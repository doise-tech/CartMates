-- Comments on a saved item, for everyone on the list. They work with or without a live party.
-- (Votes need no change: they are rows in public.reactions with type 'up' or 'down'; one vote per person per item.)
create table if not exists public.item_comments (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.list_items(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists item_comments_item_idx on public.item_comments (item_id, created_at);

alter table public.item_comments enable row level security;

create policy "Members read item comments" on public.item_comments
  for select to authenticated
  using (private.is_list_member(private.item_list_id(item_id)));

create policy "Members comment on items" on public.item_comments
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_list_member(private.item_list_id(item_id)));

create policy "Delete your own comment" on public.item_comments
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.item_comments to authenticated;

alter publication supabase_realtime add table public.item_comments;
