-- CartMates · 0004 · A permanent invite code for every list
-- Until now a person could join a list only through a live party's code.
-- Now each list has its own code that works any time, so you can share a list
-- right after you create it. Party codes still work as before.
--   * Every member can see the code (they can already see the list) and pass it on.
--   * Nobody can pick or edit a code by hand. It is made by the database.
--   * Only the owner can retire a code and get a fresh one. Members who already
--     joined stay; the old code stops working.

alter table public.lists
  add column invite_code text not null unique
    default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

create or replace function private.guard_list()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.invite_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    return new;
  end if;
  if new.invite_code <> old.invite_code
     and coalesce(current_setting('cartmates.new_code', true), '') <> 'on' then
    raise exception 'A list''s invite code can''t be edited. Ask the owner for a new one instead.';
  end if;
  return new;
end;
$$;

create trigger lists_guard
  before insert or update on public.lists
  for each row execute function private.guard_list();

-- Joining with a list code: you become a member, nothing else changes.
create or replace function public.join_list(code text)
returns public.lists
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  l  public.lists;
begin
  if me is null then
    raise exception 'Sign in to join a list';
  end if;

  select * into l from public.lists where invite_code = btrim(code);
  if not found then
    raise exception 'That invite code doesn''t match any list';
  end if;

  insert into public.list_members (list_id, user_id, role)
  values (l.id, me, 'member')
  on conflict (list_id, user_id) do nothing;

  return l;
end;
$$;

-- The owner retires the current code and gets a new one.
create or replace function public.reset_list_invite(list_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  fresh text;
begin
  if not private.is_list_owner(list_id) then
    raise exception 'Only the list owner can make a new invite code';
  end if;
  perform set_config('cartmates.new_code', 'on', true);
  update public.lists
     set invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
   where id = list_id
  returning invite_code into fresh;
  perform set_config('cartmates.new_code', 'off', true);
  return fresh;
end;
$$;

revoke all on function public.join_list(text) from public, anon;
revoke all on function public.reset_list_invite(uuid) from public, anon;
grant execute on function public.join_list(text) to authenticated;
grant execute on function public.reset_list_invite(uuid) to authenticated;
