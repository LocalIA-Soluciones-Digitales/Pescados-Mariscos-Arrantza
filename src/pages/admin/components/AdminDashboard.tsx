import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useProductos } from '@/hooks/useProductos';
import type { Producto, ProductoCategoria, ProductoEstado } from '@/types/producto';
import ProductoFormModal from './ProductoFormModal';
import ErrorLogsPanel from './ErrorLogsPanel';
import ReportsPanel from './ReportsPanel';
import SummaryPanel from './SummaryPanel';

const ESTADO_LABELS: Record<ProductoEstado, string> = {
  available: 'Normal',
  new: 'Novedad',
  premium: 'Especialidad',
  seasonal: 'Temporada',
};

type CategoriaFiltro = 'todos' | ProductoCategoria | string;

// Mismo listado y orden que el filtro del catálogo público (categorías + subcategorías de pescado)
const CATEGORIA_FILTROS: { value: CategoriaFiltro; label: string; tipo: 'categoria' | 'subcategoria' }[] = [
  { value: 'todos', label: 'Todos', tipo: 'categoria' },
  { value: 'pescado', label: 'Pescado', tipo: 'categoria' },
  { value: 'especial', label: 'Especial', tipo: 'categoria' },
  { value: 'raciones', label: 'Raciones', tipo: 'categoria' },
  { value: 'marisco', label: 'Marisco', tipo: 'categoria' },
  { value: 'azul', label: 'Pescado Azul', tipo: 'subcategoria' },
  { value: 'blanco', label: 'Pescado Blanco', tipo: 'subcategoria' },
  { value: 'cefalopodos', label: 'Cefalópodos', tipo: 'subcategoria' },
  { value: 'bivalvos', label: 'Bivalvos / Moluscos', tipo: 'subcategoria' },
  { value: 'crustaceos_grandes', label: 'Crustáceos Grandes', tipo: 'subcategoria' },
  { value: 'gambas_langostinos', label: 'Gambas y Langostinos', tipo: 'subcategoria' },
];

function ProductoCard({ producto, onChanged, onEdit }: { producto: Producto; onChanged: () => void; onEdit: () => void }) {
  const [busy, setBusy] = useState(false);

  const toggleDisponible = async () => {
    setBusy(true);
    await supabase.from('productos').update({ disponible: !producto.disponible }).eq('id', producto.id);
    setBusy(false);
    onChanged();
  };

  const cambiarEstado = async (estado: ProductoEstado) => {
    setBusy(true);
    await supabase.from('productos').update({ estado }).eq('id', producto.id);
    setBusy(false);
    onChanged();
  };

  const eliminar = async () => {
    if (!confirm(`¿Eliminar "${producto.nombre_es}" del catálogo?`)) return;
    setBusy(true);
    await supabase.from('productos').delete().eq('id', producto.id);
    setBusy(false);
    onChanged();
  };

  return (
    <div className={`bg-background-50 border border-background-200/70 rounded-lg overflow-hidden ${busy ? 'opacity-60' : ''}`}>
      <div className="aspect-[5/4] bg-background-100">
        {producto.imagen_url && (
          <img src={producto.imagen_url} alt={producto.nombre_es} className={`w-full h-full object-cover ${!producto.disponible ? 'grayscale opacity-60' : ''}`} />
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-foreground-950 truncate mb-0.5">{producto.nombre_es}</p>
        <p className="text-xs text-foreground-400 mb-2">{producto.precio}</p>

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

        {/* Estado chips */}
        <div className="flex flex-wrap gap-1 mb-3">
          {(Object.keys(ESTADO_LABELS) as ProductoEstado[]).map((estado) => (
            <button
              key={estado}
              type="button"
              onClick={() => cambiarEstado(estado)}
              disabled={busy}
              className={`px-2 py-1 rounded-full text-[10px] font-medium ${
                producto.estado === estado
                  ? 'bg-primary-500 text-background-50'
                  : 'bg-background-100 text-foreground-400 hover:bg-background-200/70'
              }`}
            >
              {ESTADO_LABELS[estado]}
            </button>
          ))}
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

export default function AdminDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<'productos' | 'informes' | 'resumen' | 'errores'>('productos');
  const { productos, loading, refetch } = useProductos();
  const [editing, setEditing] = useState<Producto | null | 'new'>(null);
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState<CategoriaFiltro>('todos');
  const [soloAgotados, setSoloAgotados] = useState(false);

  const agotadosCount = useMemo(() => productos.filter((p) => !p.disponible).length, [productos]);

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
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((p) => p.nombre_es.toLowerCase().includes(q) || p.nombre_eu?.toLowerCase().includes(q));
    }

    // Agotados primero — así el pescadero ve de un vistazo qué falta reponer
    return [...result].sort((a, b) => Number(a.disponible) - Number(b.disponible) || a.orden - b.orden);
  }, [productos, categoria, soloAgotados, search]);

  return (
    <div className="min-h-screen bg-background-100">
      <header className="sticky top-0 z-10 bg-background-50 border-b border-background-200/70 px-4 md:px-8 py-4 flex items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-base font-heading font-semibold text-foreground-950">
              {tab === 'productos'
                ? 'Gestión de productos'
                : tab === 'informes'
                  ? 'Informes de visitas'
                  : tab === 'resumen'
                    ? 'Resumen'
                    : 'Registro de errores'}
            </h1>
            <p className="text-xs text-foreground-400">Pescados y Mariscos Arrantza</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTab('productos')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                tab === 'productos' ? 'bg-primary-500 text-background-50' : 'bg-background-100 text-foreground-500 hover:bg-background-200/70'
              }`}
            >
              Productos
            </button>
            <button
              type="button"
              onClick={() => setTab('informes')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                tab === 'informes' ? 'bg-primary-500 text-background-50' : 'bg-background-100 text-foreground-500 hover:bg-background-200/70'
              }`}
            >
              Informes
            </button>
            <button
              type="button"
              onClick={() => setTab('resumen')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                tab === 'resumen' ? 'bg-primary-500 text-background-50' : 'bg-background-100 text-foreground-500 hover:bg-background-200/70'
              }`}
            >
              Resumen
            </button>
            <button
              type="button"
              onClick={() => setTab('errores')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                tab === 'errores' ? 'bg-primary-500 text-background-50' : 'bg-background-100 text-foreground-500 hover:bg-background-200/70'
              }`}
            >
              Errores
            </button>
          </div>
        </div>
        <button type="button" onClick={onSignOut} className="text-xs font-medium text-foreground-500 hover:text-foreground-950 flex-shrink-0">
          Cerrar sesión
        </button>
      </header>

      {tab === 'errores' ? (
        <ErrorLogsPanel />
      ) : tab === 'informes' ? (
        <ReportsPanel />
      ) : tab === 'resumen' ? (
        <SummaryPanel />
      ) : (
        <>
      {/* Filtros */}
      <div className="sticky top-[65px] z-10 bg-background-100/95 backdrop-blur-sm border-b border-background-200/50 px-4 md:px-8 py-3 flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 max-w-[280px]">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto…"
            className="w-full pl-9 pr-3 py-2 bg-background-50 border border-background-200/70 rounded-full text-sm focus:outline-none focus:border-foreground-300/60"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {CATEGORIA_FILTROS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategoria(c.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                categoria === c.value ? 'bg-primary-500 text-background-50' : 'bg-background-50 text-foreground-500 hover:bg-background-200/70'
              }`}
            >
              {c.label}
              <span
                className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] leading-none ${
                  categoria === c.value ? 'bg-background-50/20 text-background-50' : 'bg-background-200/60 text-foreground-400'
                }`}
              >
                {categoriaCounts[c.value] ?? 0}
              </span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => setSoloAgotados((v) => !v)}
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
        </div>
      </div>

      <main className="px-4 md:px-8 py-6 pb-28">
        {loading ? (
          <p className="text-sm text-foreground-400">Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="text-sm text-foreground-400">No hay productos que coincidan con el filtro.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {visibles.map((producto) => (
              <ProductoCard
                key={producto.id}
                producto={producto}
                onChanged={refetch}
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
          onSaved={() => {
            setEditing(null);
            refetch();
          }}
        />
      )}
        </>
      )}
    </div>
  );
}
