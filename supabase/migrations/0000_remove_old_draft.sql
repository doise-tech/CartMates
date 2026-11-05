-- CartMates · 0000 · Clear out the empty Oct 12 draft before the new model goes in
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.item_comments   cascade;
drop table if exists public.item_reactions  cascade;
drop table if exists public.saved_items     cascade;
drop table if exists public.messages        cascade;
drop table if exists public.session_members cascade;
drop table if exists public.sessions        cascade;
drop table if exists public.profiles        cascade;

drop function if exists public.create_session cascade;
drop function if exists public.join_session cascade;
drop function if exists public.handle_new_user cascade;
drop function if exists private.is_session_member cascade;
drop function if exists private.is_session_owner cascade;
