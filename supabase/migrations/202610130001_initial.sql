-- Orquivia · una empresa, roles separados, sin registro público.
-- Ejecutar una sola vez en un proyecto Supabase vacío. No contiene claves secretas.
begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 200),
  email text not null default '',
  role text not null check (role in ('manager', 'worker')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.company (
  id boolean primary key default true check (id),
  name text not null check (length(trim(name)) between 1 and 200),
  tax_id text not null default '', address text not null default '',
  email text not null default '', phone text not null default '',
  default_vat numeric(5,2) not null default 21 check (default_vat between 0 and 100)
);
create table public.company_rates (
  id boolean primary key default true check (id),
  labor_rate numeric(12,2) not null default 0 check (labor_rate between 0 and 1000000)
);
insert into public.company (name) values ('Orquivia');
insert into public.company_rates (labor_rate) values (0);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  tax_id text not null default '', email text not null default '',
  phone text not null default '', address text not null default '', site text not null default '',
  updated_at timestamptz not null default now()
);
create sequence public.order_number_seq;
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  title text not null check (length(trim(title)) between 1 and 160),
  description text not null check (length(trim(description)) between 1 and 5000),
  client_id uuid not null references public.clients(id) on delete restrict,
  client_name text not null,
  site text not null check (length(trim(site)) between 1 and 200),
  location_type text not null check (location_type in ('unit','common','exterior','other')),
  location_detail text not null check (length(trim(location_detail)) between 1 and 200),
  priority text not null check (priority in ('normal','urgent')),
  status text not null check (status in ('pending','review','valued','sent')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_by_name text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  service_date date not null,
  hours numeric(12,3) not null default 0 check (hours between 0 and 10000),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 100),
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 12),
  notes text not null default '' check (length(notes) <= 5000),
  assistance boolean not null default false,
  assistance_note text not null default '' check (length(assistance_note) <= 2000),
  version integer not null default 1 check (version > 0),
  check (not assistance or length(trim(assistance_note)) > 0)
);
create table public.valuations (
  order_id uuid primary key references public.orders(id) on delete restrict,
  labor_rate numeric(12,2) not null check (labor_rate between 0 and 1000000),
  vat_rate numeric(5,2) not null check (vat_rate between 0 and 100),
  item_prices jsonb not null default '[]'::jsonb check (jsonb_typeof(item_prices) = 'array')
);
create table public.audit_entries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete restrict,
  actor_name text not null,
  action text not null,
  created_at timestamptz not null default now(),
  manager_only boolean not null default false,
  changes jsonb not null default '{}'::jsonb
);
create index orders_created_by_idx on public.orders(created_by);
create index orders_created_at_idx on public.orders(created_at desc);
create index orders_status_idx on public.orders(status);
create index audit_order_created_idx on public.audit_entries(order_id,created_at desc);

create function private.current_role() returns text
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid() and active $$;
create function private.can_read_order(target_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.orders o where o.id = target_id and
  (private.current_role() = 'manager' or (private.current_role() = 'worker' and o.created_by = auth.uid()))) $$;
create function private.can_edit_order(target_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.orders o where o.id = target_id and
  (private.current_role() = 'manager' or (private.current_role() = 'worker' and o.created_by = auth.uid() and o.status in ('pending','review')))) $$;
revoke execute on function private.current_role(), private.can_read_order(uuid), private.can_edit_order(uuid) from public, anon;
grant execute on function private.current_role(), private.can_read_order(uuid), private.can_edit_order(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.company enable row level security;
alter table public.company_rates enable row level security;
alter table public.clients enable row level security;
alter table public.orders enable row level security;
alter table public.valuations enable row level security;
alter table public.audit_entries enable row level security;
create policy profiles_read on public.profiles for select to authenticated
  using (private.current_role() = 'manager' or (id = auth.uid() and active));
create policy company_read on public.company for select to authenticated using (private.current_role() is not null);
create policy company_rates_read on public.company_rates for select to authenticated using (private.current_role() = 'manager');
create policy clients_read on public.clients for select to authenticated using (private.current_role() is not null);
create policy orders_read on public.orders for select to authenticated using (private.can_read_order(id));
create policy valuations_read on public.valuations for select to authenticated using (private.current_role() = 'manager');
create policy audit_read on public.audit_entries for select to authenticated using (
  private.current_role() = 'manager' or (not manager_only and private.can_read_order(order_id))
);
-- No direct write grants or policies. All writes go through checked atomic RPCs.
revoke all on public.profiles, public.company, public.company_rates, public.clients, public.orders, public.valuations, public.audit_entries from anon, authenticated;
grant select on public.profiles, public.company, public.company_rates, public.clients, public.orders, public.valuations, public.audit_entries to authenticated;
revoke all on sequence public.order_number_seq from anon, authenticated;

create function private.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor text; target uuid; label text; is_private boolean; old_json jsonb; new_json jsonb;
begin
  select name into actor from public.profiles where id = auth.uid();
  old_json := case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) else null end;
  new_json := case when TG_OP in ('INSERT','UPDATE') then to_jsonb(NEW) else null end;
  if TG_OP = 'UPDATE' and old_json = new_json then return NEW; end if;
  is_private := TG_TABLE_NAME in ('valuations','company_rates');
  if TG_TABLE_NAME = 'orders' then
    target := coalesce((new_json->>'id')::uuid,(old_json->>'id')::uuid);
    label := case when TG_OP = 'INSERT' then 'Parte creado' else 'Parte actualizado' end;
  elsif TG_TABLE_NAME = 'valuations' then
    target := coalesce((new_json->>'order_id')::uuid,(old_json->>'order_id')::uuid);
    label := 'Valoración actualizada';
  elsif TG_TABLE_NAME in ('company','company_rates') then label := 'Datos de empresa actualizados';
  elsif TG_TABLE_NAME = 'clients' then label := case when TG_OP = 'INSERT' then 'Cliente creado' else 'Cliente actualizado' end;
  else label := case when TG_OP = 'INSERT' then 'Usuario activado' else 'Usuario actualizado' end;
  end if;
  insert into public.audit_entries(order_id,actor_id,actor_name,action,manager_only,changes)
    values(target,auth.uid(),coalesce(actor,'Administración'),label,is_private,
      jsonb_build_object('table',TG_TABLE_NAME,'before',old_json,'after',new_json));
  return NEW;
end $$;
revoke execute on function private.audit_change() from public, anon, authenticated;
create trigger audit_orders after insert or update on public.orders for each row execute function private.audit_change();
create trigger audit_valuations after insert or update on public.valuations for each row execute function private.audit_change();
create trigger audit_company after update on public.company for each row execute function private.audit_change();
create trigger audit_company_rates after update on public.company_rates for each row execute function private.audit_change();
create trigger audit_clients after insert or update on public.clients for each row execute function private.audit_change();
create trigger audit_profiles after insert or update on public.profiles for each row execute function private.audit_change();

create function private.order_json(target_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
select jsonb_build_object(
  'id',o.id,'number',o.number,'title',o.title,'description',o.description,
  'clientId',o.client_id,'clientName',o.client_name,'site',o.site,
  'locationType',o.location_type,'locationDetail',o.location_detail,'priority',o.priority,'status',o.status,
  'createdBy',o.created_by,'createdByName',o.created_by_name,'createdAt',o.created_at,'updatedAt',o.updated_at,
  'serviceDate',o.service_date,'hours',o.hours,
  'laborRate',case when private.current_role() = 'manager' then v.labor_rate else 0 end,
  'vatRate',case when private.current_role() = 'manager' then v.vat_rate else 0 end,
  'items',coalesce((select jsonb_agg(i || jsonb_build_object('unitPrice',case when private.current_role() = 'manager' then
    coalesce((select (p->>'unitPrice')::numeric from jsonb_array_elements(v.item_prices) p where p->>'id' = i->>'id'),0)
    else 0 end)) from jsonb_array_elements(o.items) i),'[]'::jsonb),
  'photos',o.photos,'notes',o.notes,'assistance',o.assistance,'assistanceNote',o.assistance_note,'version',o.version
) from public.orders o left join public.valuations v on v.order_id=o.id
where o.id=target_id and private.can_read_order(o.id)
$$;
revoke execute on function private.order_json(uuid) from public, anon, authenticated;

create function public.load_app() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; role_name text := private.current_role();
begin
  if role_name is null then raise exception 'NO_PROFILE' using errcode='42501'; end if;
  select jsonb_build_object(
    'orders',coalesce((select jsonb_agg(private.order_json(o.id) order by o.created_at desc) from public.orders o where private.can_read_order(o.id)),'[]'::jsonb),
    'clients',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'taxId',c.tax_id,'email',c.email,'phone',c.phone,'address',c.address,'site',c.site) order by c.name) from public.clients c),'[]'::jsonb),
    'company',(select jsonb_build_object('name',c.name,'taxId',c.tax_id,'address',c.address,'email',c.email,'phone',c.phone,'defaultVat',c.default_vat,
      'laborRate',case when role_name='manager' then r.labor_rate else 0 end) from public.company c cross join public.company_rates r),
    'profiles',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'role',p.role) order by p.name) from public.profiles p where p.active and (role_name='manager' or p.id=auth.uid())),'[]'::jsonb),
    'audit',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'orderId',a.order_id,'actorName',a.actor_name,'action',a.action,'createdAt',a.created_at,'changes',a.changes) order by a.created_at desc)
      from public.audit_entries a where role_name='manager' or (not a.manager_only and private.can_read_order(a.order_id))),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create function public.save_order(payload jsonb, expected_version integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  role_name text := private.current_role(); actor text; target uuid; previous public.orders; existing boolean;
  client_record public.clients; new_status text; safe_items jsonb := '[]'::jsonb; prices jsonb := '[]'::jsonb;
  safe_photos jsonb := '[]'::jsonb; item jsonb; photo jsonb; item_id uuid; quantity numeric; price numeric;
  work_hours numeric; labor numeric; vat numeric; old_value public.valuations; number_value text; sequence_value text;
begin
  if role_name is null then raise exception 'NO_PROFILE' using errcode='42501'; end if;
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Parte no válido'; end if;
  target := (payload->>'id')::uuid;
  if target is null then raise exception 'Identificador de parte obligatorio'; end if;
  select * into previous from public.orders where id=target for update;
  existing := FOUND;
  if existing and expected_version is distinct from previous.version then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  if not existing and expected_version is distinct from 0 then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  if role_name='worker' and existing and previous.created_by<>auth.uid() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if role_name='worker' and existing and previous.status in ('valued','sent') then raise exception 'LOCKED_ORDER' using errcode='42501'; end if;
  new_status := payload->>'status';
  if role_name='worker' and new_status not in ('pending','review') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into client_record from public.clients where id=(payload->>'clientId')::uuid;
  if not FOUND then raise exception 'Selecciona un cliente válido'; end if;
  select name into actor from public.profiles where id=auth.uid();
  work_hours := (payload->>'hours')::numeric;
  if work_hours is null or work_hours<>round(work_hours,3) or work_hours not between 0 and 10000 then raise exception 'Horas no válidas'; end if;
  if coalesce(payload->>'serviceDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Fecha no válida'; end if;
  if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items')>100 then raise exception 'Materiales no válidos'; end if;
  if jsonb_typeof(payload->'photos') is distinct from 'array' or jsonb_array_length(payload->'photos')>12 then raise exception 'Fotos no válidas'; end if;
  select * into old_value from public.valuations where order_id=target;
  if role_name='manager' then
    labor := (payload->>'laborRate')::numeric; vat := (payload->>'vatRate')::numeric;
  else
    labor := coalesce(old_value.labor_rate,(select labor_rate from public.company_rates));
    vat := coalesce(old_value.vat_rate,(select default_vat from public.company));
  end if;
  if labor is null or labor not between 0 and 1000000 or labor<>round(labor,2) or vat is null or vat not between 0 and 100 or vat<>round(vat,2) then raise exception 'Precios o IVA no válidos'; end if;
  for item in select value from jsonb_array_elements(payload->'items') loop
    item_id := (item->>'id')::uuid; quantity := (item->>'quantity')::numeric;
    if item_id is null or exists(select 1 from jsonb_array_elements(safe_items) x where x->>'id'=item_id::text) then raise exception 'Material duplicado o sin identificador'; end if;
    if length(trim(coalesce(item->>'description',''))) not between 1 and 300 or length(trim(coalesce(item->>'unit',''))) not between 1 and 30 then raise exception 'Descripción o unidad de material no válida'; end if;
    if quantity is null or quantity not between 0.001 and 1000000 or quantity<>round(quantity,3) then raise exception 'Cantidad de material no válida'; end if;
    if role_name='manager' then price := (item->>'unitPrice')::numeric;
    else select coalesce((select (p->>'unitPrice')::numeric from jsonb_array_elements(coalesce(old_value.item_prices,'[]'::jsonb)) p where p->>'id'=item_id::text),0) into price; end if;
    if price is null or price not between 0 and 1000000 or price<>round(price,2) then raise exception 'Precio de material no válido'; end if;
    safe_items := safe_items || jsonb_build_array(jsonb_build_object('id',item_id,'description',trim(item->>'description'),'quantity',quantity,'unit',trim(item->>'unit')));
    prices := prices || jsonb_build_array(jsonb_build_object('id',item_id,'unitPrice',price));
  end loop;
  for photo in select value from jsonb_array_elements(payload->'photos') loop
    if (photo->>'id')::uuid is null or length(coalesce(photo->>'name','')) not between 1 and 300 then raise exception 'Foto no válida'; end if;
    if coalesce(photo->>'path','') !~ ('^'||target::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$') then raise exception 'Ruta de foto no válida'; end if;
    if not exists(select 1 from storage.objects where bucket_id='order-photos' and name=photo->>'path') then raise exception 'Primero sube la foto al almacenamiento privado'; end if;
    if exists(select 1 from jsonb_array_elements(safe_photos) x where x->>'id'=photo->>'id') then raise exception 'Foto duplicada'; end if;
    safe_photos := safe_photos || jsonb_build_array(jsonb_build_object('id',photo->>'id','path',photo->>'path','name',photo->>'name'));
  end loop;
  if existing then
    update public.orders set title=trim(payload->>'title'),description=trim(payload->>'description'),client_id=client_record.id,client_name=client_record.name,
      site=trim(payload->>'site'),location_type=payload->>'locationType',location_detail=trim(payload->>'locationDetail'),priority=payload->>'priority',status=new_status,
      service_date=(payload->>'serviceDate')::date,hours=work_hours,items=safe_items,photos=safe_photos,notes=coalesce(payload->>'notes',''),
      assistance=coalesce((payload->>'assistance')::boolean,false),assistance_note=coalesce(payload->>'assistanceNote',''),updated_at=now(),version=version+1
      where id=target;
  else
    sequence_value := nextval('public.order_number_seq')::text;
    number_value := 'ALB-'||extract(year from (now() at time zone 'Europe/Madrid'))::text||'-'||lpad(sequence_value,greatest(4,length(sequence_value)),'0');
    insert into public.orders(id,number,title,description,client_id,client_name,site,location_type,location_detail,priority,status,created_by,created_by_name,service_date,hours,items,photos,notes,assistance,assistance_note)
      values(target,number_value,trim(payload->>'title'),trim(payload->>'description'),client_record.id,client_record.name,trim(payload->>'site'),payload->>'locationType',trim(payload->>'locationDetail'),payload->>'priority',new_status,
        auth.uid(),actor,(payload->>'serviceDate')::date,work_hours,safe_items,safe_photos,coalesce(payload->>'notes',''),coalesce((payload->>'assistance')::boolean,false),coalesce(payload->>'assistanceNote',''));
  end if;
  insert into public.valuations(order_id,labor_rate,vat_rate,item_prices) values(target,labor,vat,prices)
    on conflict(order_id) do update set labor_rate=excluded.labor_rate,vat_rate=excluded.vat_rate,item_prices=excluded.item_prices;
  return private.order_json(target);
exception when unique_violation then raise exception 'VERSION_CONFLICT' using errcode='40001';
end $$;

create function public.save_company(payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare labor numeric; vat numeric;
begin
  if private.current_role() is distinct from 'manager' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  labor := (payload->>'laborRate')::numeric; vat := (payload->>'defaultVat')::numeric;
  if labor is null or labor not between 0 and 1000000 or labor<>round(labor,2) or vat is null or vat not between 0 and 100 or vat<>round(vat,2) then raise exception 'Precios o IVA no válidos'; end if;
  update public.company set name=trim(payload->>'name'),tax_id=coalesce(payload->>'taxId',''),address=coalesce(payload->>'address',''),email=coalesce(payload->>'email',''),phone=coalesce(payload->>'phone',''),default_vat=vat where id;
  update public.company_rates set labor_rate=labor where id;
end $$;
create function public.save_client(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.clients;
begin
  if private.current_role() is distinct from 'manager' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  insert into public.clients(id,name,tax_id,email,phone,address,site)
    values((payload->>'id')::uuid,trim(payload->>'name'),coalesce(payload->>'taxId',''),coalesce(payload->>'email',''),coalesce(payload->>'phone',''),coalesce(payload->>'address',''),coalesce(payload->>'site',''))
    on conflict(id) do update set name=excluded.name,tax_id=excluded.tax_id,email=excluded.email,phone=excluded.phone,address=excluded.address,site=excluded.site,updated_at=now()
    returning * into c;
  return jsonb_build_object('id',c.id,'name',c.name,'taxId',c.tax_id,'email',c.email,'phone',c.phone,'address',c.address,'site',c.site);
end $$;
create function public.set_profile_role(target_id uuid, new_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.current_role() is distinct from 'manager' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if new_role not in ('manager','worker') or new_role is null then raise exception 'Rol no válido'; end if;
  if target_id=auth.uid() and new_role<>'manager' then raise exception 'No puedes quitarte tu propio acceso de responsable'; end if;
  update public.profiles set role=new_role where id=target_id;
  if not FOUND then raise exception 'Usuario no encontrado'; end if;
end $$;

revoke execute on function public.load_app(),public.save_order(jsonb,integer),public.save_company(jsonb),public.save_client(jsonb),public.set_profile_role(uuid,text) from public, anon;
grant execute on function public.load_app(),public.save_order(jsonb,integer),public.save_company(jsonb),public.save_client(jsonb),public.set_profile_role(uuid,text) to authenticated;

-- Todas las fotos requieren autenticación y autorización por parte.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('order-photos','order-photos',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy order_photos_read on storage.objects for select to authenticated using (
  bucket_id='order-photos' and private.can_read_order(case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then ((storage.foldername(name))[1])::uuid else null end)
);
create policy order_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id='order-photos' and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and private.can_edit_order(case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then ((storage.foldername(name))[1])::uuid else null end)
);
-- Fotos históricas no se borran desde el cliente; la app puede retirar su referencia
-- dejando la huella del cambio en audit_entries. Limpieza física solo administrativa.

alter publication supabase_realtime add table public.orders,public.audit_entries,public.company,public.clients,public.profiles;
commit;
