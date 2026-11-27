-- Oven settings per recipe: what the oven should be set to, kept apart from the
-- steps so it can be shown at a glance.
--
-- oven is a list of settings in the order they are used (bread: 250 °C, then 200 °C):
--   [{ temp_c, mode, minutes, minutes_max, rack, note }]
-- mode: over_under | varmluft | overvarme | undervarme | grill | varmluft_grill
-- rack: nederst | midten | overst
-- Every field may be null. The shape is checked by the app (zod), not here.

alter table public.recipes
  add column oven jsonb not null default '[]'::jsonb
  check (jsonb_typeof(oven) = 'array' and jsonb_array_length(oven) <= 10);

-- save_recipe, update_recipe and copy_recipe: unchanged apart from oven.

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
        food_id, original_text, original_amount, original_unit
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
        ing->>'original_unit'
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
        food_id, original_text, original_amount, original_unit
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
        ing->>'original_unit'
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
      food_id, original_text, original_amount, original_unit
    )
    select new_grp, i.position, i.amount, i.amount_max, i.unit, i.name, i.note, i.scalable,
           i.food_id, i.original_text, i.original_amount, i.original_unit
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
