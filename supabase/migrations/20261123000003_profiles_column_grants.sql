-- Prevent privilege escalation: the "update own profile" RLS policy is
-- row-level only, so a user could set is_admin = true on their own row.
-- Restrict UPDATE to display_name; is_admin is changed only via SQL / service role.
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;
