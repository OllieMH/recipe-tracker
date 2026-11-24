-- Who is on a shopping list, for the members panel and "ticked by".
--
-- label = the display name; the email only when the display name is empty, so an
-- address is exposed to co-members only when there is nothing else to show.
-- Returns rows only to members of that list (non-members get an empty result).
-- The owner is listed first.

create or replace function public.list_members(p_list_id uuid)
returns table (user_id uuid, label text, is_owner boolean)
language sql
stable
security definer set search_path = ''
as $$
  select m.user_id,
         coalesce(nullif(btrim(p.display_name), ''), u.email::text) as label,
         (l.owner_id = m.user_id) as is_owner
  from public.shopping_list_members m
  join public.shopping_lists l on l.id = m.list_id
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  where m.list_id = p_list_id
    and public.is_list_member(p_list_id)
  order by (l.owner_id = m.user_id) desc, m.created_at;
$$;

revoke all on function public.list_members(uuid) from public, anon;
grant execute on function public.list_members(uuid) to authenticated;
