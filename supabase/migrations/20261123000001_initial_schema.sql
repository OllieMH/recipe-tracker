-- =============================================================
-- Initial schema for recipe-tracker
-- =============================================================

-- ---------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Auto-create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- foods + food_measures  (seeded from Mattilsynet API)
-- ---------------------------------------------------------------
create table public.foods (
  id         bigint generated always as identity primary key,
  name_no    text not null,
  name_en    text,
  aliases    text[] not null default '{}',
  category   text,
  source     text not null default 'mattilsynet'
             check (source in ('mattilsynet', 'manual'))
);

create index foods_name_no_idx on public.foods using gin (to_tsvector('norwegian', name_no));
create index foods_aliases_idx on public.foods using gin (aliases);

create table public.food_measures (
  id       bigint generated always as identity primary key,
  food_id  bigint not null references public.foods(id) on delete cascade,
  unit     text not null,   -- e.g. 'dl', 'ss', 'ts', 'stk', 'fedd', 'neve'
  grams    numeric not null check (grams > 0),
  source   text not null default 'mattilsynet',
  unique (food_id, unit)
);

-- ---------------------------------------------------------------
-- recipes
-- ---------------------------------------------------------------
create table public.recipes (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles(id) on delete cascade,
  parent_id         uuid references public.recipes(id) on delete set null,
  visibility        text not null default 'public'
                    check (visibility in ('public', 'private')),

  title             text not null,
  description       text,
  servings          numeric,
  servings_unit     text,                -- e.g. 'porsjoner', 'stk', 'boller'
  prep_minutes      int,
  total_minutes     int,

  source_url        text,
  source_site       text,
  original_language text,               -- ISO 639-1 code, e.g. 'no', 'en'
  was_translated    boolean not null default false,

  tips              text[] not null default '{}',
  tags              text[] not null default '{}',

  import_raw_text   text,               -- kept for "Fix with AI" and re-import

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index recipes_owner_idx      on public.recipes(owner_id);
create index recipes_parent_idx     on public.recipes(parent_id);
create index recipes_visibility_idx on public.recipes(visibility);
create index recipes_tags_idx       on public.recipes using gin(tags);
create index recipes_title_search_idx on public.recipes using gin(to_tsvector('norwegian', title));

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger recipes_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- ingredient_groups
-- ---------------------------------------------------------------
create table public.ingredient_groups (
  id        bigint generated always as identity primary key,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  position  int not null default 0,
  name      text                        -- null = default (ungrouped) group
);

create index ingredient_groups_recipe_idx on public.ingredient_groups(recipe_id);

-- ---------------------------------------------------------------
-- ingredients
-- ---------------------------------------------------------------
create table public.ingredients (
  id              bigint generated always as identity primary key,
  group_id        bigint not null references public.ingredient_groups(id) on delete cascade,
  position        int not null default 0,

  amount          numeric,
  amount_max      numeric,              -- for ranges like 2–3
  unit            text,                 -- canonical unit (see brief section 5)
  name            text not null,
  note            text,                 -- e.g. 'finhakket'

  scalable        boolean not null default true,
  food_id         bigint references public.foods(id) on delete set null,

  original_text   text not null,        -- exact source line, untranslated
  original_amount numeric,
  original_unit   text
);

create index ingredients_group_idx on public.ingredients(group_id);
create index ingredients_food_idx  on public.ingredients(food_id);
create index ingredients_name_search_idx on public.ingredients using gin(to_tsvector('norwegian', name));

-- ---------------------------------------------------------------
-- steps
-- ---------------------------------------------------------------
create table public.steps (
  id         bigint generated always as identity primary key,
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  position   int not null default 0,
  group_name text,
  text       text not null
);

create index steps_recipe_idx on public.steps(recipe_id);

-- ---------------------------------------------------------------
-- favorites
-- ---------------------------------------------------------------
create table public.favorites (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index favorites_user_idx on public.favorites(user_id);

-- ---------------------------------------------------------------
-- import_log
-- ---------------------------------------------------------------
create table public.import_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  model       text not null,
  tokens_in   int,
  tokens_out  int,
  ok          boolean not null default true
);

create index import_log_user_idx  on public.import_log(user_id);
create index import_log_time_idx  on public.import_log(user_id, created_at);

-- =============================================================
-- Row Level Security
-- =============================================================

alter table public.profiles         enable row level security;
alter table public.recipes          enable row level security;
alter table public.ingredient_groups enable row level security;
alter table public.ingredients      enable row level security;
alter table public.steps            enable row level security;
alter table public.favorites        enable row level security;
alter table public.foods            enable row level security;
alter table public.food_measures    enable row level security;
alter table public.import_log       enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Helper: does the current user own this recipe?
create or replace function public.owns_recipe(recipe_id uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.recipes
    where id = recipe_id and owner_id = auth.uid()
  );
$$;

-- ---- profiles ----
create policy "Users can read own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "Users can update own profile"
  on public.profiles for update
  using (id = auth.uid());

-- ---- recipes ----
create policy "Read public or own recipes"
  on public.recipes for select
  using (visibility = 'public' or owner_id = auth.uid());

create policy "Insert own recipes"
  on public.recipes for insert
  with check (owner_id = auth.uid());

create policy "Update own recipes or admin updates public"
  on public.recipes for update
  using (
    owner_id = auth.uid()
    or (public.is_admin() and visibility = 'public')
  );

create policy "Delete own recipes or admin deletes public"
  on public.recipes for delete
  using (
    owner_id = auth.uid()
    or (public.is_admin() and visibility = 'public')
  );

-- ---- ingredient_groups (follows recipe visibility) ----
create policy "Read ingredient_groups via recipe"
  on public.ingredient_groups for select
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id
        and (r.visibility = 'public' or r.owner_id = auth.uid())
    )
  );

create policy "Modify ingredient_groups as recipe owner"
  on public.ingredient_groups for all
  using (public.owns_recipe(recipe_id))
  with check (public.owns_recipe(recipe_id));

-- ---- ingredients (follows recipe via group) ----
create policy "Read ingredients via recipe"
  on public.ingredients for select
  using (
    exists (
      select 1 from public.ingredient_groups ig
      join public.recipes r on r.id = ig.recipe_id
      where ig.id = group_id
        and (r.visibility = 'public' or r.owner_id = auth.uid())
    )
  );

create policy "Modify ingredients as recipe owner"
  on public.ingredients for all
  using (
    exists (
      select 1 from public.ingredient_groups ig
      where ig.id = group_id and public.owns_recipe(ig.recipe_id)
    )
  )
  with check (
    exists (
      select 1 from public.ingredient_groups ig
      where ig.id = group_id and public.owns_recipe(ig.recipe_id)
    )
  );

-- ---- steps (follows recipe) ----
create policy "Read steps via recipe"
  on public.steps for select
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id
        and (r.visibility = 'public' or r.owner_id = auth.uid())
    )
  );

create policy "Modify steps as recipe owner"
  on public.steps for all
  using (public.owns_recipe(recipe_id))
  with check (public.owns_recipe(recipe_id));

-- ---- favorites ----
create policy "Users manage own favorites"
  on public.favorites for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- foods + food_measures (read by all signed-in, write by admin) ----
create policy "Signed-in users can read foods"
  on public.foods for select
  using (auth.uid() is not null);

create policy "Admin can modify foods"
  on public.foods for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Signed-in users can read food_measures"
  on public.food_measures for select
  using (auth.uid() is not null);

create policy "Admin can modify food_measures"
  on public.food_measures for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---- import_log (insert from service role only; users read own rows) ----
create policy "Users read own import_log"
  on public.import_log for select
  using (user_id = auth.uid());
