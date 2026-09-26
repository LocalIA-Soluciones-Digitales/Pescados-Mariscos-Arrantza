import { useMemo, useState } from 'react';
import { ORIGENES, ORIGEN_COLORS, ORIGEN_LABELS, type Origen } from '@/types/origen';
import CajaGraficoPeriodo from './CajaGraficoPeriodo';
import { agregar, totalGastos, totalNeto, type Agregado, type FilaPeriodo, type PatronDia, type Totales } from './cajaTotales';

// Resumen compartido por las vistas Semana, Mes y Año de Contabilidad:
// cabecera con navegación entre periodos, indicadores con comparativa
// frente al periodo anterior, previsión de cierre, gráfico (ver
// CajaGraficoPeriodo), días/meses destacados y tabla de detalle
// ordenable y exportable a Excel. Cada vista solo decide qué filas forman el periodo.

function formatEUR(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function formatPct(n: number): string {
  return `${n.toLocaleString('es-ES', { maximumFractionDigits: 0 })} %`;
}

// Variación porcentual frente al periodo anterior; null si no hay base con
// la que comparar (evita un "+∞ %" cuando el periodo anterior estaba vacío).
function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}

function formatEURRedondo(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function colorDelta(valor: number, subirEsBueno: boolean): string {
  if (Math.abs(valor) < 0.5) return 'bg-background-100 text-foreground-500';
  return valor >= 0 === subirEsBueno ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600';
}

// Variación frente al periodo anterior, en % y en euros: "+9 % · +156 €".
function DeltaChip({
  actual,
  anterior,
  subirEsBueno = true,
  comparadoCon,
  decimales = false,
}: {
  actual: number;
  anterior: number;
  subirEsBueno?: boolean;
  comparadoCon: string;
  decimales?: boolean;
}) {
  const valor = variacion(actual, anterior);
  if (valor === null) return null;
  const diff = actual - anterior;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1 text-[11px] text-foreground-400 min-w-0">
      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-medium tabular-nums flex-shrink-0 ${colorDelta(valor, subirEsBueno)}`}>
        <i className={valor >= 0 ? 'ri-arrow-right-up-line' : 'ri-arrow-right-down-line'}></i>
        {valor >= 0 ? '+' : ''}
        {formatPct(valor)}
      </span>
      <span className="tabular-nums text-foreground-600">
        {diff >= 0 ? '+' : '−'}
        {decimales ? formatEUR(Math.abs(diff)) : formatEURRedondo(Math.abs(diff))}
      </span>
      <span>{comparadoCon}</span>
    </p>
  );
}

// Pastilla pequeña de variación para tablas y listas.
function DeltaMini({ actual, anterior }: { actual: number; anterior: number }) {
  const v = variacion(actual, anterior);
  if (v === null || actual === 0) return <span className="text-foreground-300">—</span>;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium tabular-nums ${colorDelta(v, true)}`}>
      {v >= 0 ? '+' : ''}
      {formatPct(v)}
    </span>
  );
}

function Kpi({
  icon,
  iconClass,
  titulo,
  valor,
  valorClass,
  className,
  children,
}: {
  icon: string;
  iconClass: string;
  titulo: string;
  valor: string;
  valorClass?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`bg-background-50 border border-background-200/70 rounded-2xl p-4 shadow-card min-w-0 ${className ?? ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-sm ${iconClass}`}>
          <i className={icon}></i>
        </span>
        <p className="text-xs text-foreground-500">{titulo}</p>
      </div>
      <p className={`text-xl sm:text-2xl font-semibold tabular-nums tracking-tight ${valorClass ?? 'text-foreground-950'}`}>{valor}</p>
      {children}
    </div>
  );
}

// Barra de reparto de ingresos entre tiendas, con leyenda debajo.
function RepartoTiendas({ totales, anterior }: { totales: Totales; anterior: Totales }) {
  const total = ORIGENES.reduce((n, o) => n + (totales.ingresos_por_tienda[o] ?? 0), 0);
  if (total <= 0) return null;
  return (
    <div className="mt-3">
      <div className="flex h-1.5 rounded-full overflow-hidden gap-[2px] bg-background-100">
        {ORIGENES.map((o) => {
          const v = totales.ingresos_por_tienda[o] ?? 0;
          if (v <= 0) return null;
          return <div key={o} className={ORIGEN_COLORS[o].dot} style={{ width: `${(v / total) * 100}%` }}></div>;
        })}
      </div>
      <div className="mt-2 space-y-0.5">
        {ORIGENES.map((o) => {
          const v = totales.ingresos_por_tienda[o] ?? 0;
          return (
            <p key={o} className="flex items-center gap-1.5 text-[11px] text-foreground-500">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ORIGEN_COLORS[o].dot}`}></span>
              <span className="truncate">{ORIGEN_LABELS[o]}</span>
              <span className="ml-auto tabular-nums text-foreground-800">{formatEUR(v)}</span>
              <span className="tabular-nums w-9 text-right">{formatPct((v / total) * 100)}</span>
              {(anterior.ingresos_por_tienda[o] ?? 0) > 0 && (
                <span className="w-12 text-right">
                  <DeltaMini actual={v} anterior={anterior.ingresos_por_tienda[o] ?? 0} />
                </span>
              )}
            </p>
          );
        })}
      </div>
    </div>
  );
}

function Destacado({ icon, iconClass, titulo, valor, detalle, onClick }: { icon: string; iconClass: string; titulo: string; valor: string; detalle: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="text-left flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 bg-background-50 border border-background-200/70 rounded-2xl px-3 sm:px-4 py-3 shadow-card enabled:hover:bg-background-100/60 transition-colors min-w-0"
    >
      <span className={`w-8 h-8 sm:w-9 sm:h-9 flex-shrink-0 flex items-center justify-center rounded-full ${iconClass}`}>
        <i className={icon}></i>
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-foreground-400 leading-tight">{titulo}</span>
        <span className="block text-sm font-semibold text-foreground-950 tabular-nums truncate">{valor}</span>
        <span className="block text-[11px] text-foreground-500 truncate">{detalle}</span>
      </span>
    </button>
  );
}

// Tabla "actual vs anterior" con diferencia en euros y en %, para leer de un
// vistazo en qué se gana o se pierde respecto al periodo con el que se compara.
function ComparativaCard({ actual, anterior, anteriorLabel, comparadoCon }: { actual: Agregado; anterior: Agregado; anteriorLabel: string; comparadoCon: string }) {
  const tm = (a: Agregado) => (a.tickets > 0 ? a.bascula / a.tickets : 0);
  const filas: { label: string; a: number; b: number; subirEsBueno?: boolean; dot?: string; entero?: boolean; decimales?: boolean; fuerte?: boolean }[] = [
    { label: 'Ingresos', a: actual.totales.ingresos, b: anterior.totales.ingresos, fuerte: true },
    ...ORIGENES.map((o) => ({
      label: ORIGEN_LABELS[o],
      a: actual.totales.ingresos_por_tienda[o] ?? 0,
      b: anterior.totales.ingresos_por_tienda[o] ?? 0,
      dot: ORIGEN_COLORS[o].dot,
    })),
    { label: 'Gastos', a: totalGastos(actual.totales), b: totalGastos(anterior.totales), subirEsBueno: false, fuerte: true },
    { label: 'Neto', a: totalNeto(actual.totales), b: totalNeto(anterior.totales), fuerte: true },
    { label: 'Tickets', a: actual.tickets, b: anterior.tickets, entero: true },
    { label: 'Ticket medio', a: tm(actual), b: tm(anterior), decimales: true },
  ];
  const fmt = (n: number, entero?: boolean) => (entero ? Math.round(n).toLocaleString('es-ES') : formatEUR(n));
  return (
    <div className="h-full bg-background-50 border border-background-200/70 rounded-2xl shadow-card overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <p className="text-sm font-medium text-foreground-950">Comparativa</p>
        <p className="text-[11px] text-foreground-400">{comparadoCon.replace(/^vs\. /, 'Frente a ')}</p>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-foreground-400 bg-background-100/50">
            <th className="pl-4 pr-2 py-1.5 text-left font-medium"></th>
            <th className="px-2 py-1.5 text-right font-medium">Ahora</th>
            <th className="px-2 py-1.5 text-right font-medium capitalize">{anteriorLabel}</th>
            <th className="pl-2 pr-4 py-1.5 text-right font-medium">Diferencia</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const diff = f.a - f.b;
            const v = variacion(f.a, f.b);
            return (
              <tr key={f.label} className="border-t border-background-200/50">
                <td className={`pl-4 pr-2 py-2 whitespace-nowrap ${f.fuerte ? 'font-medium text-foreground-950' : 'text-foreground-500'}`}>
                  <span className="inline-flex items-center gap-1.5">
                    {f.dot && <span className={`w-1.5 h-1.5 rounded-full ${f.dot}`}></span>}
                    {f.label}
                  </span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-foreground-950 whitespace-nowrap">{fmt(f.a, f.entero)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-foreground-400 whitespace-nowrap">{fmt(f.b, f.entero)}</td>
                <td className="pl-2 pr-4 py-2 text-right whitespace-nowrap">
                  <span className="inline-flex items-center justify-end gap-1.5">
                    <span className="tabular-nums text-foreground-600">
                      {diff >= 0 ? '+' : '−'}
                      {f.entero ? Math.abs(Math.round(diff)).toLocaleString('es-ES') : f.decimales ? formatEUR(Math.abs(diff)) : formatEURRedondo(Math.abs(diff))}
                    </span>
                    {v !== null && (
                      <span className={`w-14 inline-flex justify-center px-1.5 py-0.5 rounded-full text-[10px] font-medium tabular-nums ${colorDelta(v, f.subirEsBueno ?? true)}`}>
                        {v >= 0 ? '+' : ''}
                        {formatPct(v)}
                      </span>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function plural(dia: string): string {
  const d = dia.toLowerCase();
  return d.endsWith('s') ? d : `${d}s`;
}

// Un día de la semana cuenta como "de apertura normal" si hubo venta al
// menos 2 veces en la ventana y su media no es residual (un lunes con 10 €
// sueltos de un cobro puntual no puede ser "el día más flojo").
function esDiaNormal(d: PatronDia, max: number): boolean {
  return d.dias >= 2 && d.media >= max * 0.15;
}

// Ventas medias por día de la semana: ayuda a decidir cuánto género pedir
// cada día. Se basa en las últimas 12 semanas, no solo en el periodo visto.
// A ancho completo (sin tarjeta de comparativa al lado) añade un panel
// lateral con la previsión de mañana y los días extremos.
function PatronSemanalCard({ patron, completo }: { patron: PatronDia[]; completo: boolean }) {
  const conVenta = patron.filter((d) => d.dias > 0);
  if (conVenta.length === 0) return null;
  const max = Math.max(...conVenta.map((d) => d.media));
  const normales = conVenta.filter((d) => esDiaNormal(d, max));
  const mediaGeneral = normales.length ? normales.reduce((n, d) => n + d.media, 0) / normales.length : 0;
  const mejor = normales.reduce((m, d) => (d.media > m.media ? d : m), normales[0]);
  const peor = normales.reduce((m, d) => (d.media < m.media ? d : m), normales[0]);
  const hoyIdx = (new Date().getDay() + 6) % 7;
  const manana = patron[(hoyIdx + 1) % 7];
  const mananaNormal = esDiaNormal(manana, max);
  const totalTiendas = ORIGENES.map((o) => normales.reduce((n, d) => n + (d.porTienda[o] ?? 0), 0));
  const sumaTiendas = totalTiendas.reduce((a, b) => a + b, 0);

  const filas = (
    <div className="min-w-0">
      <div className="hidden sm:flex items-center gap-3 text-[10px] uppercase tracking-wide text-foreground-400 mb-1.5">
        <span className="w-24 flex-shrink-0"></span>
        <span className="flex-1"></span>
        <span className="w-20 text-right">Media/día</span>
        <span className="w-12 text-right">vs media</span>
        <span className="w-14 text-right">Tickets</span>
        <span className="w-16 text-right">Ticket m.</span>
      </div>
      <div className="space-y-1.5">
        {patron.map((d, i) => {
          const normal = esDiaNormal(d, max);
          const pct = mediaGeneral > 0 ? ((d.media - mediaGeneral) / mediaGeneral) * 100 : 0;
          return (
            <div key={d.label} className="flex items-center gap-3 text-xs">
              <span className={`w-20 sm:w-24 flex-shrink-0 ${i === hoyIdx ? 'font-semibold text-primary-500' : 'text-foreground-600'}`}>
                {d.label}
                {i === hoyIdx && <span className="ml-1 text-[10px] font-normal">(hoy)</span>}
              </span>
              <div className={`flex-1 h-5 rounded-md bg-background-100 overflow-hidden flex gap-[2px] ${d === mejor ? 'ring-2 ring-emerald-500/40' : ''}`}>
                {d.dias > 0 &&
                  ORIGENES.map((o) => {
                    const v = d.porTienda[o] ?? 0;
                    if (v <= 0) return null;
                    return (
                      <div
                        key={o}
                        title={`${ORIGEN_LABELS[o]}: ${formatEURRedondo(v)}`}
                        className={`h-full first:rounded-l-md last:rounded-r-md ${ORIGEN_COLORS[o].dot} ${normal ? '' : 'opacity-40'}`}
                        style={{ width: `${(v / max) * 100}%` }}
                      ></div>
                    );
                  })}
              </div>
              {d.dias === 0 ? (
                <span className="w-32 sm:w-[17.5rem] text-right text-[11px] text-foreground-300">Cerrado</span>
              ) : (
                <>
                  <span className={`w-20 text-right tabular-nums font-medium ${normal ? 'text-foreground-950' : 'text-foreground-400'}`}>{formatEURRedondo(d.media)}</span>
                  <span className={`w-12 text-right tabular-nums text-[11px] ${!normal ? 'text-foreground-300' : pct >= 0 ? 'text-emerald-700' : 'text-foreground-400'}`}>
                    {normal ? `${pct >= 0 ? '+' : ''}${formatPct(pct)}` : 'puntual'}
                  </span>
                  <span className="hidden sm:inline w-14 text-right tabular-nums text-foreground-600">{Math.round(d.tickets)}</span>
                  <span className="hidden sm:inline w-16 text-right tabular-nums text-foreground-600">{d.tickets > 0 ? formatEUR(d.media / d.tickets) : '—'}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-foreground-500">
        {ORIGENES.map((o, i) => (
          <span key={o} className="inline-flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${ORIGEN_COLORS[o].dot}`}></span>
            {ORIGEN_LABELS[o]}
            {sumaTiendas > 0 && <span className="tabular-nums text-foreground-400">{formatPct((totalTiendas[i] / sumaTiendas) * 100)}</span>}
          </span>
        ))}
      </div>
    </div>
  );

  const consejo =
    mejor && peor && mejor !== peor ? (
      <>
        Los <span className="font-medium text-foreground-950">{plural(mejor.label)}</span> se vende un{' '}
        <span className="font-medium text-emerald-700">{formatPct(((mejor.media - peor.media) / peor.media) * 100)} más</span> que los {plural(peor.label)} (unos{' '}
        {Math.round(mejor.tickets)} tickets frente a {Math.round(peor.tickets)}).
      </>
    ) : null;

  return (
    <div className="h-full bg-background-50 border border-background-200/70 rounded-2xl shadow-card p-4">
      <p className="text-sm font-medium text-foreground-950">Ventas por día de la semana</p>
      <p className="text-[11px] text-foreground-400 mb-3">Media de ingresos de las últimas 12 semanas · para planificar el género</p>
      {completo ? (
        <div className="grid lg:grid-cols-[1fr_300px] gap-5">
          {filas}
          <div className="grid sm:grid-cols-3 lg:grid-cols-1 gap-2 content-start lg:border-l lg:border-background-200/70 lg:pl-5">
            <div className="rounded-xl bg-primary-500/[0.05] border border-primary-500/10 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] text-foreground-500">
                <i className="ri-calendar-event-line text-primary-500"></i>
                Mañana, {manana.label.toLowerCase()}
              </p>
              {manana.dias === 0 ? (
                <p className="text-sm font-semibold text-foreground-400 mt-0.5">Normalmente cerrado</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-foreground-950 tabular-nums mt-0.5">≈ {formatEURRedondo(manana.media)}</p>
                  <p className="text-[11px] text-foreground-500">
                    unos {Math.round(manana.tickets)} tickets
                    {mananaNormal && mediaGeneral > 0 && (
                      <>
                        {' · '}
                        <span className={manana.media >= mediaGeneral ? 'text-emerald-700' : 'text-foreground-500'}>
                          {manana.media >= mediaGeneral ? 'por encima' : 'por debajo'} de la media
                        </span>
                      </>
                    )}
                  </p>
                </>
              )}
            </div>
            {mejor && (
              <div className="rounded-xl bg-background-100/60 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[11px] text-foreground-500">
                  <i className="ri-trophy-line text-emerald-600"></i>
                  Día más fuerte
                </p>
                <p className="text-sm font-semibold text-foreground-950 mt-0.5">
                  {mejor.label} · <span className="tabular-nums">{formatEURRedondo(mejor.media)}</span>
                </p>
                <p className="text-[11px] text-foreground-500">prepara más género la víspera</p>
              </div>
            )}
            {peor && peor !== mejor && (
              <div className="rounded-xl bg-background-100/60 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[11px] text-foreground-500">
                  <i className="ri-arrow-down-circle-line text-amber-600"></i>
                  Día más flojo
                </p>
                <p className="text-sm font-semibold text-foreground-950 mt-0.5">
                  {peor.label} · <span className="tabular-nums">{formatEURRedondo(peor.media)}</span>
                </p>
                <p className="text-[11px] text-foreground-500">buen día para ofertas o menos pedido</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        filas
      )}
      {consejo && (
        <p className="mt-3 pt-3 border-t border-background-200/70 text-[11px] text-foreground-500 leading-relaxed">
          <i className="ri-lightbulb-flash-line text-amber-500 mr-1"></i>
          {consejo}
        </p>
      )}
    </div>
  );
}

type ColOrden = 'periodo' | Origen | 'ingresos' | 'gasto_factura' | 'gasto_extra' | 'neto';

function valorOrden(f: FilaPeriodo, col: ColOrden, i: number): number {
  switch (col) {
    case 'periodo':
      return i;
    case 'ingresos':
      return f.totales.ingresos;
    case 'gasto_factura':
      return f.totales.gasto_factura;
    case 'gasto_extra':
      return f.totales.gasto_extra;
    case 'neto':
      return totalNeto(f.totales);
    default:
      return f.totales.ingresos_por_tienda[col] ?? 0;
  }
}

function Th({
  col,
  orden,
  onOrdenar,
  alinear = 'right',
  children,
}: {
  col: ColOrden;
  orden: { col: ColOrden; desc: boolean };
  onOrdenar: (col: ColOrden) => void;
  alinear?: 'left' | 'right';
  children: React.ReactNode;
}) {
  const activo = orden.col === col;
  const icono = <i className={`text-xs ${activo ? (orden.desc ? 'ri-arrow-down-s-fill' : 'ri-arrow-up-s-fill') : 'ri-expand-up-down-fill opacity-30'}`}></i>;
  return (
    <th className={`px-3 first:pl-4 py-2 font-medium ${alinear === 'left' ? 'text-left' : 'text-right'}`} aria-sort={activo ? (orden.desc ? 'descending' : 'ascending') : 'none'}>
      <button
        type="button"
        onClick={() => onOrdenar(col)}
        className={`inline-flex items-center gap-1.5 uppercase tracking-wide hover:text-foreground-950 transition-colors ${activo ? 'text-foreground-950' : ''}`}
      >
        {alinear === 'right' && icono}
        {children}
        {alinear === 'left' && icono}
      </button>
    </th>
  );
}

function Importe({ valor, clase }: { valor: number; clase: string }) {
  if (Math.abs(valor) < 0.005) return <span className="text-foreground-300">—</span>;
  return <span className={clase}>{formatEUR(valor)}</span>;
}

async function exportarExcel(titulo: string, nombreArchivo: string, filas: FilaPeriodo[], total: Agregado, unidadLabel: string) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Pescados y Mariscos Arrantza';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Resumen');
  const cabecera = [unidadLabel, ...ORIGENES.map((o) => ORIGEN_LABELS[o]), 'Ingresos', 'Facturas', 'Gastos extra', 'Neto', 'Tickets'];
  sheet.columns = cabecera.map((_, i) => ({ width: i === 0 ? 18 : 15 }));

  const tituloRow = sheet.addRow([titulo]);
  tituloRow.font = { bold: true, size: 13 };
  sheet.mergeCells(tituloRow.number, 1, tituloRow.number, cabecera.length);
  sheet.addRow([]);

  const headerRow = sheet.addRow(cabecera);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF182B38' } };
  });
  sheet.views = [{ state: 'frozen', ySplit: headerRow.number }];

  const fila = (label: string, t: Totales, tickets: number, negrita = false) => {
    const row = sheet.addRow([
      label,
      ...ORIGENES.map((o) => t.ingresos_por_tienda[o] ?? 0),
      t.ingresos,
      t.gasto_factura,
      t.gasto_extra,
      totalNeto(t),
      tickets,
    ]);
    for (let c = 2; c <= cabecera.length - 1; c++) row.getCell(c).numFmt = '#,##0.00 "€"';
    const neto = row.getCell(cabecera.length - 1);
    neto.font = { bold: negrita, color: { argb: totalNeto(t) >= 0 ? 'FF047857' : 'FFDC2626' } };
    if (negrita) row.font = { bold: true };
  };
  filas.filter((f) => !f.futuro).forEach((f) => fila(f.label, f.totales, f.tickets));
  fila('Total', total.totales, total.tickets, true);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombreArchivo}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CajaResumenPeriodo({
  titulo,
  subtitulo,
  onAnterior,
  onSiguiente,
  onIrAActual,
  actualLabel,
  filas,
  anterior,
  comparadoCon,
  unidad,
  totalLabel,
  nombreArchivo,
  ocultarVaciosInicial = false,
  filasAnteriores,
  anteriorLabel,
  comparaFilaLabel,
  patronSemanal,
  onFilaClick,
}: {
  titulo: string;
  subtitulo?: string;
  onAnterior: () => void;
  onSiguiente: () => void;
  // undefined cuando ya se está viendo el periodo actual.
  onIrAActual?: () => void;
  actualLabel: string;
  filas: FilaPeriodo[];
  anterior: Agregado;
  comparadoCon: string;
  unidad: 'día' | 'mes';
  totalLabel: string;
  nombreArchivo: string;
  ocultarVaciosInicial?: boolean;
  // Periodo anterior completo (para el acumulado y el objetivo de cierre).
  filasAnteriores: FilaPeriodo[];
  anteriorLabel: string;
  // Cabecera de la columna que compara cada fila con su referencia.
  comparaFilaLabel: string;
  patronSemanal: PatronDia[];
  onFilaClick: (key: string) => void;
}) {
  const [ocultarVacios, setOcultarVacios] = useState(ocultarVaciosInicial);
  const [exportando, setExportando] = useState(false);
  const [orden, setOrden] = useState<{ col: ColOrden; desc: boolean }>({ col: 'periodo', desc: false });
  const ordenar = (col: ColOrden) =>
    setOrden((o) => (o.col === col ? { col, desc: !o.desc } : { col, desc: col !== 'periodo' }));

  const total = useMemo(() => agregar(filas), [filas]);
  const gastos = totalGastos(total.totales);
  const neto = totalNeto(total.totales);
  const margen = total.totales.ingresos > 0 ? (neto / total.totales.ingresos) * 100 : null;
  const ticketMedio = total.tickets > 0 ? total.bascula / total.tickets : 0;
  const ticketMedioAnterior = anterior.tickets > 0 ? anterior.bascula / anterior.tickets : 0;

  const conVenta = filas.filter((f) => !f.futuro && f.totales.ingresos > 0);
  const mejor = conVenta.reduce<FilaPeriodo | null>((m, f) => (!m || f.totales.ingresos > m.totales.ingresos ? f : m), null);
  // Para el más flojo y la media se descartan los días/meses con una venta
  // residual (p.ej. el mes en que se empezó a usar la báscula, con 10 €),
  // que si no se llevarían el "más flojo" y hundirían la media.
  const maxVenta = mejor?.totales.ingresos ?? 0;
  const significativas = conVenta.filter((f) => f.totales.ingresos >= maxVenta * 0.15);
  const peor =
    significativas.length > 1 ? significativas.reduce<FilaPeriodo | null>((m, f) => (!m || f.totales.ingresos < m.totales.ingresos ? f : m), null) : null;
  const media = significativas.length ? significativas.reduce((n, f) => n + f.totales.ingresos, 0) / significativas.length : 0;

  // Previsión de ingresos al cierre de un periodo en curso (solo por días):
  // media de los días ya cerrados con venta × proporción de días que se
  // abre × días que faltan. Hoy cuenta como pendiente mientras vaya por
  // debajo de lo esperado para un día normal.
  const anteriorCompleto = useMemo(() => agregar(filasAnteriores.filter((f) => !f.futuro)), [filasAnteriores]);

  // También calcula cuánto habría que vender de media en cada día de
  // apertura que queda para igualar el periodo anterior completo.
  const prevision = useMemo(() => {
    if (unidad !== 'día') return null;
    const futuras = filas.filter((f) => f.futuro).length;
    const cerradas = filas.filter((f) => !f.futuro && !f.esActual);
    const cerradasConVenta = cerradas.filter((f) => f.totales.ingresos > 0);
    if (futuras === 0 || cerradasConVenta.length < 2) return null;
    const ratioApertura = cerradasConVenta.length / cerradas.length;
    const esperadoDia = (cerradasConVenta.reduce((n, f) => n + f.totales.ingresos, 0) / cerradasConVenta.length) * ratioApertura;
    const hoy = filas.find((f) => f.esActual)?.totales.ingresos ?? 0;
    const valor = total.totales.ingresos + esperadoDia * futuras + Math.max(0, esperadoDia - hoy);
    const diasApertura = Math.max(1, Math.round((futuras + (filas.some((f) => f.esActual) ? 1 : 0)) * ratioApertura));
    const falta = anteriorCompleto.totales.ingresos - total.totales.ingresos;
    return { valor, diasApertura, porDiaParaIgualar: falta > 0 ? falta / diasApertura : null };
  }, [filas, unidad, total, anteriorCompleto]);

  const maxIngresos = Math.max(1, ...filas.map((f) => f.totales.ingresos));

  const vacia = (f: FilaPeriodo) => f.totales.ingresos === 0 && totalGastos(f.totales) === 0;
  const filasTabla = useMemo(() => {
    const base = filas.map((f, i) => ({ f, i })).filter(({ f }) => !ocultarVacios || !vacia(f));
    base.sort((a, b) => {
      const d = valorOrden(a.f, orden.col, a.i) - valorOrden(b.f, orden.col, b.i);
      return orden.desc ? -d : d;
    });
    return base.map(({ f }) => f);
  }, [filas, ocultarVacios, orden]);
  const hayVacias = filas.some(vacia);
  const hayComparativa = anterior.totales.ingresos > 0 || totalGastos(anterior.totales) > 0;
  const sinDatos = filas.every(vacia);
  const unidadPlural = unidad === 'día' ? 'días' : 'meses';

  const exportar = async () => {
    setExportando(true);
    try {
      await exportarExcel(titulo, nombreArchivo, filas, total, unidad === 'día' ? 'Día' : 'Mes');
    } catch {
      alert('No se pudo generar el Excel. Inténtalo de nuevo.');
    } finally {
      setExportando(false);
    }
  };

  const flecha = 'w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-background-50 border border-background-200/70 text-foreground-600 hover:bg-background-200/70 transition-colors';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onAnterior} className={flecha} aria-label="Periodo anterior">
          <i className="ri-arrow-left-s-line text-lg"></i>
        </button>
        <div className="min-w-0 px-1 text-center sm:text-left">
          <p className="text-base font-heading font-semibold text-foreground-950 leading-tight">{titulo}</p>
          {subtitulo && <p className="text-[11px] text-foreground-400">{subtitulo}</p>}
        </div>
        <button type="button" onClick={onSiguiente} className={flecha} aria-label="Periodo siguiente">
          <i className="ri-arrow-right-s-line text-lg"></i>
        </button>
        {onIrAActual && (
          <button
            type="button"
            onClick={onIrAActual}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-primary-500/10 text-primary-500 hover:bg-primary-500/15"
          >
            <i className="ri-calendar-check-line"></i>
            {actualLabel}
          </button>
        )}
        {!sinDatos && (
          <button
            type="button"
            onClick={exportar}
            disabled={exportando}
            className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-background-50 border border-background-200/70 text-foreground-500 hover:bg-background-200/70 hover:text-foreground-950 disabled:opacity-50"
          >
            <i className={exportando ? 'ri-loader-4-line animate-spin' : 'ri-file-excel-2-line'}></i>
            {exportando ? 'Generando…' : 'Excel'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi className="col-span-2 lg:col-span-1" icon="ri-arrow-up-line" iconClass="bg-emerald-50 text-emerald-600" titulo="Ingresos" valor={formatEUR(total.totales.ingresos)}>
          <DeltaChip actual={total.totales.ingresos} anterior={anterior.totales.ingresos} comparadoCon={comparadoCon} />
          {prevision !== null && (
            <div className="mt-2 px-2.5 py-2 rounded-xl bg-primary-500/[0.05] border border-primary-500/10 text-[11px] text-foreground-500 space-y-0.5">
              <p className="flex items-center gap-1.5" title="Estimación con la media de los días ya cerrados">
                <i className="ri-sparkling-line text-primary-500"></i>
                Previsión al cierre
                <span className="ml-auto font-semibold tabular-nums text-foreground-950">≈ {formatEURRedondo(prevision.valor)}</span>
              </p>
              {anteriorCompleto.totales.ingresos > 0 && (
                <p className="flex items-center gap-1.5 pl-[18px]">
                  vs {anteriorLabel} completo ({formatEURRedondo(anteriorCompleto.totales.ingresos)})
                  <span className="ml-auto">
                    <DeltaMini actual={prevision.valor} anterior={anteriorCompleto.totales.ingresos} />
                  </span>
                </p>
              )}
              {prevision.porDiaParaIgualar !== null && (
                <p className="flex items-center gap-1.5 pl-[18px]">
                  Para igualarlo: {formatEURRedondo(prevision.porDiaParaIgualar)}/día
                  <span className="ml-auto text-foreground-400">
                    {prevision.diasApertura} {prevision.diasApertura === 1 ? 'día' : 'días'} de apertura
                  </span>
                </p>
              )}
            </div>
          )}
          <RepartoTiendas totales={total.totales} anterior={anterior.totales} />
        </Kpi>
        <Kpi icon="ri-arrow-down-line" iconClass="bg-red-50 text-red-500" titulo="Gastos" valor={formatEUR(gastos)}>
          <DeltaChip actual={gastos} anterior={totalGastos(anterior.totales)} subirEsBueno={false} comparadoCon={comparadoCon} />
          <div className="mt-3 space-y-0.5">
            <p className="flex items-center gap-1.5 text-[11px] text-foreground-500">
              <i className="ri-file-list-3-line"></i>Facturas
              <span className="ml-auto tabular-nums text-foreground-800">{formatEUR(total.totales.gasto_factura)}</span>
            </p>
            <p className="flex items-center gap-1.5 text-[11px] text-foreground-500">
              <i className="ri-receipt-line"></i>Gastos extra
              <span className="ml-auto tabular-nums text-foreground-800">{formatEUR(total.totales.gasto_extra)}</span>
            </p>
          </div>
        </Kpi>
        <Kpi
          icon="ri-scales-3-line"
          iconClass={neto >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}
          titulo="Neto"
          valor={formatEUR(neto)}
          valorClass={neto >= 0 ? 'text-emerald-700' : 'text-red-600'}
        >
          <DeltaChip actual={neto} anterior={totalNeto(anterior.totales)} comparadoCon={comparadoCon} />
          {margen !== null && (
            <div className="mt-3">
              <p className="flex items-center gap-2 text-[11px] text-foreground-500 mb-1 whitespace-nowrap">
                Margen
                <span className="ml-auto tabular-nums text-foreground-800">{formatPct(margen)}</span>
              </p>
              <div className="h-1.5 rounded-full bg-background-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${margen >= 0 ? 'bg-emerald-500' : 'bg-red-400'}`}
                  style={{ width: `${Math.min(100, Math.abs(margen))}%` }}
                ></div>
              </div>
            </div>
          )}
        </Kpi>
        <Kpi className="col-span-2 lg:col-span-1" icon="ri-coupon-3-line" iconClass="bg-background-100 text-foreground-500" titulo="Ticket medio" valor={formatEUR(ticketMedio)}>
          <DeltaChip actual={ticketMedio} anterior={ticketMedioAnterior} comparadoCon={comparadoCon} decimales />
          <p className="mt-3 text-[11px] text-foreground-500">
            <span className="tabular-nums text-foreground-800">{total.tickets.toLocaleString('es-ES')}</span> tickets de báscula
            {conVenta.length > 0 && (
              <>
                {' · '}
                <span className="tabular-nums text-foreground-800">{Math.round(total.tickets / conVenta.length)}</span> por {unidad}
              </>
            )}
          </p>
        </Kpi>
      </div>

      {sinDatos ? (
        <div className="flex flex-col items-center text-center bg-background-50 border border-background-200/70 rounded-2xl px-4 py-12 shadow-card">
          <span className="w-12 h-12 flex items-center justify-center rounded-full bg-background-100 text-foreground-400 text-xl mb-2">
            <i className="ri-bar-chart-2-line"></i>
          </span>
          <p className="text-sm text-foreground-800">Sin movimientos en este periodo</p>
          <p className="text-xs text-foreground-400 mt-0.5">Usa las flechas para moverte a otro periodo.</p>
        </div>
      ) : (
        <>
          <CajaGraficoPeriodo filas={filas} filasAnteriores={filasAnteriores} anteriorLabel={anteriorLabel} unidad={unidad} onFilaClick={onFilaClick} />

          {mejor && (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <Destacado
                icon="ri-trophy-line"
                iconClass="bg-emerald-50 text-emerald-600"
                titulo={`Mejor ${unidad}`}
                valor={formatEUR(mejor.totales.ingresos)}
                detalle={mejor.label}
                onClick={() => onFilaClick(mejor.key)}
              />
              <Destacado
                icon="ri-arrow-down-circle-line"
                iconClass="bg-amber-50 text-amber-600"
                titulo={`${unidad === 'día' ? 'Día' : 'Mes'} más flojo`}
                valor={peor ? formatEUR(peor.totales.ingresos) : '—'}
                detalle={peor?.label ?? ''}
                onClick={peor ? () => onFilaClick(peor.key) : undefined}
              />
              <Destacado
                icon="ri-line-chart-line"
                iconClass="bg-background-100 text-foreground-500"
                titulo={`Media por ${unidad} con venta`}
                valor={formatEUR(media)}
                detalle={`${significativas.length} ${significativas.length === 1 ? unidad : unidadPlural} con venta`}
              />
            </div>
          )}

          <div className={`grid gap-3 ${hayComparativa ? 'lg:grid-cols-2' : ''}`}>
            {hayComparativa && <ComparativaCard actual={total} anterior={anterior} anteriorLabel={anteriorLabel} comparadoCon={comparadoCon} />}
            <PatronSemanalCard patron={patronSemanal} completo={!hayComparativa} />
          </div>

          <div className="bg-background-50 border border-background-200/70 rounded-2xl overflow-hidden shadow-card">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-background-200/70">
              <p className="text-sm font-medium text-foreground-950">Detalle por {unidad}</p>
              <select
                value={`${orden.col}|${orden.desc ? 'desc' : 'asc'}`}
                onChange={(e) => {
                  const [col, dir] = e.target.value.split('|');
                  setOrden({ col: col as ColOrden, desc: dir === 'desc' });
                }}
                className="md:hidden h-7 pl-2 pr-6 rounded-full bg-background-100 border border-background-200/70 text-[11px] text-foreground-600"
                aria-label="Ordenar"
              >
                <option value="periodo|asc">Por fecha</option>
                <option value="ingresos|desc">Más ingresos</option>
                <option value="neto|desc">Más neto</option>
                <option value="neto|asc">Menos neto</option>
              </select>
              {hayVacias && (
                <label className="ml-auto inline-flex items-center gap-2 text-[11px] text-foreground-500 cursor-pointer select-none">
                  <input type="checkbox" checked={ocultarVacios} onChange={(e) => setOcultarVacios(e.target.checked)} className="accent-primary-500" />
                  Ocultar {unidadPlural} sin movimientos
                </label>
              )}
            </div>

            {/* Escritorio: tabla completa */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-foreground-400 bg-background-100/50">
                    <Th col="periodo" orden={orden} onOrdenar={ordenar} alinear="left">
                      {unidad === 'día' ? 'Día' : 'Mes'}
                    </Th>
                    {ORIGENES.map((o) => (
                      <Th key={o} col={o} orden={orden} onOrdenar={ordenar}>
                        <span className={`w-1.5 h-1.5 rounded-full ${ORIGEN_COLORS[o].dot}`}></span>
                        {ORIGEN_LABELS[o]}
                      </Th>
                    ))}
                    <Th col="ingresos" orden={orden} onOrdenar={ordenar}>Ingresos</Th>
                    <Th col="gasto_factura" orden={orden} onOrdenar={ordenar}>Facturas</Th>
                    <Th col="gasto_extra" orden={orden} onOrdenar={ordenar}>Gastos extra</Th>
                    <Th col="neto" orden={orden} onOrdenar={ordenar}>Neto</Th>
                    <th className="px-3 py-2 text-right font-medium normal-case whitespace-nowrap">{comparaFilaLabel}</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filasTabla.map((f) => {
                    const n = totalNeto(f.totales);
                    return (
                      <tr
                        key={f.key}
                        onClick={f.futuro ? undefined : () => onFilaClick(f.key)}
                        className={`group border-t border-background-200/50 ${f.futuro ? 'opacity-40' : 'cursor-pointer hover:bg-background-100/60'} ${
                          f.esActual ? 'bg-primary-500/[0.04]' : ''
                        }`}
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap text-foreground-950">
                          <span className="inline-flex items-center gap-2">
                            {f.label}
                            {f.esActual && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary-500 text-background-50">
                                {unidad === 'día' ? 'Hoy' : 'Actual'}
                              </span>
                            )}
                            {mejor?.key === f.key && conVenta.length > 1 && <i className="ri-trophy-line text-emerald-600" title={`Mejor ${unidad}`}></i>}
                          </span>
                        </td>
                        {ORIGENES.map((o) => (
                          <td key={o} className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                            <Importe valor={f.totales.ingresos_por_tienda[o] ?? 0} clase="text-foreground-800" />
                          </td>
                        ))}
                        <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums font-medium">
                          <Importe valor={f.totales.ingresos} clase="text-emerald-700" />
                          {f.totales.ingresos > 0 && (
                            <div className="ml-auto mt-1 w-20 h-1 rounded-full bg-background-100 overflow-hidden">
                              <div className="ml-auto h-full rounded-full bg-emerald-500/70" style={{ width: `${(f.totales.ingresos / maxIngresos) * 100}%` }}></div>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                          <Importe valor={f.totales.gasto_factura} clase="text-red-600" />
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                          <Importe valor={f.totales.gasto_extra} clase="text-red-600" />
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums font-semibold">
                          <Importe valor={n} clase={n >= 0 ? 'text-emerald-700' : 'text-red-600'} />
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap" title={f.anterior ? `${f.anterior.label}: ${formatEUR(f.anterior.totales.ingresos)}` : undefined}>
                          {f.anterior && !f.futuro ? <DeltaMini actual={f.totales.ingresos} anterior={f.anterior.totales.ingresos} /> : null}
                        </td>
                        <td className="pr-3 text-foreground-300 group-hover:text-foreground-500">
                          {!f.futuro && <i className="ri-arrow-right-s-line"></i>}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-background-200 bg-background-100/50 font-semibold">
                    <td className="px-4 py-3 text-foreground-950">{totalLabel}</td>
                    {ORIGENES.map((o) => (
                      <td key={o} className="px-3 py-3 text-right tabular-nums text-foreground-950">{formatEUR(total.totales.ingresos_por_tienda[o] ?? 0)}</td>
                    ))}
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{formatEUR(total.totales.ingresos)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-red-600">{formatEUR(total.totales.gasto_factura)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-red-600">{formatEUR(total.totales.gasto_extra)}</td>
                    <td className={`px-3 py-3 text-right tabular-nums ${neto >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatEUR(neto)}</td>
                    <td className="px-3 py-3 text-right" title={`${comparadoCon}`}>
                      <DeltaMini actual={total.totales.ingresos} anterior={anterior.totales.ingresos} />
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Móvil: una tarjeta por fila */}
            <div className="md:hidden divide-y divide-background-200/50">
              {filasTabla.map((f) => {
                const n = totalNeto(f.totales);
                const g = totalGastos(f.totales);
                return (
                  <button
                    key={f.key}
                    type="button"
                    disabled={f.futuro}
                    onClick={() => onFilaClick(f.key)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 ${f.futuro ? 'opacity-40' : 'active:bg-background-100/60'} ${
                      f.esActual ? 'bg-primary-500/[0.04]' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm text-foreground-950">
                        {f.label}
                        {f.anterior && !f.futuro && f.totales.ingresos > 0 && <DeltaMini actual={f.totales.ingresos} anterior={f.anterior.totales.ingresos} />}
                        {f.esActual && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary-500 text-background-50">
                            {unidad === 'día' ? 'Hoy' : 'Actual'}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-foreground-400 tabular-nums mt-0.5">
                        {f.futuro ? (
                          'Próximamente'
                        ) : vacia(f) ? (
                          'Sin movimientos'
                        ) : (
                          <>
                            <span className="text-emerald-700">+{formatEUR(f.totales.ingresos)}</span>
                            {' · '}
                            <span className="text-red-600">−{formatEUR(g)}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <span className={`text-sm font-semibold tabular-nums ${Math.abs(n) < 0.005 ? 'text-foreground-300' : n >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {Math.abs(n) < 0.005 ? '—' : formatEUR(n)}
                    </span>
                    {!f.futuro && <i className="ri-arrow-right-s-line text-foreground-300"></i>}
                  </button>
                );
              })}
              <div className="px-4 py-3 flex items-center gap-3 bg-background-100/50">
                <p className="flex-1 text-sm font-semibold text-foreground-950">{totalLabel}</p>
                <span className={`text-sm font-semibold tabular-nums ${neto >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatEUR(neto)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
