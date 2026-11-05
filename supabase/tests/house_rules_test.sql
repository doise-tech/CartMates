-- CartMates · House rules test
-- Plays out a full party with three pretend people (Asha, Bina, Chetan),
-- checks every rule, then rolls everything back. Nothing is left behind:
-- the final "error" is how the results are reported, and it undoes the test.
do $test$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  l uuid; p uuid; code text; i1 uuid; i2 uuid; n int; t text; log text := E'\n';
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  values (a, 'asha@test.dev', '{"full_name":"Asha"}', 'authenticated', 'authenticated'),
         (b, 'bina@test.dev', '{"full_name":"Bina"}', 'authenticated', 'authenticated'),
         (c, 'chetan@test.dev', '{}', 'authenticated', 'authenticated');
  select count(*) into n from public.profiles where id in (a,b,c);
  log := log || 'profiles auto-created: ' || n || E'\n';

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  insert into public.lists (name) values ('Diwali gifts') returning id into l;
  select role::text into t from public.list_members where list_id=l and user_id=a;
  log := log || 'creator becomes: ' || t || E'\n';
  insert into public.parties (list_id, host_id, label) values (l, a, 'Saturday hunt') returning id, invite_code into p, code;
  select (public.save_item(l, 'https://WWW.Myntra.com/kurta/123/?utm_source=insta&color=blue#reviews', 'Blue kurta', null, 1299, 'inr', null, 'M', 1, null, p)).id into i1;
  select (public.save_item(l, 'https://www.myntra.com/kurta/123?color=blue&fbclid=xyz', 'Blue kurta', null, 1199, 'INR', null, 'L', 1, null, p)).id into i2;
  select count(*) into n from public.products;
  select url || ' | ' || store_domain || ' | price now ' || price into t from public.products limit 1;
  log := log || 'two saves, products stored: ' || n || ' (' || t || ')' || E'\n';
  select price_at_save::text into t from public.list_items where id=i1;
  log := log || 'first save keeps its snapshot price: ' || t || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  select count(*) into n from public.list_items; log := log || 'outsider sees items: ' || n || E'\n';
  select count(*) into n from public.lists;      log := log || 'outsider sees lists: ' || n || E'\n';
  select count(*) into n from public.products;   log := log || 'outsider sees products: ' || n || E'\n';
  begin perform public.join_party('wrongcode'); log := log || 'bad code: ALLOWED (bad)' || E'\n';
  exception when others then log := log || 'bad code blocked: ' || sqlerrm || E'\n'; end;

  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  perform public.join_party(code);
  select count(*) into n from public.list_items; log := log || 'after joining, Bina sees items: ' || n || E'\n';
  select count(*) into n from public.profiles;   log := log || 'Bina sees profiles (herself + list-mates): ' || n || E'\n';
  update public.list_items set status='claimed' where id=i1;
  select status || ' by ' || (claimed_by=b)::text into t from public.list_items where id=i1;
  log := log || 'Bina claims item: ' || t || E'\n';
  insert into public.reactions (item_id,user_id,type) values (i1,b,'heart');
  begin insert into public.reactions (item_id,user_id,type) values (i1,b,'yes'); log := log || 'double reaction: ALLOWED (bad)' || E'\n';
  exception when others then log := log || 'second reaction blocked (one per person)' || E'\n'; end;
  insert into public.tags (list_id,name) values (l,'Gifts');
  begin insert into public.tags (list_id,name) values (l,' gifts'); log := log || 'duplicate tag: ALLOWED (bad)' || E'\n';
  exception when others then log := log || 'duplicate tag "gifts" blocked' || E'\n'; end;
  insert into public.messages (party_id,user_id,body,item_id) values (p,b,'this one?',i1);
  log := log || 'Bina chats with an item card: ok' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  perform public.join_party(code);
  begin update public.list_items set status='claimed' where id=i1; log := log || 'claim steal: ALLOWED (bad)' || E'\n';
  exception when others then log := log || 'claim steal blocked: ' || sqlerrm || E'\n'; end;
  begin update public.list_items set status='bought' where id=i1; log := log || 'mark someone else''s bought: ALLOWED (bad)' || E'\n';
  exception when others then log := log || 'marking Bina''s item bought blocked' || E'\n'; end;
  begin update public.list_items set removed_at=now() where id=i2; log := log || 'remove others item: ALLOWED (bad)' || E'\n';
  exception when others then log := log || 'removing Asha''s item blocked' || E'\n'; end;
  update public.parties set status='ended' where id=p;
  get diagnostics n = row_count; log := log || 'non-host ending party, rows changed: ' || n || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  update public.list_items set status='bought' where id=i1;
  select status || ', bought_at set: ' || (bought_at is not null)::text into t from public.list_items where id=i1;
  log := log || 'Bina marks bought: ' || t || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  update public.parties set status='ended' where id=p;
  select status || ', ended_at set: ' || (ended_at is not null)::text into t from public.parties where id=p;
  log := log || 'host ends party: ' || t || E'\n';
  begin update public.parties set status='live' where id=p; log := log || 'restart: ALLOWED (bad)' || E'\n';
  exception when others then log := log || 'restarting ended party blocked' || E'\n'; end;

  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  begin insert into public.messages (party_id,user_id,body) values (p,b,'hello?'); log := log || 'chat after end: ALLOWED (bad)' || E'\n';
  exception when others then log := log || 'chat after party ended blocked (read-only)' || E'\n'; end;
  select count(*) into n from public.messages where party_id=p; log := log || 'old chat still readable: ' || n || ' message' || E'\n';
  select count(*) into n from public.list_items where list_id=l; log := log || 'items survive party end: ' || n || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  begin perform public.join_party(code); log := log || 'join ended party: ALLOWED (bad)' || E'\n';
  exception when others then log := log || 'old invite code blocked: ' || sqlerrm || E'\n'; end;

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  delete from public.list_members where list_id=l and user_id=a;
  execute 'reset role';
  select p2.display_name into t from public.list_members m join public.profiles p2 on p2.id=m.user_id where m.list_id=l and m.role='owner';
  log := log || 'Asha leaves, new owner: ' || coalesce(t,'none') || E'\n';
  select count(*) into n from public.list_items where list_id=l and added_by=a; log := log || 'Asha''s items stay: ' || n || E'\n';

  perform set_config('role','anon',true);
  begin select count(*) into n from public.lists; log := log || 'anon sees lists: ' || n || E'\n';
  exception when others then log := log || 'anon blocked: ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  raise exception 'TEST RESULTS (rolled back):%', log;
end $test$;
