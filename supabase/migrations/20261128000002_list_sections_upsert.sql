-- The app saves a list's own section with an upsert, and PostgREST's upsert writes
-- every column it sends, also on conflict. Allow updating the key columns too; RLS
-- still only lets members touch rows of their own lists (the new list_id included).
grant update (list_id, name_key, aisle) on public.shopping_list_aisle_overrides to authenticated;
