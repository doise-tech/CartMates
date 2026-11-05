-- CartMates · 0002 · House rules
-- Rule 2: membership opens every door. Every table gets Row Level Security,
-- and every policy asks "are you in this list?"

-- ─────────────────────────────────────────────
-- Private helpers (not exposed through the API)
-- ─────────────────────────────────────────────
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_list_member(l uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.list_members
    where list_id = l and user_id = (select auth.uid())
  );
$$;

create or replace function private.is_list_owner(l uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.list_members
    where list_id = l and user_id = (select auth.uid()) and role = 'owner'
  );
$$;

create or replace function private.party_list_id(p uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select list_id from public.parties where id = p;
$$;

create or replace function private.item_list_id(i uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select list_id from public.list_items where id = i;
$$;

create or replace function private.shares_list_with(other uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.list_members mine
    join public.list_members theirs on theirs.list_id = mine.list_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other
  );
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ─────────────────────────────────────────────
-- Automatic housekeeping
-- ─────────────────────────────────────────────

-- A profile is created the moment someone signs up
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ), 60),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

insert into public.profiles (id, display_name)
select id, left(split_part(coalesce(email, ''), '@', 1), 60) from auth.users
on conflict (id) do nothing;

-- Whoever creates a list becomes its owner
alter table public.lists alter column owner_id set default auth.uid();

create or replace function private.add_list_owner()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.owner_id is not null then
    insert into public.list_members (list_id, user_id, role)
    values (new.id, new.owner_id, 'owner')
    on conflict (list_id, user_id) do update set role = 'owner';
  end if;
  return null;
end;
$$;

create trigger lists_add_owner
  after insert on public.lists
  for each row execute function private.add_list_owner();

-- Rule 12: if the owner leaves, the longest-standing member takes over;
-- if nobody is left, the list is deleted.
create or replace function private.handover_ownership()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  heir uuid;
begin
  if old.role <> 'owner' then
    return null;
  end if;
  if not exists (select 1 from public.lists where id = old.list_id) then
    return null; -- the whole list is being deleted
  end if;

  select user_id into heir
  from public.list_members
  where list_id = old.list_id
  order by joined_at, user_id
  limit 1;

  if heir is null then
    delete from public.lists where id = old.list_id;
  else
    update public.list_members set role = 'owner'
      where list_id = old.list_id and user_id = heir;
    update public.lists set owner_id = heir where id = old.list_id;
  end if;
  return null;
end;
$$;

create trigger list_members_handover
  after delete on public.list_members
  for each row execute function private.handover_ownership();

-- Rule 5: a party is live → ended, never back. Ending stamps the time.
create or replace function private.guard_party()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'live';
    new.ended_at := null;
    new.started_at := now();
    new.last_activity_at := now();
    return new;
  end if;

  if new.list_id <> old.list_id or new.invite_code <> old.invite_code then
    raise exception 'A party''s list and invite code can''t be changed';
  end if;
  if old.status = 'ended' and new.status = 'live' then
    raise exception 'An ended party can''t be restarted. Start a new one instead.';
  end if;
  if old.status = 'live' and new.status = 'ended' then
    new.ended_at := now();
  end if;
  return new;
end;
$$;

create trigger parties_guard
  before insert or update on public.parties
  for each row execute function private.guard_party();

-- The host joins their own party automatically
create or replace function private.add_party_host()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.host_id is not null then
    insert into public.party_members (party_id, user_id)
    values (new.id, new.host_id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger parties_add_host
  after insert on public.parties
  for each row execute function private.add_party_host();

-- Activity keeps a party awake (used by the auto-end in rule 5)
create or replace function private.touch_party()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.party_id is not null then
    update public.parties set last_activity_at = now()
      where id = new.party_id and status = 'live';
  end if;
  return null;
end;
$$;

create trigger messages_touch_party
  after insert on public.messages
  for each row execute function private.touch_party();

create trigger list_items_touch_party
  after insert on public.list_items
  for each row execute function private.touch_party();

-- Rules 8 and 11: how an item may move along saved → in cart → claimed → bought
create or replace function private.guard_list_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  me       uuid := auth.uid();
  is_owner boolean;
begin
  if tg_op = 'INSERT' then
    if new.party_id is not null and
       not exists (select 1 from public.parties
                   where id = new.party_id and list_id = new.list_id) then
      raise exception 'That party isn''t shopping for this list';
    end if;
    if me is not null then
      new.added_by := me;
    end if;
    if new.status = 'claimed' then
      new.claimed_by := coalesce(new.claimed_by, me);
      new.claimed_at := now();
    end if;
    return new;
  end if;

  -- UPDATE
  if new.list_id <> old.list_id or new.product_id <> old.product_id
     or new.added_by is distinct from old.added_by
     or new.party_id is distinct from old.party_id then
    raise exception 'An item''s list, product, adder and party are fixed once saved';
  end if;

  if me is null then
    return new; -- trusted server-side change
  end if;

  is_owner := private.is_list_owner(old.list_id);

  -- removing / restoring an item: whoever added it, or the list owner
  if new.removed_at is distinct from old.removed_at then
    if not (old.added_by = me or is_owner) then
      raise exception 'Only the person who added this item, or the list owner, can remove it';
    end if;
  end if;

  if new.status is distinct from old.status
     or new.claimed_by is distinct from old.claimed_by then

    -- someone else's claim can only be touched by them or the owner
    if old.claimed_by is not null and old.claimed_by <> me and not is_owner then
      raise exception 'This item is already claimed by someone else';
    end if;

    if new.status = 'claimed' then
      if old.status <> 'claimed' or old.claimed_by is null then
        new.claimed_by := me;
        new.claimed_at := now();
      end if;
      new.bought_at := null;
    elsif new.status = 'bought' then
      if old.claimed_by is null then
        new.claimed_by := me;
        new.claimed_at := now();
      else
        new.claimed_by := old.claimed_by;
        new.claimed_at := old.claimed_at;
      end if;
      new.bought_at := coalesce(old.bought_at, now());
    else
      -- back to saved / in cart releases the claim
      new.claimed_by := null;
      new.claimed_at := null;
      new.bought_at  := null;
    end if;
  end if;

  return new;
end;
$$;

create trigger list_items_guard
  before insert or update on public.list_items
  for each row execute function private.guard_list_item();

-- ─────────────────────────────────────────────
-- Actions the extension calls
-- ─────────────────────────────────────────────

-- Rule 4: an invite code adds you to the party AND its list.
-- It stops working once the party ends.
create or replace function public.join_party(code text)
returns public.parties
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  p  public.parties;
begin
  if me is null then
    raise exception 'Sign in to join a party';
  end if;

  select * into p from public.parties where invite_code = btrim(code);
  if not found then
    raise exception 'That invite code doesn''t match any party';
  end if;
  if p.status <> 'live' then
    raise exception 'This party has already ended';
  end if;

  insert into public.list_members (list_id, user_id, role)
  values (p.list_id, me, 'member')
  on conflict (list_id, user_id) do nothing;

  insert into public.party_members (party_id, user_id)
  values (p.id, me)
  on conflict (party_id, user_id) do update set left_at = null, joined_at = now();

  update public.parties set last_activity_at = now() where id = p.id
  returning * into p;
  return p;
end;
$$;

-- Rules 6, 7, 15: saving happens only when someone clicks save.
-- The product is stored once (link cleaned) and the price is a snapshot.
create or replace function public.save_item(
  p_list_id   uuid,
  p_url       text,
  p_title     text,
  p_image_url text    default null,
  p_price     numeric default null,
  p_currency  text    default null,
  p_brand     text    default null,
  p_variant   text    default null,
  p_quantity  integer default 1,
  p_note      text    default null,
  p_party_id  uuid    default null
)
returns public.list_items
language plpgsql security definer
set search_path = ''
as $$
declare
  me     uuid := auth.uid();
  prod   uuid;
  item   public.list_items;
begin
  if me is null then
    raise exception 'Sign in to save items';
  end if;
  if not private.is_list_member(p_list_id) then
    raise exception 'You''re not a member of this list';
  end if;
  if p_party_id is not null and not exists (
    select 1 from public.parties
    where id = p_party_id and list_id = p_list_id and status = 'live'
  ) then
    raise exception 'That party isn''t live for this list';
  end if;

  insert into public.products (url, title, brand, image_url, price, currency)
  values (p_url, left(p_title, 300), p_brand, p_image_url, p_price, upper(p_currency))
  on conflict (url) do update set
    title            = coalesce(excluded.title, public.products.title),
    brand            = coalesce(excluded.brand, public.products.brand),
    image_url        = coalesce(excluded.image_url, public.products.image_url),
    price            = coalesce(excluded.price, public.products.price),
    currency         = coalesce(excluded.currency, public.products.currency),
    price_checked_at = case when excluded.price is not null then now()
                            else public.products.price_checked_at end
  returning id into prod;

  insert into public.list_items
    (list_id, product_id, added_by, party_id, price_at_save, currency_at_save,
     variant, quantity, note)
  values
    (p_list_id, prod, me, p_party_id, p_price, upper(p_currency),
     p_variant, coalesce(p_quantity, 1), p_note)
  returning * into item;

  return item;
end;
$$;

-- Rule 5: parties quiet for 6 hours end on their own
create or replace function private.end_stale_parties()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.parties
     set status = 'ended'
   where status = 'live'
     and last_activity_at < now() - interval '6 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function private.end_stale_parties() from public, anon, authenticated;

revoke all on function public.join_party(text) from public, anon;
revoke all on function public.save_item(uuid, text, text, text, numeric, text, text, text, integer, text, uuid) from public, anon;
grant execute on function public.join_party(text) to authenticated;
grant execute on function public.save_item(uuid, text, text, text, numeric, text, text, text, integer, text, uuid) to authenticated;

-- ─────────────────────────────────────────────
-- Row Level Security: the guest list at every door
-- ─────────────────────────────────────────────
alter table public.profiles      enable row level security;
alter table public.lists         enable row level security;
alter table public.list_members  enable row level security;
alter table public.parties       enable row level security;
alter table public.party_members enable row level security;
alter table public.products      enable row level security;
alter table public.list_items    enable row level security;
alter table public.tags          enable row level security;
alter table public.item_tags     enable row level security;
alter table public.reactions     enable row level security;
alter table public.messages      enable row level security;

-- Profiles: you, and the people you share a list with
create policy "See yourself and your list-mates" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_list_with(id));
create policy "Edit your own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Lists (rule 3: only the owner renames or deletes)
create policy "Members see their lists" on public.lists
  for select to authenticated
  using (private.is_list_member(id) or owner_id = (select auth.uid()));
create policy "Anyone signed in can start a list" on public.lists
  for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Owner edits the list" on public.lists
  for update to authenticated
  using (private.is_list_owner(id)) with check (private.is_list_owner(id));
create policy "Owner deletes the list" on public.lists
  for delete to authenticated
  using (private.is_list_owner(id));

-- List members (joining happens through an invite code)
create policy "Members see who's in the list" on public.list_members
  for select to authenticated
  using (private.is_list_member(list_id));
create policy "Leave a list, or owner removes someone" on public.list_members
  for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_list_owner(list_id));

-- Parties (rule 3: only the host ends it)
create policy "Members see the list's parties" on public.parties
  for select to authenticated
  using (private.is_list_member(list_id));
create policy "Members start a party" on public.parties
  for insert to authenticated
  with check (host_id = (select auth.uid()) and private.is_list_member(list_id));
create policy "Host manages the party" on public.parties
  for update to authenticated
  using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));

-- Party members
create policy "Members see who's at the party" on public.party_members
  for select to authenticated
  using (private.is_list_member(private.party_list_id(party_id)));
create policy "Rejoin a live party of your list" on public.party_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.is_list_member(private.party_list_id(party_id))
    and exists (select 1 from public.parties where id = party_id and status = 'live')
  );
create policy "Mark yourself as left" on public.party_members
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Products: you see products saved into your lists; new ones come in via save_item
create policy "See products saved in your lists" on public.products
  for select to authenticated
  using (exists (
    select 1 from public.list_items li
    where li.product_id = products.id and private.is_list_member(li.list_id)
  ));

-- List items
create policy "Members see the list's items" on public.list_items
  for select to authenticated
  using (private.is_list_member(list_id));
create policy "Members add items" on public.list_items
  for insert to authenticated
  with check (private.is_list_member(list_id) and added_by = (select auth.uid()));
create policy "Members update items" on public.list_items
  for update to authenticated
  using (private.is_list_member(list_id)) with check (private.is_list_member(list_id));
create policy "Owner can clean out items for good" on public.list_items
  for delete to authenticated
  using (private.is_list_owner(list_id));

-- Tags (rule 10: belong to a list)
create policy "Members see tags" on public.tags
  for select to authenticated using (private.is_list_member(list_id));
create policy "Members create tags" on public.tags
  for insert to authenticated with check (private.is_list_member(list_id));
create policy "Members rename tags" on public.tags
  for update to authenticated
  using (private.is_list_member(list_id)) with check (private.is_list_member(list_id));
create policy "Members delete tags" on public.tags
  for delete to authenticated using (private.is_list_member(list_id));

create policy "Members see item tags" on public.item_tags
  for select to authenticated using (private.is_list_member(list_id));
create policy "Members tag items" on public.item_tags
  for insert to authenticated with check (private.is_list_member(list_id));
create policy "Members untag items" on public.item_tags
  for delete to authenticated using (private.is_list_member(list_id));

-- Reactions (rule 9: one per person per item, and only your own)
create policy "Members see reactions" on public.reactions
  for select to authenticated
  using (private.is_list_member(private.item_list_id(item_id)));
create policy "React to items in your lists" on public.reactions
  for insert to authenticated
  with check (user_id = (select auth.uid())
              and private.is_list_member(private.item_list_id(item_id)));
create policy "Change your reaction" on public.reactions
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Remove your reaction" on public.reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Messages (rule 5: an ended party's chat is read-only history)
create policy "Members read the party chat" on public.messages
  for select to authenticated
  using (private.is_list_member(private.party_list_id(party_id)));
create policy "Chat in a live party" on public.messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.is_list_member(private.party_list_id(party_id))
    and exists (select 1 from public.parties where id = party_id and status = 'live')
    and (item_id is null or private.item_list_id(item_id) = private.party_list_id(party_id))
  );

-- Visitors who aren't signed in get nothing
revoke all on all tables in schema public from anon;

-- ─────────────────────────────────────────────
-- Live updates (Realtime still respects every rule above)
-- ─────────────────────────────────────────────
alter publication supabase_realtime add table
  public.messages, public.list_items, public.parties,
  public.party_members, public.reactions, public.item_tags;
