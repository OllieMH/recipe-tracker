-- Recipe pictures.
--
-- recipes.image_path: object path inside the private bucket, "<recipe_id>/<timestamp>.webp".
-- A thumbnail lives next to it as "<recipe_id>/<timestamp>-thumb.webp".
-- The bucket is private: the client reads images through short-lived signed URLs,
-- and storage policies decide who may read or write, based on the recipe's own RLS.

alter table public.recipes add column image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images', 'recipe-images', false, 5242880,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

-- Safely extracts the recipe id from the first path segment (null if it is not a uuid).
create or replace function public.image_recipe_id(path text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(path, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(path, '/', 1)::uuid
  end;
$$;

-- Read: anyone who can see the recipe (recipes RLS applies inside the subquery).
create policy "Read recipe images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recipe-images'
    and exists (select 1 from public.recipes r where r.id = public.image_recipe_id(name))
  );

-- Write: whoever may edit the recipe (owner, or admin on a public recipe).
create policy "Upload recipe images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recipe-images'
    and public.can_edit_recipe(public.image_recipe_id(name))
  );

create policy "Replace recipe images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'recipe-images'
    and public.can_edit_recipe(public.image_recipe_id(name))
  )
  with check (
    bucket_id = 'recipe-images'
    and public.can_edit_recipe(public.image_recipe_id(name))
  );

create policy "Delete recipe images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'recipe-images'
    and public.can_edit_recipe(public.image_recipe_id(name))
  );

-- "Lag min versjon" should carry the picture over (the copy points at the original's file).
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
    was_translated, tips, tags, import_raw_text, image_path
  ) values (
    auth.uid(), src.id, 'private', src.title, src.description, src.servings, src.servings_unit,
    src.prep_minutes, src.total_minutes, src.source_url, src.source_site, src.original_language,
    src.was_translated, src.tips, src.tags, src.import_raw_text, src.image_path
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
