-- Atomically save a recipe with its ingredient groups, ingredients and steps.
-- security invoker: RLS still applies, so the caller can only create recipes they own.
--
-- payload shape:
-- { visibility, title, description, servings, servings_unit, prep_minutes, total_minutes,
--   source_url, source_site, original_language, was_translated, tips[], tags[], import_raw_text,
--   ingredient_groups: [{ name, ingredients: [{ amount, amount_max, unit, name, note, scalable,
--       food_id, original_text, original_amount, original_unit }] }],
--   steps: [{ group_name, text }] }
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
    original_language, was_translated, tips, tags, import_raw_text
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
    payload->>'import_raw_text'
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
