import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useProductos } from '@/hooks/useProductos';
import type { Producto, ProductoEstado } from '@/types/producto';
import ProductoFormModal from './ProductoFormModal';

const ESTADO_LABELS: Record<ProductoEstado, string> = {
  available: 'Normal',
  new: 'Novedad',
  premium: 'Especialidad',
  seasonal: 'Temporada',
};

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
  const { productos, loading, refetch } = useProductos();
  const [editing, setEditing] = useState<Producto | null | 'new'>(null);

  return (
    <div className="min-h-screen bg-background-100">
      <header className="sticky top-0 z-10 bg-background-50 border-b border-background-200/70 px-4 md:px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-heading font-semibold text-foreground-950">Gestión de productos</h1>
          <p className="text-xs text-foreground-400">Pescados y Mariscos Arrantza</p>
        </div>
        <button type="button" onClick={onSignOut} className="text-xs font-medium text-foreground-500 hover:text-foreground-950">
          Cerrar sesión
        </button>
      </header>

      <main className="px-4 md:px-8 py-6 pb-28">
        {loading ? (
          <p className="text-sm text-foreground-400">Cargando…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {productos.map((producto) => (
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
    </div>
  );
}
