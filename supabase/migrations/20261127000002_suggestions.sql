-- Suggestions for the app: ideas, things that do not work, wishes.
--
-- Anyone signed in can send one and sees their own, with the status the admin
-- sets. Admins see all of them and set status and a short reply.

create table public.suggestions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind        text not null default 'idea' check (kind in ('idea', 'problem', 'other')),
  body        text not null check (char_length(btrim(body)) between 3 and 2000),
  status      text not null default 'new' check (status in ('new', 'planned', 'done', 'declined')),
  reply       text check (char_length(reply) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index suggestions_user_idx on public.suggestions(user_id);

create trigger suggestions_updated_at
  before update on public.suggestions
  for each row execute function public.set_updated_at();

revoke all on public.suggestions from anon;
revoke insert, update, delete, truncate on public.suggestions from authenticated;
-- Users may only fill in what they wrote; status and reply are the admin's.
grant insert (kind, body) on public.suggestions to authenticated;
grant update (status, reply) on public.suggestions to authenticated;
grant delete on public.suggestions to authenticated;

alter table public.suggestions enable row level security;

create policy "Users read own suggestions, admins all"
  on public.suggestions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "Users send suggestions as themselves"
  on public.suggestions for insert to authenticated
  with check (user_id = auth.uid());

create policy "Admins update suggestions"
  on public.suggestions for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Taking back your own suggestion is fine while nobody has looked at it yet.
create policy "Users delete own new suggestions, admins any"
  on public.suggestions for delete to authenticated
  using ((user_id = auth.uid() and status = 'new') or public.is_admin());

-- The admin list shows who sent each one.
create or replace function public.admin_list_suggestions()
returns table (
  id uuid, kind text, body text, status text, reply text,
  created_at timestamptz, display_name text, email text
)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return query
    select s.id, s.kind, s.body, s.status, s.reply, s.created_at, p.display_name, u.email::text
    from public.suggestions s
    join public.profiles p on p.id = s.user_id
    join auth.users u on u.id = s.user_id
    order by s.created_at desc;
end;
$$;

revoke all on function public.admin_list_suggestions() from public, anon;
grant execute on function public.admin_list_suggestions() to authenticated;
