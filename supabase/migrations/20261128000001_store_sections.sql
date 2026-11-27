-- Store sections that follow a real Norwegian store instead of nutrition groups.
--
-- * public.aisles: the sections and their default order (the app has the same list
--   in supabase/functions/_shared/aisles.ts; change both together).
-- * aisle_map: Matvaretabellen food groups remapped to the new sections.
-- * ingredients.aisle: the section Gemini chose for an ingredient on import.
-- * shopping_lists.aisle_order: a list's own section order (null = default).
-- * shopping_list_aisle_overrides: a list's own section for a name. Used for moves to
--   and from "Fri for", which depend on the household, not on the store.
-- * aisle_overrides (shared moves): remembers the section it was moved from, may not
--   be "Fri for", and admins can list and undo them.
-- Old section names in stored data are renamed.

-- ---------------------------------------------------------------
-- sections
-- ---------------------------------------------------------------
create table public.aisles (
  name     text primary key,
  position int not null unique
);

insert into public.aisles (name, position) values
  ('Frukt og grønt', 1),
  ('Brød', 2),
  ('Pålegg og frokost', 3),
  ('Kjøtt og fisk', 4),
  ('Meieri og egg', 5),
  ('Middag og hermetikk', 6),
  ('Krydder, olje og saus', 7),
  ('Bakevarer', 8),
  ('Fri for', 9),
  ('Frysevarer', 10),
  ('Drikke', 11),
  ('Husholdning', 12),
  ('Snacks og godteri', 13),
  ('Annet', 14);

revoke all on public.aisles from anon;
revoke insert, update, delete, truncate on public.aisles from authenticated;
alter table public.aisles enable row level security;
create policy "Signed-in users read aisles"
  on public.aisles for select to authenticated using (true);

-- Old name -> new name, for stored data. Ambiguous old sections go where people
-- actually used them: the manual moves into "Brød og bakevarer" were baking goods.
create temporary table aisle_rename (old text primary key, new text not null) on commit drop;
insert into aisle_rename values
  ('Brød og bakevarer', 'Bakevarer'),
  ('Tørrvarer', 'Middag og hermetikk'),
  ('Krydder og saus', 'Krydder, olje og saus'),
  ('Frysevarer og ferdigmat', 'Frysevarer'),
  ('Snacks og søtt', 'Snacks og godteri');

-- ---------------------------------------------------------------
-- food groups -> sections
-- ---------------------------------------------------------------
update public.aisle_map m set aisle = v.aisle
from (values
  ('Deiger og farser', 'Kjøtt og fisk'),              -- kjøttdeig, farse
  ('Andre brødvarer', 'Brød'),
  ('Andre brødvarer, hjemmebakt', 'Brød'),
  ('Ekstra grovt brød', 'Brød'),
  ('Fint brød', 'Brød'),
  ('Fint brød, hjemmebakt', 'Brød'),
  ('Grovt brød', 'Brød'),
  ('Grovt brød, hjemmebakt', 'Brød'),
  ('Halvgrovt brød', 'Brød'),
  ('Knekkebrød og flatbrød', 'Brød'),
  ('Kaker og søt bakst', 'Brød'),
  ('Påsmurt og lunsjretter', 'Brød'),
  ('Pannekaker og vafler', 'Bakevarer'),               -- mostly mixes
  ('Kjeks og småkaker', 'Snacks og godteri'),
  ('Mel', 'Bakevarer'),
  ('Sukker og honning', 'Bakevarer'),
  ('Frø', 'Bakevarer'),
  ('Nøtter', 'Bakevarer'),
  ('Annet fett', 'Bakevarer'),                         -- kokosfett, kakaosmør
  ('Diverse ingredienser', 'Bakevarer'),               -- bakepulver, gjær, kakao, gelatin
  ('Søte pålegg', 'Pålegg og frokost'),
  ('Frokostblanding', 'Pålegg og frokost'),
  ('Grøt', 'Pålegg og frokost'),
  ('Majones og påleggsalater', 'Pålegg og frokost'),
  ('Produkter av frukt og bær', 'Pålegg og frokost'),  -- syltetøy, marmelade
  ('Produkter av nøtter og frø', 'Pålegg og frokost'), -- peanøttsmør
  ('Belgvekster', 'Middag og hermetikk'),
  ('Gryn, ris og pasta', 'Middag og hermetikk'),
  ('Grønnsaksprodukter', 'Middag og hermetikk'),       -- hermetikk; frozen ones are caught by name
  ('Middagstilbehør', 'Middag og hermetikk'),          -- sauces, buljong
  ('Supper og gryteretter', 'Middag og hermetikk'),
  ('Urter og krydder', 'Krydder, olje og saus'),       -- fresh ones are caught by name
  ('Matolje', 'Krydder, olje og saus'),
  ('Fiske- og skalldyrsretter', 'Frysevarer'),
  ('Kjøttretter', 'Frysevarer'),
  ('Pizza og taco', 'Frysevarer'),
  ('Potetprodukter', 'Frysevarer'),
  ('Vegetarprodukter og -retter', 'Frysevarer'),
  ('Dessert og iskrem', 'Frysevarer'),
  ('Sjokolade og godteri', 'Snacks og godteri'),
  ('Snacks', 'Snacks og godteri')
) as v(category, aisle)
where m.category = v.category;

-- anything not listed above keeps its section if that still exists
update public.aisle_map m set aisle = r.new from aisle_rename r where m.aisle = r.old;

alter table public.aisle_map
  add constraint aisle_map_aisle_fkey foreign key (aisle) references public.aisles(name) on update cascade;

-- ---------------------------------------------------------------
-- stored data with old names
-- ---------------------------------------------------------------
update public.shopping_list_items i set aisle = r.new from aisle_rename r where i.aisle = r.old;
update public.aisle_overrides o set aisle = r.new from aisle_rename r where o.aisle = r.old;

-- ---------------------------------------------------------------
-- ingredients.aisle (from Gemini on import)
-- ---------------------------------------------------------------
alter table public.ingredients
  add column aisle text references public.aisles(name) on update cascade on delete set null;

-- ---------------------------------------------------------------
-- a list's own section order
-- ---------------------------------------------------------------
alter table public.shopping_lists add column aisle_order text[];

-- Any member may change it (they shop in the same store). null resets to the default.
create or replace function public.set_list_aisle_order(p_list_id uuid, p_order text[])
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not public.is_list_member(p_list_id) then
    raise exception 'not a member of this list' using errcode = '42501';
  end if;
  if p_order is not null and (
    cardinality(p_order) <> (select count(distinct x) from unnest(p_order) x)
    or exists (select 1 from unnest(p_order) x where x not in (select name from public.aisles))
  ) then
    raise exception 'invalid section order' using errcode = '22023';
  end if;
  update public.shopping_lists set aisle_order = p_order where id = p_list_id;
end;
$$;

revoke all on function public.set_list_aisle_order(uuid, text[]) from public, anon;
grant execute on function public.set_list_aisle_order(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------
-- a list's own section for a name ("Fri for")
-- ---------------------------------------------------------------
create table public.shopping_list_aisle_overrides (
  list_id    uuid not null references public.shopping_lists(id) on delete cascade,
  name_key   text not null check (char_length(name_key) between 1 and 100),
  aisle      text not null references public.aisles(name) on update cascade,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (list_id, name_key)
);

revoke all on public.shopping_list_aisle_overrides from anon;
revoke all on public.shopping_list_aisle_overrides from authenticated;
grant select, delete on public.shopping_list_aisle_overrides to authenticated;
grant insert (list_id, name_key, aisle) on public.shopping_list_aisle_overrides to authenticated;
grant update (aisle) on public.shopping_list_aisle_overrides to authenticated;

create trigger shopping_list_aisle_overrides_updated_at
  before update on public.shopping_list_aisle_overrides
  for each row execute function public.set_updated_at();

alter table public.shopping_list_aisle_overrides enable row level security;

create policy "Members read list sections"
  on public.shopping_list_aisle_overrides for select to authenticated
  using (public.is_list_member(list_id));
create policy "Members add list sections"
  on public.shopping_list_aisle_overrides for insert to authenticated
  with check (public.is_list_member(list_id));
create policy "Members change list sections"
  on public.shopping_list_aisle_overrides for update to authenticated
  using (public.is_list_member(list_id))
  with check (public.is_list_member(list_id));
create policy "Members remove list sections"
  on public.shopping_list_aisle_overrides for delete to authenticated
  using (public.is_list_member(list_id));

-- ---------------------------------------------------------------
-- shared moves: where from, never "Fri for", admins can list and undo
-- ---------------------------------------------------------------
alter table public.aisle_overrides add column previous_aisle text;

drop function public.set_aisle_override(text, text);

create or replace function public.set_aisle_override(p_key text, p_aisle text, p_from text default null)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_key is null or char_length(p_key) not between 1 and 100 or p_key <> btrim(p_key) then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  if not exists (select 1 from public.aisles where name = p_aisle) then
    raise exception 'unknown section' using errcode = '22023';
  end if;
  if p_aisle = 'Fri for' then
    raise exception 'Fri for is chosen per list, not for everyone' using errcode = '22023';
  end if;

  insert into public.aisle_overrides (name_key, aisle, previous_aisle, updated_by, updated_at)
  values (p_key, p_aisle, left(p_from, 100), auth.uid(), now())
  on conflict (name_key) do update
    set aisle = excluded.aisle, previous_aisle = excluded.previous_aisle,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.set_aisle_override(text, text, text) from public, anon;
grant execute on function public.set_aisle_override(text, text, text) to authenticated;

grant delete on public.aisle_overrides to authenticated;
create policy "Admins undo shared moves"
  on public.aisle_overrides for delete to authenticated
  using (public.is_admin());

create or replace function public.admin_list_aisle_overrides()
returns table (
  name_key text, aisle text, previous_aisle text, updated_at timestamptz, display_name text
)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return query
    select o.name_key, o.aisle, o.previous_aisle, o.updated_at, p.display_name
    from public.aisle_overrides o
    left join public.profiles p on p.id = o.updated_by
    order by o.updated_at desc;
end;
$$;

revoke all on function public.admin_list_aisle_overrides() from public, anon;
grant execute on function public.admin_list_aisle_overrides() to authenticated;

-- ---------------------------------------------------------------
-- save_recipe, update_recipe and copy_recipe: carry ingredients.aisle
-- (an unknown section is stored as null). Otherwise as in 20261127000001.
-- ---------------------------------------------------------------

create or replace function public.save_recipe(payload jsonb)
returns uuid
language plpgsql
security invoker set search_path = ''
as $$
declare
  new_id   uuid;
  grp      jsonb;
  ing      jsonb;
  stp      jsonb;
  grp_id   bigint;
  grp_pos  int := 0;
  ing_pos  int;
  stp_pos  int := 0;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  insert into public.recipes (
    owner_id, visibility, title, description, servings, servings_unit,
    prep_minutes, total_minutes, source_url, source_site,
    original_language, was_translated, tips, tags, import_raw_text, oven
  ) values (
    auth.uid(),
    coalesce(payload->>'visibility', 'public'),
    payload->>'title',
    payload->>'description',
    (payload->>'servings')::numeric,
    payload->>'servings_unit',
    (payload->>'prep_minutes')::int,
    (payload->>'total_minutes')::int,
    payload->>'source_url',
    payload->>'source_site',
    payload->>'original_language',
    coalesce((payload->>'was_translated')::boolean, false),
    coalesce(array(select jsonb_array_elements_text(payload->'tips')), '{}'),
    coalesce(array(select jsonb_array_elements_text(payload->'tags')), '{}'),
    payload->>'import_raw_text',
    coalesce(payload->'oven', '[]'::jsonb)
  )
  returning id into new_id;

  for grp in select * from jsonb_array_elements(coalesce(payload->'ingredient_groups', '[]'::jsonb))
  loop
    insert into public.ingredient_groups (recipe_id, position, name)
    values (new_id, grp_pos, nullif(grp->>'name', ''))
    returning id into grp_id;
    grp_pos := grp_pos + 1;
    ing_pos := 0;

    for ing in select * from jsonb_array_elements(coalesce(grp->'ingredients', '[]'::jsonb))
    loop
      insert into public.ingredients (
        group_id, position, amount, amount_max, unit, name, note, scalable,
        food_id, original_text, original_amount, original_unit, aisle
      ) values (
        grp_id, ing_pos,
        (ing->>'amount')::numeric,
        (ing->>'amount_max')::numeric,
        ing->>'unit',
        ing->>'name',
        nullif(ing->>'note', ''),
        coalesce((ing->>'scalable')::boolean, true),
        (ing->>'food_id')::bigint,
        coalesce(ing->>'original_text', ing->>'name'),
        (ing->>'original_amount')::numeric,
        ing->>'original_unit',
        (select a.name from public.aisles a where a.name = ing->>'aisle')
      );
      ing_pos := ing_pos + 1;
    end loop;
  end loop;

  for stp in select * from jsonb_array_elements(coalesce(payload->'steps', '[]'::jsonb))
  loop
    insert into public.steps (recipe_id, position, group_name, text)
    values (new_id, stp_pos, nullif(stp->>'group_name', ''), stp->>'text');
    stp_pos := stp_pos + 1;
  end loop;

  return new_id;
end;
$$;

revoke all on function public.save_recipe(jsonb) from public, anon;
grant execute on function public.save_recipe(jsonb) to authenticated;

create or replace function public.update_recipe(recipe_id uuid, payload jsonb)
returns void
language plpgsql
security invoker set search_path = ''
as $$
declare
  grp      jsonb;
  ing      jsonb;
  stp      jsonb;
  grp_id   bigint;
  grp_pos  int := 0;
  ing_pos  int;
  stp_pos  int := 0;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  update public.recipes r set
    title         = payload->>'title',
    description   = payload->>'description',
    servings      = (payload->>'servings')::numeric,
    servings_unit = payload->>'servings_unit',
    prep_minutes  = (payload->>'prep_minutes')::int,
    total_minutes = (payload->>'total_minutes')::int,
    source_url    = payload->>'source_url',
    source_site   = payload->>'source_site',
    tips          = coalesce(array(select jsonb_array_elements_text(payload->'tips')), '{}'),
    tags          = coalesce(array(select jsonb_array_elements_text(payload->'tags')), '{}'),
    oven          = coalesce(payload->'oven', r.oven),  -- older app versions do not send it
    visibility    = case when r.owner_id = auth.uid()
                         then coalesce(payload->>'visibility', r.visibility)
                         else r.visibility end
  where r.id = update_recipe.recipe_id;

  if not found then
    raise exception 'recipe not found or not editable' using errcode = '42501';
  end if;

  delete from public.ingredient_groups g where g.recipe_id = update_recipe.recipe_id;
  delete from public.steps s where s.recipe_id = update_recipe.recipe_id;

  for grp in select * from jsonb_array_elements(coalesce(payload->'ingredient_groups', '[]'::jsonb))
  loop
    insert into public.ingredient_groups (recipe_id, position, name)
    values (update_recipe.recipe_id, grp_pos, nullif(grp->>'name', ''))
    returning id into grp_id;
    grp_pos := grp_pos + 1;
    ing_pos := 0;

    for ing in select * from jsonb_array_elements(coalesce(grp->'ingredients', '[]'::jsonb))
    loop
      insert into public.ingredients (
        group_id, position, amount, amount_max, unit, name, note, scalable,
        food_id, original_text, original_amount, original_unit, aisle
      ) values (
        grp_id, ing_pos,
        (ing->>'amount')::numeric,
        (ing->>'amount_max')::numeric,
        ing->>'unit',
        ing->>'name',
        nullif(ing->>'note', ''),
        coalesce((ing->>'scalable')::boolean, true),
        (ing->>'food_id')::bigint,
        coalesce(ing->>'original_text', ing->>'name'),
        (ing->>'original_amount')::numeric,
        ing->>'original_unit',
        (select a.name from public.aisles a where a.name = ing->>'aisle')
      );
      ing_pos := ing_pos + 1;
    end loop;
  end loop;

  for stp in select * from jsonb_array_elements(coalesce(payload->'steps', '[]'::jsonb))
  loop
    insert into public.steps (recipe_id, position, group_name, text)
    values (update_recipe.recipe_id, stp_pos, nullif(stp->>'group_name', ''), stp->>'text');
    stp_pos := stp_pos + 1;
  end loop;
end;
$$;

revoke all on function public.update_recipe(uuid, jsonb) from public, anon;
grant execute on function public.update_recipe(uuid, jsonb) to authenticated;

create or replace function public.copy_recipe(source_id uuid)
returns uuid
language plpgsql
security invoker set search_path = ''
as $$
declare
  src      public.recipes;
  existing uuid;
  new_id   uuid;
  grp      public.ingredient_groups;
  new_grp  bigint;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into src from public.recipes where id = source_id;
  if not found then
    raise exception 'recipe not found' using errcode = '42501';
  end if;
  if src.owner_id = auth.uid() then
    raise exception 'you already own this recipe';
  end if;

  select id into existing from public.recipes
  where parent_id = source_id and owner_id = auth.uid();
  if found then
    return existing;
  end if;

  insert into public.recipes (
    owner_id, parent_id, visibility, title, description, servings, servings_unit,
    prep_minutes, total_minutes, source_url, source_site, original_language,
    was_translated, tips, tags, import_raw_text, image_path, oven
  ) values (
    auth.uid(), src.id, 'private', src.title, src.description, src.servings, src.servings_unit,
    src.prep_minutes, src.total_minutes, src.source_url, src.source_site, src.original_language,
    src.was_translated, src.tips, src.tags, src.import_raw_text, src.image_path, src.oven
  )
  returning id into new_id;

  for grp in select * from public.ingredient_groups where recipe_id = source_id order by position
  loop
    insert into public.ingredient_groups (recipe_id, position, name)
    values (new_id, grp.position, grp.name)
    returning id into new_grp;

    insert into public.ingredients (
      group_id, position, amount, amount_max, unit, name, note, scalable,
      food_id, original_text, original_amount, original_unit, aisle
    )
    select new_grp, i.position, i.amount, i.amount_max, i.unit, i.name, i.note, i.scalable,
           i.food_id, i.original_text, i.original_amount, i.original_unit, i.aisle
    from public.ingredients i
    where i.group_id = grp.id;
  end loop;

  insert into public.steps (recipe_id, position, group_name, text)
  select new_id, s.position, s.group_name, s.text
  from public.steps s
  where s.recipe_id = source_id;

  return new_id;
end;
$$;
