-- Close the Supabase security-advisor findings about function privileges.
--
-- By default Postgres lets PUBLIC (so also `anon`) execute every function, which
-- exposes SECURITY DEFINER helpers at /rest/v1/rpc/<name>. Policies and RPCs run
-- these helpers as the signed-in caller, so `authenticated` keeps EXECUTE.

-- Helpers used inside RLS policies / RPCs (signed-in users only)
revoke execute on function
  public.is_admin(),
  public.owns_recipe(uuid),
  public.can_edit_recipe(uuid)
  from public, anon;
grant execute on function
  public.is_admin(),
  public.owns_recipe(uuid),
  public.can_edit_recipe(uuid)
  to authenticated;

-- Deliberately NOT touched: handle_new_user() and rls_auto_enable(). They are
-- trigger functions, so calling them over /rest/v1/rpc fails anyway, and
-- changing their privileges could break sign-up/invites in a way that cannot
-- be tested from here.

-- Fixed search_path (advisor: function_search_path_mutable)
alter function public.set_updated_at() set search_path = '';
