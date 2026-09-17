import { useMemo, useState } from 'react';
import type { Producto } from '@/types/producto';
import type { ProfesionalListaPrecio, ProfesionalPrecio } from '@/types/profesional';

function FilaProducto({
  producto,
  override,
  onGuardar,
}: {
  producto: Producto;
  override: string;
  onGuardar: (precio: string) => Promise<void>;
}) {
  const [valor, setValor] = useState(override);
  const [saving, setSaving] = useState(false);
  const modificado = valor !== override;

  const guardar = async () => {
    if (!modificado) return;
    setSaving(true);
    await onGuardar(valor);
    setSaving(false);
  };

  return (
    <div className="flex items-center gap-3 py-2 border-b border-background-200/50 last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground-800 truncate">{producto.nombre_es}</p>
        <p className="text-[11px] text-foreground-400">Precio público: {producto.precio}</p>
      </div>
      <input
        type="text"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        placeholder="Igual que el público"
        disabled={saving}
        className="w-40 px-2.5 py-1.5 bg-background-100 border border-background-200/70 rounded-lg text-sm text-right focus:outline-none focus:border-foreground-300/60"
      />
    </div>
  );
}

export default function ListaPrecioModal({
  lista,
  productos,
  precios,
  onClose,
  onGuardarPrecio,
  onRenombrar,
  onEliminar,
}: {
  lista: ProfesionalListaPrecio;
  productos: Producto[];
  precios: ProfesionalPrecio[];
  onClose: () => void;
  onGuardarPrecio: (listaId: string, productoId: string, precio: string) => Promise<boolean>;
  onRenombrar: (id: string, nombre: string) => Promise<boolean>;
  onEliminar: (id: string) => Promise<boolean>;
}) {
  const [search, setSearch] = useState('');
  const [nombre, setNombre] = useState(lista.nombre);
  const [editandoNombre, setEditandoNombre] = useState(false);

  const overridesPorProducto = useMemo(() => {
    const map = new Map<string, string>();
    precios.filter((p) => p.lista_id === lista.id).forEach((p) => map.set(p.producto_id, p.precio));
    return map;
  }, [precios, lista.id]);

  const visibles = useMemo(() => {
    const disponibles = productos.filter((p) => p.disponible);
    if (!search.trim()) return disponibles;
    const q = search.trim().toLowerCase();
    return disponibles.filter((p) => p.nombre_es.toLowerCase().includes(q));
  }, [productos, search]);

  const conOverride = overridesPorProducto.size;

  const handleGuardarNombre = async () => {
    if (!nombre.trim() || nombre.trim() === lista.nombre) {
      setEditandoNombre(false);
      return;
    }
    await onRenombrar(lista.id, nombre.trim());
    setEditandoNombre(false);
  };

  const handleEliminar = async () => {
    if (!confirm(`¿Eliminar la tarifa "${lista.nombre}"? Solo es posible si no tiene ningún cliente profesional asignado.`)) return;
    const ok = await onEliminar(lista.id);
    if (!ok) {
      alert('No se pudo eliminar: hay clientes profesionales usando esta tarifa. Reasígnalos a otra tarifa primero.');
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-foreground-950/40 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full sm:max-w-[560px] max-h-[92vh] sm:max-h-[85vh] bg-background-50 rounded-t-2xl sm:rounded-lg border border-background-200/70 shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-background-200/70 flex-shrink-0">
          {!editandoNombre ? (
            <button type="button" onClick={() => setEditandoNombre(true)} className="text-base font-heading font-semibold text-foreground-950 hover:text-primary-700">
              {lista.nombre}
              <i className="ri-pencil-line text-xs ml-1.5 text-foreground-400"></i>
            </button>
          ) : (
            <input
              autoFocus
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onBlur={handleGuardarNombre}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="px-2 py-1 bg-background-100 border border-background-200/70 rounded-lg text-sm font-semibold"
            />
          )}
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-100 hover:text-foreground-950">
            <i className="ri-close-line"></i>
          </button>
        </div>

        <div className="px-5 pt-3 pb-2 flex-shrink-0">
          <p className="text-xs text-foreground-400 mb-3">
            {conOverride} producto{conOverride === 1 ? '' : 's'} con precio propio. Deja el campo vacío para usar el precio público normal.
          </p>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto…"
            className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {visibles.length === 0 ? (
            <p className="text-sm text-foreground-400 py-4">No hay productos que coincidan.</p>
          ) : (
            visibles.map((producto) => (
              <FilaProducto
                key={producto.id}
                producto={producto}
                override={overridesPorProducto.get(producto.id) ?? ''}
                onGuardar={(precio) => onGuardarPrecio(lista.id, producto.id, precio).then(() => {})}
              />
            ))
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-background-200/70 flex-shrink-0">
          <button type="button" onClick={handleEliminar} className="px-4 py-2.5 rounded-full text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100">
            Eliminar tarifa
          </button>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
