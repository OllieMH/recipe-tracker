-- Admin-only: list all users with email and import count.
-- RLS only lets users read their own profile / import_log rows, so this
-- security definer function checks is_admin() itself.
create or replace function public.admin_list_users()
returns table (
  id            uuid,
  email         text,
  display_name  text,
  is_admin      boolean,
  created_at    timestamptz,
  last_sign_in_at timestamptz,
  import_count  bigint
)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
    select p.id, u.email::text, p.display_name, p.is_admin, p.created_at,
           u.last_sign_in_at,
           (select count(*) from public.import_log l where l.user_id = p.id)
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at;
end;
$$;

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;
