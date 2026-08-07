-- ============================================================
-- Pescados y Mariscos Arrantza — catálogo de productos (v2, bilingüe)
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- ============================================================

create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  nombre_es text not null,
  nombre_eu text,
  descripcion_es text,
  descripcion_eu text,
  origen_es text,
  origen_eu text,
  precio text not null,
  categoria text not null check (categoria in ('pescado', 'especial', 'raciones', 'marisco')),
  subcategoria text,
  imagen_url text,
  estado text not null default 'available' check (estado in ('available', 'new', 'premium', 'seasonal')),
  disponible boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_productos_updated_at on public.productos;
create trigger trg_productos_updated_at
  before update on public.productos
  for each row execute function public.set_updated_at();

alter table public.productos enable row level security;

-- Catálogo completo visible para todos (agotados incluidos, se marcan en la UI)
drop policy if exists "productos_select_publico" on public.productos;
create policy "productos_select_publico"
  on public.productos for select
  to anon, authenticated
  using (true);

drop policy if exists "productos_insert_admin" on public.productos;
create policy "productos_insert_admin"
  on public.productos for insert
  to authenticated
  with check (true);

drop policy if exists "productos_update_admin" on public.productos;
create policy "productos_update_admin"
  on public.productos for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "productos_delete_admin" on public.productos;
create policy "productos_delete_admin"
  on public.productos for delete
  to authenticated
  using (true);

create index if not exists idx_productos_categoria on public.productos (categoria);
create index if not exists idx_productos_disponible on public.productos (disponible);

-- Bucket de Storage para las fotos que suba el pescadero
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

drop policy if exists "productos_storage_lectura_publica" on storage.objects;
create policy "productos_storage_lectura_publica"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'productos');

drop policy if exists "productos_storage_escritura_admin" on storage.objects;
create policy "productos_storage_escritura_admin"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'productos')
  with check (bucket_id = 'productos');

-- ============================================================
-- Registro de errores del frontend (solo lectura para desarrolladores)
-- ============================================================

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  stack text,
  source text not null default 'unknown' check (source in ('window_error', 'unhandled_rejection', 'react_boundary', 'api')),
  url text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.error_logs enable row level security;

-- Cualquier visitante puede reportar un error (es lo que ocurre cuando falla la página)…
drop policy if exists "error_logs_insert_publico" on public.error_logs;
create policy "error_logs_insert_publico"
  on public.error_logs for insert
  to anon, authenticated
  with check (true);

-- …pero solo el desarrollador autenticado puede leerlos o borrarlos
drop policy if exists "error_logs_select_admin" on public.error_logs;
create policy "error_logs_select_admin"
  on public.error_logs for select
  to authenticated
  using (true);

drop policy if exists "error_logs_delete_admin" on public.error_logs;
create policy "error_logs_delete_admin"
  on public.error_logs for delete
  to authenticated
  using (true);

create index if not exists idx_error_logs_created_at on public.error_logs (created_at desc);

-- ============================================================
-- Visitas y conversiones (para comparar tráfico antes/después de Google Ads)
-- ============================================================

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  event_type text not null default 'pageview' check (event_type in ('pageview', 'tel_click', 'whatsapp_click')),
  path text not null,
  referrer text,
  source_category text not null default 'direct' check (source_category in ('google_ads', 'google_organic', 'social', 'referral', 'direct', 'other')),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz not null default now()
);

alter table public.visits enable row level security;

-- Cualquier visitante genera eventos de navegación…
drop policy if exists "visits_insert_publico" on public.visits;
create policy "visits_insert_publico"
  on public.visits for insert
  to anon, authenticated
  with check (true);

-- …pero solo el desarrollador autenticado puede leerlos o borrarlos
drop policy if exists "visits_select_admin" on public.visits;
create policy "visits_select_admin"
  on public.visits for select
  to authenticated
  using (true);

drop policy if exists "visits_delete_admin" on public.visits;
create policy "visits_delete_admin"
  on public.visits for delete
  to authenticated
  using (true);

create index if not exists idx_visits_created_at on public.visits (created_at desc);
create index if not exists idx_visits_event_type on public.visits (event_type);
create index if not exists idx_visits_session_id on public.visits (session_id);

-- Ajustes internos del panel (p.ej. fecha de lanzamiento de Google Ads),
-- solo para el desarrollador autenticado.
create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_settings_updated_at on public.settings;
create trigger trg_settings_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

alter table public.settings enable row level security;

drop policy if exists "settings_all_admin" on public.settings;
create policy "settings_all_admin"
  on public.settings for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- Interés por categoría (qué buscan más los visitantes en /productos)
-- ============================================================

alter table public.visits add column if not exists label text;

alter table public.visits drop constraint if exists visits_event_type_check;
alter table public.visits add constraint visits_event_type_check
  check (event_type in ('pageview', 'tel_click', 'whatsapp_click', 'category_view'));

-- ============================================================
-- Separación de roles: el pescadero solo gestiona productos;
-- informes/errores/ajustes quedan restringidos a los desarrolladores.
-- Mantener esta lista sincronizada con DEVELOPER_EMAILS en
-- src/config/devEmails.ts.
-- ============================================================

create or replace function public.is_developer()
returns boolean as $$
  select (auth.jwt() ->> 'email') = any (array['edortadossantos@gmail.com', 'admin@developers.local']);
$$ language sql stable;

drop policy if exists "error_logs_select_admin" on public.error_logs;
create policy "error_logs_select_admin"
  on public.error_logs for select
  to authenticated
  using (public.is_developer());

drop policy if exists "error_logs_delete_admin" on public.error_logs;
create policy "error_logs_delete_admin"
  on public.error_logs for delete
  to authenticated
  using (public.is_developer());

drop policy if exists "visits_select_admin" on public.visits;
create policy "visits_select_admin"
  on public.visits for select
  to authenticated
  using (public.is_developer());

drop policy if exists "visits_delete_admin" on public.visits;
create policy "visits_delete_admin"
  on public.visits for delete
  to authenticated
  using (public.is_developer());

drop policy if exists "settings_all_admin" on public.settings;
create policy "settings_all_admin"
  on public.settings for all
  to authenticated
  using (public.is_developer())
  with check (public.is_developer());

-- ============================================================
-- Más señal para analizar la web: tipo de dispositivo y si el
-- visitante ya había estado antes (nuevo vs. recurrente).
-- ============================================================

alter table public.visits add column if not exists device_type text;
alter table public.visits drop constraint if exists visits_device_type_check;
alter table public.visits add constraint visits_device_type_check
  check (device_type is null or device_type in ('mobile', 'tablet', 'desktop'));

alter table public.visits add column if not exists is_returning boolean not null default false;

create index if not exists idx_visits_path on public.visits (path);

-- ============================================================
-- Tracking a nivel de producto: qué se mira vs. qué se añade al
-- pedido. Reutiliza la tabla visits — label guarda el id del
-- producto (igual que category_view guarda la categoría).
-- ============================================================

alter table public.visits drop constraint if exists visits_event_type_check;
alter table public.visits add constraint visits_event_type_check
  check (event_type in ('pageview', 'tel_click', 'whatsapp_click', 'category_view', 'product_view', 'add_to_cart'));

-- ============================================================
-- Pedidos: persiste el contenido de cada pedido enviado por
-- WhatsApp (antes solo se registraba el clic, no qué se pedía).
-- Da al pescadero un historial real de demanda para comprar en
-- lonja y calcular ticket medio.
-- ============================================================

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  items jsonb not null,
  total_productos integer not null default 0,
  peso_total numeric not null default 0,
  importe_estimado numeric,
  metodo_entrega text not null default 'pickup' check (metodo_entrega in ('home', 'pickup')),
  cliente_nombre text,
  cliente_negocio text,
  cliente_telefono text,
  cliente_email text,
  cliente_direccion text,
  cliente_ciudad text,
  cliente_cp text,
  fecha_preferida text,
  hora_preferida text,
  notas text,
  estado text not null default 'nuevo' check (estado in ('nuevo', 'confirmado', 'completado', 'cancelado')),
  created_at timestamptz not null default now()
);

alter table public.pedidos enable row level security;

-- El cliente envía el pedido desde la web (sin sesión)…
drop policy if exists "pedidos_insert_publico" on public.pedidos;
create policy "pedidos_insert_publico"
  on public.pedidos for insert
  to anon, authenticated
  with check (true);

-- …pero solo el pescadero (autenticado) puede verlos y gestionarlos.
drop policy if exists "pedidos_select_admin" on public.pedidos;
create policy "pedidos_select_admin"
  on public.pedidos for select
  to authenticated
  using (true);

drop policy if exists "pedidos_update_admin" on public.pedidos;
create policy "pedidos_update_admin"
  on public.pedidos for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "pedidos_delete_admin" on public.pedidos;
create policy "pedidos_delete_admin"
  on public.pedidos for delete
  to authenticated
  using (true);

create index if not exists idx_pedidos_created_at on public.pedidos (created_at desc);
create index if not exists idx_pedidos_estado on public.pedidos (estado);

-- ============================================================
-- Reseñas de clientes: las rellena el propio cliente después de
-- usar la web (no contenido inventado). Quedan pendientes de
-- aprobación del pescadero antes de mostrarse en público, para
-- evitar spam o abuso.
-- ============================================================

create table if not exists public.resenas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  valoracion integer not null check (valoracion between 1 and 5),
  comentario text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  created_at timestamptz not null default now()
);

alter table public.resenas enable row level security;

-- Cualquier visitante puede dejar su opinión…
drop policy if exists "resenas_insert_publico" on public.resenas;
create policy "resenas_insert_publico"
  on public.resenas for insert
  to anon, authenticated
  with check (
    char_length(nombre) between 1 and 100
    and char_length(comentario) between 1 and 1000
  );

-- …el público solo ve las aprobadas…
drop policy if exists "resenas_select_publico" on public.resenas;
create policy "resenas_select_publico"
  on public.resenas for select
  to anon, authenticated
  using (estado = 'aprobada');

-- …y el pescadero (autenticado) las ve todas y las modera.
drop policy if exists "resenas_select_admin" on public.resenas;
create policy "resenas_select_admin"
  on public.resenas for select
  to authenticated
  using (true);

drop policy if exists "resenas_update_admin" on public.resenas;
create policy "resenas_update_admin"
  on public.resenas for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "resenas_delete_admin" on public.resenas;
create policy "resenas_delete_admin"
  on public.resenas for delete
  to authenticated
  using (true);

create index if not exists idx_resenas_estado on public.resenas (estado);
create index if not exists idx_resenas_created_at on public.resenas (created_at desc);

-- ============================================================
-- Control de stock: kg restantes por producto, descontados solo
-- con cada pedido de un cliente y repuestos manualmente por el
-- pescadero. Si el stock cae por debajo del mínimo definido se
-- envía un aviso por correo (ver triggers más abajo).
-- ============================================================

alter table public.productos add column if not exists stock_kg numeric not null default 0;
alter table public.productos add column if not exists stock_minimo numeric not null default 10;
alter table public.productos add column if not exists stock_alerta_enviada boolean not null default false;

-- Descuenta stock al registrarse un pedido (trigger sobre pedidos,
-- ver logPedido en src/lib/pedidosLog.ts). security definer porque
-- el pedido lo inserta un cliente anónimo sin permiso de update
-- sobre productos.
create or replace function public.descontar_stock_pedido()
returns trigger as $$
declare
  item jsonb;
begin
  for item in select * from jsonb_array_elements(new.items) loop
    begin
      update public.productos
      set stock_kg = greatest(stock_kg - coalesce((item->>'kg')::numeric, 0), 0)
      where id = (item->>'productoId')::uuid;
    exception when others then
      null; -- nunca debe bloquear el insert del pedido
    end;
  end loop;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_pedidos_descontar_stock on public.pedidos;
create trigger trg_pedidos_descontar_stock
  after insert on public.pedidos
  for each row execute function public.descontar_stock_pedido();

-- Avisa por correo cuando el stock de un producto cae por debajo de
-- su mínimo (una sola vez por caída; se re-arma solo si vuelve a
-- subir por encima del mínimo y luego baja de nuevo). Usa la tabla
-- settings ya existente para guardar la URL de la Edge Function y
-- un secreto compartido, sin credenciales sueltas en el SQL.
create extension if not exists pg_net with schema extensions;

create or replace function public.notificar_stock_bajo()
returns trigger as $$
declare
  v_url text;
  v_secret text;
begin
  if new.stock_kg <= new.stock_minimo and coalesce(old.stock_alerta_enviada, false) = false then
    new.stock_alerta_enviada := true;

    select value #>> '{}' into v_url from public.settings where key = 'stock_alert_url';
    select value #>> '{}' into v_secret from public.settings where key = 'stock_alert_secret';

    if v_url is not null then
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(v_secret, '')),
        body := jsonb_build_object(
          'producto_id', new.id,
          'nombre', new.nombre_es,
          'stock_kg', new.stock_kg,
          'stock_minimo', new.stock_minimo
        )
      );
    end if;
  elsif new.stock_kg > new.stock_minimo and coalesce(old.stock_alerta_enviada, false) = true then
    new.stock_alerta_enviada := false;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

drop trigger if exists trg_productos_stock_bajo on public.productos;
create trigger trg_productos_stock_bajo
  before update of stock_kg, stock_minimo on public.productos
  for each row execute function public.notificar_stock_bajo();

-- Tras desplegar supabase/functions/stock-alert, registra su URL y el
-- secreto compartido (mismo valor que STOCK_ALERT_SECRET en la function):
-- insert into public.settings (key, value) values
--   ('stock_alert_url', '"https://<PROJECT_REF>.supabase.co/functions/v1/stock-alert"'),
--   ('stock_alert_secret', '"<UN_SECRETO_ALEATORIO>"')
-- on conflict (key) do update set value = excluded.value;
