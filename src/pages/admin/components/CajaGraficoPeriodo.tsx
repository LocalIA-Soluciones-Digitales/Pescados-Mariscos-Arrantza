import { useEffect, useMemo, useRef, useState } from 'react';
import { ORIGENES, ORIGEN_COLORS, ORIGEN_LABELS, type Origen } from '@/types/origen';
import { totalGastos, totalNeto, type FilaPeriodo } from './cajaTotales';

// Gráfico del resumen de Contabilidad, dibujado en SVG a tamaño real (se
// mide el ancho con ResizeObserver en vez de escalar un viewBox, para que
// el texto no se deforme). Tres lecturas del mismo periodo:
//  - Ingresos y gastos: ingresos apilados por tienda + marca de gastos.
//  - Neto diario: barras divergentes desde cero (verde gana / rojo pierde).
//  - Neto acumulado: cómo va la caja del periodo día a día.
// Una sola escala en euros en cada modo. Al pasar por encima se resalta la
// columna y se ve el desglose; al pulsar se entra en ese día/mes.

type Modo = 'ingresos' | 'neto' | 'acumulado';

const FILL_TIENDA: Record<Origen, string> = { pescaderia_1: 'fill-sky-500', pescaderia_2: 'fill-amber-500' };

function formatEUR(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function formatEje(n: number): string {
  if (n === 0) return '0';
  if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k`;
  return Math.round(n).toLocaleString('es-ES');
}

// Escala "bonita": marcas en múltiplos de 1, 2, 2.5 o 5 × 10^n que cubren
// [min, max] con unas 4 divisiones.
function escalaBonita(min: number, max: number): { lo: number; hi: number; ticks: number[] } {
  const lo0 = Math.min(0, min);
  const hi0 = Math.max(0, max);
  if (hi0 - lo0 <= 0) return { lo: 0, hi: 1, ticks: [0, 1] };
  const bruto = (hi0 - lo0) / 4;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= bruto) ?? 10 * mag;
  const lo = Math.floor(lo0 / paso) * paso;
  const hi = Math.ceil(hi0 / paso) * paso;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + paso / 2; v += paso) ticks.push(Math.round(v * 100) / 100);
  return { lo, hi, ticks };
}

// Rectángulo con solo las esquinas del extremo de datos redondeadas (arriba
// si crece hacia arriba, abajo si es negativo) y la base plana sobre el eje.
function barra(x: number, y0: number, y1: number, w: number, r: number): string {
  const arriba = y1 < y0;
  const h = Math.abs(y1 - y0);
  const rr = Math.min(r, h, w / 2);
  if (arriba) {
    return `M${x},${y0} V${y1 + rr} Q${x},${y1} ${x + rr},${y1} H${x + w - rr} Q${x + w},${y1} ${x + w},${y1 + rr} V${y0} Z`;
  }
  return `M${x},${y0} V${y1 - rr} Q${x},${y1} ${x + rr},${y1} H${x + w - rr} Q${x + w},${y1} ${x + w},${y1 - rr} V${y0} Z`;
}

function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ancho };
}

const MODOS: { value: Modo; label: string }[] = [
  { value: 'ingresos', label: 'Ingresos y gastos' },
  { value: 'neto', label: 'Neto' },
  { value: 'acumulado', label: 'Acumulado' },
];

export default function CajaGraficoPeriodo({
  filas,
  unidad,
  onFilaClick,
}: {
  filas: FilaPeriodo[];
  unidad: 'día' | 'mes';
  onFilaClick: (key: string) => void;
}) {
  const [modo, setModo] = useState<Modo>('ingresos');
  const [hover, setHover] = useState<number | null>(null);
  const { ref, ancho } = useAncho<HTMLDivElement>();

  const acumulado = useMemo(() => {
    let n = 0;
    return filas.map((f) => (f.futuro ? null : (n += totalNeto(f.totales))));
  }, [filas]);

  const pasadas = filas.filter((f) => !f.futuro);
  const conVenta = pasadas.filter((f) => f.totales.ingresos > 0);
  const media = conVenta.length ? conVenta.reduce((n, f) => n + f.totales.ingresos, 0) / conVenta.length : 0;

  const alto = ancho < 520 ? 210 : 260;
  const m = { top: 14, right: 12, bottom: 26, left: 44 };
  const plotW = Math.max(0, ancho - m.left - m.right);
  const plotH = alto - m.top - m.bottom;
  const banda = filas.length ? plotW / filas.length : 0;
  const anchoBarra = Math.max(3, Math.min(28, banda * (filas.length > 12 ? 0.62 : 0.5)));
  const cx = (i: number) => m.left + banda * i + banda / 2;

  const esc = useMemo(() => {
    if (modo === 'ingresos') {
      return escalaBonita(0, Math.max(...filas.map((f) => Math.max(f.totales.ingresos, totalGastos(f.totales)))));
    }
    if (modo === 'neto') {
      const netos = pasadas.map((f) => totalNeto(f.totales));
      return escalaBonita(Math.min(0, ...netos), Math.max(0, ...netos));
    }
    const vals = acumulado.filter((v): v is number => v !== null);
    return escalaBonita(Math.min(0, ...vals), Math.max(0, ...vals));
  }, [modo, filas, pasadas, acumulado]);

  const y = (v: number) => m.top + plotH - ((v - esc.lo) / (esc.hi - esc.lo || 1)) * plotH;
  const y0 = y(0);

  // Cuántas etiquetas del eje X caben sin pisarse.
  const pasoEtiqueta = Math.max(1, Math.ceil(filas.length / Math.max(1, Math.floor(plotW / 34))));

  const lineaAcumulado = useMemo(() => {
    const pts = acumulado.map((v, i) => (v === null ? null : [cx(i), y(v)] as const)).filter((p): p is readonly [number, number] => p !== null);
    if (!pts.length) return { linea: '', area: '' };
    const linea = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ');
    const area = `${linea} L${pts[pts.length - 1][0]},${y0} L${pts[0][0]},${y0} Z`;
    return { linea, area };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acumulado, ancho, esc]);

  const netoFinal = [...acumulado].reverse().find((v) => v !== null) ?? 0;
  const f = hover !== null ? filas[hover] : null;
  const idClip = useMemo(() => `clip-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-2xl p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <p className="text-sm font-medium text-foreground-950 mr-auto">Evolución por {unidad}</p>
        <div className="inline-flex p-0.5 rounded-full bg-background-100 border border-background-200/70">
          {MODOS.map((mo) => (
            <button
              key={mo.value}
              type="button"
              onClick={() => setModo(mo.value)}
              className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap ${
                modo === mo.value ? 'bg-background-50 text-foreground-950 shadow-sm' : 'text-foreground-500 hover:text-foreground-950'
              }`}
            >
              {mo.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 min-h-[16px]">
        {modo === 'ingresos' && (
          <>
            {ORIGENES.map((o) => (
              <span key={o} className="inline-flex items-center gap-1.5 text-[11px] text-foreground-500">
                <span className={`w-2.5 h-2.5 rounded-sm ${ORIGEN_COLORS[o].dot}`}></span>
                {ORIGEN_LABELS[o]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground-500">
              <span className="w-3.5 h-[3px] bg-red-500 rounded-full"></span>
              Gastos
            </span>
            {media > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground-500">
                <span className="w-4 border-t border-dashed border-foreground-400"></span>
                Media de ingresos · {formatEUR(media)}
              </span>
            )}
          </>
        )}
        {modo === 'neto' && (
          <>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>
              Ganancia
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground-500">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-400"></span>
              Pérdida
            </span>
            <span className="text-[11px] text-foreground-400">Ingresos − gastos de cada {unidad}</span>
          </>
        )}
        {modo === 'acumulado' && (
          <span className="text-[11px] text-foreground-500">
            Neto acumulado del periodo:{' '}
            <span className={`font-semibold tabular-nums ${netoFinal >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatEUR(netoFinal)}</span>
          </span>
        )}
      </div>

      <div ref={ref} className="relative w-full select-none" style={{ height: alto }} onPointerLeave={() => setHover(null)}>
        {ancho > 0 && (
          <svg width={ancho} height={alto} className="block overflow-visible" role="img" aria-label={`Gráfico por ${unidad}`}>
            <defs>
              <clipPath id={`${idClip}-sup`}>
                <rect x={0} y={0} width={ancho} height={y0} />
              </clipPath>
              <clipPath id={`${idClip}-inf`}>
                <rect x={0} y={y0} width={ancho} height={Math.max(0, alto - y0)} />
              </clipPath>
            </defs>

            {/* Rejilla y eje Y */}
            {esc.ticks.map((t) => (
              <g key={t}>
                <line
                  x1={m.left}
                  x2={ancho - m.right}
                  y1={y(t)}
                  y2={y(t)}
                  className={t === 0 ? 'stroke-foreground-300' : 'stroke-background-200'}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-foreground-400 text-[10px] tabular-nums">
                  {formatEje(t)}
                </text>
              </g>
            ))}

            {/* Columna resaltada */}
            {hover !== null && (
              <rect x={m.left + banda * hover} y={m.top} width={banda} height={plotH} rx={6} className="fill-background-200/60" />
            )}

            {modo === 'ingresos' &&
              filas.map((fila, i) => {
                if (fila.futuro || fila.totales.ingresos <= 0) return null;
                const x = cx(i) - anchoBarra / 2;
                const tiendas = ORIGENES.map((o) => [o, fila.totales.ingresos_por_tienda[o] ?? 0] as const).filter(([, v]) => v > 0);
                let base = 0;
                return (
                  <g key={fila.key} opacity={hover !== null && hover !== i ? 0.55 : 1} className="transition-opacity">
                    {tiendas.map(([o, v], j) => {
                      const ultimo = j === tiendas.length - 1;
                      const yb = y(base) - (j > 0 ? 1 : 0);
                      const yt = y(base + v) + (ultimo ? 0 : 1);
                      base += v;
                      if (yb - yt <= 0) return null;
                      return ultimo ? (
                        <path key={o} d={barra(x, yb, yt, anchoBarra, 4)} className={FILL_TIENDA[o]} />
                      ) : (
                        <rect key={o} x={x} y={yt} width={anchoBarra} height={yb - yt} className={FILL_TIENDA[o]} />
                      );
                    })}
                  </g>
                );
              })}

            {modo === 'ingresos' && media > 0 && (
              <line x1={m.left} x2={ancho - m.right} y1={y(media)} y2={y(media)} className="stroke-foreground-400" strokeDasharray="4 4" strokeWidth={1} />
            )}

            {/* Gastos: una marca horizontal por día al nivel del gasto. Las
                facturas llegan a golpes, así que una línea continua haría
                picos que no significan tendencia. */}
            {modo === 'ingresos' && (
              <g className="pointer-events-none">
                {filas.map((fila, i) => {
                  const g = totalGastos(fila.totales);
                  if (fila.futuro || g <= 0) return null;
                  const w = anchoBarra + Math.min(10, banda * 0.25);
                  return (
                    <g key={fila.key} opacity={hover !== null && hover !== i ? 0.55 : 1}>
                      <line x1={cx(i) - w / 2} x2={cx(i) + w / 2} y1={y(g)} y2={y(g)} className="stroke-background-50" strokeWidth={6} strokeLinecap="round" />
                      <line x1={cx(i) - w / 2} x2={cx(i) + w / 2} y1={y(g)} y2={y(g)} className="stroke-red-500" strokeWidth={3} strokeLinecap="round" />
                    </g>
                  );
                })}
              </g>
            )}

            {modo === 'neto' &&
              filas.map((fila, i) => {
                if (fila.futuro) return null;
                const n = totalNeto(fila.totales);
                if (Math.abs(n) < 0.005) return null;
                return (
                  <path
                    key={fila.key}
                    d={barra(cx(i) - anchoBarra / 2, y0, y(n), anchoBarra, 4)}
                    className={`${n >= 0 ? 'fill-emerald-500' : 'fill-red-400'} transition-opacity`}
                    opacity={hover !== null && hover !== i ? 0.55 : 1}
                  />
                );
              })}

            {modo === 'acumulado' && lineaAcumulado.linea && (
              <g className="pointer-events-none">
                <path d={lineaAcumulado.area} className="fill-emerald-500/15" clipPath={`url(#${idClip}-sup)`} />
                <path d={lineaAcumulado.area} className="fill-red-400/15" clipPath={`url(#${idClip}-inf)`} />
                <path d={lineaAcumulado.linea} fill="none" className="stroke-emerald-600" strokeWidth={2} strokeLinejoin="round" clipPath={`url(#${idClip}-sup)`} />
                <path d={lineaAcumulado.linea} fill="none" className="stroke-red-500" strokeWidth={2} strokeLinejoin="round" clipPath={`url(#${idClip}-inf)`} />
                {hover !== null && acumulado[hover] !== null && (
                  <>
                    <line x1={cx(hover)} x2={cx(hover)} y1={m.top} y2={m.top + plotH} className="stroke-foreground-300" strokeDasharray="3 3" />
                    <circle
                      cx={cx(hover)}
                      cy={y(acumulado[hover]!)}
                      r={5}
                      className={`${acumulado[hover]! >= 0 ? 'fill-emerald-600' : 'fill-red-500'} stroke-background-50`}
                      strokeWidth={2}
                    />
                  </>
                )}
              </g>
            )}

            {/* Eje X */}
            {filas.map((fila, i) =>
              i % pasoEtiqueta === 0 || fila.esActual || hover === i ? (
                <text
                  key={fila.key}
                  x={cx(i)}
                  y={alto - 8}
                  textAnchor="middle"
                  className={`text-[10px] tabular-nums ${
                    hover === i ? 'fill-foreground-950 font-semibold' : fila.esActual ? 'fill-primary-500 font-semibold' : fila.futuro ? 'fill-foreground-300' : 'fill-foreground-400'
                  }`}
                >
                  {fila.labelCorto}
                </text>
              ) : null,
            )}

            {/* Zonas de interacción, una por columna */}
            {filas.map((fila, i) => (
              <rect
                key={fila.key}
                x={m.left + banda * i}
                y={m.top}
                width={banda}
                height={plotH + m.bottom}
                fill="transparent"
                className={fila.futuro ? '' : 'cursor-pointer'}
                onPointerEnter={() => setHover(fila.futuro ? null : i)}
                onClick={() => !fila.futuro && onFilaClick(fila.key)}
              />
            ))}
          </svg>
        )}

        {f && hover !== null && (
          <div
            className="absolute z-10 top-0 pointer-events-none w-56"
            style={{
              left: Math.min(Math.max(cx(hover) + (cx(hover) > ancho / 2 ? -240 : 16), 0), Math.max(0, ancho - 224)),
            }}
          >
            <div className="bg-foreground-950/95 backdrop-blur text-background-50 rounded-xl px-3 py-2.5 shadow-xl text-[11px] space-y-0.5">
              <p className="font-medium text-xs mb-1.5 flex items-center gap-2">
                {f.label}
                {f.esActual && <span className="px-1.5 rounded-full bg-background-50/15 text-[10px]">{unidad === 'día' ? 'Hoy' : 'Actual'}</span>}
              </p>
              {ORIGENES.map((o) => (
                <p key={o} className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${ORIGEN_COLORS[o].dot}`}></span>
                  <span className="opacity-75">{ORIGEN_LABELS[o]}</span>
                  <span className="ml-auto tabular-nums">{formatEUR(f.totales.ingresos_por_tienda[o] ?? 0)}</span>
                </p>
              ))}
              <p className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span className="opacity-75">Ingresos</span>
                <span className="ml-auto tabular-nums">{formatEUR(f.totales.ingresos)}</span>
              </p>
              <p className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                <span className="opacity-75">Gastos</span>
                <span className="ml-auto tabular-nums">{formatEUR(totalGastos(f.totales))}</span>
              </p>
              <p className="flex items-center gap-1.5 pt-1.5 mt-1 border-t border-background-50/15 font-medium">
                Neto
                <span className={`ml-auto tabular-nums ${totalNeto(f.totales) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{formatEUR(totalNeto(f.totales))}</span>
              </p>
              {acumulado[hover] !== null && (
                <p className="flex items-center gap-1.5 opacity-75">
                  Acumulado
                  <span className="ml-auto tabular-nums">{formatEUR(acumulado[hover]!)}</span>
                </p>
              )}
              {f.tickets > 0 && <p className="opacity-50 pt-0.5">{f.tickets} tickets · pulsa para ver el detalle</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
