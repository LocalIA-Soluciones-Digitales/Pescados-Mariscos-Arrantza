import { useEffect, useMemo, useRef, useState } from 'react';
import { ORIGENES, ORIGEN_COLORS, ORIGEN_LABELS, type Origen } from '@/types/origen';
import { totalGastos, totalNeto, type FilaPeriodo } from './cajaTotales';

// Gráfico del resumen de Contabilidad, dibujado en SVG a tamaño real (se
// mide el ancho con ResizeObserver en vez de escalar un viewBox, para que
// el texto no se deforme). Tres lecturas del mismo periodo:
//  - Ingresos y gastos: ingresos apilados por tienda con la barra de gastos
//    al lado, y opcionalmente la línea del mismo día de la semana anterior
//    (o mismo mes del año anterior) como referencia.
//  - Neto diario: barras divergentes desde cero (verde gana / rojo pierde).
//  - Neto acumulado: cómo va la caja del periodo día a día, frente a cómo
//    iba el periodo anterior a la misma altura.
// Una sola escala en euros en cada modo. Al pasar por encima se resalta la
// columna y se ve el desglose; al pulsar se entra en ese día/mes.

type Modo = 'ingresos' | 'neto' | 'acumulado';

const FILL_TIENDA: Record<Origen, string> = { pescaderia_1: 'fill-sky-500', pescaderia_2: 'fill-amber-500' };

function formatEUR(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function formatPctDelta(actual: number, anterior: number): string | null {
  if (anterior <= 0) return null;
  const v = ((actual - anterior) / anterior) * 100;
  return `${v >= 0 ? '+' : ''}${v.toLocaleString('es-ES', { maximumFractionDigits: 0 })} %`;
}

// Trazo de una serie con huecos: se corta donde el valor es null.
function trazoConHuecos(puntos: ([number, number] | null)[]): string {
  let d = '';
  let dentro = false;
  puntos.forEach((p) => {
    if (!p) {
      dentro = false;
      return;
    }
    d += `${dentro ? 'L' : 'M'}${p[0]},${p[1]} `;
    dentro = true;
  });
  return d.trim();
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
  filasAnteriores,
  anteriorLabel,
  unidad,
  onFilaClick,
}: {
  filas: FilaPeriodo[];
  filasAnteriores: FilaPeriodo[];
  anteriorLabel: string;
  unidad: 'día' | 'mes';
  onFilaClick: (key: string) => void;
}) {
  const [modo, setModo] = useState<Modo>('ingresos');
  const [comparar, setComparar] = useState(true);
  const refLabel = unidad === 'día' ? 'Mismo día sem. anterior' : `Mismo mes de ${anteriorLabel}`;
  const [hover, setHover] = useState<number | null>(null);
  const { ref, ancho } = useAncho<HTMLDivElement>();

  const acumulado = useMemo(() => {
    let n = 0;
    return filas.map((f) => (f.futuro ? null : (n += totalNeto(f.totales))));
  }, [filas]);

  // Acumulado del periodo anterior alineado por posición (día 1 con día 1…).
  const acumuladoAnt = useMemo(() => {
    let n = 0;
    return filas.map((_, i) => {
      const fa = filasAnteriores[i];
      if (!fa || fa.futuro) return null;
      return (n += totalNeto(fa.totales));
    });
  }, [filas, filasAnteriores]);

  const pasadas = filas.filter((f) => !f.futuro);
  const conVenta = pasadas.filter((f) => f.totales.ingresos > 0);
  const media = conVenta.length ? conVenta.reduce((n, f) => n + f.totales.ingresos, 0) / conVenta.length : 0;

  const alto = ancho < 520 ? 210 : 260;
  const m = { top: 14, right: 12, bottom: 26, left: 44 };
  const plotW = Math.max(0, ancho - m.left - m.right);
  const plotH = alto - m.top - m.bottom;
  const banda = filas.length ? plotW / filas.length : 0;
  const anchoBarra = Math.max(3, Math.min(28, banda * (filas.length > 12 ? 0.62 : 0.5)));
  // Modo ingresos: grupo de dos barras (ingresos apilados + gastos).
  const anchoGrupo = Math.max(6, Math.min(filas.length > 12 ? 30 : 56, banda * (filas.length > 12 ? 0.8 : 0.56)));
  const hueco = anchoGrupo > 14 ? 2 : 1;
  const wIng = (anchoGrupo - hueco) * 0.55;
  const wGas = anchoGrupo - hueco - wIng;
  const cx = (i: number) => m.left + banda * i + banda / 2;

  const esc = useMemo(() => {
    if (modo === 'ingresos') {
      return escalaBonita(
        0,
        Math.max(...filas.map((f) => Math.max(f.totales.ingresos, totalGastos(f.totales), comparar ? (f.anterior?.totales.ingresos ?? 0) : 0))),
      );
    }
    if (modo === 'neto') {
      const netos = pasadas.map((f) => totalNeto(f.totales));
      return escalaBonita(Math.min(0, ...netos), Math.max(0, ...netos));
    }
    const vals = [...acumulado, ...(comparar ? acumuladoAnt : [])].filter((v): v is number => v !== null);
    return escalaBonita(Math.min(0, ...vals), Math.max(0, ...vals));
  }, [modo, filas, pasadas, acumulado, acumuladoAnt, comparar]);

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

  const lineaReferencia = trazoConHuecos(filas.map((fila, i) => (fila.anterior && fila.anterior.totales.ingresos > 0 ? [cx(i), y(fila.anterior.totales.ingresos)] : null)));
  const lineaAcumAnt = trazoConHuecos(acumuladoAnt.map((v, i) => (v === null ? null : [cx(i), y(v)])));
  const hayReferencia = filas.some((fila) => (fila.anterior?.totales.ingresos ?? 0) > 0);
  const hayAcumAnt = acumuladoAnt.some((v) => v !== null && v !== 0);

  const netoFinal = [...acumulado].reverse().find((v) => v !== null) ?? 0;
  const idxUltimo = acumulado.reduce<number>((u, v, i) => (v !== null ? i : u), -1);
  const antMismaAltura = idxUltimo >= 0 ? acumuladoAnt[idxUltimo] : null;
  const f = hover !== null ? filas[hover] : null;
  const idClip = useMemo(() => `clip-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-2xl p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <p className="text-sm font-medium text-foreground-950 mr-auto">Evolución por {unidad}</p>
        {modo !== 'neto' && (modo === 'ingresos' ? hayReferencia : hayAcumAnt) && (
          <button
            type="button"
            onClick={() => setComparar((c) => !c)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              comparar ? 'bg-foreground-950 text-background-50 border-foreground-950' : 'bg-background-50 text-foreground-500 border-background-200/70 hover:text-foreground-950'
            }`}
          >
            <i className="ri-git-compare-line"></i>
            Comparar
          </button>
        )}
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
              <span className="w-2.5 h-2.5 rounded-sm bg-red-400"></span>
              Gastos
            </span>
            {comparar && hayReferencia && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground-500">
                <svg width="18" height="8" aria-hidden="true">
                  <line x1="1" x2="17" y1="4" y2="4" className="stroke-foreground-500" strokeWidth="1.5" />
                  <circle cx="9" cy="4" r="2.5" className="fill-background-50 stroke-foreground-500" strokeWidth="1.5" />
                </svg>
                {refLabel}
              </span>
            )}
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
          <>
            <span className="text-[11px] text-foreground-500">
              Neto acumulado:{' '}
              <span className={`font-semibold tabular-nums ${netoFinal >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatEUR(netoFinal)}</span>
            </span>
            {comparar && hayAcumAnt && antMismaAltura !== null && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground-500">
                <span className="w-4 border-t-2 border-dashed border-foreground-400"></span>
                {anteriorLabel.charAt(0).toUpperCase() + anteriorLabel.slice(1)} a la misma altura:{' '}
                <span className="font-medium tabular-nums text-foreground-800">{formatEUR(antMismaAltura)}</span>
                <span className={`font-medium tabular-nums ${netoFinal - antMismaAltura >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  ({netoFinal - antMismaAltura >= 0 ? '+' : ''}
                  {formatEUR(netoFinal - antMismaAltura)})
                </span>
              </span>
            )}
          </>
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
                if (fila.futuro) return null;
                const x = cx(i) - anchoGrupo / 2;
                const g = totalGastos(fila.totales);
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
                        <path key={o} d={barra(x, yb, yt, wIng, 4)} className={FILL_TIENDA[o]} />
                      ) : (
                        <rect key={o} x={x} y={yt} width={wIng} height={yb - yt} className={FILL_TIENDA[o]} />
                      );
                    })}
                    {g > 0 && <path d={barra(x + wIng + hueco, y0, y(g), wGas, 3)} className="fill-red-400" />}
                  </g>
                );
              })}

            {modo === 'ingresos' && media > 0 && (
              <line x1={m.left} x2={ancho - m.right} y1={y(media)} y2={y(media)} className="stroke-foreground-400" strokeDasharray="4 4" strokeWidth={1} />
            )}

            {/* Referencia: mismo día de la semana anterior / mismo mes del
                año anterior. Se dibuja también sobre los días que faltan,
                para ver de antemano lo que se vendió "un día como ese". */}
            {modo === 'ingresos' && comparar && lineaReferencia && (
              <g className="pointer-events-none">
                <path d={lineaReferencia} fill="none" className="stroke-foreground-500" strokeWidth={1.5} strokeLinejoin="round" />
                {filas.map((fila, i) =>
                  fila.anterior && fila.anterior.totales.ingresos > 0 ? (
                    <circle
                      key={fila.key}
                      cx={cx(i)}
                      cy={y(fila.anterior.totales.ingresos)}
                      r={hover === i ? 4 : filas.length > 12 ? 2 : 3}
                      className="fill-background-50 stroke-foreground-500"
                      strokeWidth={1.5}
                    />
                  ) : null,
                )}
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

            {modo === 'acumulado' && comparar && lineaAcumAnt && (
              <path d={lineaAcumAnt} fill="none" className="stroke-foreground-400 pointer-events-none" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
            )}

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
                onPointerEnter={() => setHover(fila.futuro && !(modo === 'ingresos' && fila.anterior) ? null : i)}
                onClick={() => !fila.futuro && onFilaClick(fila.key)}
              />
            ))}
          </svg>
        )}

        {f && hover !== null && (
          <div
            className="absolute z-10 top-0 pointer-events-none w-64"
            style={{
              left: Math.min(Math.max(cx(hover) + (cx(hover) > ancho / 2 ? -272 : 16), 0), Math.max(0, ancho - 256)),
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
              {f.anterior && f.anterior.totales.ingresos > 0 && (
                <p className="flex items-center gap-1.5 pl-3">
                  <span className="opacity-50 truncate">vs {f.anterior.label}</span>
                  <span className="ml-auto tabular-nums opacity-75">{formatEUR(f.anterior.totales.ingresos)}</span>
                  {formatPctDelta(f.totales.ingresos, f.anterior.totales.ingresos) && (
                    <span className={`tabular-nums font-medium ${f.totales.ingresos >= f.anterior.totales.ingresos ? 'text-emerald-300' : 'text-red-300'}`}>
                      {formatPctDelta(f.totales.ingresos, f.anterior.totales.ingresos)}
                    </span>
                  )}
                </p>
              )}
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
              {modo === 'acumulado' && acumuladoAnt[hover] !== null && (
                <p className="flex items-center gap-1.5 opacity-50">
                  {anteriorLabel.charAt(0).toUpperCase() + anteriorLabel.slice(1)} a esta altura
                  <span className="ml-auto tabular-nums">{formatEUR(acumuladoAnt[hover]!)}</span>
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
