import { useMemo, useState } from 'react';
import type { HosteleriaArticulo, HosteleriaListaPrecio } from '@/types/hosteleria';

type ArticuloCambios = Partial<Pick<HosteleriaArticulo, 'nombre' | 'precio' | 'unidad' | 'activo'>>;

function parsePrecio(valor: string): number | null {
  const n = Number(valor.replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && valor.trim() !== '' ? Math.round(n * 100) / 100 : null;
}

function formatPrecio(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

function FilaArticulo({
  articulo,
  onGuardar,
  onEliminar,
}: {
  articulo: HosteleriaArticulo;
  onGuardar: (cambios: ArticuloCambios) => Promise<boolean>;
  onEliminar: () => Promise<boolean>;
}) {
  const [precio, setPrecio] = useState(formatPrecio(articulo.precio));
  const [saving, setSaving] = useState(false);

  const guardarPrecio = async () => {
    const n = parsePrecio(precio);
    if (n === null || n === articulo.precio) {
      setPrecio(formatPrecio(articulo.precio));
      return;
    }
    setSaving(true);
    await onGuardar({ precio: n });
    setSaving(false);
  };

  return (
    <div className={`flex items-center gap-2.5 py-2 border-b border-background-200/50 last:border-b-0 ${articulo.activo ? '' : 'opacity-50'}`}>
      <span className="w-9 text-[11px] font-mono text-foreground-400 flex-shrink-0">{articulo.codigo_bascula ?? '—'}</span>
      <p className="flex-1 min-w-0 text-sm text-foreground-800 truncate">{articulo.nombre}</p>
      <div className="flex items-center gap-1 flex-shrink-0">
        <input
          type="text"
          inputMode="decimal"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          onBlur={guardarPrecio}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          disabled={saving}
          aria-label={`Precio de ${articulo.nombre}`}
          className="w-20 px-2 py-1.5 bg-background-100 border border-background-200/70 rounded-lg text-sm text-right tabular-nums focus:outline-none focus:border-foreground-300/60"
        />
        <button
          type="button"
          onClick={() => onGuardar({ unidad: articulo.unidad === 'kg' ? 'un' : 'kg' })}
          title="Cambiar unidad"
          className="w-10 py-1.5 rounded-lg text-xs text-foreground-500 bg-background-100 hover:bg-background-200/70"
        >
          €/{articulo.unidad === 'un' ? 'ud' : 'kg'}
        </button>
      </div>
      <button
        type="button"
        onClick={() => onGuardar({ activo: !articulo.activo })}
        title={articulo.activo ? 'Ocultar al cliente' : 'Mostrar al cliente'}
        className="w-8 h-8 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-100 hover:text-foreground-900 flex-shrink-0"
      >
        <i className={articulo.activo ? 'ri-eye-line' : 'ri-eye-off-line'}></i>
      </button>
      <button
        type="button"
        onClick={() => {
          if (confirm(`¿Quitar "${articulo.nombre}" de esta tarifa?`)) void onEliminar();
        }}
        title="Quitar de la tarifa"
        className="w-8 h-8 flex items-center justify-center rounded-full text-foreground-400 hover:bg-red-50 hover:text-red-600 flex-shrink-0"
      >
        <i className="ri-delete-bin-line"></i>
      </button>
    </div>
  );
}

export default function ListaPrecioModal({
  lista,
  articulos,
  onClose,
  onActualizarArticulo,
  onCrearArticulo,
  onEliminarArticulo,
  onRenombrar,
  onEliminar,
}: {
  lista: HosteleriaListaPrecio;
  articulos: HosteleriaArticulo[];
  onClose: () => void;
  onActualizarArticulo: (id: string, cambios: ArticuloCambios) => Promise<boolean>;
  onCrearArticulo: (listaId: string, nombre: string, precio: number, unidad: 'kg' | 'un') => Promise<boolean>;
  onEliminarArticulo: (id: string) => Promise<boolean>;
  onRenombrar: (id: string, nombre: string) => Promise<boolean>;
  onEliminar: (id: string) => Promise<boolean>;
}) {
  const [search, setSearch] = useState('');
  const [nombre, setNombre] = useState(lista.nombre);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoPrecio, setNuevoPrecio] = useState('');

  const deLista = useMemo(() => articulos.filter((a) => a.lista_id === lista.id), [articulos, lista.id]);
  const visibles = useMemo(() => {
    if (!search.trim()) return deLista;
    const q = search.trim().toLowerCase();
    return deLista.filter((a) => a.nombre.toLowerCase().includes(q) || (a.codigo_bascula ?? '').includes(q));
  }, [deLista, search]);
  const activos = deLista.filter((a) => a.activo).length;

  const handleGuardarNombre = async () => {
    if (!nombre.trim() || nombre.trim() === lista.nombre) {
      setEditandoNombre(false);
      return;
    }
    await onRenombrar(lista.id, nombre.trim());
    setEditandoNombre(false);
  };

  const handleEliminar = async () => {
    if (!confirm(`¿Eliminar la tarifa "${lista.nombre}"? Solo es posible si no tiene ningún cliente de hostelería asignado.`)) return;
    const ok = await onEliminar(lista.id);
    if (!ok) {
      alert('No se pudo eliminar: hay clientes de hostelería usando esta tarifa. Reasígnalos a otra tarifa primero.');
      return;
    }
    onClose();
  };

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    const precio = parsePrecio(nuevoPrecio);
    if (!nuevoNombre.trim() || precio === null) return;
    const ok = await onCrearArticulo(lista.id, nuevoNombre, precio, 'kg');
    if (ok) {
      setNuevoNombre('');
      setNuevoPrecio('');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-foreground-950/40 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full sm:max-w-[620px] max-h-[92vh] sm:max-h-[85vh] bg-background-50 rounded-t-2xl sm:rounded-lg border border-background-200/70 shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-background-200/70 flex-shrink-0">
          <div className="min-w-0">
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
            {lista.bascula_familia && (
              <p className="text-[11px] text-foreground-400 mt-0.5">
                <i className="ri-scales-3-line mr-1"></i>
                Familia {lista.bascula_familia} de la báscula ({lista.bascula_origen === 'pescaderia_2' ? 'Pescadería II' : 'Pescadería I'})
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-100 hover:text-foreground-950">
            <i className="ri-close-line"></i>
          </button>
        </div>

        <div className="px-5 pt-3 pb-2 flex-shrink-0">
          <p className="text-xs text-foreground-400 mb-3">
            {activos} de {deLista.length} artículo{deLista.length === 1 ? '' : 's'} visibles para los clientes con esta tarifa. Solo ven estos productos y estos precios — nunca el catálogo ni los precios de la pescadería.
          </p>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o código…"
            className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {visibles.length === 0 ? (
            <p className="text-sm text-foreground-400 py-4">
              {deLista.length === 0 ? 'Esta tarifa todavía no tiene artículos.' : 'No hay artículos que coincidan.'}
            </p>
          ) : (
            visibles.map((articulo) => (
              <FilaArticulo
                key={articulo.id}
                articulo={articulo}
                onGuardar={(cambios) => onActualizarArticulo(articulo.id, cambios)}
                onEliminar={() => onEliminarArticulo(articulo.id)}
              />
            ))
          )}
        </div>

        <form onSubmit={handleCrear} className="flex items-center gap-2 px-5 py-3 border-t border-background-200/70 flex-shrink-0">
          <input
            type="text"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Añadir artículo…"
            className="flex-1 min-w-0 px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
          />
          <input
            type="text"
            inputMode="decimal"
            value={nuevoPrecio}
            onChange={(e) => setNuevoPrecio(e.target.value)}
            placeholder="€/kg"
            className="w-20 px-2 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm text-right focus:outline-none focus:border-foreground-300/60"
          />
          <button
            type="submit"
            disabled={!nuevoNombre.trim() || parsePrecio(nuevoPrecio) === null}
            className="px-3 py-2 rounded-full text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-50"
          >
            Añadir
          </button>
        </form>

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
