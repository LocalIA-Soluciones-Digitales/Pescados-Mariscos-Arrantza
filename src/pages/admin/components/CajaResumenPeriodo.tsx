import { useMemo, useState } from 'react';
import { ORIGENES, ORIGEN_COLORS, ORIGEN_LABELS } from '@/types/origen';
import { agregar, totalGastos, totalNeto, type Agregado, type FilaPeriodo, type Totales } from './cajaTotales';

// Resumen compartido por las vistas Semana, Mes y Año de Contabilidad:
// cabecera con navegación entre periodos, indicadores con comparativa
// frente al periodo anterior, gráfico de barras (ingresos por tienda
// apilados junto a los gastos), días/meses destacados y tabla de detalle
// exportable a Excel. Cada vista solo decide qué filas forman el periodo.

function formatEUR(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function formatEURCompacto(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k €`;
  return `${Math.round(n)} €`;
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

function DeltaChip({ valor, subirEsBueno, comparadoCon }: { valor: number | null; subirEsBueno: boolean; comparadoCon: string }) {
  if (valor === null) return <p className="text-[11px] text-foreground-400 mt-1">Sin datos para comparar</p>;
  const sube = valor >= 0;
  const bueno = Math.abs(valor) < 0.5 ? null : sube === subirEsBueno;
  const color = bueno === null ? 'bg-background-100 text-foreground-500' : bueno ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600';
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1 text-[11px] text-foreground-400 min-w-0">
      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-medium tabular-nums flex-shrink-0 ${color}`}>
        <i className={sube ? 'ri-arrow-right-up-line' : 'ri-arrow-right-down-line'}></i>
        {sube ? '+' : ''}
        {formatPct(valor)}
      </span>
      <span>{comparadoCon}</span>
    </p>
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
function RepartoTiendas({ totales }: { totales: Totales }) {
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
            </p>
          );
        })}
      </div>
    </div>
  );
}

// Gráfico de barras: por cada día/mes, ingresos apilados por tienda y, al
// lado, los gastos. Una sola escala en euros. Al pasar por encima se ve el
// desglose; al pulsar se entra en ese día/mes.
function GraficoPeriodo({
  filas,
  unidad,
  onFilaClick,
}: {
  filas: FilaPeriodo[];
  unidad: 'día' | 'mes';
  onFilaClick: (key: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...filas.map((f) => Math.max(f.totales.ingresos, totalGastos(f.totales))));
  const conVenta = filas.filter((f) => !f.futuro && f.totales.ingresos > 0);
  const media = conVenta.length ? conVenta.reduce((n, f) => n + f.totales.ingresos, 0) / conVenta.length : 0;
  const marcas = [max, max / 2];
  const densa = filas.length > 12;
  const f = hover !== null ? filas[hover] : null;

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-2xl p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
        <p className="w-full sm:w-auto text-sm font-medium text-foreground-950 sm:mr-auto">Ingresos y gastos por {unidad}</p>
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
        {media > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground-500">
            <span className="w-3 border-t border-dashed border-foreground-400"></span>
            Media de ingresos
          </span>
        )}
      </div>

      <div className="overflow-x-auto scrollbar-hide -mx-1 px-1 pt-2">
        <div className={`relative ${densa ? 'min-w-[620px]' : ''}`}>
          <div className="relative h-44 ml-10">
            {marcas.map((v) => (
              <div key={v} className="absolute inset-x-0 border-t border-background-200/70" style={{ bottom: `${(v / max) * 100}%` }}>
                <span className="absolute -left-10 -translate-y-1/2 w-9 text-right text-[10px] text-foreground-400 tabular-nums">{formatEURCompacto(v)}</span>
              </div>
            ))}
            {media > 0 && (
              <div className="absolute inset-x-0 border-t border-dashed border-foreground-400/70 z-[1] pointer-events-none" style={{ bottom: `${(media / max) * 100}%` }}></div>
            )}
            <div className="absolute inset-0 flex items-end border-b border-background-300">
              {filas.map((fila, i) => {
                const gastos = totalGastos(fila.totales);
                const activo = hover === i;
                return (
                  <button
                    key={fila.key}
                    type="button"
                    disabled={fila.futuro}
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    onClick={() => onFilaClick(fila.key)}
                    aria-label={`${fila.label}: ingresos ${formatEUR(fila.totales.ingresos)}, gastos ${formatEUR(gastos)}`}
                    className={`relative flex-1 h-full flex items-end justify-center gap-[2px] rounded-t-md transition-colors ${
                      activo ? 'bg-background-100' : ''
                    } ${fila.futuro ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <div className="flex flex-col-reverse gap-[2px] w-[38%] max-w-[22px]" style={{ height: `${(fila.totales.ingresos / max) * 100}%` }}>
                      {ORIGENES.map((o) => {
                        const v = fila.totales.ingresos_por_tienda[o] ?? 0;
                        if (v <= 0 || fila.totales.ingresos <= 0) return null;
                        return <div key={o} className={`${ORIGEN_COLORS[o].dot} first:rounded-b-[2px] last:rounded-t-[4px] min-h-[2px]`} style={{ flexGrow: v }}></div>;
                      })}
                    </div>
                    <div
                      className="w-[30%] max-w-[16px] bg-red-400 rounded-t-[4px]"
                      style={{ height: gastos > 0 ? `max(2px, ${(gastos / max) * 100}%)` : 0 }}
                    ></div>
                  </button>
                );
              })}
            </div>

            {f && (
              <div
                className="absolute z-10 top-1 pointer-events-none w-52 -translate-x-1/2"
                style={{ left: `clamp(104px, ${((hover! + 0.5) / filas.length) * 100}%, calc(100% - 104px))` }}
              >
                <div className="bg-foreground-950 text-background-50 rounded-xl px-3 py-2.5 shadow-xl text-[11px]">
                  <p className="font-medium text-xs mb-1.5">{f.label}</p>
                  {ORIGENES.map((o) => (
                    <p key={o} className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${ORIGEN_COLORS[o].dot}`}></span>
                      <span className="opacity-80">{ORIGEN_LABELS[o]}</span>
                      <span className="ml-auto tabular-nums">{formatEUR(f.totales.ingresos_por_tienda[o] ?? 0)}</span>
                    </p>
                  ))}
                  <p className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                    <span className="opacity-80">Gastos</span>
                    <span className="ml-auto tabular-nums">{formatEUR(totalGastos(f.totales))}</span>
                  </p>
                  <p className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-background-50/20 font-medium">
                    Neto
                    <span className={`ml-auto tabular-nums ${totalNeto(f.totales) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {formatEUR(totalNeto(f.totales))}
                    </span>
                  </p>
                  {f.tickets > 0 && <p className="opacity-60 mt-1">{f.tickets} tickets de báscula</p>}
                </div>
              </div>
            )}
          </div>

          <div className="flex ml-10 mt-1.5">
            {filas.map((fila, i) => (
              <span
                key={fila.key}
                className={`flex-1 text-center text-[10px] tabular-nums truncate ${
                  fila.esActual ? 'font-semibold text-primary-500' : hover === i ? 'text-foreground-950' : 'text-foreground-400'
                }`}
              >
                {densa && i % 2 === 1 && !fila.esActual && hover !== i ? '' : fila.labelCorto}
              </span>
            ))}
          </div>
        </div>
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
  onFilaClick: (key: string) => void;
}) {
  const [ocultarVacios, setOcultarVacios] = useState(ocultarVaciosInicial);
  const [exportando, setExportando] = useState(false);

  const total = useMemo(() => agregar(filas), [filas]);
  const gastos = totalGastos(total.totales);
  const neto = totalNeto(total.totales);
  const margen = total.totales.ingresos > 0 ? (neto / total.totales.ingresos) * 100 : null;
  const ticketMedio = total.tickets > 0 ? total.bascula / total.tickets : 0;
  const ticketMedioAnterior = anterior.tickets > 0 ? anterior.bascula / anterior.tickets : 0;

  const conVenta = filas.filter((f) => !f.futuro && f.totales.ingresos > 0);
  const mejor = conVenta.reduce<FilaPeriodo | null>((m, f) => (!m || f.totales.ingresos > m.totales.ingresos ? f : m), null);
  const peor = conVenta.reduce<FilaPeriodo | null>((m, f) => (!m || f.totales.ingresos < m.totales.ingresos ? f : m), null);
  const media = conVenta.length ? total.totales.ingresos / conVenta.length : 0;

  const vacia = (f: FilaPeriodo) => f.totales.ingresos === 0 && totalGastos(f.totales) === 0;
  const filasTabla = ocultarVacios ? filas.filter((f) => !vacia(f)) : filas;
  const hayVacias = filas.some(vacia);
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
          <DeltaChip valor={variacion(total.totales.ingresos, anterior.totales.ingresos)} subirEsBueno comparadoCon={comparadoCon} />
          <RepartoTiendas totales={total.totales} />
        </Kpi>
        <Kpi icon="ri-arrow-down-line" iconClass="bg-red-50 text-red-500" titulo="Gastos" valor={formatEUR(gastos)}>
          <DeltaChip valor={variacion(gastos, totalGastos(anterior.totales))} subirEsBueno={false} comparadoCon={comparadoCon} />
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
          <DeltaChip valor={variacion(neto, totalNeto(anterior.totales))} subirEsBueno comparadoCon={comparadoCon} />
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
          <DeltaChip valor={variacion(ticketMedio, ticketMedioAnterior)} subirEsBueno comparadoCon={comparadoCon} />
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
          <GraficoPeriodo filas={filas} unidad={unidad} onFilaClick={onFilaClick} />

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
                detalle={`${conVenta.length} ${conVenta.length === 1 ? unidad : unidadPlural} con venta`}
              />
            </div>
          )}

          <div className="bg-background-50 border border-background-200/70 rounded-2xl overflow-hidden shadow-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-background-200/70">
              <p className="text-sm font-medium text-foreground-950">Detalle por {unidad}</p>
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
                    <th className="px-4 py-2 text-left font-medium">{unidad === 'día' ? 'Día' : 'Mes'}</th>
                    {ORIGENES.map((o) => (
                      <th key={o} className="px-3 py-2 text-right font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${ORIGEN_COLORS[o].dot}`}></span>
                          {ORIGEN_LABELS[o]}
                        </span>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">Ingresos</th>
                    <th className="px-3 py-2 text-right font-medium">Facturas</th>
                    <th className="px-3 py-2 text-right font-medium">Gastos extra</th>
                    <th className="px-3 py-2 text-right font-medium">Neto</th>
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
