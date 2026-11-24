-- Shared corrections to the store section of an item.
--
-- The food database does not know every product ("sitronsaft", "greek yoghurt").
-- When someone moves an item to the right section the choice is saved here, and
-- everyone gets it the next time that name is added. Last correction wins; who
-- made it and when is kept. The key is the normalised item name, built by the
-- client (lower case, trimmed, single spaces), so the app owns the format.

create table public.aisle_overrides (
  name_key   text primary key check (char_length(name_key) between 1 and 100),
  aisle      text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

revoke all on public.aisle_overrides from anon;
revoke insert, update, delete, truncate on public.aisle_overrides from authenticated;

alter table public.aisle_overrides enable row level security;

create policy "Signed-in users read aisle_overrides"
  on public.aisle_overrides for select to authenticated
  using (true);

-- The only way to write: checks the section is one of the real ones.
create or replace function public.set_aisle_override(p_key text, p_aisle text)
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
  if not exists (select 1 from public.aisle_map where aisle = p_aisle) then
    raise exception 'unknown section' using errcode = '22023';
  end if;

  insert into public.aisle_overrides (name_key, aisle, updated_by, updated_at)
  values (p_key, p_aisle, auth.uid(), now())
  on conflict (name_key) do update
    set aisle = excluded.aisle, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.set_aisle_override(text, text) from public, anon;
grant execute on function public.set_aisle_override(text, text) to authenticated;
