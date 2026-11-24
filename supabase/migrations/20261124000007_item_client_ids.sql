-- Shopping list items get a UUID `id` that the app can choose itself.
--
-- Why: an item typed while offline must exist (and be tickable) on the phone before
-- the server has seen it, and sending it twice must not create two items. With an id
-- made on the phone the insert is idempotent: a repeat hits the primary key.
--
-- The old numeric id keeps counting up as `seq`: it is the creation order, which is
-- what items with the same `position` are sorted by. Existing items get an id derived
-- from their seq in a valid UUID shape, so they keep their order even for code that
-- still sorts by id. New items get a random UUID unless the app supplies one.
--
-- Policies, column grants (id is not updatable), triggers, realtime and replica
-- identity are table-level and stay as they are.

alter table public.shopping_list_items rename column id to seq;
alter table public.shopping_list_items drop constraint shopping_list_items_pkey;

alter table public.shopping_list_items add column id uuid not null default gen_random_uuid();
update public.shopping_list_items
  set id = ('00000000-0000-4000-8000-' || lpad(to_hex(seq), 12, '0'))::uuid;
alter table public.shopping_list_items add primary key (id);

create index shopping_list_items_order_idx on public.shopping_list_items (list_id, position, seq);
