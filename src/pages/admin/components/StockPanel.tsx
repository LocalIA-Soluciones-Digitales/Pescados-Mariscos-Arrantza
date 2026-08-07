import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Producto } from '@/types/producto';

function StockRow({ producto, onPatch }: { producto: Producto; onPatch: (patch: Partial<Producto>) => void }) {
  const [stockKg, setStockKg] = useState(producto.stock_kg);
  const [stockMinimo, setStockMinimo] = useState(producto.stock_minimo);
  const [saving, setSaving] = useState(false);
  const stockBajo = producto.stock_kg <= producto.stock_minimo;

  const guardar = async (patch: { stock_kg?: number; stock_minimo?: number }) => {
    setSaving(true);
    const { error } = await supabase.from('productos').update(patch).eq('id', producto.id);
    setSaving(false);
    if (error) {
      alert('No se pudo guardar el stock: ' + error.message);
      return;
    }
    onPatch(patch);
  };

  return (
    <div className={`flex flex-wrap items-center gap-3 bg-background-50 border border-background-200/70 rounded-lg px-3 py-2.5 ${saving ? 'opacity-60' : ''}`}>
      <div className="w-10 h-10 rounded-md overflow-hidden bg-background-100 flex-shrink-0">
        {producto.imagen_url && <img src={producto.imagen_url} alt="" className="w-full h-full object-cover" />}
      </div>

      <div className="flex-1 min-w-[120px]">
        <p className="text-sm font-medium text-foreground-950 truncate">{producto.nombre_es}</p>
        <p className="text-xs text-foreground-400">{producto.precio}</p>
      </div>

      {stockBajo && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 flex-shrink-0">
          <i className="ri-alert-line"></i> Bajo mínimo
        </span>
      )}

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <label className="text-[11px] text-foreground-400">Stock</label>
        <input
          type="number"
          step="0.5"
          min="0"
          value={stockKg}
          onChange={(e) => setStockKg(e.target.valueAsNumber)}
          onBlur={() => {
            const v = Number.isFinite(stockKg) ? stockKg : 0;
            setStockKg(v);
            if (v !== producto.stock_kg) guardar({ stock_kg: v });
          }}
          disabled={saving}
          className="w-20 px-2 py-1.5 bg-background-100 border border-background-200/70 rounded-md text-sm text-right"
        />
        <span className="text-xs text-foreground-400">kg</span>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <label className="text-[11px] text-foreground-400">Aviso en</label>
        <input
          type="number"
          step="0.5"
          min="0"
          value={stockMinimo}
          onChange={(e) => setStockMinimo(e.target.valueAsNumber)}
          onBlur={() => {
            const v = Number.isFinite(stockMinimo) ? stockMinimo : 10;
            setStockMinimo(v);
            if (v !== producto.stock_minimo) guardar({ stock_minimo: v });
          }}
          disabled={saving}
          className="w-16 px-2 py-1.5 bg-background-100 border border-background-200/70 rounded-md text-sm text-right"
        />
        <span className="text-xs text-foreground-400">kg</span>
      </div>
    </div>
  );
}

export default function StockPanel({
  productos,
  loading,
  onPatch,
}: {
  productos: Producto[];
  loading: boolean;
  onPatch: (id: string, patch: Partial<Producto>) => void;
}) {
  const [search, setSearch] = useState('');
  const [soloBajo, setSoloBajo] = useState(false);

  const bajoCount = useMemo(() => productos.filter((p) => p.stock_kg <= p.stock_minimo).length, [productos]);

  const visibles = useMemo(() => {
    let result = productos;
    if (soloBajo) {
      result = result.filter((p) => p.stock_kg <= p.stock_minimo);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((p) => p.nombre_es.toLowerCase().includes(q) || p.nombre_eu?.toLowerCase().includes(q));
    }
    return [...result].sort((a, b) => a.orden - b.orden);
  }, [productos, soloBajo, search]);

  return (
    <div className="px-4 md:px-8 py-6 pb-28">
      <p className="text-xs text-foreground-400 mb-4">
        Actualiza aquí los kg que quedan de cada producto (el pescador, a diario). El stock se descuenta solo con cada
        pedido de un cliente; si baja del mínimo, se avisa por correo automáticamente. Los cambios se guardan al salir del campo.
      </p>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center mb-4">
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
        <button
          type="button"
          onClick={() => setSoloBajo((v) => !v)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors flex items-center gap-1 w-fit ${
            soloBajo ? 'bg-red-500 text-background-50' : 'bg-background-50 text-foreground-500 hover:bg-background-200/70'
          }`}
        >
          Stock bajo
          {bajoCount > 0 && (
            <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] ${soloBajo ? 'bg-background-50/25' : 'bg-red-100 text-red-600'}`}>
              {bajoCount}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-foreground-400">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-foreground-400">No hay productos que coincidan con el filtro.</p>
      ) : (
        <div className="space-y-2">
          {visibles.map((producto) => (
            <StockRow key={producto.id} producto={producto} onPatch={(patch) => onPatch(producto.id, patch)} />
          ))}
        </div>
      )}
    </div>
  );
}
