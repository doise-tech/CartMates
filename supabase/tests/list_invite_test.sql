-- CartMates · List invite code test
-- Asha makes a list, Bina and Chetan try to get in, then everything is rolled back.
do $test$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  l uuid; code text; fresh text; n int; t text; log text := E'\n';
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  values (a, 'asha@test.dev', '{"full_name":"Asha"}', 'authenticated', 'authenticated'),
         (b, 'bina@test.dev', '{"full_name":"Bina"}', 'authenticated', 'authenticated'),
         (c, 'chetan@test.dev', '{}', 'authenticated', 'authenticated');

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  insert into public.lists (name, invite_code) values ('Goa trip', 'chosenbyme') returning id, invite_code into l, code;
  log := log || 'code is made by the database, not chosen: ' || (code <> 'chosenbyme') || ' (' || char_length(code) || ' chars)' || E'\n';
  perform public.save_item(l, 'https://shop.test/p/hat', 'Sun hat', null, 499, 'INR', null, null, 1, null, null);

  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  select count(*) into n from public.lists;      log := log || 'outsider sees lists: ' || n || E'\n';
  begin perform public.join_list('wrongcode'); log := log || 'bad code: ALLOWED (bad)' || E'\n';
  exception when others then log := log || 'bad code blocked: ' || sqlerrm || E'\n'; end;
  perform public.join_list(code);
  select count(*) into n from public.list_items;  log := log || 'after joining, Bina sees items: ' || n || E'\n';
  select role::text into t from public.list_members where list_id=l and user_id=b;
  log := log || 'Bina joins as: ' || t || E'\n';
  perform public.join_list(code);
  select count(*) into n from public.list_members where list_id=l;
  log := log || 'joining twice is harmless, members: ' || n || E'\n';
  update public.lists set invite_code = 'mine' where id = l;
  get diagnostics n = row_count;
  log := log || 'member edit touched rows: ' || n || ' (only the owner can edit a list)' || E'\n';
  execute 'reset role';
  select count(*) into n from public.lists where id=l and invite_code='mine';
  log := log || 'code unchanged: ' || (n = 0) || E'\n';
  perform set_config('role','authenticated',true);
  begin perform public.reset_list_invite(l); log := log || 'member resets code: ALLOWED (bad)' || E'\n';
  exception when others then log := log || 'member reset blocked: ' || sqlerrm || E'\n'; end;

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  begin update public.lists set invite_code = 'mine' where id = l; log := log || 'owner edits code by hand: ALLOWED (bad)' || E'\n';
  exception when others then log := log || 'owner hand-edit blocked' || E'\n'; end;
  fresh := public.reset_list_invite(l);
  log := log || 'owner got a new code: ' || (fresh <> code) || E'\n';
  select count(*) into n from public.list_members where list_id=l;
  log := log || 'members stay after reset: ' || n || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  begin perform public.join_list(code); log := log || 'old code: ALLOWED (bad)' || E'\n';
  exception when others then log := log || 'old code blocked: ' || sqlerrm || E'\n'; end;
  perform public.join_list(fresh);
  select count(*) into n from public.list_items; log := log || 'new code works, Chetan sees items: ' || n || E'\n';

  perform set_config('role','anon',true);
  begin perform public.join_list(fresh); log := log || 'anon join: ALLOWED (bad)' || E'\n';
  exception when others then log := log || 'anon join blocked' || E'\n'; end;
  execute 'reset role';

  raise exception 'TEST RESULTS (rolled back):%', log;
end $test$;
