import { useMemo, useState } from 'react';
import { usePrevisionGenero, useVentasPorHora, type PrevisionProducto } from '@/hooks/usePrevisiones';
import type { Producto } from '@/types/producto';
import InfoHint from '@/components/base/InfoHint';

// Previsiones de la pestaña Hoy, calculadas con el historial de las
// básculas comparando siempre con el mismo día de la semana (un sábado con
// los sábados anteriores): el ritmo de ventas de hoy en directo y lo que se
// suele vender de cada producto, cruzado con el stock cuando el producto
// está enlazado a su código de báscula.

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function isoLocal(d: Date): string {
  return d.toLocaleDateString('sv-SE');
}

function diaSemana(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return DIAS[new Date(y, m - 1, d).getDay()];
}

function plural(dia: string): string {
  return dia.endsWith('s') ? dia : `${dia}s`;
}

function formatEUR(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function formatCant(n: number, unidad: string): string {
  const esKg = unidad.toLowerCase().startsWith('kg');
  const v = esKg ? n.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : Math.round(n).toLocaleString('es-ES');
  return `${v} ${esKg ? 'kg' : 'ud'}`;
}

function nombreBonito(designacion: string): string {
  const t = designacion.trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------------------------------------------------------------------------
// Ritmo de hoy
// ---------------------------------------------------------------------------

export function RitmoDelDia() {
  const hoy = isoLocal(new Date());
  const { horas, loading } = useVentasPorHora(hoy);
  const dia = diaSemana(hoy);

  const r = useMemo(() => {
    if (!horas.length) return null;
    const ahora = new Date();
    const h = ahora.getHours();
    const frac = ahora.getMinutes() / 60;
    const diasRef = horas[0].dias_referencia;
    const conRef = horas.filter((x) => x.importe_referencia > 0);
    const conHoy = horas.filter((x) => x.importe_hoy > 0);
    const acumHoy = horas.reduce((n, x) => n + x.importe_hoy, 0);
    const refTotal = horas.reduce((n, x) => n + x.importe_referencia, 0);
    const refHastaAhora = horas.reduce((n, x) => n + (x.hora < h ? x.importe_referencia : x.hora === h ? x.importe_referencia * frac : 0), 0);
    const primera = Math.min(...[...conRef, ...conHoy].map((x) => x.hora), 24);
    const ultima = Math.max(...[...conRef, ...conHoy].map((x) => x.hora), 0);
    const cerrado = h > ultima;
    const antesDeAbrir = acumHoy === 0 && h <= primera;
    const base = cerrado ? refTotal : refHastaAhora;
    const ritmo = base > 30 ? (acumHoy - base) / base : null;
    // Previsión de cierre: si ya ha pasado una parte razonable del día, se
    // escala lo que falta de un día normal por el ritmo que se lleva (con
    // límites para que una primera hora rara no dispare la cifra).
    const factor = refHastaAhora > refTotal * 0.15 ? Math.min(1.6, Math.max(0.5, acumHoy / refHastaAhora)) : 1;
    const prevision = cerrado ? acumHoy : acumHoy + Math.max(0, refTotal - refHastaAhora) * factor;
    return { diasRef, acumHoy, refTotal, refHastaAhora, primera, ultima, cerrado, antesDeAbrir, ritmo, prevision, h, frac };
  }, [horas]);

  if (loading) return null;
  if (!r || r.diasRef === 0 || r.refTotal === 0) {
    return (
      <div className="bg-background-50 border border-background-200/70 rounded-2xl shadow-card px-4 py-3.5 text-sm text-foreground-500 flex items-center gap-2">
        <i className="ri-pulse-line text-foreground-300"></i>
        Hoy es {dia}: no hay {plural(dia)} anteriores con ventas (normalmente cerrado), así que no hay ritmo que comparar.
      </div>
    );
  }

  const bueno = (r.ritmo ?? 0) >= 0;
  const pct = r.ritmo !== null ? Math.round(Math.abs(r.ritmo) * 100) : null;
  const normal = pct !== null && pct < 5;

  // Curvas acumuladas (hoy vs un día normal) entre la primera y la última hora con ventas.
  const desde = r.primera;
  const hasta = r.ultima + 1;
  const puntosRef: [number, number][] = [];
  const puntosHoy: [number, number][] = [];
  let aRef = 0;
  let aHoy = 0;
  puntosRef.push([desde, 0]);
  puntosHoy.push([desde, 0]);
  horas
    .filter((x) => x.hora >= desde && x.hora < hasta)
    .forEach((x) => {
      aRef += x.importe_referencia;
      puntosRef.push([x.hora + 1, aRef]);
      if (x.hora < r.h) {
        aHoy += x.importe_hoy;
        puntosHoy.push([x.hora + 1, aHoy]);
      } else if (x.hora === r.h) {
        aHoy += x.importe_hoy;
        puntosHoy.push([x.hora + Math.max(r.frac, 0.05), aHoy]);
      }
    });
  const maxY = Math.max(aRef, aHoy, 1) * 1.08;
  const X = (hora: number) => ((hora - desde) / Math.max(1, hasta - desde)) * 100;
  const Y = (v: number) => 40 - (v / maxY) * 40;
  const trazo = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(2)},${Y(y).toFixed(2)}`).join(' ');
  const areaHoy = puntosHoy.length > 1 ? `${trazo(puntosHoy)} L${X(puntosHoy[puntosHoy.length - 1][0]).toFixed(2)},40 L${X(desde)},40 Z` : '';
  const etiquetasHoras = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i).filter((_, i, arr) => arr.length <= 8 || i % 2 === 0);

  const titulo = r.antesDeAbrir
    ? `Hoy es ${dia}: un ${dia} normal se facturan ${formatEUR(r.refTotal)}`
    : r.cerrado
      ? normal
        ? `Día cerrado en la media de un ${dia} normal`
        : `Día cerrado un ${pct} % ${bueno ? 'por encima' : 'por debajo'} de un ${dia} normal`
      : normal
        ? `Vas al ritmo de un ${dia} normal`
        : `Vas un ${pct} % ${bueno ? 'por encima' : 'por debajo'} de un ${dia} normal a estas horas`;

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-2xl shadow-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-foreground-400 mb-1">
            {!r.cerrado && !r.antesDeAbrir && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>}
            Ritmo de hoy · en directo
          </p>
          <p className="text-base font-heading font-semibold text-foreground-950 leading-snug">
            {!r.antesDeAbrir && !normal && pct !== null && (
              <i className={`mr-1.5 ${bueno ? 'ri-arrow-right-up-line text-emerald-600' : 'ri-arrow-right-down-line text-red-500'}`}></i>
            )}
            {titulo}
          </p>
        </div>
        <InfoHint
          title="Ritmo de hoy"
          size="sm"
          items={[
            {
              icon: 'ri-pulse-line',
              text: `Compara lo vendido hoy hasta ahora con lo que se vendía a la misma hora de media en los últimos ${r.diasRef} ${plural(dia)}, sumando las dos básculas.`,
            },
            { icon: 'ri-sparkling-line', text: 'La previsión de cierre suma lo que falta de un día normal, ajustado al ritmo que llevas hoy.' },
          ]}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="rounded-xl bg-background-100/60 px-3 py-2">
          <p className="text-[10px] text-foreground-400">{r.cerrado ? 'Facturado hoy' : 'Hoy hasta ahora'}</p>
          <p className="text-sm sm:text-base font-semibold text-foreground-950 tabular-nums">{formatEUR(r.acumHoy)}</p>
        </div>
        <div className="rounded-xl bg-background-100/60 px-3 py-2">
          <p className="text-[10px] text-foreground-400">{r.cerrado ? `Un ${dia} normal` : 'Normal a esta hora'}</p>
          <p className="text-sm sm:text-base font-semibold text-foreground-500 tabular-nums">{formatEUR(r.cerrado ? r.refTotal : r.refHastaAhora)}</p>
        </div>
        <div className="rounded-xl bg-primary-500/[0.06] border border-primary-500/10 px-3 py-2">
          <p className="text-[10px] text-foreground-400">{r.cerrado ? 'Diferencia' : 'Previsión de cierre'}</p>
          <p className={`text-sm sm:text-base font-semibold tabular-nums ${r.cerrado ? (bueno ? 'text-emerald-700' : 'text-red-600') : 'text-foreground-950'}`}>
            {r.cerrado ? `${r.acumHoy - r.refTotal >= 0 ? '+' : '−'}${formatEUR(Math.abs(r.acumHoy - r.refTotal))}` : `≈ ${formatEUR(r.prevision)}`}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-16 overflow-visible" aria-hidden="true">
          {[10, 20, 30].map((y) => (
            <line key={y} x1="0" x2="100" y1={y} y2={y} className="stroke-background-200" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {areaHoy && <path d={areaHoy} className={bueno ? 'fill-emerald-500/15' : 'fill-red-400/15'} />}
          <path d={trazo(puntosRef)} fill="none" className="stroke-foreground-400" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          {puntosHoy.length > 1 && (
            <path d={trazo(puntosHoy)} fill="none" className={bueno ? 'stroke-emerald-600' : 'stroke-red-500'} strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        <div className="relative h-4 mt-1">
          {etiquetasHoras.map((hh) => (
            <span key={hh} className="absolute -translate-x-1/2 text-[10px] text-foreground-400 tabular-nums" style={{ left: `${X(hh)}%` }}>
              {hh}h
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[11px] text-foreground-500">
          <span className="inline-flex items-center gap-1.5">
            <span className={`w-3.5 h-[3px] rounded-full ${bueno ? 'bg-emerald-600' : 'bg-red-500'}`}></span>
            Hoy (acumulado)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 border-t-2 border-dashed border-foreground-400"></span>
            Un {dia} normal · media de {r.diasRef}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Previsión de género
// ---------------------------------------------------------------------------

const NO_GENERO = /^(bolsa|varios)(\s|$)/i;

type EstadoStock = { tipo: 'ok' | 'justo' | 'falta'; stock: number; falta: number } | null;

function estadoStock(p: PrevisionProducto, productos: Map<string, Producto>): EstadoStock {
  if (!p.producto_id || !p.unidad.toLowerCase().startsWith('kg')) return null;
  const prod = productos.get(p.producto_id);
  if (!prod || !prod.gestion_stock) return null;
  const stock = Number(prod.stock_kg);
  if (stock >= Math.max(p.maximo, p.media)) return { tipo: 'ok', stock, falta: 0 };
  if (stock >= p.media) return { tipo: 'justo', stock, falta: 0 };
  return { tipo: 'falta', stock, falta: p.media - stock };
}

function FilaPrevision({ p, estado, dia }: { p: PrevisionProducto; estado: EstadoStock; dia: string }) {
  const maximo = Math.max(p.maximo, p.media);
  const ambos = p.media_p1 > 0 && p.media_p2 > 0;
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground-950 truncate">{nombreBonito(p.designacion)}</p>
        <p className="text-[11px] text-foreground-400 truncate tabular-nums">
          {ambos ? (
            <>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-500 mr-1 align-middle"></span>
              {formatCant(p.media_p1, p.unidad)}
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 ml-2 mr-1 align-middle"></span>
              {formatCant(p.media_p2, p.unidad)}
            </>
          ) : (
            <>
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${p.media_p1 > 0 ? 'bg-sky-500' : 'bg-amber-500'}`}></span>
              {p.media_p1 > 0 ? 'Pescadería I' : 'Pescadería II'}
            </>
          )}
          {' · '}
          {p.dias_vendido} de {p.dias_referencia} {p.dias_referencia === 1 ? dia : plural(dia)}
        </p>
        {estado && (
          <p
            className={`inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium tabular-nums ${
              estado.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700' : estado.tipo === 'justo' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
            }`}
          >
            <i className={estado.tipo === 'ok' ? 'ri-checkbox-circle-line' : estado.tipo === 'justo' ? 'ri-error-warning-line' : 'ri-alert-line'}></i>
            Stock {formatCant(estado.stock, 'kg')}
            {estado.tipo === 'falta' && ` · faltan ~${formatCant(estado.falta, 'kg')}`}
            {estado.tipo === 'justo' && ' · justo'}
          </p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-base font-semibold text-foreground-950 tabular-nums">≈ {formatCant(p.media, p.unidad)}</p>
        <p className="text-[10px] text-foreground-400 tabular-nums">máx. {formatCant(maximo, p.unidad)}</p>
      </div>
    </div>
  );
}

export function PrevisionGenero({ productos }: { productos: Producto[] }) {
  const opciones = useMemo(() => {
    const base = new Date();
    return [0, 1, 2].map((d) => {
      const f = new Date(base.getFullYear(), base.getMonth(), base.getDate() + d);
      const iso = isoLocal(f);
      const nombre = diaSemana(iso);
      return { iso, nombre, etiqueta: d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : nombre.charAt(0).toUpperCase() + nombre.slice(1) };
    });
  }, []);
  // Por la mañana interesa el día en curso (compra en lonja); a partir del
  // mediodía, planificar el siguiente.
  const [sel, setSel] = useState(() => (new Date().getHours() < 12 ? 0 : 1));
  const [verTodos, setVerTodos] = useState(false);
  const opcion = opciones[sel];
  const { filas, loading } = usePrevisionGenero(opcion.iso);
  const mapaProductos = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  // Fuera bolsas y cobros genéricos ("Varios"), que no son género.
  const productosReales = filas.filter((f) => !NO_GENERO.test(f.designacion.trim()));
  const facturacion = filas.reduce((n, f) => n + f.importe_medio, 0);
  // Un día con cuatro céntimos vendidos (una prueba, un cobro suelto) cuenta
  // como cerrado, no como día de apertura.
  const diasRef = facturacion >= 100 ? (filas[0]?.dias_referencia ?? 0) : 0;
  // Habituales: se vendieron al menos la mitad de esos días.
  const esHabitual = (f: PrevisionProducto) => f.dias_vendido * 2 >= diasRef && f.media > 0;
  const habituales = productosReales.filter(esHabitual);
  const ocasionales = productosReales.filter((f) => !esHabitual(f));
  const visibles = verTodos ? habituales : habituales.slice(0, 12);
  const faltan = habituales.filter((f) => estadoStock(f, mapaProductos)?.tipo === 'falta');

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-foreground-400 mb-0.5">Para planificar el género</p>
          <div className="flex items-center gap-1.5">
            <h2 className="text-base font-heading font-semibold text-foreground-950 leading-tight">
              Qué se suele vender {sel === 0 ? 'hoy' : sel === 1 ? 'mañana' : `el ${opcion.nombre}`}
            </h2>
            <InfoHint
              title="Previsión de género"
              size="sm"
              items={[
                {
                  icon: 'ri-bar-chart-grouped-line',
                  text: 'Media de lo vendido de cada producto los mismos días de la semana de las últimas 6 semanas, sumando las dos básculas (solo los días que se abrió).',
                },
                { icon: 'ri-arrow-up-line', text: '"máx." es lo máximo que se vendió en uno de esos días: si quieres ir sobrado, pide hacia esa cifra.' },
                {
                  icon: 'ri-archive-line',
                  text: 'El stock solo aparece en los productos enlazados a su código de báscula. Las ventas de la Pescadería I todavía no descuentan stock, así que tómalo como orientativo.',
                },
              ]}
            />
          </div>
        </div>
        <div className="inline-flex p-0.5 rounded-full bg-background-100 border border-background-200/70">
          {opciones.map((o, i) => (
            <button
              key={o.iso}
              type="button"
              onClick={() => {
                setSel(i);
                setVerTodos(false);
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                sel === i ? 'bg-background-50 text-foreground-950 shadow-sm' : 'text-foreground-500 hover:text-foreground-950'
              }`}
            >
              {o.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-foreground-400">Calculando…</p>
      ) : diasRef === 0 || habituales.length === 0 ? (
        <div className="flex flex-col items-center text-center gap-2 py-9 px-4 rounded-xl border border-dashed border-background-200 bg-background-50/50">
          <span className="w-10 h-10 flex items-center justify-center rounded-full bg-background-100 text-foreground-300">
            <i className="ri-store-3-line text-lg"></i>
          </span>
          <p className="text-sm text-foreground-400">
            {diasRef === 0 ? `No hay ventas de ${plural(opcion.nombre)} anteriores: normalmente está cerrado.` : 'Sin suficientes datos todavía.'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 text-xs text-foreground-500">
            <span>
              Un {opcion.nombre} normal se facturan <span className="font-semibold text-foreground-950 tabular-nums">≈ {formatEUR(facturacion)}</span>
            </span>
            <span className="text-foreground-400">
              {diasRef === 1 ? `según el último ${opcion.nombre}` : `según los últimos ${diasRef} ${plural(opcion.nombre)}`}
            </span>
            {faltan.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">
                <i className="ri-alert-line"></i>
                {faltan.length} {faltan.length === 1 ? 'producto' : 'productos'} con poco stock
              </span>
            )}
          </div>
          {diasRef < 3 && (
            <p className="flex items-center gap-1.5 mb-3 px-3 py-2 rounded-xl bg-amber-50 text-amber-800 text-[11px]">
              <i className="ri-information-line"></i>
              Aún hay pocos datos ({diasRef} {diasRef === 1 ? opcion.nombre : plural(opcion.nombre)}): la previsión se afina cada semana.
            </p>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 bg-background-50 border border-background-200/70 rounded-2xl shadow-card overflow-hidden">
            {visibles.map((p, i) => (
              <div
                key={`${p.designacion}|${p.unidad}`}
                className={`border-background-200/50 ${i > 0 ? 'border-t' : ''} ${i === 1 ? 'lg:border-t-0' : ''} ${i % 2 === 0 ? 'lg:border-r' : ''}`}
              >
                <FilaPrevision p={p} estado={estadoStock(p, mapaProductos)} dia={opcion.nombre} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-xs">
            {habituales.length > 12 && (
              <button type="button" onClick={() => setVerTodos((v) => !v)} className="font-medium text-primary-600 hover:underline">
                {verTodos ? 'Ver menos' : `Ver todos (${habituales.length})`}
              </button>
            )}
            {ocasionales.length > 0 && (
              <span className="text-foreground-400">
                + {ocasionales.length} {ocasionales.length === 1 ? 'producto que se vende' : 'productos que se venden'} solo algunos {plural(opcion.nombre)}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
