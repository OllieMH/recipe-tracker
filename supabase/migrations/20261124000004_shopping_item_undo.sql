-- Undo for unit changes on shopping list items.
--
-- When a row is converted to another unit (merge or manual conversion) the client
-- stores what it was before in these columns, only if they are still empty, so
-- several conversions in a row still undo back to the very first amount and unit.
-- Undo writes the originals back and clears these columns. Any list member can
-- undo (same rule as editing items); everything is covered by the existing
-- item policies.

alter table public.shopping_list_items
  add column orig_amount     numeric,
  add column orig_amount_max numeric,
  add column orig_unit       text;

grant update (orig_amount, orig_amount_max, orig_unit)
  on public.shopping_list_items to authenticated;
