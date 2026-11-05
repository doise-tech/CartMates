-- CartMates · 0001 · Tables
-- The list is home base; a party is one shopping trip to it.

-- ─────────────────────────────────────────────
-- Shared helpers
-- ─────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Rule 6: one product, many saves. Tracking bits are removed from links
-- so the same product is never stored twice.
create or replace function public.clean_product_url(raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  url   text;
  base  text;
  qs    text;
  part  text;
  kept  text[] := '{}';
  host  text;
begin
  if raw is null then
    return null;
  end if;

  url  := split_part(btrim(raw), '#', 1);
  base := split_part(url, '?', 1);
  qs   := nullif(substr(url, length(base) + 2), '');

  if qs is not null then
    foreach part in array string_to_array(qs, '&') loop
      if part <> ''
         and lower(split_part(part, '=', 1)) !~
           '^(utm_.*|ref|ref_.*|fbclid|gclid|gclsrc|dclid|msclkid|mc_cid|mc_eid|igshid|_ga|_gl|affid|aff_id|affiliate.*|tag|psc|smid|linkcode|ascsubtag|pd_rd_.*|pf_rd_.*|sr|qid|sprefix|crid|keywords|spm|scm)$'
      then
        kept := kept || part;
      end if;
    end loop;
  end if;

  -- lowercase the scheme + host, keep the path as-is
  host := substring(base from '^[A-Za-z][A-Za-z0-9+.-]*://[^/]+');
  if host is not null then
    base := lower(host) || substr(base, length(host) + 1);
  end if;

  -- drop a trailing slash on the path
  if base ~ '://[^/]+/.+/$' then
    base := left(base, length(base) - 1);
  end if;

  if array_length(kept, 1) is null then
    return base;
  end if;
  return base || '?' || array_to_string(kept, '&');
end;
$$;

-- ─────────────────────────────────────────────
-- People
-- ─────────────────────────────────────────────
create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  display_name          text not null default '' check (char_length(display_name) <= 60),
  avatar_url            text,
  preferred_currency    text not null default 'INR' check (char_length(preferred_currency) = 3),
  notifications_enabled boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────
-- Lists (home base) and who belongs to them
-- ─────────────────────────────────────────────
create type public.member_role as enum ('owner', 'member');

create table public.lists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  owner_id    uuid references public.profiles (id) on delete set null,
  cover_image text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index lists_owner_id_idx on public.lists (owner_id);

create trigger lists_updated_at
  before update on public.lists
  for each row execute function public.set_updated_at();

create table public.list_members (
  list_id   uuid not null references public.lists (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index list_members_user_id_idx on public.list_members (user_id);
-- exactly one owner per list
create unique index list_members_one_owner on public.list_members (list_id) where role = 'owner';

-- ─────────────────────────────────────────────
-- Parties (one shopping trip to a list)
-- ─────────────────────────────────────────────
create type public.party_status as enum ('live', 'ended');

create table public.parties (
  id               uuid primary key default gen_random_uuid(),
  list_id          uuid not null references public.lists (id) on delete cascade,
  host_id          uuid references public.profiles (id) on delete set null,
  label            text check (char_length(label) <= 80),
  status           public.party_status not null default 'live',
  invite_code      text not null unique
                     default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  started_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at         timestamptz,
  constraint parties_ended_at_matches_status
    check ((status = 'ended') = (ended_at is not null))
);
create index parties_list_id_idx on public.parties (list_id);
create index parties_host_id_idx on public.parties (host_id);
create index parties_live_idx on public.parties (last_activity_at) where status = 'live';

create table public.party_members (
  party_id  uuid not null references public.parties (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  primary key (party_id, user_id)
);
create index party_members_user_id_idx on public.party_members (user_id);

-- ─────────────────────────────────────────────
-- Products (stored once) and saves (list items)
-- ─────────────────────────────────────────────
create table public.products (
  id                uuid primary key default gen_random_uuid(),
  url               text not null unique,
  store_domain      text not null default '',
  title             text not null check (char_length(title) <= 300),
  brand             text check (char_length(brand) <= 120),
  image_url         text,
  price             numeric(12, 2) check (price >= 0),
  currency          text check (char_length(currency) = 3),
  first_captured_at timestamptz not null default now(),
  price_checked_at  timestamptz not null default now()
);

create or replace function public.products_clean()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.url := public.clean_product_url(new.url);
  new.store_domain := regexp_replace(
    lower(coalesce(substring(new.url from '^[a-z][a-z0-9+.-]*://([^/:?]+)'), '')),
    '^www\.', ''
  );
  return new;
end;
$$;

create trigger products_clean
  before insert or update of url on public.products
  for each row execute function public.products_clean();

-- Rule 8: saved → in cart → claimed → bought (and back again)
create type public.item_status as enum ('saved', 'in_cart', 'claimed', 'bought');

create table public.list_items (
  id               uuid primary key default gen_random_uuid(),
  list_id          uuid not null references public.lists (id) on delete cascade,
  product_id       uuid not null references public.products (id) on delete restrict,
  added_by         uuid references public.profiles (id) on delete set null,
  party_id         uuid references public.parties (id) on delete set null,
  price_at_save    numeric(12, 2) check (price_at_save >= 0),
  currency_at_save text check (char_length(currency_at_save) = 3),
  variant          text check (char_length(variant) <= 120),
  quantity         integer not null default 1 check (quantity between 1 and 99),
  note             text check (char_length(note) <= 500),
  status           public.item_status not null default 'saved',
  claimed_by       uuid references public.profiles (id) on delete set null,
  claimed_at       timestamptz,
  bought_at        timestamptz,
  removed_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint list_items_claim_has_claimer
    check (status <> 'claimed' or claimed_by is not null),
  constraint list_items_id_list_unique unique (id, list_id)
);
create index list_items_list_id_idx    on public.list_items (list_id);
create index list_items_product_id_idx on public.list_items (product_id);
create index list_items_added_by_idx   on public.list_items (added_by);
create index list_items_party_id_idx   on public.list_items (party_id);
create index list_items_claimed_by_idx on public.list_items (claimed_by);

create trigger list_items_updated_at
  before update on public.list_items
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────
-- Tags (per list), reactions, chat
-- ─────────────────────────────────────────────
create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.lists (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  constraint tags_id_list_unique unique (id, list_id)
);
-- Rule 10: "gifts" and "Gifts" can't both exist in one list
create unique index tags_list_name_unique on public.tags (list_id, lower(btrim(name)));

create table public.item_tags (
  item_id uuid not null,
  tag_id  uuid not null,
  list_id uuid not null,
  primary key (item_id, tag_id),
  -- a tag can only go on an item from the same list
  foreign key (item_id, list_id) references public.list_items (id, list_id) on delete cascade,
  foreign key (tag_id, list_id)  references public.tags (id, list_id)       on delete cascade
);
create index item_tags_tag_id_idx  on public.item_tags (tag_id, list_id);
create index item_tags_item_list_idx on public.item_tags (item_id, list_id);

-- Rule 9: one reaction per person per item
create table public.reactions (
  item_id    uuid not null references public.list_items (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null check (char_length(type) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index reactions_user_id_idx on public.reactions (user_id);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  party_id   uuid not null references public.parties (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,
  body       text not null default '' check (char_length(body) <= 2000),
  item_id    uuid references public.list_items (id) on delete set null,
  created_at timestamptz not null default now()
);
create index messages_party_id_idx on public.messages (party_id, created_at);
create index messages_user_id_idx  on public.messages (user_id);
create index messages_item_id_idx  on public.messages (item_id);
