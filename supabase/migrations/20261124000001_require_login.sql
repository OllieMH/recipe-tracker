-- Recipes are for signed-in users only ("Logg inn for å se oppskriftene").
--
-- Until now the recipe policies applied to the `public` role, which includes
-- `anon`, so anyone holding the anon key (it ships in the frontend bundle)
-- could read every PUBLIC recipe through the API without logging in.
-- foods / food_measures and the storage policies already require sign-in.

-- 1. Limit every policy on the recipe tables to signed-in users.
--    (Loops over pg_policies so it also covers policies added by later migrations.)
do $$
declare p record;
begin
  for p in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('recipes', 'ingredient_groups', 'ingredients', 'steps')
  loop
    execute format('alter policy %I on public.%I to authenticated', p.policyname, p.tablename);
  end loop;
end $$;

-- 2. Defense in depth: the anon role never needs direct access to app tables
--    (sign-in and password reset go through the auth API, not these tables).
revoke all on public.recipes, public.ingredient_groups, public.ingredients,
              public.steps, public.favorites, public.profiles,
              public.import_log
  from anon;
