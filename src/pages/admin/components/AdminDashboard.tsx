import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useProductos } from '@/hooks/useProductos';
import { CATEGORIA_FILTROS, type CategoriaFiltro, type Producto, type ProductoEstado } from '@/types/producto';
import CategoryFilterDropdown from '@/components/base/CategoryFilterDropdown';
import ProductoFormModal from './ProductoFormModal';
import VentasPanel from './VentasPanel';
import ResenasPanel from './ResenasPanel';
import StockPanel from './StockPanel';
import CajaPanel from './CajaPanel';
import ReservasPanel from './ReservasPanel';
import SolicitudesStockPanel from './SolicitudesStockPanel';
import HoyPanel from './HoyPanel';
import ClientesPanel from './ClientesPanel';
import {
  HOY_INFO_ITEMS,
  VENTAS_INFO_ITEMS,
  CAJA_INFO_ITEMS,
  RESERVAS_INFO_ITEMS,
  SOLICITUDES_INFO_ITEMS,
  PRODUCTOS_INFO_ITEMS,
  STOCK_INFO_ITEMS,
  CLIENTES_INFO_ITEMS,
  RESENAS_INFO_ITEMS,
} from './infoItems';
import { usePedidos } from '@/hooks/usePedidos';
import { useResenas } from '@/hooks/useResenas';
import { useReservas } from '@/hooks/useReservas';
import { useSolicitudesStock } from '@/hooks/useSolicitudesStock';
import { usePromoOtorgadas } from '@/hooks/usePromoOtorgadas';
import { usePulse } from '@/hooks/usePulse';
import { useOrderAlertSound } from '@/hooks/useOrderAlertSound';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';
import ViewSwitcher from './ViewSwitcher';
import InfoHint from '@/components/base/InfoHint';
import SearchInput from '@/components/base/SearchInput';

type Tab = 'hoy' | 'productos' | 'ventas' | 'caja' | 'resenas' | 'stock' | 'reservas' | 'solicitudes' | 'clientes';

const ESTADO_LABELS: Record<ProductoEstado, string> = {
  available: 'Normal',
  new: 'Novedad',
  premium: 'Especialidad',
  seasonal: 'Temporada',
};

function ProductoCard({
  producto,
  onPatch,
  onDelete,
  onEdit,
}: {
  producto: Producto;
  onPatch: (patch: Partial<Producto>) => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const stockBajo = producto.stock_kg <= producto.stock_minimo;

  const toggleDisponible = async () => {
    setBusy(true);
    const disponible = !producto.disponible;
    const { error } = await supabase.from('productos').update({ disponible }).eq('id', producto.id);
    setBusy(false);
    if (error) {
      alert('No se pudo actualizar la disponibilidad: ' + error.message);
      return;
    }
    onPatch({ disponible });
  };

  const toggleDestacado = async () => {
    setBusy(true);
    const destacado = !producto.destacado;
    const { error } = await supabase.from('productos').update({ destacado }).eq('id', producto.id);
    setBusy(false);
    if (error) {
      alert('No se pudo actualizar el destacado: ' + error.message);
      return;
    }
    onPatch({ destacado });
  };

  const cambiarEstado = async (estado: ProductoEstado) => {
    setBusy(true);
    const { error } = await supabase.from('productos').update({ estado }).eq('id', producto.id);
    setBusy(false);
    if (error) {
      alert('No se pudo actualizar la etiqueta: ' + error.message);
      return;
    }
    onPatch({ estado });
  };

  const eliminar = async () => {
    if (!confirm(`¿Eliminar "${producto.nombre_es}" del catálogo?`)) return;
    setBusy(true);
    const { error } = await supabase.from('productos').delete().eq('id', producto.id);
    setBusy(false);
    if (error) {
      alert('No se pudo eliminar: ' + error.message);
      return;
    }
    onDelete();
  };

  return (
    <div className={`bg-background-50 border border-background-200/70 rounded-xl shadow-card hover:shadow-card-hover transition-shadow duration-200 overflow-hidden ${busy ? 'opacity-60' : ''}`}>
      <div className="relative aspect-[5/4] bg-background-100">
        {producto.imagen_url && (
          <img src={producto.imagen_url} alt={producto.nombre_es} className={`w-full h-full object-cover ${!producto.disponible ? 'grayscale opacity-60' : ''}`} />
        )}
        <button
          type="button"
          onClick={toggleDestacado}
          disabled={busy}
          title={producto.destacado ? 'Quitar de la selección del día' : 'Añadir a la selección del día'}
          className={`absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full text-sm shadow-sm transition-colors ${
            producto.destacado ? 'bg-amber-400 text-white' : 'bg-white/85 text-foreground-400 hover:text-amber-500'
          }`}
        >
          <i className={producto.destacado ? 'ri-star-fill' : 'ri-star-line'}></i>
        </button>
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-foreground-950 truncate mb-0.5">{producto.nombre_es}</p>
        <p className="text-xs text-foreground-400 mb-0.5">{producto.precio}</p>
        <p className={`text-xs mb-2 flex items-center gap-1 ${stockBajo ? 'text-red-600 font-medium' : 'text-foreground-400'}`}>
          {stockBajo && <i className="ri-alert-line"></i>}
          Stock: {producto.stock_kg} kg
        </p>

        {/* Toggle disponible/agotado */}
        <button
          type="button"
          onClick={toggleDisponible}
          disabled={busy}
          className={`w-full mb-2 px-3 py-2 rounded-full text-xs font-medium transition-colors ${
            producto.disponible
              ? 'bg-emerald-100/80 text-emerald-700 hover:bg-emerald-200/80'
              : 'bg-background-200/70 text-foreground-500 hover:bg-background-300/70'
          }`}
        >
          {producto.disponible ? 'Disponible' : 'Agotado'}
        </button>

        {/* Etiqueta */}
        <div className="relative mb-3">
          <select
            value={producto.estado}
            onChange={(e) => cambiarEstado(e.target.value as ProductoEstado)}
            disabled={busy}
            className="w-full appearance-none bg-background-100 border border-background-200/70 rounded-full px-8 py-1.5 !text-[11px] font-medium text-foreground-700 text-center [text-align-last:center] cursor-pointer hover:bg-background-200/70 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40 transition-all duration-200"
          >
            {(Object.keys(ESTADO_LABELS) as ProductoEstado[]).map((estado) => (
              <option key={estado} value={estado}>
                {ESTADO_LABELS[estado]}
              </option>
            ))}
          </select>
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 flex items-center justify-center text-foreground-400 pointer-events-none">
            <i className="ri-arrow-down-s-line text-xs"></i>
          </span>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={onEdit} className="flex-1 px-3 py-2 rounded-full text-xs font-medium bg-background-100 text-foreground-600 hover:bg-background-200/70">
            Editar
          </button>
          <button type="button" onClick={eliminar} className="px-3 py-2 rounded-full text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100">
            <i className="ri-delete-bin-line"></i>
          </button>
        </div>
      </div>
    </div>
  );
}

const TABS: { value: Tab; label: string; info: { icon: string; text: string }[] }[] = [
  { value: 'hoy', label: 'Hoy', info: HOY_INFO_ITEMS },
  { value: 'ventas', label: 'Ventas', info: VENTAS_INFO_ITEMS },
  { value: 'caja', label: 'Caja', info: CAJA_INFO_ITEMS },
  { value: 'reservas', label: 'Reservas', info: RESERVAS_INFO_ITEMS },
  { value: 'solicitudes', label: 'Solicitudes', info: SOLICITUDES_INFO_ITEMS },
  { value: 'productos', label: 'Productos', info: PRODUCTOS_INFO_ITEMS },
  { value: 'stock', label: 'Stock', info: STOCK_INFO_ITEMS },
  { value: 'clientes', label: 'Clientes', info: CLIENTES_INFO_ITEMS },
  { value: 'resenas', label: 'Reseñas', info: RESENAS_INFO_ITEMS },
];

type ViewSwitch = { label: string; onClick: () => void };

export default function AdminDashboard({ onSignOut, viewSwitch }: { onSignOut: () => void; viewSwitch?: ViewSwitch }) {
  const { productos, loading: loadingProductos, patchLocal, removeLocal, addLocal } = useProductos();
  const loading = loadingProductos;
  const [editing, setEditing] = useState<Producto | null | 'new'>(null);
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState<CategoriaFiltro>('todos');
  const [soloAgotados, setSoloAgotados] = useState(false);
  const [soloDestacados, setSoloDestacados] = useState(false);
  const [tab, setTab] = useState<Tab>('hoy');
  const tabsScroll = useHorizontalWheelScroll<HTMLDivElement>();
  const filtrosScroll = useHorizontalWheelScroll<HTMLDivElement>();
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeaderHeight(el.getBoundingClientRect().height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Se cargan aquí (y no solo dentro de cada panel) para las insignias de las
  // pestañas y para alimentar Hoy/Clientes, que cruzan datos de varias
  // tablas. Con Realtime activo (useRealtimeTable dentro de cada hook) se
  // mantienen al día solas, sin recargar la página.
  const { pedidos, loading: loadingPedidos } = usePedidos();
  const { resenas, loading: loadingResenas } = useResenas();
  const { reservas, loading: loadingReservas } = useReservas();
  const { solicitudes } = useSolicitudesStock();
  const { otorgadas: promoOtorgadas, patchOtorgada } = usePromoOtorgadas();
  const pedidosNuevos = useMemo(() => pedidos.filter((p) => p.estado === 'nuevo').length, [pedidos]);
  const resenasPendientes = useMemo(() => resenas.filter((r) => r.estado === 'pendiente').length, [resenas]);
  const reservasPendientes = useMemo(() => reservas.filter((r) => r.estado === 'pendiente').length, [reservas]);
  const solicitudesPendientes = useMemo(() => solicitudes.filter((s) => s.estado === 'pendiente').length, [solicitudes]);

  // Resalta visualmente la pestaña correspondiente durante unos segundos
  // cuando entra algo nuevo, y avisa con un sonido en el caso de pedidos
  // (el más urgente: implica dinero y una preparación con fecha).
  const pedidosPulse = usePulse(pedidosNuevos);
  const reservasPulse = usePulse(reservasPendientes);
  const resenasPulse = usePulse(resenasPendientes);
  const solicitudesPulse = usePulse(solicitudesPendientes);

  const { playNewOrderSound, unlock } = useOrderAlertSound();
  const pedidosNuevosPrevRef = useRef<number | null>(null);

  useEffect(() => {
    const handler = () => unlock();
    window.addEventListener('pointerdown', handler, { once: true });
    return () => window.removeEventListener('pointerdown', handler);
  }, [unlock]);

  useEffect(() => {
    if (pedidosNuevosPrevRef.current !== null && pedidosNuevos > pedidosNuevosPrevRef.current) {
      playNewOrderSound();
    }
    pedidosNuevosPrevRef.current = pedidosNuevos;
  }, [pedidosNuevos, playNewOrderSound]);

  const agotadosCount = useMemo(() => productos.filter((p) => !p.disponible).length, [productos]);
  const destacadosCount = useMemo(() => productos.filter((p) => p.destacado).length, [productos]);
  const stockBajoCount = useMemo(() => productos.filter((p) => p.stock_kg <= p.stock_minimo).length, [productos]);

  const categoriaCounts = useMemo(() => {
    const counts: Record<string, number> = { todos: productos.length };
    CATEGORIA_FILTROS.forEach((c) => {
      if (c.value === 'todos') return;
      counts[c.value] = productos.filter((p) =>
        c.tipo === 'categoria' ? p.categoria === c.value : p.subcategoria === c.value,
      ).length;
    });
    return counts;
  }, [productos]);

  const visibles = useMemo(() => {
    let result = productos;

    if (categoria !== 'todos') {
      const filtro = CATEGORIA_FILTROS.find((c) => c.value === categoria);
      result = result.filter((p) =>
        filtro?.tipo === 'subcategoria' ? p.subcategoria === categoria : p.categoria === categoria,
      );
    }
    if (soloAgotados) {
      result = result.filter((p) => !p.disponible);
    }
    if (soloDestacados) {
      result = result.filter((p) => p.destacado);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((p) => p.nombre_es.toLowerCase().includes(q) || p.nombre_eu?.toLowerCase().includes(q));
    }

    // Alfabético — no depende de disponible/estado/stock, así que el
    // producto nunca "salta" de sitio al marcarlo agotado.
    return [...result].sort((a, b) => a.nombre_es.localeCompare(b.nombre_es, 'es'));
  }, [productos, categoria, soloAgotados, soloDestacados, search]);

  const nombresSugeridos = useMemo(
    () => Array.from(new Set(productos.flatMap((p) => [p.nombre_es, p.nombre_eu].filter((n): n is string => !!n)))),
    [productos],
  );

  const tabsNav = (
    <div ref={tabsScroll.ref} onWheel={tabsScroll.onWheel} className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
      {TABS.map((t) => {
        const badge =
          t.value === 'hoy'
            ? pedidosNuevos + reservasPendientes
            : t.value === 'ventas'
              ? pedidosNuevos
              : t.value === 'resenas'
                ? resenasPendientes
                : t.value === 'stock'
                  ? stockBajoCount
                  : t.value === 'reservas'
                    ? reservasPendientes
                    : t.value === 'solicitudes'
                      ? solicitudesPendientes
                      : 0;
        const pulse =
          t.value === 'hoy'
            ? pedidosPulse || reservasPulse
            : t.value === 'ventas'
              ? pedidosPulse
              : t.value === 'reservas'
                ? reservasPulse
                : t.value === 'resenas'
                  ? resenasPulse
                  : t.value === 'solicitudes'
                    ? solicitudesPulse
                    : false;
        const active = tab === t.value;
        return (
          <div
            key={t.value}
            data-tab-pill
            className={`inline-flex items-center gap-1 rounded-full whitespace-nowrap flex-shrink-0 transition-all duration-200 ${
              active ? 'bg-primary-500 text-background-50 shadow-card' : 'bg-background-100 text-foreground-500 hover:bg-background-200/70'
            }`}
          >
            <button
              type="button"
              onClick={() => setTab(t.value)}
              className="inline-flex items-center gap-1.5 pl-3.5 py-2 text-xs font-medium"
            >
              {t.label}
              {badge > 0 && (
                <span className="relative inline-flex flex-shrink-0">
                  {pulse && (
                    <span className="absolute inset-0 rounded-full bg-red-400 animate-ping"></span>
                  )}
                  <span
                    className={`relative inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-semibold leading-none ${
                      active ? 'bg-background-50/25' : 'bg-red-500 text-background-50'
                    }`}
                  >
                    {badge}
                  </span>
                </span>
              )}
            </button>
            <InfoHint
              items={t.info}
              title={t.label}
              align="right"
              size="sm"
              tone={active ? 'onPrimary' : 'neutral'}
              anchorSelector="[data-tab-pill]"
              className="mr-2.5"
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-background-100" style={{ '--admin-header-height': `${headerHeight}px` } as CSSProperties}>
      <header ref={headerRef} className="sticky top-0 z-20 bg-background-50 border-b border-background-200/70 shadow-card px-4 md:px-8 py-3 md:py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <h1 className="text-lg font-heading font-semibold text-foreground-950 truncate leading-tight">Gestión</h1>
              <p className="text-[11px] uppercase tracking-wide text-foreground-400 truncate">Pescados y Mariscos Arrantza</p>
            </div>
            <div className="hidden md:block">{tabsNav}</div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden md:flex items-center gap-3">
              {viewSwitch && <ViewSwitcher current="Panel de gestión" viewSwitch={viewSwitch} />}
              <button type="button" onClick={onSignOut} className="text-xs font-medium text-foreground-500 hover:text-foreground-950">
                Cerrar sesión
              </button>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-full bg-background-100 border border-background-200/70 text-foreground-500 hover:text-foreground-950 hover:border-foreground-300/60 transition-colors flex-shrink-0"
            >
              <i className="ri-logout-box-r-line text-base"></i>
            </button>
          </div>
        </div>
        {viewSwitch && <div className="mt-3 md:hidden"><ViewSwitcher current="Panel de gestión" viewSwitch={viewSwitch} /></div>}
        <div className="md:hidden mt-3">{tabsNav}</div>
      </header>

      {tab === 'hoy' ? (
        <HoyPanel
          pedidos={pedidos}
          reservas={reservas}
          resenas={resenas}
          productos={productos}
          loading={loadingPedidos || loadingReservas || loadingResenas || loadingProductos}
          onNavigate={setTab}
        />
      ) : tab === 'ventas' ? (
        <VentasPanel />
      ) : tab === 'caja' ? (
        <CajaPanel />
      ) : tab === 'resenas' ? (
        <ResenasPanel />
      ) : tab === 'reservas' ? (
        <ReservasPanel />
      ) : tab === 'solicitudes' ? (
        <SolicitudesStockPanel />
      ) : tab === 'clientes' ? (
        <ClientesPanel
          pedidos={pedidos}
          reservas={reservas}
          productos={productos}
          promoOtorgadas={promoOtorgadas}
          patchOtorgada={patchOtorgada}
          loading={loadingPedidos || loadingReservas}
        />
      ) : tab === 'stock' ? (
        <StockPanel productos={productos} loading={loading} onPatch={patchLocal} />
      ) : (
        <>
      {/* Filtros */}
      <div
        className="sticky z-10 bg-background-100/95 backdrop-blur-sm border-b border-background-200/50 px-4 md:px-8 py-3 flex flex-col sm:flex-row gap-2 sm:items-center"
        style={{ top: 'var(--admin-header-height, 0px)' }}
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          suggestions={nombresSugeridos}
          placeholder="Buscar producto…"
          className="w-full sm:w-[280px] md:w-[420px] flex-shrink-0"
        />

        <CategoryFilterDropdown
          categorias={CATEGORIA_FILTROS}
          counts={categoriaCounts}
          value={categoria}
          onChange={(v) => {
            setCategoria(v);
            setSoloAgotados(false);
            setSoloDestacados(false);
          }}
        />

        <div ref={filtrosScroll.ref} onWheel={filtrosScroll.onWheel} className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          <button
            type="button"
            onClick={() => {
              setSoloAgotados((v) => !v);
              setSoloDestacados(false);
              setCategoria('todos');
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors flex items-center gap-1 ${
              soloAgotados ? 'bg-red-500 text-background-50' : 'bg-background-50 text-foreground-500 hover:bg-background-200/70'
            }`}
          >
            Agotados
            {agotadosCount > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] ${soloAgotados ? 'bg-background-50/25' : 'bg-red-100 text-red-600'}`}>
                {agotadosCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setSoloDestacados((v) => !v);
              setSoloAgotados(false);
              setCategoria('todos');
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors flex items-center gap-1 ${
              soloDestacados ? 'bg-amber-400 text-background-50' : 'bg-background-50 text-foreground-500 hover:bg-background-200/70'
            }`}
          >
            <i className="ri-star-line"></i>
            Selección del día
            {destacadosCount > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] ${soloDestacados ? 'bg-background-50/25' : 'bg-amber-100 text-amber-700'}`}>
                {destacadosCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <main className="px-4 md:px-8 py-6 pb-28">
        {loading ? (
          <p className="text-sm text-foreground-400">Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="text-sm text-foreground-400">No hay productos que coincidan con el filtro.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {visibles.map((producto) => (
              <ProductoCard
                key={producto.id}
                producto={producto}
                onPatch={(patch) => patchLocal(producto.id, patch)}
                onDelete={() => removeLocal(producto.id)}
                onEdit={() => setEditing(producto)}
              />
            ))}
          </div>
        )}
      </main>

      {/* FAB añadir producto */}
      <button
        type="button"
        onClick={() => setEditing('new')}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary-500 text-background-50 shadow-lg flex items-center justify-center text-2xl hover:bg-primary-600"
        aria-label="Añadir producto"
      >
        <i className="ri-add-line"></i>
      </button>

      {editing !== null && (
        <ProductoFormModal
          producto={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            const wasNew = editing === 'new';
            setEditing(null);
            if (wasNew) addLocal(saved);
            else patchLocal(saved.id, saved);
          }}
        />
      )}
        </>
      )}
    </div>
  );
}
