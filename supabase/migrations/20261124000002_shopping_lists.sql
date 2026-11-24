-- =============================================================
-- Shopping lists: many named lists, each shareable with other users.
--
-- Writes to lists/members go through RPCs (security definer) so the rules live
-- in one place. Items are written directly by list members under RLS.
-- Every policy is `to authenticated`; `anon` has no access (see require_login).
-- =============================================================

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------
create table public.shopping_lists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index shopping_lists_owner_idx on public.shopping_lists(owner_id);

create table public.shopping_list_members (
  list_id    uuid not null references public.shopping_lists(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index shopping_list_members_user_idx on public.shopping_list_members(user_id);

-- Items from a recipe are snapshots (amount at the chosen servings, recipe title
-- copied). Free items have recipe_id null. Rows are merged only when displayed.
create table public.shopping_list_items (
  id           bigint generated always as identity primary key,
  list_id      uuid not null references public.shopping_lists(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 200),
  amount       numeric,
  amount_max   numeric,
  unit         text,
  food_id      bigint references public.foods(id) on delete set null,
  aisle        text not null default 'Annet',
  checked      boolean not null default false,
  checked_by   uuid references public.profiles(id) on delete set null,
  recipe_id    uuid references public.recipes(id) on delete set null,
  recipe_title text,
  added_by     uuid default auth.uid() references public.profiles(id) on delete set null,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);
create index shopping_list_items_list_idx   on public.shopping_list_items(list_id);
create index shopping_list_items_recipe_idx on public.shopping_list_items(list_id, recipe_id);

-- Store aisle per seeded food category (foods.category). Read-only for users.
create table public.aisle_map (
  category text primary key,
  aisle    text not null
);

-- ---------------------------------------------------------------
-- Helpers (security definer so policies don't recurse into RLS)
-- ---------------------------------------------------------------
create or replace function public.is_list_member(lid uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.shopping_list_members
    where list_id = lid and user_id = auth.uid()
  );
$$;

create or replace function public.is_list_owner(lid uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.shopping_lists
    where id = lid and owner_id = auth.uid()
  );
$$;

revoke all on function public.is_list_member(uuid), public.is_list_owner(uuid) from public, anon;
grant execute on function public.is_list_member(uuid), public.is_list_owner(uuid) to authenticated;

-- ---------------------------------------------------------------
-- Privileges: no anon; no direct inserts on lists/members; column-limited updates
-- ---------------------------------------------------------------
revoke all on public.shopping_lists, public.shopping_list_members,
              public.shopping_list_items, public.aisle_map from anon;

revoke insert, update, truncate on public.shopping_lists from authenticated;
grant update (name) on public.shopping_lists to authenticated;

revoke insert, update, truncate on public.shopping_list_members from authenticated;

revoke update, truncate on public.shopping_list_items from authenticated;
grant update (name, amount, amount_max, unit, aisle, checked, position)
  on public.shopping_list_items to authenticated;

revoke insert, update, delete, truncate on public.aisle_map from authenticated;

-- ---------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------
alter table public.shopping_lists        enable row level security;
alter table public.shopping_list_members enable row level security;
alter table public.shopping_list_items   enable row level security;
alter table public.aisle_map             enable row level security;

-- lists
create policy "Members read lists"
  on public.shopping_lists for select to authenticated
  using (public.is_list_member(id));

create policy "Owner renames list"
  on public.shopping_lists for update to authenticated
  using (public.is_list_owner(id))
  with check (public.is_list_owner(id));

create policy "Owner deletes list"
  on public.shopping_lists for delete to authenticated
  using (public.is_list_owner(id));

-- members (adding/removing others goes through RPCs; a member may leave)
create policy "Members read members"
  on public.shopping_list_members for select to authenticated
  using (public.is_list_member(list_id));

create policy "Member leaves list"
  on public.shopping_list_members for delete to authenticated
  using (user_id = auth.uid() and not public.is_list_owner(list_id));

-- items
create policy "Members read items"
  on public.shopping_list_items for select to authenticated
  using (public.is_list_member(list_id));

create policy "Members add items"
  on public.shopping_list_items for insert to authenticated
  with check (public.is_list_member(list_id) and added_by = auth.uid());

create policy "Members update items"
  on public.shopping_list_items for update to authenticated
  using (public.is_list_member(list_id))
  with check (public.is_list_member(list_id));

create policy "Members delete items"
  on public.shopping_list_items for delete to authenticated
  using (public.is_list_member(list_id));

-- aisle_map
create policy "Signed-in users read aisle_map"
  on public.aisle_map for select to authenticated
  using (true);

-- Record who ticked an item (the client cannot choose it).
create or replace function public.set_item_checked_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.checked is distinct from old.checked then
    new.checked_by := case when new.checked then auth.uid() else null end;
  end if;
  return new;
end;
$$;

create trigger shopping_items_checked_by
  before update on public.shopping_list_items
  for each row execute function public.set_item_checked_by();

-- ---------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------
create or replace function public.create_list(p_name text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.shopping_lists (name, owner_id)
  values (btrim(p_name), auth.uid())
  returning id into new_id;
  insert into public.shopping_list_members (list_id, user_id) values (new_id, auth.uid());
  return new_id;
end;
$$;

-- Owner shares a list with an existing user, by email. Sign-up is invite-only,
-- so an unknown email is an error (this tells list owners whether an address
-- has an account; acceptable for a small invite-only group).
create or replace function public.share_list(p_list_id uuid, p_email text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare target uuid;
begin
  if not public.is_list_owner(p_list_id) then
    raise exception 'only the owner can share this list' using errcode = '42501';
  end if;
  select id into target from auth.users where lower(email) = lower(btrim(p_email));
  if target is null then
    raise exception 'no user with that email' using errcode = 'P0002';
  end if;
  insert into public.shopping_list_members (list_id, user_id)
  values (p_list_id, target)
  on conflict do nothing;
  return target;
end;
$$;

create or replace function public.remove_list_member(p_list_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_list_owner(p_list_id) then
    raise exception 'only the owner can remove members' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'the owner cannot be removed from the list';
  end if;
  delete from public.shopping_list_members
  where list_id = p_list_id and user_id = p_user_id;
end;
$$;

-- Display names, only for yourself and people you share a list with.
create or replace function public.display_names(ids uuid[])
returns table (id uuid, display_name text)
language sql
stable
security definer set search_path = ''
as $$
  select p.id, p.display_name
  from public.profiles p
  where auth.uid() is not null
    and p.id = any(ids)
    and (
      p.id = auth.uid()
      or exists (
        select 1
        from public.shopping_list_members mine
        join public.shopping_list_members theirs on theirs.list_id = mine.list_id
        where mine.user_id = auth.uid() and theirs.user_id = p.id
      )
    );
$$;

revoke all on function
  public.create_list(text),
  public.share_list(uuid, text),
  public.remove_list_member(uuid, uuid),
  public.display_names(uuid[])
  from public, anon;
grant execute on function
  public.create_list(text),
  public.share_list(uuid, text),
  public.remove_list_member(uuid, uuid),
  public.display_names(uuid[])
  to authenticated;

-- ---------------------------------------------------------------
-- Realtime (RLS decides what each client receives). Full replica identity so
-- DELETE events carry list_id.
-- ---------------------------------------------------------------
alter table public.shopping_list_items   replica identity full;
alter table public.shopping_list_members replica identity full;
alter publication supabase_realtime add table public.shopping_list_items, public.shopping_list_members;

-- ---------------------------------------------------------------
-- Aisle mapping for every seeded foods.category
-- ---------------------------------------------------------------
insert into public.aisle_map (category, aisle) values
  -- Frukt og grønt
  ('Bær', 'Frukt og grønt'),
  ('Frukt', 'Frukt og grønt'),
  ('Grønnsaker, rå og tilberedt', 'Frukt og grønt'),
  ('Grønnsaksprodukter', 'Frukt og grønt'),
  ('Poteter, rå og tilberedt', 'Frukt og grønt'),
  ('Salater', 'Frukt og grønt'),
  -- Kjøtt og fisk
  ('Fet fisk', 'Kjøtt og fisk'),
  ('Mager fisk', 'Kjøtt og fisk'),
  ('Fiskeinnmat', 'Kjøtt og fisk'),
  ('Fiskeprodukter', 'Kjøtt og fisk'),
  ('Skalldyr', 'Kjøtt og fisk'),
  ('Fjørfe', 'Kjøtt og fisk'),
  ('Innmat', 'Kjøtt og fisk'),
  ('Kjøttprodukter', 'Kjøtt og fisk'),
  ('Lam', 'Kjøtt og fisk'),
  ('Storfe og kalv', 'Kjøtt og fisk'),
  ('Svin', 'Kjøtt og fisk'),
  ('Viltkjøtt', 'Kjøtt og fisk'),
  -- Meieri og egg
  ('Egg', 'Meieri og egg'),
  ('Ferskost', 'Meieri og egg'),
  ('Annen ost', 'Meieri og egg'),
  ('Brunost', 'Meieri og egg'),
  ('Gulost', 'Meieri og egg'),
  ('Muggost', 'Meieri og egg'),
  ('Smelteost', 'Meieri og egg'),
  ('Fløte og rømme', 'Meieri og egg'),
  ('Melk', 'Meieri og egg'),
  ('Yoghurt', 'Meieri og egg'),
  ('Plantebasert drikke', 'Meieri og egg'),
  ('Margarin og smør', 'Meieri og egg'),
  -- Brød og bakevarer
  ('Andre brødvarer', 'Brød og bakevarer'),
  ('Andre brødvarer, hjemmebakt', 'Brød og bakevarer'),
  ('Ekstra grovt brød', 'Brød og bakevarer'),
  ('Fint brød', 'Brød og bakevarer'),
  ('Fint brød, hjemmebakt', 'Brød og bakevarer'),
  ('Grovt brød', 'Brød og bakevarer'),
  ('Grovt brød, hjemmebakt', 'Brød og bakevarer'),
  ('Halvgrovt brød', 'Brød og bakevarer'),
  ('Knekkebrød og flatbrød', 'Brød og bakevarer'),
  ('Kaker og søt bakst', 'Brød og bakevarer'),
  ('Kjeks og småkaker', 'Brød og bakevarer'),
  ('Pannekaker og vafler', 'Brød og bakevarer'),
  ('Deiger og farser', 'Brød og bakevarer'),
  -- Tørrvarer
  ('Belgvekster', 'Tørrvarer'),
  ('Frø', 'Tørrvarer'),
  ('Frokostblanding', 'Tørrvarer'),
  ('Grøt', 'Tørrvarer'),
  ('Gryn, ris og pasta', 'Tørrvarer'),
  ('Mel', 'Tørrvarer'),
  ('Nøtter', 'Tørrvarer'),
  ('Produkter av nøtter og frø', 'Tørrvarer'),
  ('Produkter av frukt og bær', 'Tørrvarer'),
  ('Sukker og honning', 'Tørrvarer'),
  ('Søte pålegg', 'Tørrvarer'),
  -- Krydder og saus
  ('Urter og krydder', 'Krydder og saus'),
  ('Middagstilbehør', 'Krydder og saus'),
  ('Diverse ingredienser', 'Krydder og saus'),
  ('Majones og påleggsalater', 'Krydder og saus'),
  ('Matolje', 'Krydder og saus'),
  ('Annet fett', 'Krydder og saus'),
  -- Frysevarer og ferdigmat
  ('Fiske- og skalldyrsretter', 'Frysevarer og ferdigmat'),
  ('Kjøttretter', 'Frysevarer og ferdigmat'),
  ('Påsmurt og lunsjretter', 'Frysevarer og ferdigmat'),
  ('Pizza og taco', 'Frysevarer og ferdigmat'),
  ('Potetprodukter', 'Frysevarer og ferdigmat'),
  ('Supper og gryteretter', 'Frysevarer og ferdigmat'),
  ('Vegetarprodukter og -retter', 'Frysevarer og ferdigmat'),
  -- Drikke
  ('Alkoholholdige drikkevarer', 'Drikke'),
  ('Brus og energidrikke', 'Drikke'),
  ('Juice og smoothie', 'Drikke'),
  ('Kaffe og te', 'Drikke'),
  ('Vann og mineralvann', 'Drikke'),
  -- Snacks og søtt
  ('Dessert og iskrem', 'Snacks og søtt'),
  ('Sjokolade og godteri', 'Snacks og søtt'),
  ('Snacks', 'Snacks og søtt'),
  -- Annet
  ('Kosttilskudd', 'Annet'),
  ('Spedbarnsmat', 'Annet');
