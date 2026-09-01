-- ============================================================
-- Pescados y Mariscos Arrantza — esquema de referencia (Postgres/Supabase)
--
-- Este fichero documenta el esquema tal y como está desplegado en el
-- proyecto Supabase real (multi-tenant, compartido con otros clientes
-- de LocalIA Soluciones Digitales), reconstruido a partir de la base
-- de producción el 2026-08-15. NO es un script idempotente de
-- instalación limpia: varias tablas/funciones ya asumen la existencia
-- de `public.clientes` y `public.usuarios_negocio`, definidas fuera de
-- este fichero (son compartidas por todos los proyectos del mismo
-- Supabase). Úsalo como referencia para entender el modelo de datos y
-- las políticas RLS reales, no lo ejecutes tal cual sobre un proyecto
-- nuevo sin adaptar esa parte multi-tenant primero.
-- ============================================================

-- ============================================================
-- Multi-tenant: cada fila de negocio "cuelga" de public.clientes.
-- Definida fuera de este proyecto (compartida por todos los clientes
-- de LocalIA); se documenta aquí solo para contexto de las FKs.
--
--   public.clientes (id uuid pk, nombre_negocio, slug, tipo_proyecto,
--                     contacto_*, estado, site_key uuid unique, ...)
--
-- Cada usuario de Supabase Auth con acceso a un panel de gestión tiene
-- una fila en usuarios_negocio que lo vincula a su cliente:
--
--   public.usuarios_negocio (user_id uuid pk references auth.users,
--                             cliente_id uuid references clientes,
--                             rol text check (rol in ('gestion')))
--
-- RLS de usuarios_negocio: cada usuario solo puede ver su propia fila
-- (`user_id = auth.uid()`); solo is_developer() tiene acceso total.
-- ============================================================

-- Devuelve el cliente_id del usuario autenticado actual (null si no
-- tiene fila en usuarios_negocio, p.ej. mientras no se le ha dado de
-- alta o si es un desarrollador que gestiona todo vía is_developer()).
create or replace function public.mi_cliente_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select cliente_id from public.usuarios_negocio where user_id = auth.uid();
$$;

-- Lista de emails con acceso total (todos los clientes, todas las
-- tablas). Mantener en sync con DEVELOPER_EMAILS en
-- src/config/devEmails.ts.
create or replace function public.is_developer()
returns boolean as $$
  select (auth.jwt() ->> 'email') = any (array['edortadossantos@gmail.com', 'admin@developers.local']);
$$ language sql stable set search_path = public;

-- Resuelve el cliente_id a partir del site_key público (VITE_SITE_KEY),
-- usado por todas las funciones RPC que el frontend llama sin sesión
-- (formularios públicos: pedidos, reseñas, newsletter, analítica...).
-- Solo devuelve clientes en estado 'activo'.
create or replace function public.cliente_id_from_site_key(p_site_key uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.clientes where site_key = p_site_key and estado = 'activo';
$$;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

-- ============================================================
-- Catálogo de productos
-- ============================================================

create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  nombre_es text not null,
  nombre_eu text,
  descripcion_es text,
  descripcion_eu text,
  origen_es text,
  origen_eu text,
  precio text not null,
  categoria text not null check (categoria in ('pescado', 'especial', 'raciones', 'marisco', 'congelados')),
  subcategoria text,
  imagen_url text,
  estado text not null default 'available' check (estado in ('available', 'new', 'premium', 'seasonal')),
  disponible boolean not null default true,
  orden integer not null default 0,
  destacado boolean not null default false,
  stock_kg numeric not null default 0,
  stock_minimo numeric not null default 10,
  stock_alerta_enviada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_productos_updated_at on public.productos;
create trigger trg_productos_updated_at
  before update on public.productos
  for each row execute function public.set_updated_at();

alter table public.productos enable row level security;

-- Gestión (alta/edición/borrado): el pescadero del cliente dueño de la
-- fila, o cualquier desarrollador. Ya NO es "cualquier authenticated"
-- (así estaba en una versión anterior de este fichero, desactualizada
-- respecto a producción) — el aislamiento entre clientes del mismo
-- proyecto Supabase depende de esta condición.
drop policy if exists "productos_select_admin" on public.productos;
create policy "productos_select_admin"
  on public.productos for select
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "productos_insert_admin" on public.productos;
create policy "productos_insert_admin"
  on public.productos for insert
  to authenticated
  with check (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "productos_update_admin" on public.productos;
create policy "productos_update_admin"
  on public.productos for update
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id())
  with check (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "productos_delete_admin" on public.productos;
create policy "productos_delete_admin"
  on public.productos for delete
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

create index if not exists idx_productos_categoria on public.productos (categoria);
create index if not exists idx_productos_disponible on public.productos (disponible);
create index if not exists idx_productos_destacado on public.productos (destacado);

-- Lectura pública del catálogo: siempre vía la función RPC
-- get_productos_publico(site_key), nunca por select directo — así el
-- frontend anónimo nunca necesita (ni tiene) una policy de select
-- abierta sobre la tabla.
create or replace function public.get_productos_publico(p_site_key uuid)
returns setof productos
language sql stable security definer set search_path = public
as $$
  select p.* from public.productos p
  where p.cliente_id = public.cliente_id_from_site_key(p_site_key)
  order by p.orden asc, p.created_at asc;
$$;

-- Bucket de Storage para las fotos que suba el pescadero. Compartido
-- por todos los clientes del proyecto (no hay una carpeta por
-- cliente_id en las rutas que genera ProductoFormModal.tsx), así que
-- la policy de escritura solo exige tener alguna cuenta de gestión
-- (is_developer() o mi_cliente_id() no nulo) — no aísla un cliente de
-- otro dentro del mismo bucket. Ver auditoría de seguridad: aislar por
-- carpeta (como ya hace el bucket 'restaurant-media') es una mejora
-- pendiente si el volumen de clientes lo justifica.
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

drop policy if exists "productos_storage_lectura_publica" on storage.objects;
create policy "productos_storage_lectura_publica"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'productos');

-- Escritura restringida a imágenes de hasta 5 MB (antes no había
-- ninguna restricción de tipo/tamaño — ver auditoría de seguridad,
-- hallazgo F-05).
drop policy if exists "productos_storage_escritura_admin" on storage.objects;
create policy "productos_storage_escritura_admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'productos'
    and (metadata->>'size')::bigint < 5242880
    and (metadata->>'mimetype') in ('image/jpeg', 'image/png', 'image/webp')
  );

drop policy if exists "productos_storage_actualizacion_admin" on storage.objects;
create policy "productos_storage_actualizacion_admin"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'productos')
  with check (
    bucket_id = 'productos'
    and (metadata->>'size')::bigint < 5242880
    and (metadata->>'mimetype') in ('image/jpeg', 'image/png', 'image/webp')
  );

drop policy if exists "productos_storage_borrado_admin" on storage.objects;
create policy "productos_storage_borrado_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'productos');

-- ============================================================
-- Registro de errores del frontend (solo lectura para desarrolladores)
-- ============================================================

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  message text not null,
  stack text,
  source text not null default 'unknown' check (source in ('window_error', 'unhandled_rejection', 'react_boundary', 'api')),
  url text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.error_logs enable row level security;

-- Solo el desarrollador puede leerlos/borrarlos (a diferencia de
-- productos/pedidos/reseñas, esto no se delega al pescadero: es
-- diagnóstico técnico interno, no gestión del negocio).
drop policy if exists "error_logs_select_admin" on public.error_logs;
create policy "error_logs_select_admin"
  on public.error_logs for select
  to authenticated
  using (is_developer());

drop policy if exists "error_logs_delete_admin" on public.error_logs;
create policy "error_logs_delete_admin"
  on public.error_logs for delete
  to authenticated
  using (is_developer());

create index if not exists idx_error_logs_created_at on public.error_logs (created_at desc);

-- El frontend nunca inserta directamente: siempre vía esta función,
-- que resuelve el cliente_id a partir del site_key público.
create or replace function public.crear_error_log(
  p_site_key uuid, p_message text, p_stack text, p_source text, p_url text, p_user_agent text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_cliente_id uuid;
begin
  v_cliente_id := public.cliente_id_from_site_key(p_site_key);
  if v_cliente_id is null then
    raise exception 'site_key inválida';
  end if;

  insert into public.error_logs (cliente_id, message, stack, source, url, user_agent)
  values (v_cliente_id, p_message, p_stack, p_source, p_url, p_user_agent);
end;
$$;

-- ============================================================
-- Visitas y conversiones (para comparar tráfico antes/después de Google Ads)
-- ============================================================

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  session_id uuid not null,
  event_type text not null default 'pageview' check (event_type in ('pageview', 'tel_click', 'whatsapp_click', 'category_view', 'product_view', 'add_to_cart')),
  path text not null,
  referrer text,
  source_category text not null default 'direct' check (source_category in ('google_ads', 'google_organic', 'social', 'referral', 'direct', 'other')),
  utm_source text,
  utm_medium text,
  utm_campaign text,
  label text,
  device_type text check (device_type is null or device_type in ('mobile', 'tablet', 'desktop')),
  is_returning boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.visits enable row level security;

drop policy if exists "visits_select_admin" on public.visits;
create policy "visits_select_admin"
  on public.visits for select
  to authenticated
  using (is_developer());

drop policy if exists "visits_delete_admin" on public.visits;
create policy "visits_delete_admin"
  on public.visits for delete
  to authenticated
  using (is_developer());

create index if not exists idx_visits_created_at on public.visits (created_at desc);
create index if not exists idx_visits_event_type on public.visits (event_type);
create index if not exists idx_visits_session_id on public.visits (session_id);
create index if not exists idx_visits_path on public.visits (path);

-- El frontend nunca inserta directamente: siempre vía esta función.
create or replace function public.registrar_visita(
  p_site_key uuid, p_session_id uuid, p_event_type text, p_path text, p_label text,
  p_referrer text, p_source_category text, p_utm_source text, p_utm_medium text,
  p_utm_campaign text, p_device_type text, p_is_returning boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_cliente_id uuid;
begin
  v_cliente_id := public.cliente_id_from_site_key(p_site_key);
  if v_cliente_id is null then
    raise exception 'site_key inválida';
  end if;

  insert into public.visits (
    cliente_id, session_id, event_type, path, label, referrer, source_category,
    utm_source, utm_medium, utm_campaign, device_type, is_returning
  ) values (
    v_cliente_id, p_session_id, p_event_type, p_path, p_label, p_referrer, p_source_category,
    p_utm_source, p_utm_medium, p_utm_campaign, p_device_type, p_is_returning
  );
end;
$$;

-- ============================================================
-- Ajustes internos por cliente (URLs y secretos compartidos de las
-- Edge Functions de notificación, fecha de lanzamiento de Google
-- Ads...). Clave compuesta (key, cliente_id): cada cliente tiene su
-- propia fila para la misma key.
-- ============================================================

create table if not exists public.settings (
  key text not null,
  cliente_id uuid not null references public.clientes (id),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (key, cliente_id)
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
  using (is_developer())
  with check (is_developer());

-- ============================================================
-- Pedidos: persiste el contenido de cada pedido enviado por WhatsApp.
-- ============================================================

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
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
  -- Cómo se envió el pedido y en qué punto está su cobro online. 'no_aplica'
  -- cubre el flujo histórico por WhatsApp, donde el cobro ocurre fuera de la
  -- web (en tienda o por transferencia) y nunca pasa por Stripe.
  metodo_pago text not null default 'whatsapp' check (metodo_pago in ('whatsapp', 'stripe', 'bizum')),
  estado_pago text not null default 'no_aplica' check (estado_pago in ('no_aplica', 'pendiente', 'pagado', 'fallido')),
  stripe_session_id text,
  stripe_payment_intent_id text,
  device_id uuid,
  created_at timestamptz not null default now()
);

-- La tabla ya existe en producción sin estas columnas (se añadieron para el
-- cobro online con Stripe, después de la reconstrucción de este fichero del
-- 2026-08-15). `add column if not exists` es idempotente: en una instalación
-- nueva es un no-op porque el create table de arriba ya las incluye; en la
-- base real, ejecutar este bloque en el SQL Editor de Supabase es lo que
-- realmente las añade.
alter table public.pedidos
  add column if not exists metodo_pago text not null default 'whatsapp' check (metodo_pago in ('whatsapp', 'stripe', 'bizum')),
  add column if not exists estado_pago text not null default 'no_aplica' check (estado_pago in ('no_aplica', 'pendiente', 'pagado', 'fallido')),
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent_id text;

-- El check de metodo_pago ya existía sin 'bizum' antes de añadir el pago
-- manual por Bizum — en una instalación nueva el create table de arriba ya
-- lo incluye (no-op); en la base real, esto amplía el constraint existente.
alter table public.pedidos drop constraint if exists pedidos_metodo_pago_check;
alter table public.pedidos add constraint pedidos_metodo_pago_check check (metodo_pago in ('whatsapp', 'stripe', 'bizum'));

create unique index if not exists idx_pedidos_stripe_session_id on public.pedidos (stripe_session_id) where stripe_session_id is not null;

alter table public.pedidos enable row level security;

-- Gestión: el pescadero del cliente dueño del pedido, o desarrollador.
drop policy if exists "pedidos_select_admin" on public.pedidos;
create policy "pedidos_select_admin"
  on public.pedidos for select
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "pedidos_update_admin" on public.pedidos;
create policy "pedidos_update_admin"
  on public.pedidos for update
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id())
  with check (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "pedidos_delete_admin" on public.pedidos;
create policy "pedidos_delete_admin"
  on public.pedidos for delete
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

create index if not exists idx_pedidos_created_at on public.pedidos (created_at desc);
create index if not exists idx_pedidos_estado on public.pedidos (estado);
create index if not exists idx_pedidos_device_id on public.pedidos (device_id);

-- El cliente envía el pedido desde la web (sin sesión) siempre vía
-- esta función, nunca por insert directo — no hay policy de insert
-- para anon sobre la tabla.
create or replace function public.crear_pedido(
  p_site_key uuid, p_items jsonb, p_total_productos integer, p_peso_total numeric,
  p_importe_estimado numeric, p_metodo_entrega text, p_cliente_nombre text,
  p_cliente_negocio text, p_cliente_telefono text, p_cliente_email text,
  p_cliente_direccion text, p_cliente_ciudad text, p_cliente_cp text,
  p_fecha_preferida text, p_hora_preferida text, p_notas text, p_device_id uuid,
  p_metodo_pago text default 'whatsapp'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_id uuid;
begin
  v_cliente_id := public.cliente_id_from_site_key(p_site_key);
  if v_cliente_id is null then
    raise exception 'site_key inválida';
  end if;

  insert into public.pedidos (
    cliente_id, items, total_productos, peso_total, importe_estimado, metodo_entrega,
    cliente_nombre, cliente_negocio, cliente_telefono, cliente_email,
    cliente_direccion, cliente_ciudad, cliente_cp, fecha_preferida, hora_preferida, notas, device_id,
    metodo_pago, estado_pago
  ) values (
    v_cliente_id, p_items, p_total_productos, p_peso_total, p_importe_estimado, p_metodo_entrega,
    p_cliente_nombre, p_cliente_negocio, p_cliente_telefono, p_cliente_email,
    p_cliente_direccion, p_cliente_ciudad, p_cliente_cp, p_fecha_preferida, p_hora_preferida, p_notas, p_device_id,
    p_metodo_pago, case when p_metodo_pago in ('stripe', 'bizum') then 'pendiente' else 'no_aplica' end
  ) returning id into v_id;

  return v_id;
end;
$$;

-- Consulta de un pedido por su Stripe Checkout Session id, usada por la
-- página de confirmación tras el redirect de pago (sin login: el session id
-- de Stripe es impredecible y funciona como token de acceso, igual que
-- confirm_token/baja_token en newsletter_subscribers).
create or replace function public.get_pedido_by_stripe_session(p_session_id text)
returns setof pedidos
language sql stable security definer set search_path = public
as $$
  select * from public.pedidos where stripe_session_id = p_session_id limit 1;
$$;

revoke all on function public.get_pedido_by_stripe_session(text) from public;
grant execute on function public.get_pedido_by_stripe_session(text) to anon, authenticated;

-- Historial de pedidos por dispositivo, sin login. device_id es un
-- UUID aleatorio generado en el navegador (localStorage + cookie) que
-- viaja con cada pedido; al ser impredecible funciona como un token
-- de acceso. security definer para poder filtrar sin darle a "anon"
-- un select abierto sobre toda la tabla.
create or replace function public.get_pedidos_by_device(p_device_id uuid)
returns setof pedidos
language sql stable security definer set search_path = public
as $$
  select *
  from public.pedidos
  where device_id = p_device_id
  order by created_at desc
  limit 20;
$$;

revoke all on function public.get_pedidos_by_device(uuid) from public;
grant execute on function public.get_pedidos_by_device(uuid) to anon, authenticated;

-- Avisa al cliente por correo cuando el pescadero confirma o completa
-- su pedido. Usa la tabla settings para no dejar credenciales sueltas
-- en el SQL.
--
-- ⚠️ Pendiente de revisar (detectado en auditoría de seguridad,
-- 2026-08-15): esta consulta NO filtra por cliente_id, aunque
-- `settings` ya soporta una fila por (key, cliente_id) desde que el
-- proyecto es multi-tenant. Hoy solo un cliente tiene configuradas
-- estas claves, así que no falla — pero en cuanto un segundo cliente
-- configure 'pedido_estado_url'/'pedido_estado_secret', el `select
-- ... into` de abajo puede devolver más de una fila y abortar la
-- transacción (rollback silencioso del update de estado, ya que
-- usePedidos.setEstado en el frontend no comprueba el error), o en el
-- peor caso enviar los datos de un pedido al webhook/secreto de OTRO
-- cliente si Postgres decide una fila arbitraria. Corrección: añadir
-- `and cliente_id = new.cliente_id` a las tres consultas de esta
-- función (y a las equivalentes en notificar_stock_bajo y
-- notificar_newsletter_confirmacion).
create or replace function public.notificar_pedido_estado()
returns trigger as $$
declare
  v_url text;
  v_secret text;
begin
  if new.estado in ('confirmado', 'completado')
     and new.estado is distinct from old.estado
     and new.cliente_email is not null then

    select value #>> '{}' into v_url from public.settings where key = 'pedido_estado_url';
    select value #>> '{}' into v_secret from public.settings where key = 'pedido_estado_secret';

    if v_url is not null then
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(v_secret, '')),
        body := jsonb_build_object(
          'estado', new.estado,
          'cliente_nombre', new.cliente_nombre,
          'cliente_email', new.cliente_email,
          'metodo_entrega', new.metodo_entrega,
          'items', new.items,
          'importe_estimado', new.importe_estimado
        )
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

drop trigger if exists trg_pedidos_estado_notificar on public.pedidos;
create trigger trg_pedidos_estado_notificar
  after update of estado on public.pedidos
  for each row execute function public.notificar_pedido_estado();

-- ============================================================
-- Reseñas de clientes: quedan pendientes de aprobación del pescadero
-- antes de mostrarse en público.
-- ============================================================

create table if not exists public.resenas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  nombre text not null,
  valoracion integer not null check (valoracion between 1 and 5),
  comentario text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  created_at timestamptz not null default now()
);

alter table public.resenas enable row level security;

drop policy if exists "resenas_select_publico" on public.resenas;
create policy "resenas_select_publico"
  on public.resenas for select
  to anon, authenticated
  using (estado = 'aprobada');

drop policy if exists "resenas_select_admin" on public.resenas;
create policy "resenas_select_admin"
  on public.resenas for select
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "resenas_update_admin" on public.resenas;
create policy "resenas_update_admin"
  on public.resenas for update
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id())
  with check (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "resenas_delete_admin" on public.resenas;
create policy "resenas_delete_admin"
  on public.resenas for delete
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

create index if not exists idx_resenas_estado on public.resenas (estado);
create index if not exists idx_resenas_created_at on public.resenas (created_at desc);

-- El visitante deja su opinión siempre vía esta función, nunca por
-- insert directo.
create or replace function public.crear_resena(p_site_key uuid, p_nombre text, p_valoracion integer, p_comentario text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_id uuid;
begin
  v_cliente_id := public.cliente_id_from_site_key(p_site_key);
  if v_cliente_id is null then
    raise exception 'site_key inválida';
  end if;
  if char_length(p_nombre) < 1 or char_length(p_nombre) > 100 then
    raise exception 'nombre inválido';
  end if;
  if char_length(p_comentario) < 1 or char_length(p_comentario) > 1000 then
    raise exception 'comentario inválido';
  end if;

  insert into public.resenas (cliente_id, nombre, valoracion, comentario)
  values (v_cliente_id, p_nombre, p_valoracion, p_comentario)
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================
-- Control de stock: kg restantes por producto.
-- ============================================================

-- Descuenta stock al registrarse un pedido. security definer porque
-- el pedido lo inserta un cliente anónimo sin permiso de update sobre
-- productos.
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

-- Suma al stock lo que trae el pescadero cada mañana, de forma atómica
-- (evita condiciones de carrera frente a un simple "leer y volver a
-- escribir" desde el cliente).
create or replace function public.sumar_stock(p_producto_id uuid, p_kg numeric)
returns numeric as $$
  update public.productos
  set stock_kg = stock_kg + p_kg
  where id = p_producto_id
  returning stock_kg;
$$ language sql set search_path = public;

revoke all on function public.sumar_stock(uuid, numeric) from public;
grant execute on function public.sumar_stock(uuid, numeric) to authenticated;

-- Avisa por correo cuando el stock de un producto cae por debajo de su
-- mínimo (una sola vez por caída). Mismo aviso sobre tenant-scoping
-- pendiente que notificar_pedido_estado (ver comentario allí).
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

-- Descuenta stock automáticamente a partir de las pesadas registradas en
-- las básculas BM5 (Balanzas Marques) — David tiene dos pescaderías con
-- una báscula cada una, y comparten el mismo stock y catálogo (compra en
-- el mercado y reparte entre ambas). La Edge Function bascula-sync (ver
-- supabase/functions/bascula-sync) consulta cada pocos minutos el API
-- ETWS de cada terminal y llama a esta función por cada línea de ticket
-- vendida a peso, identificando el producto por su código en ESE
-- terminal concreto — cada báscula tiene su propio catálogo interno de
-- códigos, así que el mismo producto puede tener un código distinto en
-- cada una (ver productos_codigos_bascula, más abajo).
create or replace function public.descontar_stock_bascula(
  p_cliente_id uuid, p_origen text, p_codigo_bascula text, p_kg numeric
)
returns numeric as $$
  update public.productos p
  set stock_kg = greatest(stock_kg - p_kg, 0)
  from public.productos_codigos_bascula m
  where m.producto_id = p.id
    and m.cliente_id = p_cliente_id
    and m.origen = p_origen
    and m.codigo_bascula = p_codigo_bascula
  returning p.stock_kg;
$$ language sql set search_path = public;

revoke all on function public.descontar_stock_bascula(uuid, text, text, numeric) from public;
grant execute on function public.descontar_stock_bascula(uuid, text, text, numeric) to service_role;

-- Mapeo producto × báscula → código de ese terminal. Sustituye a un
-- antiguo campo único productos.codigo_bascula (válido mientras solo
-- había una báscula) — con dos terminales, un mismo producto necesita un
-- código por cada origen.
create table if not exists public.productos_codigos_bascula (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  producto_id uuid not null references public.productos (id) on delete cascade,
  origen text not null,
  codigo_bascula text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (producto_id, origen),
  unique (cliente_id, origen, codigo_bascula)
);

drop trigger if exists trg_productos_codigos_bascula_updated_at on public.productos_codigos_bascula;
create trigger trg_productos_codigos_bascula_updated_at
  before update on public.productos_codigos_bascula
  for each row execute function public.set_updated_at();

alter table public.productos_codigos_bascula enable row level security;

drop policy if exists "productos_codigos_bascula_admin" on public.productos_codigos_bascula;
create policy "productos_codigos_bascula_admin"
  on public.productos_codigos_bascula for all
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id())
  with check (is_developer() or cliente_id = mi_cliente_id());

-- Registro de cada línea de venta procesada desde cualquiera de las dos
-- básculas (origen), para poder sacar la facturación diaria además de
-- descontar stock. Se guarda igual aunque el producto no tenga código
-- mapeado todavía para ese origen (producto_id queda null en ese caso)
-- — el cierre de caja no debe depender de que el mapeo de stock esté
-- completo. linea_oid es el contador interno de CADA báscula por
-- separado (dos terminales pueden compartir el mismo número para
-- tickets distintos), así que la unicidad es (origen, linea_oid), no
-- linea_oid a secas.
create table if not exists public.bascula_ventas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  origen text not null,
  producto_id uuid references public.productos (id) on delete set null,
  linea_oid bigint not null,
  ticket_tipo_doc integer not null,
  ticket_posto integer not null,
  ticket_numero integer not null,
  fecha date not null,
  hora time,
  codigo_bascula text not null,
  designacion text not null,
  unidad text not null,
  cantidad numeric not null,
  precio_unit numeric not null,
  importe numeric not null,
  created_at timestamptz not null default now(),
  unique (origen, linea_oid)
);

alter table public.bascula_ventas enable row level security;

drop policy if exists "bascula_ventas_select_admin" on public.bascula_ventas;
create policy "bascula_ventas_select_admin"
  on public.bascula_ventas for select
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

-- Permite borrar una línea desde Ventas > Tienda si se coló una venta
-- errónea (ver comentario en useBasculaVentas.ts sobre por qué es
-- seguro: la sincronización no la vuelve a traer).
drop policy if exists "bascula_ventas_delete_admin" on public.bascula_ventas;
create policy "bascula_ventas_delete_admin"
  on public.bascula_ventas for delete
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

create index if not exists idx_bascula_ventas_fecha on public.bascula_ventas (cliente_id, fecha);
create index if not exists idx_bascula_ventas_origen_fecha on public.bascula_ventas (cliente_id, origen, fecha);

-- Facturación diaria combinando las dos pescaderías (importe de línea,
-- IVA incluido, tal como lo registra la báscula) y kg vendidos a peso,
-- para el cierre de caja. security_invoker: la vista respeta la RLS de
-- bascula_ventas para quien la consulte, en vez de correr con los
-- permisos de quien la creó.
create or replace view public.bascula_ventas_diarias
with (security_invoker = true) as
select
  cliente_id,
  fecha,
  count(distinct (ticket_tipo_doc, ticket_posto, ticket_numero)) as num_tickets,
  sum(importe) as total_importe,
  sum(cantidad) filter (where unidad = 'kg') as total_peso_kg
from public.bascula_ventas
group by cliente_id, fecha
order by fecha desc;

-- Mismo desglose pero por tienda — los ingresos sí se quieren ver
-- separados por pescadería (a diferencia de los gastos de Caja, que son
-- generales para el negocio conjunto).
create or replace view public.bascula_ventas_diarias_por_tienda
with (security_invoker = true) as
select
  cliente_id,
  fecha,
  origen,
  count(distinct (ticket_tipo_doc, ticket_posto, ticket_numero)) as num_tickets,
  sum(importe) as total_importe,
  sum(cantidad) filter (where unidad = 'kg') as total_peso_kg
from public.bascula_ventas
group by cliente_id, fecha, origen
order by fecha desc, origen;

-- ============================================================
-- Caja: registro manual de ingresos y gastos del día a día (sustituye la
-- hoja de cálculo que llevaba antes el pescadero). Cada fila es un
-- movimiento suelto, no un total diario ya sumado, para poder registrar
-- varias facturas o entradas el mismo día sin tener que sumarlas a mano
-- antes de escribirlas. 'ingreso_bares' es un ingreso (venta a hostelería
-- facturada aparte de tarjeta/efectivo de mostrador), no un gasto — así lo
-- trataba ya la hoja de cálculo original (se sumaba al total, no se
-- restaba). foto_url queda preparado desde ya para adjuntar la foto de la
-- factura/albarán en una fase posterior, sin necesitar otra migración.
create table if not exists public.caja_movimientos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  fecha date not null default current_date,
  tipo text not null check (
    tipo in ('ingreso_tarjeta', 'ingreso_efectivo', 'ingreso_bares', 'gasto_factura', 'gasto_extra')
  ),
  concepto text,
  importe numeric(10, 2) not null check (importe >= 0),
  foto_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_caja_movimientos_updated_at on public.caja_movimientos;
create trigger trg_caja_movimientos_updated_at
  before update on public.caja_movimientos
  for each row execute function public.set_updated_at();

alter table public.caja_movimientos enable row level security;

drop policy if exists "caja_movimientos_select_admin" on public.caja_movimientos;
create policy "caja_movimientos_select_admin"
  on public.caja_movimientos for select
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "caja_movimientos_insert_admin" on public.caja_movimientos;
create policy "caja_movimientos_insert_admin"
  on public.caja_movimientos for insert
  to authenticated
  with check (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "caja_movimientos_update_admin" on public.caja_movimientos;
create policy "caja_movimientos_update_admin"
  on public.caja_movimientos for update
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id())
  with check (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "caja_movimientos_delete_admin" on public.caja_movimientos;
create policy "caja_movimientos_delete_admin"
  on public.caja_movimientos for delete
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

create index if not exists idx_caja_movimientos_fecha on public.caja_movimientos (cliente_id, fecha);

-- ============================================================
-- Suscriptores del newsletter, con doble confirmación (double opt-in)
-- y baja sin login vía token.
-- ============================================================

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  email text not null,
  idioma text not null default 'es' check (idioma in ('es', 'eu')),
  confirmado boolean not null default false,
  confirmado_en timestamptz,
  confirm_token uuid not null default gen_random_uuid(),
  baja_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unique (cliente_id, email)
);

alter table public.newsletter_subscribers enable row level security;

drop policy if exists "newsletter_subscribers_select_admin" on public.newsletter_subscribers;
create policy "newsletter_subscribers_select_admin"
  on public.newsletter_subscribers for select
  to authenticated
  using (is_developer());

drop policy if exists "newsletter_subscribers_delete_admin" on public.newsletter_subscribers;
create policy "newsletter_subscribers_delete_admin"
  on public.newsletter_subscribers for delete
  to authenticated
  using (is_developer());

create unique index if not exists idx_newsletter_subscribers_confirm_token on public.newsletter_subscribers (confirm_token);
create unique index if not exists idx_newsletter_subscribers_baja_token on public.newsletter_subscribers (baja_token);
create index if not exists idx_newsletter_subscribers_created_at on public.newsletter_subscribers (created_at desc);

-- Alta/reenvío de confirmación. Devuelve 'nuevo' | 'reenviado' | 'confirmado'.
create or replace function public.crear_newsletter_subscriber(p_site_key uuid, p_email text, p_idioma text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_id uuid;
  v_confirmado boolean;
begin
  v_cliente_id := public.cliente_id_from_site_key(p_site_key);
  if v_cliente_id is null then
    raise exception 'site_key inválida';
  end if;
  if char_length(p_email) < 3 or char_length(p_email) > 255 then
    raise exception 'email inválido';
  end if;

  select id, confirmado into v_id, v_confirmado
  from public.newsletter_subscribers
  where cliente_id = v_cliente_id and email = p_email;

  if v_id is null then
    insert into public.newsletter_subscribers (cliente_id, email, idioma)
    values (v_cliente_id, p_email, p_idioma);
    return 'nuevo';
  elsif v_confirmado then
    return 'confirmado';
  else
    update public.newsletter_subscribers
    set confirm_token = gen_random_uuid(), idioma = p_idioma
    where id = v_id;
    return 'reenviado';
  end if;
end;
$$;

-- Marca como confirmado el suscriptor dueño de ese token.
-- 'confirmado' | 'ya_confirmado' | 'invalido'.
create or replace function public.confirmar_newsletter_subscriber(p_token uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_confirmado boolean;
begin
  select id, confirmado into v_id, v_confirmado
  from public.newsletter_subscribers
  where confirm_token = p_token;

  if v_id is null then
    return 'invalido';
  elsif v_confirmado then
    return 'ya_confirmado';
  end if;

  update public.newsletter_subscribers
  set confirmado = true, confirmado_en = now()
  where id = v_id;

  return 'confirmado';
end;
$$;

-- Da de baja (borra) al suscriptor dueño de ese token. 'baja' | 'invalido'.
create or replace function public.baja_newsletter_subscriber(p_token uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.newsletter_subscribers where baja_token = p_token;
  if v_id is null then
    return 'invalido';
  end if;

  delete from public.newsletter_subscribers where id = v_id;
  return 'baja';
end;
$$;

-- Envía el correo de confirmación (vía la Edge Function
-- newsletter-confirm). Mismo aviso sobre tenant-scoping pendiente que
-- notificar_pedido_estado (ver comentario allí).
create or replace function public.notificar_newsletter_confirmacion()
returns trigger as $$
declare
  v_url text;
  v_secret text;
begin
  if new.confirmado = false then
    select value #>> '{}' into v_url from public.settings where key = 'newsletter_confirm_url';
    select value #>> '{}' into v_secret from public.settings where key = 'newsletter_confirm_secret';

    if v_url is not null then
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(v_secret, '')),
        body := jsonb_build_object(
          'email', new.email,
          'idioma', new.idioma,
          'confirm_token', new.confirm_token,
          'baja_token', new.baja_token
        )
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

drop trigger if exists trg_newsletter_confirmacion on public.newsletter_subscribers;
create trigger trg_newsletter_confirmacion
  after insert or update of confirm_token on public.newsletter_subscribers
  for each row execute function public.notificar_newsletter_confirmacion();

-- Tras desplegar cada Edge Function de notificación, registra su URL y
-- el secreto compartido (mismo valor que el `*_SECRET` de la function,
-- configurado con `supabase secrets set`) en `settings`, para el
-- cliente correspondiente:
-- insert into public.settings (cliente_id, key, value) values
--   ('<CLIENTE_ID>', 'pedido_estado_url', '"https://<PROJECT_REF>.supabase.co/functions/v1/pedido-estado"'),
--   ('<CLIENTE_ID>', 'pedido_estado_secret', '"<UN_SECRETO_ALEATORIO>"'),
--   ('<CLIENTE_ID>', 'stock_alert_url', '"https://<PROJECT_REF>.supabase.co/functions/v1/stock-alert"'),
--   ('<CLIENTE_ID>', 'stock_alert_secret', '"<UN_SECRETO_ALEATORIO>"'),
--   ('<CLIENTE_ID>', 'newsletter_confirm_url', '"https://<PROJECT_REF>.supabase.co/functions/v1/newsletter-confirm"'),
--   ('<CLIENTE_ID>', 'newsletter_confirm_secret', '"<UN_SECRETO_ALEATORIO>"')
-- on conflict (key, cliente_id) do update set value = excluded.value;

-- Sincronización de stock con las básculas BM5 (Balanzas Marques) de las
-- dos pescaderías: a diferencia de las notificaciones anteriores,
-- bascula-sync no la invoca un trigger sobre una fila (no hay
-- "new"/"old" del que leer cliente_id), sino un cron — uno por cada
-- báscula, que le indica en el body a qué "origen" (pescaderia_1 /
-- pescaderia_2) pertenece. Sus credenciales del API ETWS (una por
-- origen) y el cliente_id al que pertenece van como secretos de la
-- propia function (ver supabase/functions/bascula-sync/.env.example),
-- no en `settings`. Tras desplegarla y fijar sus secretos con
-- `supabase secrets set`, programa su ejecución cada 5 minutos, una vez
-- por báscula:
-- create extension if not exists pg_cron with schema extensions;
-- select cron.schedule(
--   'bascula-sync-pescaderia-1',
--   '*/5 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/bascula-sync',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '<UN_SECRETO_ALEATORIO>'),
--     body := jsonb_build_object('origen', 'pescaderia_1')
--   );
--   $$
-- );
-- select cron.schedule(
--   'bascula-sync-pescaderia-2',
--   '*/5 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/bascula-sync',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', '<UN_SECRETO_ALEATORIO>'),
--     body := jsonb_build_object('origen', 'pescaderia_2')
--   );
--   $$
-- );

-- ============================================================
-- Reservas para fechas especiales (Navidad, Nochevieja...). El
-- pescadero abre "eventos" de reserva (una fecha de entrega y, si
-- quiere, una fecha límite para pedir), y desde la web pública el
-- cliente reserva productos y cantidades para ese evento sin
-- necesidad de que haya stock disponible ahora mismo — es un pedido a
-- futuro, así que a diferencia de `pedidos` NO descuenta `stock_kg`
-- al crearse.
-- ============================================================

-- fecha_entrega: primer día de recogida disponible de la campaña (p.ej.
-- Nochebuena). fecha_limite: último día en que se aceptan reservas — NO es
-- una fecha de entrega única para todos los clientes, cada cliente indica su
-- propio día de recogida al reservar (reservas.fecha_deseada), ya que una
-- campaña de fiestas cubre varias fechas relevantes (Nochebuena, Nochevieja,
-- Reyes...).
create table if not exists public.reservas_eventos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  nombre_es text not null,
  nombre_eu text,
  fecha_entrega date not null,
  fecha_limite date,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservas_eventos_fecha_limite_check check (fecha_limite is null or fecha_limite >= fecha_entrega)
);

drop trigger if exists trg_reservas_eventos_updated_at on public.reservas_eventos;
create trigger trg_reservas_eventos_updated_at
  before update on public.reservas_eventos
  for each row execute function public.set_updated_at();

alter table public.reservas_eventos enable row level security;

drop policy if exists "reservas_eventos_select_admin" on public.reservas_eventos;
create policy "reservas_eventos_select_admin"
  on public.reservas_eventos for select
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "reservas_eventos_insert_admin" on public.reservas_eventos;
create policy "reservas_eventos_insert_admin"
  on public.reservas_eventos for insert
  to authenticated
  with check (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "reservas_eventos_update_admin" on public.reservas_eventos;
create policy "reservas_eventos_update_admin"
  on public.reservas_eventos for update
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id())
  with check (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "reservas_eventos_delete_admin" on public.reservas_eventos;
create policy "reservas_eventos_delete_admin"
  on public.reservas_eventos for delete
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

create index if not exists idx_reservas_eventos_activo on public.reservas_eventos (activo);

-- Lectura pública: solo eventos activos y todavía dentro de plazo (sin
-- fecha límite, o con fecha límite no pasada) del cliente resuelto por
-- site_key, nunca por select directo — igual que get_productos_publico.
create or replace function public.get_reservas_eventos_publico(p_site_key uuid)
returns setof reservas_eventos
language sql stable security definer set search_path = public
as $$
  select e.* from public.reservas_eventos e
  where e.cliente_id = public.cliente_id_from_site_key(p_site_key)
    and e.activo = true
    and (e.fecha_limite is null or e.fecha_limite >= current_date)
  order by e.orden asc, e.fecha_entrega asc;
$$;

create table if not exists public.reservas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  evento_id uuid not null references public.reservas_eventos (id),
  items jsonb not null,
  total_productos integer not null default 0,
  peso_total numeric not null default 0,
  importe_estimado numeric,
  cliente_nombre text not null,
  cliente_telefono text,
  cliente_email text,
  fecha_deseada text,
  notas text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmada', 'entregada', 'cancelada')),
  device_id uuid,
  created_at timestamptz not null default now()
);

alter table public.reservas enable row level security;

-- Gestión: el pescadero del cliente dueño de la reserva, o desarrollador.
-- No hay policy de insert para "authenticated"/"anon": el cliente crea la
-- reserva siempre vía crear_reserva (security definer), igual que pedidos.
drop policy if exists "reservas_select_admin" on public.reservas;
create policy "reservas_select_admin"
  on public.reservas for select
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "reservas_update_admin" on public.reservas;
create policy "reservas_update_admin"
  on public.reservas for update
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id())
  with check (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "reservas_delete_admin" on public.reservas;
create policy "reservas_delete_admin"
  on public.reservas for delete
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

create index if not exists idx_reservas_created_at on public.reservas (created_at desc);
create index if not exists idx_reservas_estado on public.reservas (estado);
create index if not exists idx_reservas_evento_id on public.reservas (evento_id);
create index if not exists idx_reservas_device_id on public.reservas (device_id);

-- El cliente envía la reserva desde la web (sin sesión) siempre vía esta
-- función, nunca por insert directo. p_fecha_deseada es el día que el
-- propio cliente quiere recoger su pedido (texto libre, igual que
-- pedidos.fecha_preferida) — la campaña solo marca el periodo en que se
-- aceptan reservas, no impone una única fecha de entrega para todos.
create or replace function public.crear_reserva(
  p_site_key uuid, p_evento_id uuid, p_items jsonb, p_total_productos integer, p_peso_total numeric,
  p_importe_estimado numeric, p_cliente_nombre text, p_cliente_telefono text, p_cliente_email text,
  p_fecha_deseada text, p_notas text, p_device_id uuid
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_id uuid;
begin
  v_cliente_id := public.cliente_id_from_site_key(p_site_key);
  if v_cliente_id is null then
    raise exception 'site_key inválida';
  end if;

  if not exists (
    select 1 from public.reservas_eventos
    where id = p_evento_id and cliente_id = v_cliente_id and activo = true
      and (fecha_limite is null or fecha_limite >= current_date)
  ) then
    raise exception 'evento de reserva inválido o cerrado';
  end if;

  if char_length(p_cliente_nombre) < 1 or char_length(p_cliente_nombre) > 150 then
    raise exception 'nombre inválido';
  end if;

  insert into public.reservas (
    cliente_id, evento_id, items, total_productos, peso_total, importe_estimado,
    cliente_nombre, cliente_telefono, cliente_email, fecha_deseada, notas, device_id
  ) values (
    v_cliente_id, p_evento_id, p_items, p_total_productos, p_peso_total, p_importe_estimado,
    p_cliente_nombre, p_cliente_telefono, p_cliente_email, p_fecha_deseada, p_notas, p_device_id
  ) returning id into v_id;

  return v_id;
end;
$$;

-- Historial de reservas por dispositivo, sin login — mismo patrón que
-- get_pedidos_by_device.
create or replace function public.get_reservas_by_device(p_device_id uuid)
returns setof reservas
language sql stable security definer set search_path = public
as $$
  select *
  from public.reservas
  where device_id = p_device_id
  order by created_at desc
  limit 20;
$$;

revoke all on function public.get_reservas_by_device(uuid) from public;
grant execute on function public.get_reservas_by_device(uuid) to anon, authenticated;

-- Ajustes manuales sobre el resumen de un producto reservado: permite al
-- pescadero registrar una entrega/venta de reserva que no está ligada a
-- una fila concreta de `reservas` (p. ej. una reserva gestionada por
-- teléfono) sin tener que editar los items de una reserva existente. El
-- resumen por producto en el panel resta estos kg del total pendiente.
create table if not exists public.reservas_ajustes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  evento_id uuid not null references public.reservas_eventos (id),
  producto_id uuid references public.productos (id),
  producto_nombre text not null,
  kg numeric not null,
  nota text,
  created_at timestamptz not null default now()
);

alter table public.reservas_ajustes enable row level security;

drop policy if exists "reservas_ajustes_select_admin" on public.reservas_ajustes;
create policy "reservas_ajustes_select_admin"
  on public.reservas_ajustes for select
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "reservas_ajustes_insert_admin" on public.reservas_ajustes;
create policy "reservas_ajustes_insert_admin"
  on public.reservas_ajustes for insert
  to authenticated
  with check (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "reservas_ajustes_delete_admin" on public.reservas_ajustes;
create policy "reservas_ajustes_delete_admin"
  on public.reservas_ajustes for delete
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

create index if not exists idx_reservas_ajustes_evento_id on public.reservas_ajustes (evento_id);

-- ============================================================
-- Solicitudes de stock: cuando un producto está agotado
-- (productos.disponible = false), el cliente puede pedir desde la web
-- que se le avise o se reponga, sin necesidad de cuenta. El pescadero
-- las ve en el panel de Stock y las marca como atendidas al reponer o
-- contactar con el cliente — mismo patrón sin-login que `reservas`.
-- ============================================================
create table if not exists public.solicitudes_stock (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  producto_id uuid references public.productos (id) on delete set null,
  producto_nombre text not null,
  cliente_nombre text,
  cliente_telefono text,
  cantidad_kg numeric,
  notas text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'atendida', 'descartada')),
  device_id uuid,
  created_at timestamptz not null default now()
);

alter table public.solicitudes_stock enable row level security;

-- Gestión: el pescadero del cliente dueño de la solicitud, o desarrollador.
-- No hay policy de insert para "authenticated"/"anon": el cliente crea la
-- solicitud siempre vía crear_solicitud_stock (security definer), igual
-- que reservas.
drop policy if exists "solicitudes_stock_select_admin" on public.solicitudes_stock;
create policy "solicitudes_stock_select_admin"
  on public.solicitudes_stock for select
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "solicitudes_stock_update_admin" on public.solicitudes_stock;
create policy "solicitudes_stock_update_admin"
  on public.solicitudes_stock for update
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id())
  with check (is_developer() or cliente_id = mi_cliente_id());

drop policy if exists "solicitudes_stock_delete_admin" on public.solicitudes_stock;
create policy "solicitudes_stock_delete_admin"
  on public.solicitudes_stock for delete
  to authenticated
  using (is_developer() or cliente_id = mi_cliente_id());

create index if not exists idx_solicitudes_stock_created_at on public.solicitudes_stock (created_at desc);
create index if not exists idx_solicitudes_stock_estado on public.solicitudes_stock (estado);
create index if not exists idx_solicitudes_stock_producto_id on public.solicitudes_stock (producto_id);

-- El cliente envía la solicitud desde la web (sin sesión) siempre vía esta
-- función, nunca por insert directo — mismo patrón que crear_reserva.
-- producto_nombre se guarda tal cual está en el momento de la solicitud,
-- para que la fila siga siendo legible aunque el producto se borre o
-- cambie de nombre después.
create or replace function public.crear_solicitud_stock(
  p_site_key uuid, p_producto_id uuid, p_cliente_nombre text, p_cliente_telefono text,
  p_cantidad_kg numeric, p_notas text, p_device_id uuid
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_producto_nombre text;
  v_id uuid;
begin
  v_cliente_id := public.cliente_id_from_site_key(p_site_key);
  if v_cliente_id is null then
    raise exception 'site_key inválida';
  end if;

  select nombre_es into v_producto_nombre
  from public.productos
  where id = p_producto_id and cliente_id = v_cliente_id;

  if v_producto_nombre is null then
    raise exception 'producto inválido';
  end if;

  insert into public.solicitudes_stock (
    cliente_id, producto_id, producto_nombre, cliente_nombre, cliente_telefono, cantidad_kg, notas, device_id
  ) values (
    v_cliente_id, p_producto_id, v_producto_nombre, nullif(p_cliente_nombre, ''), nullif(p_cliente_telefono, ''),
    p_cantidad_kg, nullif(p_notas, ''), p_device_id
  ) returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================
-- Realtime: el panel de gestión (usePedidos, useReservas, useResenas,
-- useProductos, useNewsletter, useReservasEventos, useReservasAjustes,
-- useSolicitudesStock, useCaja) se suscribe a estas tablas con Postgres Changes
-- para refrescarse solo en cuanto cambian, sin recargar la página.
-- Postgres Changes solo emite eventos de una tabla si está añadida a la
-- publicación `supabase_realtime` — no ocurre automáticamente al crear la
-- tabla, hay que añadirla a mano. El envío a cada cliente conectado sigue
-- filtrado por sus policies de select (RLS), igual que una query normal:
-- un cliente_id no ve cambios de otro. Bloque idempotente: solo añade las
-- que falten.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'pedidos', 'reservas', 'reservas_eventos', 'reservas_ajustes',
    'resenas', 'newsletter_subscribers', 'productos', 'solicitudes_stock',
    'bascula_ventas',
    'caja_movimientos'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
