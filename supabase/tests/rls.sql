-- =============================================================
-- RLS / permission tests for Kokebok.
--
-- Runs entirely inside a transaction that is ROLLED BACK, so it leaves no data
-- behind. It creates three throwaway users (alice, bob, carol=admin) and checks
-- what each role can and cannot do. The first failing ASSERT aborts the script.
--
-- Run against a scratch/local database (preferred):
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
-- Success prints: NOTICE:  ALL RLS TESTS PASSED
-- =============================================================
begin;

-- ---- fixtures (as the superuser/postgres role) ------------------------------
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@test.invalid', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@test.invalid',   'authenticated', 'authenticated'),
  ('cccccccc-0000-0000-0000-000000000003', 'carol@test.invalid', 'authenticated', 'authenticated');
-- handle_new_user() created the profile rows.
update public.profiles set is_admin = true where id = 'cccccccc-0000-0000-0000-000000000003';

insert into public.recipes (id, owner_id, visibility, title) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'public',  'Alice public'),
  ('22222222-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'private', 'Alice private');

insert into public.ingredient_groups (id, recipe_id, position) overriding system value values
  (900001, '11111111-0000-0000-0000-000000000001', 0),
  (900002, '22222222-0000-0000-0000-000000000002', 0);
insert into public.ingredients (group_id, position, name, original_text) values
  (900001, 0, 'mel', '2 dl mel'),
  (900002, 0, 'smør', '50 g smør');
insert into public.steps (recipe_id, position, text) values
  ('11111111-0000-0000-0000-000000000001', 0, 'Bland.'),
  ('22222222-0000-0000-0000-000000000002', 0, 'Hemmelig steg.');

-- ============================================================================
-- bob (regular user)
-- ============================================================================
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

do $$
declare n int;
begin
  -- reads
  -- Counts are scoped to the fixtures so the script also works on a database
  -- that already contains real recipes.
  select count(*) into n from public.recipes
    where id in ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002');
  assert n = 1, format('bob should see only the public fixture recipe, saw %s', n);

  select count(*) into n from public.recipes where id = '22222222-0000-0000-0000-000000000002';
  assert n = 0, 'bob must not see alice''s private recipe';

  select count(*) into n from public.ingredients where group_id in (900001, 900002);
  assert n = 1, format('bob should see only the public fixture ingredient, saw %s', n);

  select count(*) into n from public.steps
    where recipe_id in ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002');
  assert n = 1, format('bob should see only the public fixture step, saw %s', n);

  select count(*) into n from public.profiles;
  assert n = 1, format('bob should see only his own profile, saw %s', n);

  -- writes on someone else's recipe affect 0 rows
  update public.recipes set title = 'hacked' where id = '11111111-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'bob must not update alice''s recipe';

  delete from public.recipes where id = '11111111-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'bob must not delete alice''s recipe';
end $$;

do $$
begin
  -- cannot create a recipe owned by someone else
  begin
    insert into public.recipes (owner_id, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'forged');
    raise exception 'bob inserted a recipe owned by alice';
  exception when insufficient_privilege then null; end;

  -- cannot add children to someone else's recipe
  begin
    insert into public.ingredient_groups (recipe_id, position) values ('11111111-0000-0000-0000-000000000001', 5);
    raise exception 'bob added an ingredient group to alice''s recipe';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.steps (recipe_id, position, text) values ('11111111-0000-0000-0000-000000000001', 9, 'x');
    raise exception 'bob added a step to alice''s recipe';
  exception when insufficient_privilege then null; end;

  -- cannot make himself admin
  begin
    update public.profiles set is_admin = true where id = 'bbbbbbbb-0000-0000-0000-000000000002';
    raise exception 'bob changed is_admin';
  exception when insufficient_privilege then null; end;

  -- cannot favorite as someone else
  begin
    insert into public.favorites (user_id, recipe_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001');
    raise exception 'bob created a favorite for alice';
  exception when insufficient_privilege then null; end;

  -- cannot write the import log or foods
  begin
    insert into public.import_log (user_id, model) values ('bbbbbbbb-0000-0000-0000-000000000002', 'x');
    raise exception 'bob wrote import_log';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.foods (name_no) values ('forged');
    raise exception 'bob inserted a food';
  exception when insufficient_privilege then null; end;

  -- admin-only function
  begin
    perform * from public.admin_list_users();
    raise exception 'bob called admin_list_users';
  exception when insufficient_privilege then null; end;
end $$;

-- copy_recipe ("Lag min versjon")
do $$
declare
  copy1 uuid; copy2 uuid; n int; r public.recipes;
begin
  copy1 := public.copy_recipe('11111111-0000-0000-0000-000000000001');
  select * into r from public.recipes where id = copy1;
  assert r.owner_id = 'bbbbbbbb-0000-0000-0000-000000000002', 'copy must belong to bob';
  assert r.visibility = 'private', 'copy must be private';
  assert r.parent_id = '11111111-0000-0000-0000-000000000001', 'copy must point at the original';

  select count(*) into n from public.ingredients i
    join public.ingredient_groups g on g.id = i.group_id where g.recipe_id = copy1;
  assert n = 1, 'copy must include the ingredients';
  select count(*) into n from public.steps where recipe_id = copy1;
  assert n = 1, 'copy must include the steps';

  copy2 := public.copy_recipe('11111111-0000-0000-0000-000000000001');
  assert copy2 = copy1, 'copying twice must return the same copy';

  begin
    perform public.copy_recipe('22222222-0000-0000-0000-000000000002');
    raise exception 'bob copied alice''s private recipe';
  exception when insufficient_privilege then null; end;

  -- alice's recipe is untouched
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
  select count(*) into n from public.recipes where owner_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  assert n = 0, 'alice must not see bob''s private copy';
end $$;

-- ============================================================================
-- carol (admin): may change PUBLIC recipes of others, never private ones
-- ============================================================================
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true);

do $$
declare n int;
begin
  update public.recipes set tags = array['admin-edit'] where id = '11111111-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 1, 'admin should be able to edit a public recipe';

  update public.recipes set tags = array['admin-edit'] where id = '22222222-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'admin must not edit a private recipe';

  select count(*) into n from public.admin_list_users();
  assert n >= 3, 'admin should be able to list users';
end $$;

-- ============================================================================
-- anon (not signed in, only holds the public anon key)
-- Recipes are meant for signed-in users only ("Logg inn for å se oppskriftene"),
-- so anon must see nothing. If this fails, public recipes are readable by anyone.
-- ============================================================================
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
declare n int;
begin
  -- After the require_login migration anon has no table privileges at all, so
  -- the query raises "permission denied" (insufficient_privilege). Seeing zero
  -- rows would also be acceptable; seeing any row is a failure.
  begin
    select count(*) into n from public.recipes;
    assert n = 0, format('anon can read %s recipe(s) without logging in', n);
  exception when insufficient_privilege then null; end;
  begin
    select count(*) into n from public.ingredients;
    assert n = 0, format('anon can read %s ingredient(s) without logging in', n);
  exception when insufficient_privilege then null; end;
  begin
    select count(*) into n from public.steps;
    assert n = 0, format('anon can read %s step(s) without logging in', n);
  exception when insufficient_privilege then null; end;
end $$;

reset role;
do $$ begin raise notice 'ALL RLS TESTS PASSED'; end $$;
rollback;
