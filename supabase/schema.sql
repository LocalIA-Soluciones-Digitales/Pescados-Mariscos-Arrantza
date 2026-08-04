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
