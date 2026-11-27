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
update public.recipes set oven = '[{"temp_c": 200, "mode": "varmluft"}]'
  where id = '11111111-0000-0000-0000-000000000001';

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
  assert r.oven = '[{"temp_c": 200, "mode": "varmluft"}]'::jsonb, 'copy must include the oven settings';

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
-- shopping lists (needs the 20261124000002_shopping_lists migration)
-- alice owns a list; bob is first a non-member, then a member; carol is an
-- unrelated admin (admins get no special access to other people's lists).
-- ============================================================================
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

do $$
declare lid uuid; n int; ok boolean;
begin
  lid := public.create_list('Ukeshandel');
  perform set_config('test.list_id', lid::text, true);

  select count(*) into n from public.shopping_list_members where list_id = lid;
  assert n = 1, 'owner must be the list''s only member after create_list';

  insert into public.shopping_list_items (list_id, name, amount, unit, aisle)
  values (lid, 'melk', 1, 'l', 'Meieri og egg');

  -- the app may choose an item's id (items typed offline); the same id twice hits the
  -- primary key; the id cannot be changed afterwards and seq cannot be chosen
  insert into public.shopping_list_items (id, list_id, name)
  values ('eeeeeeee-0000-0000-0000-000000000001', lid, 'client id');
  ok := false;
  begin
    insert into public.shopping_list_items (id, list_id, name)
    values ('eeeeeeee-0000-0000-0000-000000000001', lid, 'client id');
  exception when unique_violation then ok := true; end;
  assert ok, 'the same item id must not be insertable twice';
  ok := false;
  begin
    update public.shopping_list_items set id = gen_random_uuid() where list_id = lid;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'an item id must not be updatable';
  ok := false;
  begin
    insert into public.shopping_list_items (list_id, name, seq) values (lid, 'x', 5);
  exception when others then ok := true; end;
  assert ok, 'seq (creation order) must not be settable by the client';

  -- lists and members cannot be written directly
  begin
    insert into public.shopping_lists (name, owner_id) values ('direct', auth.uid());
    raise exception 'alice inserted a list directly';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.shopping_list_members (list_id, user_id)
    values (lid, 'bbbbbbbb-0000-0000-0000-000000000002');
    raise exception 'alice inserted a member directly';
  exception when insufficient_privilege then null; end;

  -- cannot forge who added an item
  begin
    insert into public.shopping_list_items (list_id, name, added_by)
    values (lid, 'forged', 'bbbbbbbb-0000-0000-0000-000000000002');
    raise exception 'alice forged added_by';
  exception when insufficient_privilege then null; end;

  -- unknown email
  ok := false;
  begin
    perform public.share_list(lid, 'nobody@test.invalid');
  exception when no_data_found then ok := true; end;
  assert ok, 'share_list must reject an unknown email';

  -- the owner cannot be removed or leave
  ok := false;
  begin
    perform public.remove_list_member(lid, 'aaaaaaaa-0000-0000-0000-000000000001');
  exception when raise_exception then ok := true; end;
  assert ok, 'the owner must not be removable';
  delete from public.shopping_list_members
    where list_id = lid and user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'the owner must not be able to leave the list';

  -- reference data is readable but not writable
  select count(*) into n from public.aisle_map;
  assert n > 0, 'signed-in users should read aisle_map';
  begin
    insert into public.aisle_map (category, aisle) values ('x', 'y');
    raise exception 'alice wrote aisle_map';
  exception when insufficient_privilege then null; end;
end $$;

-- bob, not a member yet
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);

do $$
declare lid uuid := current_setting('test.list_id')::uuid; n int;
begin
  select count(*) into n from public.shopping_lists where id = lid;
  assert n = 0, 'non-member must not see the list';
  select count(*) into n from public.shopping_list_items where list_id = lid;
  assert n = 0, 'non-member must not see items';
  select count(*) into n from public.shopping_list_members where list_id = lid;
  assert n = 0, 'non-member must not see members';

  begin
    insert into public.shopping_list_items (list_id, name) values (lid, 'sneaky');
    raise exception 'non-member added an item';
  exception when insufficient_privilege then null; end;

  begin
    perform public.share_list(lid, 'bob@test.invalid');
    raise exception 'non-member shared the list with himself';
  exception when insufficient_privilege then null; end;

  update public.shopping_lists set name = 'hacked' where id = lid;
  get diagnostics n = row_count;
  assert n = 0, 'non-member must not rename the list';
  delete from public.shopping_lists where id = lid;
  get diagnostics n = row_count;
  assert n = 0, 'non-member must not delete the list';

  select count(*) into n from public.display_names(array['aaaaaaaa-0000-0000-0000-000000000001']::uuid[]);
  assert n = 0, 'display_names must not reveal people you share no list with';
  select count(*) into n from public.list_members(lid);
  assert n = 0, 'list_members must return nothing to a non-member';
end $$;

-- alice shares with bob
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$
declare lid uuid := current_setting('test.list_id')::uuid; n int;
begin
  perform public.share_list(lid, 'bob@test.invalid');
  perform public.share_list(lid, 'bob@test.invalid');  -- idempotent
  select count(*) into n from public.shopping_list_members where list_id = lid;
  assert n = 2, 'list should have alice and bob as members';
  select count(*) into n from public.list_members(lid) where is_owner and label = 'alice';
  assert n = 1, 'list_members should show the owner, by display name';
end $$;

-- bob, now a member
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);

do $$
declare lid uuid := current_setting('test.list_id')::uuid; n int; item uuid; who uuid; names int;
begin
  select count(*) into n from public.shopping_lists where id = lid;
  assert n = 1, 'member must see the list';
  select id into item from public.shopping_list_items where list_id = lid and name = 'melk';
  assert item is not null, 'member must see items';

  insert into public.shopping_list_items (list_id, name, aisle) values (lid, 'brød', 'Brød og bakevarer');

  update public.shopping_list_items set checked = true where id = item;
  select checked_by into who from public.shopping_list_items where id = item;
  assert who = 'bbbbbbbb-0000-0000-0000-000000000002', 'ticking must record who ticked';
  update public.shopping_list_items set checked = false where id = item;
  select checked_by into who from public.shopping_list_items where id = item;
  assert who is null, 'unticking must clear checked_by';

  -- items cannot be moved to another list or re-attributed
  begin
    update public.shopping_list_items set list_id = gen_random_uuid() where id = item;
    raise exception 'member changed list_id';
  exception when insufficient_privilege then null; end;
  begin
    update public.shopping_list_items set added_by = 'bbbbbbbb-0000-0000-0000-000000000002' where id = item;
    raise exception 'member changed added_by';
  exception when insufficient_privilege then null; end;

  -- members cannot manage the list itself
  update public.shopping_lists set name = 'hacked' where id = lid;
  get diagnostics n = row_count;
  assert n = 0, 'member must not rename the list';
  begin
    perform public.share_list(lid, 'carol@test.invalid');
    raise exception 'member shared the list';
  exception when insufficient_privilege then null; end;
  begin
    perform public.remove_list_member(lid, 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'member removed the owner';
  exception when insufficient_privilege then null; end;

  -- display names: alice yes (shared list), carol no
  select count(*) into names from public.display_names(array['aaaaaaaa-0000-0000-0000-000000000001']::uuid[]);
  assert names = 1, 'display_names should show a list co-member';
  select count(*) into names from public.display_names(array['cccccccc-0000-0000-0000-000000000003']::uuid[]);
  assert names = 0, 'display_names must not show someone outside your lists';
end $$;

-- carol (admin) is not a member: no special access
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true);
do $$
declare lid uuid := current_setting('test.list_id')::uuid; n int;
begin
  select count(*) into n from public.shopping_lists where id = lid;
  assert n = 0, 'admin must not see other people''s lists';
  select count(*) into n from public.shopping_list_items where list_id = lid;
  assert n = 0, 'admin must not see other people''s list items';
end $$;

-- bob leaves; then alice deletes the list and its items go too
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$
declare lid uuid := current_setting('test.list_id')::uuid; n int;
begin
  delete from public.shopping_list_members
    where list_id = lid and user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 1, 'a member must be able to leave';
  select count(*) into n from public.shopping_list_items where list_id = lid;
  assert n = 0, 'after leaving, bob must not see items';
end $$;

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$
declare lid uuid := current_setting('test.list_id')::uuid; n int;
begin
  delete from public.shopping_lists where id = lid;
  get diagnostics n = row_count;
  assert n = 1, 'the owner must be able to delete the list';
  reset role;
  select count(*) into n from public.shopping_list_items where list_id = lid;
  assert n = 0, 'deleting a list must delete its items';
  set local role authenticated;
end $$;

-- shared section corrections (needs the 20261124000006_aisle_overrides migration)
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$
declare ok boolean;
begin
  perform public.set_aisle_override('sitronsaft', 'Krydder og saus');
  assert (select aisle from public.aisle_overrides where name_key = 'sitronsaft') = 'Krydder og saus',
    'a correction must be saved and readable';
  perform public.set_aisle_override('sitronsaft', 'Drikke');
  assert (select count(*) from public.aisle_overrides where name_key = 'sitronsaft') = 1, 'one row per name; last correction wins';

  ok := false;
  begin insert into public.aisle_overrides (name_key, aisle) values ('x', 'Annet');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'direct writes to aisle_overrides must be blocked';

  ok := false;
  begin perform public.set_aisle_override('mel', 'Finnes ikke');
  exception when invalid_parameter_value then ok := true; end;
  assert ok, 'an unknown section must be rejected';
end $$;

-- suggestions (needs the 20261127000002_suggestions migration)
-- bob sends one; alice cannot see it; bob cannot set its status; carol (admin) can.
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$
declare ok boolean; n int;
begin
  insert into public.suggestions (kind, body) values ('idea', 'Bobs forslag');
  assert (select user_id from public.suggestions where body = 'Bobs forslag') = auth.uid(),
    'a suggestion must belong to the sender';

  ok := false;
  begin insert into public.suggestions (kind, body, user_id)
    values ('idea', 'Forfalsket', 'aaaaaaaa-0000-0000-0000-000000000001');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'a suggestion must not be sent in someone else''s name';

  ok := false;
  begin update public.suggestions set status = 'done' where body = 'Bobs forslag';
  get diagnostics n = row_count;
  ok := n = 0;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'a regular user must not set status';

  ok := false;
  begin perform public.admin_list_suggestions();
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'admin_list_suggestions is for admins only';
end $$;

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.suggestions where body = 'Bobs forslag';
  assert n = 0, 'alice must not see bob''s suggestion';
  delete from public.suggestions where body = 'Bobs forslag';
  get diagnostics n = row_count;
  assert n = 0, 'alice must not delete bob''s suggestion';
end $$;

select set_config('request.jwt.claims',
  '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true);
do $$
declare n int;
begin
  update public.suggestions set status = 'planned', reply = 'God idé' where body = 'Bobs forslag';
  get diagnostics n = row_count;
  assert n = 1, 'an admin must be able to set status and reply';
  select count(*) into n from public.admin_list_suggestions() where body = 'Bobs forslag';
  assert n = 1, 'the admin list must include bob''s suggestion';
end $$;

select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$
declare n int;
begin
  assert (select status from public.suggestions where body = 'Bobs forslag') = 'planned',
    'bob must see the status the admin set';
  delete from public.suggestions where body = 'Bobs forslag';
  get diagnostics n = row_count;
  assert n = 0, 'a suggestion the admin has handled must not be deleted by its sender';
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
  begin
    select count(*) into n from public.shopping_lists;
    assert n = 0, format('anon can read %s shopping list(s)', n);
  exception when insufficient_privilege then null; end;
  begin
    select count(*) into n from public.shopping_list_items;
    assert n = 0, format('anon can read %s shopping item(s)', n);
  exception when insufficient_privilege then null; end;
  begin
    select count(*) into n from public.aisle_map;
    assert n = 0, format('anon can read %s aisle_map row(s)', n);
  exception when insufficient_privilege then null; end;

  -- RLS helpers and RPCs must not be callable without signing in
  begin
    perform public.is_admin();
    raise exception 'anon executed is_admin';
  exception when insufficient_privilege then null; end;
  begin
    perform public.owns_recipe(gen_random_uuid());
    raise exception 'anon executed owns_recipe';
  exception when insufficient_privilege then null; end;
  begin
    perform public.can_edit_recipe(gen_random_uuid());
    raise exception 'anon executed can_edit_recipe';
  exception when insufficient_privilege then null; end;
  begin
    perform public.create_list('anon list');
    raise exception 'anon executed create_list';
  exception when insufficient_privilege then null; end;
  begin
    select count(*) into n from public.aisle_overrides;
    raise exception 'anon read aisle_overrides';
  exception when insufficient_privilege then null; end;
  begin
    select count(*) into n from public.suggestions;
    raise exception 'anon read suggestions';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
do $$ begin raise notice 'ALL RLS TESTS PASSED'; end $$;
rollback;
