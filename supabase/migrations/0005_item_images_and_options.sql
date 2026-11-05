-- Keep the shop's picture gallery and every option it offered (Colour: White, Black, ...) with each saved item.
alter table public.list_items
  add column if not exists images  jsonb not null default '[]'::jsonb,
  add column if not exists options jsonb not null default '[]'::jsonb;

-- Same signature as before plus two new trailing arguments. The old one goes first so the name stays unambiguous.
drop function if exists public.save_item(uuid, text, text, text, numeric, text, text, text, integer, text, uuid);

create or replace function public.save_item(
  p_list_id uuid, p_url text, p_title text,
  p_image_url text default null, p_price numeric default null, p_currency text default null,
  p_brand text default null, p_variant text default null, p_quantity integer default 1,
  p_note text default null, p_party_id uuid default null,
  p_images jsonb default '[]'::jsonb, p_options jsonb default '[]'::jsonb
) returns public.list_items
language plpgsql security definer set search_path = ''
as $function$
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
  if jsonb_typeof(coalesce(p_images, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_options, '[]'::jsonb)) <> 'array' then
    raise exception 'Pictures and options must be lists';
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
     variant, quantity, note, images, options)
  values
    (p_list_id, prod, me, p_party_id, p_price, upper(p_currency),
     p_variant, coalesce(p_quantity, 1), p_note,
     case when length(coalesce(p_images, '[]'::jsonb)::text) > 8000 then '[]'::jsonb else coalesce(p_images, '[]'::jsonb) end,
     case when length(coalesce(p_options, '[]'::jsonb)::text) > 12000 then '[]'::jsonb else coalesce(p_options, '[]'::jsonb) end)
  returning * into item;

  return item;
end;
$function$;

revoke all on function public.save_item(uuid, text, text, text, numeric, text, text, text, integer, text, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_item(uuid, text, text, text, numeric, text, text, text, integer, text, uuid, jsonb, jsonb) to authenticated;
