import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Producto, ProductoCategoria } from '@/types/producto';

const CATEGORIA_LABELS: Record<ProductoCategoria, string> = {
  pescado: 'Pescado',
  especial: 'Especial',
  raciones: 'Raciones',
  marisco: 'Marisco',
};

const CATEGORIA_ORDEN: ProductoCategoria[] = ['pescado', 'especial', 'raciones', 'marisco'];

function StockRow({ producto, onPatch }: { producto: Producto; onPatch: (patch: Partial<Producto>) => void }) {
  const [entrada, setEntrada] = useState('');
  const [stockMinimo, setStockMinimo] = useState(producto.stock_minimo);
  const [saving, setSaving] = useState(false);
  const stockBajo = producto.stock_kg <= producto.stock_minimo;

  const sumarEntrada = async () => {
    const kg = Number(entrada);
    if (!Number.isFinite(kg) || kg <= 0) {
      setEntrada('');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc('sumar_stock', { p_producto_id: producto.id, p_kg: kg });
    setSaving(false);
    if (error) {
      alert('No se pudo sumar el stock: ' + error.message);
      return;
    }
    setEntrada('');
    onPatch({ stock_kg: data as number });
  };

  const guardarMinimo = async (v: number) => {
    setSaving(true);
    const { error } = await supabase.from('productos').update({ stock_minimo: v }).eq('id', producto.id);
    setSaving(false);
    if (error) {
      alert('No se pudo guardar el mínimo: ' + error.message);
      return;
    }
    onPatch({ stock_minimo: v });
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
        stockBajo ? 'bg-red-50/60 border-red-200 border-l-4 border-l-red-400' : 'bg-background-50 border-background-200/70'
      } ${saving ? 'opacity-60' : ''}`}
    >
      <div className="w-10 h-10 rounded-md overflow-hidden bg-background-100 flex-shrink-0">
        {producto.imagen_url && <img src={producto.imagen_url} alt="" className="w-full h-full object-cover" />}
      </div>

      <div className="flex-1 min-w-[120px]">
        <p className="text-sm font-medium text-foreground-950 truncate">{producto.nombre_es}</p>
        <p className="text-xs text-foreground-400">{producto.precio}</p>
      </div>

      {stockBajo && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-700 flex-shrink-0">
          <i className="ri-alert-line"></i> Bajo mínimo
        </span>
      )}

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <label className="text-[11px] text-foreground-400">Quedan</label>
        <span className={`w-16 text-right text-sm font-medium ${stockBajo ? 'text-red-700' : 'text-foreground-950'}`}>
          {producto.stock_kg} kg
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <label className="text-[11px] text-foreground-400">Entra hoy</label>
        <input
          type="number"
          step="0.5"
          min="0"
          placeholder="0"
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          onBlur={sumarEntrada}
          disabled={saving}
          className="w-16 px-2 py-1.5 bg-background-100 border border-background-200/70 rounded-md text-sm text-right"
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
            if (v !== producto.stock_minimo) guardarMinimo(v);
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

  const grupos = useMemo(() => {
    let result = productos;
    if (soloBajo) {
      result = result.filter((p) => p.stock_kg <= p.stock_minimo);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((p) => p.nombre_es.toLowerCase().includes(q) || p.nombre_eu?.toLowerCase().includes(q));
    }

    const porCategoria = new Map<ProductoCategoria, Producto[]>();
    result.forEach((p) => {
      const grupo = porCategoria.get(p.categoria) ?? [];
      grupo.push(p);
      porCategoria.set(p.categoria, grupo);
    });

    return CATEGORIA_ORDEN.map((categoria) => ({
      categoria,
      productos: (porCategoria.get(categoria) ?? []).sort((a, b) => a.nombre_es.localeCompare(b.nombre_es, 'es')),
    })).filter((g) => g.productos.length > 0);
  }, [productos, soloBajo, search]);

  const totalVisible = useMemo(() => grupos.reduce((n, g) => n + g.productos.length, 0), [grupos]);

  return (
    <div className="px-4 md:px-8 py-6 pb-28">
      <p className="text-xs text-foreground-400 mb-4">
        Cada mañana, introduce en "Entra hoy" solo los kg que te llegan del mar — se suman solos a lo que queda, sin
        que tengas que hacer cuentas. El stock se descuenta solo con cada pedido de un cliente; si baja del mínimo, se
        avisa por correo automáticamente.
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
      ) : totalVisible === 0 ? (
        <p className="text-sm text-foreground-400">No hay productos que coincidan con el filtro.</p>
      ) : (
        <div className="space-y-6">
          {grupos.map((grupo) => (
            <div key={grupo.categoria}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-500">
                  {CATEGORIA_LABELS[grupo.categoria]}
                </h3>
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] bg-background-200/60 text-foreground-400">
                  {grupo.productos.length}
                </span>
                <div className="flex-1 h-px bg-background-200/70" />
              </div>
              <div className="space-y-2">
                {grupo.productos.map((producto) => (
                  <StockRow key={producto.id} producto={producto} onPatch={(patch) => onPatch(producto.id, patch)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
