import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CATEGORIA_FILTROS, type CategoriaFiltro, type Producto, type ProductoCategoria } from '@/types/producto';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';
import { useProductosCodigosBascula } from '@/hooks/useProductosCodigosBascula';
import { ORIGENES, ORIGEN_LABELS, type Origen } from '@/types/origen';
import SearchInput from '@/components/base/SearchInput';
import CategoryFilterDropdown from '@/components/base/CategoryFilterDropdown';
import ProductImagePlaceholder from '@/components/base/ProductImagePlaceholder';
import StockHistorial from './StockHistorial';

const CATEGORIA_LABELS: Record<ProductoCategoria, string> = {
  pescado: 'Pescado',
  especial: 'Pescado de carta',
  raciones: 'Raciones',
  marisco: 'Marisco',
  congelados: 'Congelado',
  preparados: 'Varios',
};

const CATEGORIA_ORDEN: ProductoCategoria[] = ['pescado', 'especial', 'marisco', 'congelados', 'preparados', 'raciones'];

// Códigos de hostelería por cliente: en la báscula cada familia usa su
// centena (7xx Orotela, 8xx Artebakarra, 9xx Bares/Restaurantes).
const TARIFAS_HOSTELERIA = [
  { familia: '7', etiqueta: 'Orotela' },
  { familia: '8', etiqueta: 'Artebakarra' },
  { familia: '9', etiqueta: 'Hostelería' },
];

const formatoKg =(kg: number) => kg.toLocaleString('es-ES', { maximumFractionDigits: 3 });

function CodigoChip({ etiqueta, valor, title }: { etiqueta: string; valor: string | undefined; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-lg border border-background-200/80 bg-background-50 px-2 py-1 text-[11px] leading-none"
    >
      <span className="text-foreground-400">{etiqueta}</span>
      <span className={`font-semibold tabular-nums ${valor ? 'text-foreground-800' : 'text-foreground-300'}`}>{valor || '—'}</span>
    </span>
  );
}

function StockRow({
  producto,
  onPatch,
  codigosBascula,
  codigosHosteleria,
}: {
  producto: Producto;
  onPatch: (patch: Partial<Producto>) => void;
  codigosBascula: Partial<Record<Origen, string>>;
  codigosHosteleria: string[];
}) {
  const [entrada, setEntrada] = useState('');
  const [movimiento, setMovimiento] = useState<'entrada' | 'baja'>('entrada');
  const [stockMinimo, setStockMinimo] = useState(producto.stock_minimo);
  const [saving, setSaving] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  // Cambia cada vez que se guarda un movimiento, para que el historial abierto se recargue.
  const [versionHistorial, setVersionHistorial] = useState(0);
  const stockBajo = producto.gestion_stock && producto.stock_kg <= producto.stock_minimo;
  const cantidad = Number(entrada.replace(',', '.'));
  const cantidadValida = Number.isFinite(cantidad) && cantidad > 0;
  const esEntrada = movimiento === 'entrada';

  const guardarMovimiento = async () => {
    if (!cantidadValida || saving) return;
    const kg = esEntrada ? cantidad : -cantidad;
    setSaving(true);
    const { data, error } = await supabase.rpc('sumar_stock', { p_producto_id: producto.id, p_kg: kg });
    setSaving(false);
    if (error) {
      alert('No se pudo guardar el movimiento: ' + error.message);
      return;
    }
    setEntrada('');
    setMovimiento('entrada');
    setVersionHistorial((v) => v + 1);
    const nuevoStock = data as number;
    // Refleja aquí lo que hace el trigger marcar_agotado_por_stock en la base
    // de datos: solo una entrada real puede quitar el agotado; una bajada a 0
    // (venta, báscula, merma) siempre lo pone.
    const nuevoDisponible = producto.gestion_stock
      ? nuevoStock <= 0
        ? false
        : esEntrada
          ? true
          : producto.disponible
      : producto.disponible;
    onPatch({ stock_kg: nuevoStock, disponible: nuevoDisponible });
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

  const toggleGestionStock = async () => {
    const gestion_stock = !producto.gestion_stock;
    setSaving(true);
    const { error } = await supabase.from('productos').update({ gestion_stock }).eq('id', producto.id);
    setSaving(false);
    if (error) {
      alert('No se pudo actualizar la gestión de stock: ' + error.message);
      return;
    }
    onPatch({ gestion_stock });
  };

  const apagado = !producto.gestion_stock ? 'opacity-50' : '';

  const interruptor = (
    <button
      type="button"
      role="switch"
      aria-checked={producto.gestion_stock}
      aria-label="Controlar stock"
      onClick={toggleGestionStock}
      disabled={saving}
      className={`relative inline-flex flex-shrink-0 items-center w-10 h-6 rounded-full border transition-colors duration-200 ${
        producto.gestion_stock ? 'bg-primary-500 border-primary-500' : 'bg-background-200 border-background-300'
      }`}
    >
      <span
        className={`inline-block w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
          producto.gestion_stock ? 'translate-x-[19px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
  const tituloInterruptor = producto.gestion_stock
    ? 'Dejar de gestionar el stock de este producto (no avisará de mínimos)'
    : 'Volver a gestionar el stock de este producto';

  // Móvil: tarjeta apilada (cabecera, stock + movimiento, pie con códigos).
  // Ordenador (lg): todo en una fila compacta; los bloques intermedios usan
  // lg:contents para que sus hijos pasen a ser columnas de esa fila.
  return (
    <article
      className={`relative overflow-hidden rounded-2xl lg:rounded-xl border bg-background-50 shadow-card transition-shadow duration-200 hover:shadow-card-hover ${
        stockBajo ? 'border-red-200' : 'border-background-200/70'
      } ${saving ? 'opacity-70' : ''}`}
    >
      {stockBajo && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-red-400" />}

      <div className="lg:flex lg:items-center lg:gap-4 lg:px-4 lg:py-2">
      <div className="p-3.5 sm:p-4 lg:contents">
        {/* Cabecera: foto, nombre completo (sin recortar) y, debajo, precio +
            estados — en el móvil no caben en la misma línea que el interruptor. */}
        <div className="flex items-start gap-3 lg:w-56 lg:flex-shrink-0 lg:items-center">
          <div className={`w-12 h-12 lg:w-10 lg:h-10 rounded-xl lg:rounded-lg overflow-hidden bg-background-100 flex-shrink-0 ${apagado}`}>
            {producto.imagen_url ? (
              <img src={producto.imagen_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <ProductImagePlaceholder className="[&>i]:text-sm [&>span]:hidden" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className={`text-[15px] lg:text-sm font-semibold leading-snug text-foreground-950 break-words ${apagado}`}>{producto.nombre_es}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
              <span className={`text-xs text-foreground-400 whitespace-nowrap ${apagado}`}>{producto.precio}</span>
              {!producto.disponible && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-medium bg-foreground-800 text-background-50 whitespace-nowrap"
                  title="Sin stock: se marcó agotado automáticamente. Registra una entrada para volver a ponerlo disponible."
                >
                  <i className="ri-close-circle-line"></i> Agotado
                </span>
              )}
              {stockBajo && (
                <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-medium bg-red-100 text-red-700 whitespace-nowrap">
                  <i className="ri-alert-line"></i> Bajo mínimo
                </span>
              )}
              {!producto.gestion_stock && (
                <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-background-200 text-foreground-500 whitespace-nowrap">
                  Sin control de stock
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5 lg:hidden" title={tituloInterruptor}>
            {interruptor}
            <span className="text-[10px] text-foreground-400">Control</span>
          </div>
        </div>

        {/* Stock + movimiento: apilados en el móvil, en fila desde sm. */}
        <div className={`mt-3.5 flex flex-col gap-3 sm:flex-row sm:items-stretch lg:mt-0 lg:items-center lg:flex-shrink-0 ${apagado}`}>
          <div
            className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 sm:w-56 sm:flex-col sm:items-start sm:justify-center lg:w-auto lg:flex-row lg:items-center lg:gap-4 lg:rounded-lg lg:px-3 lg:py-1.5 ${
              stockBajo ? 'bg-red-50' : 'bg-background-100/80'
            }`}
          >
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground-400 lg:hidden">Stock</p>
              <p
                className={`w-auto lg:w-24 text-2xl lg:text-base font-semibold tabular-nums leading-tight ${stockBajo ? 'text-red-700' : 'text-foreground-950'}`}
              >
                {formatoKg(producto.stock_kg)}
                <span className="ml-1 text-sm lg:text-xs font-medium text-foreground-400">kg</span>
              </p>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-foreground-400 whitespace-nowrap">
              Aviso bajo
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                value={Number.isFinite(stockMinimo) ? stockMinimo : ''}
                onChange={(e) => setStockMinimo(e.target.valueAsNumber)}
                onBlur={() => {
                  const v = Number.isFinite(stockMinimo) ? stockMinimo : 10;
                  setStockMinimo(v);
                  if (v !== producto.stock_minimo) guardarMinimo(v);
                }}
                disabled={saving}
                className="w-14 px-1.5 py-1 bg-background-50 border border-background-200/80 rounded-md text-xs text-right text-foreground-800 tabular-nums"
              />
              kg
            </label>
          </div>

          <div className="flex-1 rounded-xl border border-background-200/70 p-2.5 lg:flex lg:flex-none lg:items-center lg:gap-2 lg:border-0 lg:p-0">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-background-100 p-1 lg:flex-shrink-0 lg:p-0.5">
              {(['entrada', 'baja'] as const).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setMovimiento(tipo)}
                  disabled={saving}
                  aria-pressed={movimiento === tipo}
                  className={`flex items-center justify-center gap-1 rounded-md py-1.5 lg:py-1 lg:px-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                    movimiento === tipo
                      ? tipo === 'entrada'
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'bg-red-500 text-white shadow-sm'
                      : 'text-foreground-500 hover:text-foreground-800'
                  }`}
                >
                  <i className={tipo === 'entrada' ? 'ri-add-line' : 'ri-subtract-line'}></i>
                  {tipo === 'entrada' ? 'Entrada' : 'Baja / merma'}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 lg:mt-0">
              <div
                className={`flex flex-1 items-center rounded-lg border px-3 lg:w-24 lg:flex-none lg:px-2 ${
                  esEntrada ? 'border-background-200/80 bg-background-50' : 'border-red-200 bg-red-50'
                }`}
              >
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={entrada}
                  onChange={(e) => setEntrada(e.target.value.replace(/[^0-9.,]/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') guardarMovimiento();
                  }}
                  disabled={saving}
                  aria-label={esEntrada ? 'Kilos que entran' : 'Kilos que se dan de baja'}
                  className={`w-full min-w-0 bg-transparent py-2 lg:py-1 text-base lg:text-sm text-right tabular-nums focus:outline-none ${
                    esEntrada ? 'text-foreground-950' : 'text-red-700'
                  }`}
                />
                <span className="pl-1.5 text-sm lg:text-xs text-foreground-400">kg</span>
              </div>
              <button
                type="button"
                onClick={guardarMovimiento}
                disabled={!cantidadValida || saving}
                className={`h-10 lg:h-8 flex-shrink-0 rounded-lg px-4 lg:px-3 text-sm lg:text-xs font-semibold text-white transition-colors disabled:bg-background-200 disabled:text-foreground-400 ${
                  esEntrada ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {saving ? 'Guardando…' : esEntrada ? 'Sumar' : 'Restar'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Pie: códigos de báscula (solo lectura) + historial. */}
      <div className="flex flex-col gap-2 border-t border-background-200/70 bg-background-100/50 px-3.5 py-2.5 sm:flex-row sm:items-center sm:px-4 lg:contents">
        <div className="flex flex-1 flex-wrap items-center gap-1.5 lg:min-w-0 lg:justify-end">
          {ORIGENES.map((origen) => (
            <CodigoChip key={origen} etiqueta={ORIGEN_LABELS[origen].replace('Pescadería', 'Báscula')} valor={codigosBascula[origen]} />
          ))}
          {TARIFAS_HOSTELERIA.map(({ familia, etiqueta }) => {
            const codigos = codigosHosteleria.filter((c) => c.startsWith(familia));
            return codigos.length > 0 ? (
              <CodigoChip
                key={familia}
                etiqueta={etiqueta}
                valor={codigos.join(' · ')}
                title={`Ventas de ${etiqueta} (familia ${familia}) que también descuentan el stock de este producto`}
              />
            ) : null;
          })}
        </div>
        <button
          type="button"
          onClick={() => setVerHistorial((v) => !v)}
          aria-expanded={verHistorial}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 lg:py-1.5 text-xs font-semibold whitespace-nowrap transition-colors sm:w-auto lg:flex-shrink-0 ${
            verHistorial
              ? 'bg-foreground-900 text-background-50'
              : 'border border-background-200/80 bg-background-50 text-foreground-700 hover:bg-background-100'
          }`}
        >
          <i className="ri-history-line text-sm"></i>
          <span className="lg:hidden">{verHistorial ? 'Ocultar historial' : 'Ver historial'}</span>
          <span className="hidden lg:inline">Historial</span>
          <i className={`ri-arrow-down-s-line transition-transform ${verHistorial ? 'rotate-180' : ''}`}></i>
        </button>
      </div>

      <div className="hidden lg:flex flex-shrink-0" title={tituloInterruptor}>
        {interruptor}
      </div>
      </div>

      {verHistorial && <StockHistorial key={versionHistorial} productoId={producto.id} />}
    </article>
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
  const [categoria, setCategoria] = useState<CategoriaFiltro>('todos');
  const [colapsados, setColapsados] = useState<Set<ProductoCategoria>>(new Set(CATEGORIA_ORDEN));

  const toggleColapsado = (cat: ProductoCategoria) => {
    setColapsados((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };
  const filtrosScroll = useHorizontalWheelScroll<HTMLDivElement>();
  const { codigos: codigosBascula, codigosStock, loading: loadingCodigos } = useProductosCodigosBascula();
  const cargando = loading || loadingCodigos;

  const bajoCount = useMemo(() => productos.filter((p) => p.gestion_stock && p.stock_kg <= p.stock_minimo).length, [productos]);

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

  const grupos = useMemo(() => {
    let result = productos;
    if (categoria !== 'todos') {
      const filtro = CATEGORIA_FILTROS.find((c) => c.value === categoria);
      result = result.filter((p) =>
        filtro?.tipo === 'subcategoria' ? p.subcategoria === categoria : p.categoria === categoria,
      );
    }
    if (soloBajo) {
      result = result.filter((p) => p.gestion_stock && p.stock_kg <= p.stock_minimo);
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

    // Mismo orden que la báscula: por código de Pescadería I (familias 1-5 =
    // categorías de la web). Los que aún no tienen código van al final.
    const codigoOrden = (p: Producto) => {
      const codigos = codigosBascula.get(p.id);
      const n = Number(codigos?.pescaderia_1 ?? codigos?.pescaderia_2);
      return Number.isFinite(n) && n > 0 ? n : Infinity;
    };

    return CATEGORIA_ORDEN.map((categoria) => ({
      categoria,
      productos: (porCategoria.get(categoria) ?? []).sort(
        (a, b) => codigoOrden(a) - codigoOrden(b) || a.nombre_es.localeCompare(b.nombre_es, 'es'),
      ),
    })).filter((g) => g.productos.length > 0);
  }, [productos, categoria, soloBajo, search, codigosBascula]);

  const totalVisible = useMemo(() => grupos.reduce((n, g) => n + g.productos.length, 0), [grupos]);

  const nombresSugeridos = useMemo(
    () => Array.from(new Set(productos.flatMap((p) => [p.nombre_es, p.nombre_eu].filter((n): n is string => !!n)))),
    [productos],
  );

  return (
    <>
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
        <CategoryFilterDropdown categorias={CATEGORIA_FILTROS} counts={categoriaCounts} value={categoria} onChange={setCategoria} />

        <div ref={filtrosScroll.ref} onWheel={filtrosScroll.onWheel} className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          <button
            type="button"
            onClick={() => setSoloBajo((v) => !v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors flex items-center gap-1 ${
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
      </div>

      <div className="px-4 md:px-8 py-6 pb-28">
      {cargando ? (
        <p className="text-sm text-foreground-400">Cargando…</p>
      ) : totalVisible === 0 ? (
        <p className="text-sm text-foreground-400">No hay productos que coincidan con el filtro.</p>
      ) : (
        <div className="space-y-6">
          {grupos.map((grupo) => {
            const colapsado = colapsados.has(grupo.categoria);
            return (
              <div key={grupo.categoria}>
                <button
                  type="button"
                  onClick={() => toggleColapsado(grupo.categoria)}
                  className="w-full flex items-center gap-2 mb-2 group"
                >
                  <i
                    className={`ri-arrow-down-s-line text-sm text-foreground-400 transition-transform ${colapsado ? '-rotate-90' : ''}`}
                  ></i>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-500 group-hover:text-foreground-700">
                    {CATEGORIA_LABELS[grupo.categoria]}
                  </h3>
                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] bg-background-200/60 text-foreground-400">
                    {grupo.productos.length}
                  </span>
                  <div className="flex-1 h-px bg-background-200/70" />
                </button>
                {!colapsado && (
                  <div className="space-y-3">
                    {grupo.productos.map((producto) => (
                      <StockRow
                        key={producto.id}
                        producto={producto}
                        onPatch={(patch) => onPatch(producto.id, patch)}
                        codigosBascula={codigosBascula.get(producto.id) ?? {}}
                        codigosHosteleria={codigosStock.get(producto.id) ?? []}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </>
  );
}
