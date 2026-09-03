import { useEffect, useMemo, useState } from 'react';
import { useBasculaVentasDiarias, fetchBasculaVentasDelDia, fetchBasculaVentasResumenProductos } from '@/hooks/useBasculaVentas';
import type { BasculaVenta, BasculaVentaDiariaPorTienda, BasculaVentaResumenProducto } from '@/types/basculaVenta';
import { ORIGENES, ORIGEN_COLORS, ORIGEN_LABELS, type Origen } from '@/types/origen';
import OrigenBadge from '@/components/base/OrigenBadge';

type Filtro = 'todas' | Origen;
type Periodo = 'dia' | 'mes' | 'anio';

function formatFechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const texto = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function isoDeFecha(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatMesAnio(d: Date): string {
  const texto = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatPrecio(n: number): string {
  return `${n.toFixed(2)} €`;
}

function LineaVenta({ l, mostrarHora = true }: { l: BasculaVenta; mostrarHora?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs py-1.5">
      <div className="min-w-0 flex items-center gap-2">
        {mostrarHora && <span className="text-foreground-400 tabular-nums flex-shrink-0">{l.hora?.slice(0, 5) ?? '—'}</span>}
        <span className="text-foreground-800 truncate">{l.designacion}</span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-foreground-400 tabular-nums w-16 text-right">
          {l.cantidad} {l.unidad}
        </span>
        <span className="text-foreground-950 font-medium tabular-nums w-16 text-right">{formatPrecio(l.importe)}</span>
      </div>
    </div>
  );
}

// Un ticket = una cesta de la compra (varias líneas con el mismo
// ticket_tipo_doc/posto/numero). Se agrupan así en vez de en una lista
// plana para que se vea claramente dónde acaba una venta y empieza la
// siguiente.
type TicketGrupo = { key: string; hora: string | null; lineas: BasculaVenta[]; total: number };

function agruparPorTicket(lineasOrigen: BasculaVenta[]): TicketGrupo[] {
  const map = new Map<string, TicketGrupo>();
  lineasOrigen.forEach((l) => {
    const key = `${l.ticket_tipo_doc}-${l.ticket_posto}-${l.ticket_numero}`;
    const actual = map.get(key);
    if (actual) {
      actual.lineas.push(l);
      actual.total += l.importe;
    } else {
      map.set(key, { key, hora: l.hora, lineas: [l], total: l.importe });
    }
  });
  return Array.from(map.values());
}

function StatTile({
  label,
  valor,
  icon,
  color,
  onClick,
}: {
  label: string;
  valor: string;
  icon: string;
  color?: { bg: string; text: string };
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`text-left bg-background-50 border border-background-200/70 rounded-xl p-3 shadow-card ${
        onClick ? 'cursor-pointer hover:bg-background-100/60 hover:border-background-300/70 transition-colors' : 'cursor-default'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full text-[11px] ${color ? `${color.bg} ${color.text}` : 'bg-primary-50 text-primary-600'}`}>
          <i className={icon}></i>
        </span>
        <p className="text-[11px] text-foreground-400 truncate">{label}</p>
      </div>
      <p className="text-lg font-semibold text-foreground-950 tabular-nums">{valor}</p>
    </button>
  );
}

// Listado agregado por producto (no cronológico como las líneas de
// ticket de DiaRow) que se abre al pulsar los recuadros de Kg a peso /
// Piezas: separa lo vendido a peso de lo vendido por unidad para que se
// pueda revisar de un vistazo cuánto se ha movido de cada producto.
function ResumenSeccion({
  titulo,
  icon,
  filas,
  unidad,
  totalCantidad,
  totalImporte,
}: {
  titulo: string;
  icon: string;
  filas: BasculaVentaResumenProducto[];
  unidad: 'kg' | 'un';
  totalCantidad: number;
  totalImporte: number;
}) {
  if (filas.length === 0) return null;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full bg-primary-50 text-primary-600 text-[11px]">
            <i className={icon}></i>
          </span>
          <h3 className="text-xs font-semibold text-foreground-700 uppercase tracking-wide truncate">{titulo}</h3>
        </div>
        <span className="text-xs text-foreground-500 tabular-nums flex-shrink-0">
          {totalCantidad.toFixed(unidad === 'kg' ? 2 : 0)} {unidad} · {formatPrecio(totalImporte)}
        </span>
      </div>
      <div className="border border-background-200/70 rounded-xl overflow-hidden divide-y divide-background-200/70">
        {filas.map((p) => (
          <div key={`${p.designacion}__${p.unidad}`} className="flex items-center justify-between gap-3 px-3 py-2 text-xs bg-background-50">
            <span className="text-foreground-800 truncate">{p.designacion}</span>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-foreground-400 tabular-nums">
                {p.cantidad.toFixed(unidad === 'kg' ? 3 : 0)} {p.unidad}
              </span>
              <span className="text-foreground-950 font-medium tabular-nums w-16 text-right">{formatPrecio(p.importe)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Ranking visual de los productos que más se mueven (mismo patrón de
// barras que "Lo que más se pide" en Reportes > Online), para que David
// vea de un vistazo qué reponer sin tener que abrir el resumen completo.
function TopProductosSeccion({ titulo, icon, productos, unidad }: { titulo: string; icon: string; productos: BasculaVentaResumenProducto[]; unidad: 'kg' | 'un' }) {
  if (productos.length === 0) return null;
  const max = productos[0]?.cantidad || 1;
  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl p-4 shadow-card">
      <div className="flex items-center gap-1.5 mb-4">
        <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full bg-primary-50 text-primary-600 text-[11px]">
          <i className={icon}></i>
        </span>
        <p className="text-sm font-medium text-foreground-950">{titulo}</p>
      </div>
      <div className="space-y-2.5">
        {productos.map((p) => {
          const pct = (p.cantidad / max) * 100;
          return (
            <div key={`${p.designacion}__${p.unidad}`} className="flex items-center gap-3">
              <span className="text-xs text-foreground-600 w-28 sm:w-36 flex-shrink-0 truncate">{p.designacion}</span>
              <div className="flex-1 h-2 bg-background-200/60 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-foreground-400 w-28 flex-shrink-0 text-right tabular-nums">
                {p.cantidad.toFixed(unidad === 'kg' ? 1 : 0)} {unidad} · {formatPrecio(p.importe)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResumenProductosModal({
  onClose,
  cargando,
  productos,
  subtitulo,
}: {
  onClose: () => void;
  cargando: boolean;
  productos: BasculaVentaResumenProducto[] | null;
  subtitulo: string;
}) {
  const { kg, piezas, totalKg, totalPiezas, importeKg, importePiezas } = useMemo(() => {
    const kg = (productos ?? []).filter((p) => p.unidad === 'kg');
    const piezas = (productos ?? []).filter((p) => p.unidad === 'un');
    return {
      kg,
      piezas,
      totalKg: kg.reduce((acc, p) => acc + p.cantidad, 0),
      totalPiezas: piezas.reduce((acc, p) => acc + p.cantidad, 0),
      importeKg: kg.reduce((acc, p) => acc + p.importe, 0),
      importePiezas: piezas.reduce((acc, p) => acc + p.importe, 0),
    };
  }, [productos]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-foreground-950/40 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full sm:max-w-[560px] max-h-[92vh] sm:max-h-[85vh] bg-background-50 rounded-t-2xl sm:rounded-lg border border-background-200/70 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-background-200/70 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-heading font-semibold text-foreground-950">Resumen por producto</h2>
            <p className="text-xs text-foreground-400 mt-0.5 truncate">{subtitulo}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-100 hover:text-foreground-950"
          >
            <i className="ri-close-line"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {cargando ? (
            <p className="text-xs text-foreground-400">Cargando…</p>
          ) : (productos ?? []).length === 0 ? (
            <p className="text-xs text-foreground-400">Sin ventas registradas.</p>
          ) : (
            <>
              <ResumenSeccion titulo="Vendido a peso" icon="ri-scales-3-line" filas={kg} unidad="kg" totalCantidad={totalKg} totalImporte={importeKg} />
              <ResumenSeccion titulo="Vendido por unidad" icon="ri-shopping-basket-line" filas={piezas} unidad="un" totalCantidad={totalPiezas} totalImporte={importePiezas} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DiaRow({
  fecha,
  numTickets,
  totalPeso,
  totalImporte,
  porTienda,
  filtro,
}: {
  fecha: string;
  numTickets: number;
  totalPeso: number | null;
  totalImporte: number;
  porTienda: BasculaVentaDiariaPorTienda[];
  filtro: Filtro;
}) {
  const [abierto, setAbierto] = useState(false);
  const [lineas, setLineas] = useState<BasculaVenta[] | null>(null);
  const [cargando, setCargando] = useState(false);

  const toggle = async () => {
    const nuevoEstado = !abierto;
    setAbierto(nuevoEstado);
    if (nuevoEstado && lineas === null) {
      setCargando(true);
      const data = await fetchBasculaVentasDelDia(fecha);
      setLineas(data);
      setCargando(false);
    }
  };

  const lineasPorOrigen = useMemo(() => {
    const map = new Map<Origen, BasculaVenta[]>();
    (lineas ?? [])
      .filter((l) => filtro === 'todas' || l.origen === filtro)
      .forEach((l) => {
        const grupo = map.get(l.origen) ?? [];
        grupo.push(l);
        map.set(l.origen, grupo);
      });
    return map;
  }, [lineas, filtro]);

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl shadow-card overflow-hidden">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-background-100/60 transition-colors text-left">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground-950">{formatFechaLarga(fecha)}</p>
          <p className="text-xs text-foreground-400 mt-0.5">
            {numTickets} ticket{numTickets === 1 ? '' : 's'}
            {totalPeso ? ` · ${totalPeso.toFixed(2)} kg vendidos a peso` : ''}
          </p>
          {filtro === 'todas' && porTienda.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {porTienda.map((t) => (
                <span key={t.origen} className="inline-flex items-center gap-1 text-[11px]">
                  <OrigenBadge origen={t.origen} />
                  <span className="font-medium text-foreground-600">{formatPrecio(t.total_importe)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm font-semibold text-foreground-950 tabular-nums">{formatPrecio(totalImporte)}</span>
          <i className={`ri-arrow-down-s-line text-foreground-400 transition-transform ${abierto ? 'rotate-180' : ''}`}></i>
        </div>
      </button>

      {abierto && (
        <div className="border-t border-background-200/70 px-4 py-3 space-y-4">
          {cargando ? (
            <p className="text-xs text-foreground-400">Cargando…</p>
          ) : lineasPorOrigen.size === 0 ? (
            <p className="text-xs text-foreground-400">Sin líneas de venta guardadas para este día.</p>
          ) : (
            Array.from(lineasPorOrigen.entries()).map(([origen, lineasOrigen]) => (
              <div key={origen}>
                {filtro === 'todas' && <OrigenBadge origen={origen} className="mb-1.5" />}
                <div className="space-y-2.5 mt-1.5">
                  {agruparPorTicket(lineasOrigen).map((ticket) => (
                    <div key={ticket.key} className="rounded-xl border border-background-200/70 shadow-sm overflow-hidden bg-background-50">
                      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-background-100/50 border-b border-background-200/70">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full bg-primary-50 text-primary-600 text-[11px]">
                            <i className="ri-receipt-line"></i>
                          </span>
                          <span className="text-[11px] text-foreground-500 tabular-nums">{ticket.hora?.slice(0, 5) ?? '—'}</span>
                          <span className="text-[11px] text-foreground-300">·</span>
                          <span className="text-[11px] text-foreground-400">
                            {ticket.lineas.length} producto{ticket.lineas.length === 1 ? '' : 's'}
                          </span>
                        </span>
                        <span className="text-sm font-semibold text-foreground-950 tabular-nums flex-shrink-0">{formatPrecio(ticket.total)}</span>
                      </div>
                      <div className="divide-y divide-background-200/60 px-3">
                        {ticket.lineas.map((l) => (
                          <LineaVenta key={l.id} l={l} mostrarHora={false} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Fila resumen de un mes completo (vista "Año"): a diferencia de DiaRow no
// se despliega in situ, pulsarla lleva directamente a la vista "Mes" de ese
// mes para ver el detalle día a día.
function MesRow({
  anio,
  mes,
  numTickets,
  totalPeso,
  totalImporte,
  porTienda,
  filtro,
  onClick,
}: {
  anio: number;
  mes: number;
  numTickets: number;
  totalPeso: number;
  totalImporte: number;
  porTienda: Map<Origen, number>;
  filtro: Filtro;
  onClick: () => void;
}) {
  const etiqueta = formatMesAnio(new Date(anio, mes - 1, 1));
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-background-50 border border-background-200/70 rounded-xl shadow-card hover:bg-background-100/60 transition-colors text-left"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground-950">{etiqueta}</p>
        <p className="text-xs text-foreground-400 mt-0.5">
          {numTickets} ticket{numTickets === 1 ? '' : 's'}
          {totalPeso ? ` · ${totalPeso.toFixed(2)} kg vendidos a peso` : ''}
        </p>
        {filtro === 'todas' && porTienda.size > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {Array.from(porTienda.entries()).map(([origen, importe]) => (
              <span key={origen} className="inline-flex items-center gap-1 text-[11px]">
                <OrigenBadge origen={origen} />
                <span className="font-medium text-foreground-600">{formatPrecio(importe)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-sm font-semibold text-foreground-950 tabular-nums">{formatPrecio(totalImporte)}</span>
        <i className="ri-arrow-right-s-line text-foreground-400"></i>
      </div>
    </button>
  );
}

export default function VentasTiendaPanel() {
  const { dias, porTienda, loading } = useBasculaVentasDiarias();
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [periodo, setPeriodo] = useState<Periodo>('dia');
  const [cursor, setCursor] = useState<Date>(() => new Date());

  const porTiendaPorFecha = useMemo(() => {
    const map = new Map<string, BasculaVentaDiariaPorTienda[]>();
    porTienda.forEach((t) => {
      const grupo = map.get(t.fecha) ?? [];
      grupo.push(t);
      map.set(t.fecha, grupo);
    });
    return map;
  }, [porTienda]);

  // "Todas": los días combinados tal cual vienen de la vista. Con un
  // origen concreto: se reconstruye la lista a partir del desglose por
  // tienda, mostrando solo los días en los que esa tienda vendió algo.
  const diasTienda = useMemo(() => {
    if (filtro === 'todas')
      return dias.map((d) => ({ fecha: d.fecha, numTickets: d.num_tickets, totalPeso: d.total_peso_kg, totalPiezas: d.total_piezas_un, totalImporte: d.total_importe }));
    return porTienda
      .filter((t) => t.origen === filtro)
      .map((t) => ({ fecha: t.fecha, numTickets: t.num_tickets, totalPeso: t.total_peso_kg, totalPiezas: t.total_piezas_un, totalImporte: t.total_importe }));
  }, [filtro, dias, porTienda]);

  // Además del filtro por tienda, se acota a día/mes/año concreto según el
  // selector de periodo, para que el listado no sea un histórico infinito.
  const diasPeriodo = useMemo(() => {
    const anio = cursor.getFullYear();
    const mesPrefijo = `${anio}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    if (periodo === 'dia') return diasTienda.filter((d) => d.fecha === isoDeFecha(cursor));
    if (periodo === 'mes') return diasTienda.filter((d) => d.fecha.startsWith(mesPrefijo));
    return diasTienda.filter((d) => d.fecha.startsWith(`${anio}-`));
  }, [diasTienda, periodo, cursor]);

  const totales = useMemo(() => {
    const base = { importe: 0, peso: 0, piezas: 0, tickets: 0 };
    return diasPeriodo.reduce(
      (acc, d) => ({
        importe: acc.importe + d.totalImporte,
        peso: acc.peso + (d.totalPeso ?? 0),
        piezas: acc.piezas + (d.totalPiezas ?? 0),
        tickets: acc.tickets + d.numTickets,
      }),
      base,
    );
  }, [diasPeriodo]);

  const etiquetaPeriodo = useMemo(() => {
    if (periodo === 'dia') return formatFechaLarga(isoDeFecha(cursor));
    if (periodo === 'mes') return formatMesAnio(cursor);
    return String(cursor.getFullYear());
  }, [periodo, cursor]);

  const esPeriodoActual = useMemo(() => {
    const ahora = new Date();
    if (periodo === 'dia') return isoDeFecha(cursor) === isoDeFecha(ahora);
    if (periodo === 'mes') return cursor.getFullYear() === ahora.getFullYear() && cursor.getMonth() === ahora.getMonth();
    return cursor.getFullYear() === ahora.getFullYear();
  }, [periodo, cursor]);

  const moverPeriodo = (delta: number) => {
    setCursor((prev) => {
      const d = new Date(prev);
      if (periodo === 'dia') d.setDate(d.getDate() + delta);
      else if (periodo === 'mes') d.setMonth(d.getMonth() + delta);
      else d.setFullYear(d.getFullYear() + delta);
      return d;
    });
  };

  // Vista "Año": se agregan los días visibles por mes para mostrar un
  // listado corto (máx. 12 filas) en vez de todos los días del año.
  const mesesDelAnio = useMemo(() => {
    if (periodo !== 'anio') return [];
    const map = new Map<
      string,
      { anio: number; mes: number; numTickets: number; totalPeso: number; totalImporte: number; porTienda: Map<Origen, number> }
    >();
    diasPeriodo.forEach((d) => {
      const mesKey = d.fecha.slice(0, 7);
      const [anio, mes] = mesKey.split('-').map(Number);
      const tiendasDia = porTiendaPorFecha.get(d.fecha) ?? [];
      const actual = map.get(mesKey);
      if (actual) {
        actual.numTickets += d.numTickets;
        actual.totalPeso += d.totalPeso ?? 0;
        actual.totalImporte += d.totalImporte;
        tiendasDia.forEach((t) => actual.porTienda.set(t.origen, (actual.porTienda.get(t.origen) ?? 0) + t.total_importe));
      } else {
        const porTiendaMes = new Map<Origen, number>();
        tiendasDia.forEach((t) => porTiendaMes.set(t.origen, t.total_importe));
        map.set(mesKey, { anio, mes, numTickets: d.numTickets, totalPeso: d.totalPeso ?? 0, totalImporte: d.totalImporte, porTienda: porTiendaMes });
      }
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([, v]) => v);
  }, [periodo, diasPeriodo, porTiendaPorFecha]);

  const [resumenAbierto, setResumenAbierto] = useState(false);
  const [resumenProductos, setResumenProductos] = useState<BasculaVentaResumenProducto[] | null>(null);
  const [resumenCargando, setResumenCargando] = useState(false);

  // Se carga en cuanto hay días visibles (no solo al abrir el modal) para
  // poder alimentar también el ranking de "Top productos" siempre visible.
  useEffect(() => {
    if (diasPeriodo.length === 0) {
      setResumenProductos([]);
      return;
    }
    let cancelado = false;
    setResumenCargando(true);
    const fechas = diasPeriodo.map((d) => d.fecha);
    fetchBasculaVentasResumenProductos(fechas, filtro === 'todas' ? null : filtro).then((data) => {
      if (cancelado) return;
      setResumenProductos(data);
      setResumenCargando(false);
    });
    return () => {
      cancelado = true;
    };
  }, [diasPeriodo, filtro]);

  const { topKg, topPiezas } = useMemo(() => {
    const ordenado = [...(resumenProductos ?? [])].sort((a, b) => b.cantidad - a.cantidad);
    return {
      topKg: ordenado.filter((p) => p.unidad === 'kg').slice(0, 8),
      topPiezas: ordenado.filter((p) => p.unidad === 'un').slice(0, 8),
    };
  }, [resumenProductos]);

  return (
    <div className="px-4 md:px-8 py-6 pb-28">
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <button
          type="button"
          onClick={() => setFiltro('todas')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
            filtro === 'todas' ? 'bg-primary-500 text-background-50' : 'bg-background-50 text-foreground-500 hover:bg-background-200/70 border border-background-200/70'
          }`}
        >
          Todas las tiendas
        </button>
        {ORIGENES.map((origen) => {
          const c = ORIGEN_COLORS[origen];
          const activo = filtro === origen;
          return (
            <button
              key={origen}
              type="button"
              onClick={() => setFiltro(origen)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                activo ? `${c.bg} ${c.text} border-transparent ring-1 ${c.ring}` : 'bg-background-50 text-foreground-500 hover:bg-background-200/70 border-background-200/70'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></span>
              {ORIGEN_LABELS[origen]}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          {(['dia', 'mes', 'anio'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodo(p)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                periodo === p ? 'bg-foreground-950 text-background-50' : 'bg-background-50 text-foreground-500 hover:bg-background-200/70 border border-background-200/70'
              }`}
            >
              {p === 'dia' ? 'Día' : p === 'mes' ? 'Mes' : 'Año'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => moverPeriodo(-1)}
            className="w-7 h-7 flex items-center justify-center rounded-full border border-background-200/70 bg-background-50 text-foreground-500 hover:bg-background-100"
          >
            <i className="ri-arrow-left-s-line"></i>
          </button>
          <span className="text-sm font-medium text-foreground-950 min-w-[130px] text-center capitalize">{etiquetaPeriodo}</span>
          <button
            type="button"
            onClick={() => moverPeriodo(1)}
            className="w-7 h-7 flex items-center justify-center rounded-full border border-background-200/70 bg-background-50 text-foreground-500 hover:bg-background-100"
          >
            <i className="ri-arrow-right-s-line"></i>
          </button>
          {!esPeriodoActual && (
            <button type="button" onClick={() => setCursor(new Date())} className="ml-1 text-xs font-medium text-primary-600 hover:underline">
              Hoy
            </button>
          )}
        </div>
      </div>

      {!loading && diasPeriodo.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <StatTile label="Facturado" valor={formatPrecio(totales.importe)} icon="ri-money-euro-circle-line" />
          <StatTile label="Kg a peso" valor={`${totales.peso.toFixed(2)} kg`} icon="ri-scales-3-line" onClick={() => setResumenAbierto(true)} />
          <StatTile label="Piezas" valor={String(totales.piezas)} icon="ri-shopping-basket-line" onClick={() => setResumenAbierto(true)} />
          <StatTile label="Tickets" valor={String(totales.tickets)} icon="ri-receipt-line" />
        </div>
      )}

      {!loading && (topKg.length > 0 || topPiezas.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <TopProductosSeccion titulo="Más vendido a peso" icon="ri-scales-3-line" productos={topKg} unidad="kg" />
          <TopProductosSeccion titulo="Más vendido por unidad" icon="ri-shopping-basket-line" productos={topPiezas} unidad="un" />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-foreground-400">Cargando…</p>
      ) : diasPeriodo.length === 0 ? (
        <p className="text-sm text-foreground-400">Sin ventas registradas{filtro !== 'todas' ? ` en ${ORIGEN_LABELS[filtro]}` : ''} para este periodo.</p>
      ) : periodo === 'anio' ? (
        <div className="space-y-2">
          {mesesDelAnio.map((m) => (
            <MesRow
              key={`${m.anio}-${m.mes}`}
              anio={m.anio}
              mes={m.mes}
              numTickets={m.numTickets}
              totalPeso={m.totalPeso}
              totalImporte={m.totalImporte}
              porTienda={m.porTienda}
              filtro={filtro}
              onClick={() => {
                setCursor(new Date(m.anio, m.mes - 1, 1));
                setPeriodo('mes');
              }}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {diasPeriodo.map((d) => (
            <DiaRow
              key={d.fecha}
              fecha={d.fecha}
              numTickets={d.numTickets}
              totalPeso={d.totalPeso}
              totalImporte={d.totalImporte}
              porTienda={porTiendaPorFecha.get(d.fecha) ?? []}
              filtro={filtro}
            />
          ))}
        </div>
      )}

      {resumenAbierto && (
        <ResumenProductosModal
          onClose={() => setResumenAbierto(false)}
          cargando={resumenCargando}
          productos={resumenProductos}
          subtitulo={`${filtro === 'todas' ? 'Todas las tiendas' : ORIGEN_LABELS[filtro]} · ${etiquetaPeriodo}`}
        />
      )}
    </div>
  );
}
