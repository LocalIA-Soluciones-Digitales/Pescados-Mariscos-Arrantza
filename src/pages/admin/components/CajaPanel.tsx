import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCaja, type NewCajaMovimientoInput } from '@/hooks/useCaja';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';
import { deleteBasculaVenta, fetchBasculaVentasDelDia, useBasculaVentasDiarias } from '@/hooks/useBasculaVentas';
import { useBasculaSyncEstado, type BasculaSyncInfo } from '@/hooks/useBasculaSyncEstado';
import type { BasculaVenta } from '@/types/basculaVenta';
import { CAJA_TIPOS_GASTO, CAJA_TIPOS_INGRESO, CAJA_TIPO_LABELS, esCajaIngreso, type CajaMovimiento, type CajaMovimientoTipo } from '@/types/caja';
import { ORIGENES, ORIGEN_COLORS, ORIGEN_LABELS, type Origen } from '@/types/origen';
import OrigenBadge from '@/components/base/OrigenBadge';
import DiaNavigator from '@/components/base/DiaNavigator';
import CajaResumenPeriodo from './CajaResumenPeriodo';
import { acumularTotales, agregar, totalesVacios, type FilaPeriodo, type PatronDia, type Totales } from './cajaTotales';
import CajaBuscador, { type ResaltarObjetivo } from './CajaBuscador';

const ICONO_POR_TIPO: Record<CajaMovimientoTipo, string> = {
  ingreso_tarjeta: 'ri-bank-card-line',
  ingreso_efectivo: 'ri-money-euro-circle-line',
  ingreso_bares: 'ri-store-2-line',
  gasto_factura: 'ri-file-list-3-line',
  gasto_extra: 'ri-receipt-line',
};

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const CONCEPTO_PLACEHOLDER: Record<CajaMovimientoTipo, string> = {
  ingreso_tarjeta: 'Nota (opcional)',
  ingreso_efectivo: 'Nota (opcional)',
  ingreso_bares: 'Bar o cliente (opcional)',
  gasto_factura: 'Proveedor (opcional)',
  gasto_extra: 'Motivo (opcional)',
};

function hoyISO(): string {
  return new Date().toLocaleDateString('sv-SE');
}

function formatEUR(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function formatFechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const texto = new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatFechaCorta(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function formatFechaSemana(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const texto = new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d + dias).toLocaleDateString('sv-SE');
}

// Lunes de la semana (lunes a domingo) que contiene la fecha dada.
function lunesDe(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const diaSemana = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return sumarDias(fecha, -diaSemana);
}

function formatHora(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatRelativo(fecha: Date): string {
  const minutos = Math.round((Date.now() - fecha.getTime()) / 60000);
  if (minutos < 1) return 'ahora mismo';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `hace ${horas}h ${resto}min`;
}

const BASCULA_LABELS: Record<Origen, string> = { pescaderia_1: 'Báscula I', pescaderia_2: 'Báscula II' };

// Watchdog de conexión de cada báscula: se apoya en bascula_sync_estado()
// (hora de la última ejecución correcta del cron, haya vendido algo o no —
// ver useBasculaSyncEstado). Es normal que salga "sin conexión" mientras la
// báscula física está apagada fuera de horario — el indicador no distingue
// eso de una caída real, solo si está respondiendo ahora mismo.
function WatchdogBascula({ origen, info }: { origen: Origen; info?: BasculaSyncInfo }) {
  const estado = info?.estado ?? 'desconocido';
  const color = estado === 'conectada' ? 'bg-emerald-500' : estado === 'sin_conexion' ? 'bg-red-500' : 'bg-foreground-300';
  const titulo = info?.ultimaSync
    ? `Última sincronización: ${info.ultimaSync.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} (${formatRelativo(info.ultimaSync)})`
    : 'Sin datos de sincronización todavía';
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground-500 whitespace-nowrap" title={titulo}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`}></span>
      {BASCULA_LABELS[origen]}
      {estado === 'sin_conexion' && info?.ultimaSync && (
        <span className="text-red-500">· {formatRelativo(info.ultimaSync)}</span>
      )}
    </span>
  );
}

function NetoBadge({ valor }: { valor: number }) {
  const positivo = valor >= 0;
  return <span className={`font-semibold ${positivo ? 'text-emerald-700' : 'text-red-600'}`}>{formatEUR(valor)}</span>;
}

function FormNuevoMovimiento({
  fecha,
  onFechaChange,
  onCrear,
}: {
  fecha: string;
  onFechaChange: (fecha: string) => void;
  onCrear: (input: NewCajaMovimientoInput) => Promise<CajaMovimiento | null>;
}) {
  const [tipo, setTipo] = useState<CajaMovimientoTipo>('gasto_factura');
  const [origen, setOrigen] = useState<Origen>(ORIGENES[0]);
  const [concepto, setConcepto] = useState('');
  const [importe, setImporte] = useState('');
  const [saving, setSaving] = useState(false);
  const esIngreso = esCajaIngreso(tipo);

  const submit = async () => {
    const valor = Number(importe.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) return;
    setSaving(true);
    const creado = await onCrear({ fecha, tipo, concepto: concepto.trim() || null, importe: valor, origen: esIngreso ? origen : null });
    setSaving(false);
    if (!creado) {
      alert('No se pudo guardar el movimiento.');
      return;
    }
    setConcepto('');
    setImporte('');
  };

  const campo = 'h-11 w-full px-2.5 bg-background-100 border border-background-200/70 rounded-md text-sm';

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl p-3 shadow-card">
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1 sm:w-36">
          <label className="text-[11px] text-foreground-400">Fecha</label>
          <input type="date" value={fecha} onChange={(e) => onFechaChange(e.target.value)} className={campo} />
        </div>

        <div className="flex flex-col gap-1 sm:w-44">
          <label className="text-[11px] text-foreground-400">Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as CajaMovimientoTipo)} className={campo}>
            <optgroup label="Ingreso (manual, de respaldo)">
              {CAJA_TIPOS_INGRESO.map((t) => (
                <option key={t} value={t}>{CAJA_TIPO_LABELS[t]}</option>
              ))}
            </optgroup>
            <optgroup label="Gasto">
              {CAJA_TIPOS_GASTO.map((t) => (
                <option key={t} value={t}>{CAJA_TIPO_LABELS[t]}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {esIngreso && (
          <div className="flex flex-col gap-1 sm:w-40">
            <label className="text-[11px] text-foreground-400">Tienda</label>
            <select value={origen} onChange={(e) => setOrigen(e.target.value as Origen)} className={campo}>
              {ORIGENES.map((o) => (
                <option key={o} value={o}>{ORIGEN_LABELS[o]}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1 col-span-2 sm:col-span-1 sm:flex-1 sm:min-w-[160px] sm:max-w-xs">
          <label className="text-[11px] text-foreground-400">Concepto</label>
          <input
            type="text"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder={CONCEPTO_PLACEHOLDER[tipo]}
            className={campo}
          />
        </div>

        <div className="flex flex-col gap-1 sm:w-32">
          <label className="text-[11px] text-foreground-400">Importe</label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              placeholder="0,00"
              className={`${campo} pr-6 text-right`}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-foreground-400">€</span>
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={saving || !importe}
          className="h-11 px-4 rounded-full text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-50 self-end sm:flex-shrink-0"
        >
          {saving ? 'Guardando…' : 'Añadir'}
        </button>
      </div>
    </div>
  );
}

function FilaCaja({
  id,
  icon,
  titulo,
  subtitulo,
  origen,
  importe,
  ingreso,
  resaltado,
  onEliminar,
}: {
  id?: string;
  icon: string;
  titulo: string;
  subtitulo?: string | null;
  origen?: Origen | null;
  importe: number;
  ingreso: boolean;
  resaltado?: boolean;
  onEliminar: () => void;
}) {
  return (
    <div
      id={id}
      className={`flex items-center gap-3 px-3 py-2.5 border-b border-background-200/50 last:border-b-0 transition-colors duration-700 ${
        resaltado ? 'bg-amber-50 ring-2 ring-inset ring-amber-400' : ''
      }`}
    >
      <span
        className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full text-sm ${
          ingreso ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
        }`}
      >
        <i className={icon}></i>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-foreground-950 truncate">{titulo}</p>
          {origen && <OrigenBadge origen={origen} className="flex-shrink-0" />}
        </div>
        {subtitulo && <p className="text-xs text-foreground-400 truncate">{subtitulo}</p>}
      </div>
      <span className={`text-sm font-medium flex-shrink-0 tabular-nums ${ingreso ? 'text-emerald-700' : 'text-red-600'}`}>
        {ingreso ? '+' : '-'}{formatEUR(importe)}
      </span>
      <button
        type="button"
        onClick={onEliminar}
        className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-foreground-400 hover:bg-red-50 hover:text-red-600"
      >
        <i className="ri-delete-bin-line text-sm"></i>
      </button>
    </div>
  );
}

function FilaMovimiento({
  m,
  resaltado,
  onEliminar,
}: {
  m: CajaMovimiento;
  resaltado?: boolean;
  onEliminar: (m: CajaMovimiento) => void;
}) {
  const hora = formatHora(m.created_at);
  return (
    <FilaCaja
      id={`mov-${m.id}`}
      icon={ICONO_POR_TIPO[m.tipo]}
      titulo={CAJA_TIPO_LABELS[m.tipo]}
      subtitulo={m.concepto ? `${hora} · ${m.concepto}` : hora}
      origen={m.origen}
      importe={m.importe}
      ingreso={esCajaIngreso(m.tipo)}
      resaltado={resaltado}
      onEliminar={() => onEliminar(m)}
    />
  );
}

interface TicketBascula {
  key: string;
  origen: Origen;
  hora: string | null;
  numero: number;
  total: number;
  lineas: BasculaVenta[];
  anulado: boolean;
  editadoDeNumero: number | null;
}

// Une las líneas de báscula del mismo ticket de cliente (mismo tipo_doc +
// posto + numero) en un solo bloque con el total del ticket y el desglose
// por producto debajo — así el pescadero compara directamente con el
// papel que tiene en la mano, en vez de ver cada producto suelto. Un
// ticket se marca anulado si alguna de sus líneas lo está — bascula-sync
// las anula todas juntas, pero por si alguna se hubiera borrado a mano
// desde aquí basta con que quede una para seguir viéndolo.
function agruparPorTicket(lineas: BasculaVenta[]): TicketBascula[] {
  const grupos = new Map<string, TicketBascula>();
  const orden: string[] = [];
  for (const l of lineas) {
    const key = `${l.ticket_tipo_doc}|${l.ticket_posto}|${l.ticket_numero}`;
    let grupo = grupos.get(key);
    if (!grupo) {
      grupo = { key, origen: l.origen, hora: l.hora, numero: l.ticket_numero, total: 0, lineas: [], anulado: false, editadoDeNumero: null };
      grupos.set(key, grupo);
      orden.push(key);
    }
    grupo.total += l.importe;
    grupo.lineas.push(l);
    if (l.anulado) grupo.anulado = true;
    if (l.editado_de_numero) grupo.editadoDeNumero = l.editado_de_numero;
  }
  return orden.map((k) => grupos.get(k)!);
}

// Fila compacta y clicable: el detalle completo (líneas, total, estado) se
// ve en TicketDetalleModal al pulsarla — así la lista se puede recorrer de
// un vistazo, sin que el desglose de cada ticket empuje a los demás hacia
// abajo. En móvil el número de ticket va en su propia línea y las badges
// (tienda, anulado, editado) debajo, porque compartir una sola línea con
// ellas era lo que hacía ilegible el número (ver comentario de
// TicketDetalleModal).
function FilaTicketBascula({
  ticket,
  resaltado,
  onClick,
}: {
  ticket: TicketBascula;
  resaltado?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      id={`ticket-${ticket.key}`}
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 border-b border-background-200/50 last:border-b-0 hover:bg-background-100/60 transition-colors duration-700 ${
        ticket.anulado ? 'opacity-60' : ''
      } ${resaltado ? 'bg-amber-50 ring-2 ring-inset ring-amber-400' : ''}`}
    >
      <span
        className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full text-sm ${
          ticket.anulado ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'
        }`}
      >
        <i className="ri-scales-3-line"></i>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-1.5">
          <p className={`text-sm text-foreground-950 sm:truncate ${ticket.anulado ? 'line-through' : ''}`}>Ticket nº {ticket.numero}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <OrigenBadge origen={ticket.origen} className="flex-shrink-0" />
            {ticket.anulado && (
              <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600">Anulado</span>
            )}
            {ticket.editadoDeNumero != null && (
              <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600">
                Editado de nº {ticket.editadoDeNumero}
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-foreground-400 truncate">
          {ticket.hora?.slice(0, 5) ?? '—'} · {ticket.lineas.length} producto{ticket.lineas.length === 1 ? '' : 's'}
        </p>
      </div>
      <span className={`text-sm font-medium flex-shrink-0 tabular-nums ${ticket.anulado ? 'line-through text-foreground-400' : 'text-emerald-700'}`}>
        +{formatEUR(ticket.total)}
      </span>
      <i className="ri-arrow-right-s-line text-foreground-300 flex-shrink-0"></i>
    </button>
  );
}

// Popup de detalle al pulsar un ticket: evoca un recibo (divisores
// punteados, total al pie) sin imitarlo literalmente — pensado sobre todo
// para móvil, donde la fila compacta no tiene sitio para mostrar tienda +
// estado + todas las líneas a la vez sin atropellar el número de ticket.
function TicketDetalleModal({
  ticket,
  onClose,
  onEliminarLinea,
}: {
  ticket: TicketBascula;
  onClose: () => void;
  onEliminarLinea: (l: BasculaVenta) => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-foreground-950/40 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full sm:max-w-[420px] max-h-[88vh] sm:max-h-[85vh] bg-background-50 rounded-t-2xl sm:rounded-lg border border-background-200/70 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-background-200/70 flex-shrink-0">
          <div className="min-w-0 flex items-center gap-3">
            <span
              className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full text-base ${
                ticket.anulado ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              <i className="ri-scales-3-line"></i>
            </span>
            <div className="min-w-0">
              <h2 className={`text-base font-heading font-semibold text-foreground-950 ${ticket.anulado ? 'line-through text-foreground-400' : ''}`}>
                Ticket nº {ticket.numero}
              </h2>
              <p className="text-xs text-foreground-400 mt-0.5">
                {ticket.hora?.slice(0, 5) ?? '—'} · {ticket.lineas.length} producto{ticket.lineas.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-100 hover:text-foreground-950"
          >
            <i className="ri-close-line"></i>
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap px-5 py-3 border-b border-background-200/70 flex-shrink-0">
          <OrigenBadge origen={ticket.origen} />
          {ticket.anulado && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600">Anulado</span>
          )}
          {ticket.editadoDeNumero != null && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600">
              Editado de nº {ticket.editadoDeNumero}
            </span>
          )}
        </div>

        {ticket.anulado && (
          <p className="mx-5 mt-3 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs flex-shrink-0">
            Anulado en la báscula — no cuenta en la facturación del día.
          </p>
        )}
        {ticket.editadoDeNumero != null && (
          <p className="mx-5 mt-3 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 text-xs flex-shrink-0">
            Sustituye al ticket nº {ticket.editadoDeNumero}, anulado en la báscula.
          </p>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="divide-y divide-dashed divide-background-200/70">
            {ticket.lineas.map((l) => (
              <div key={l.id} className={`flex items-center gap-2 py-2 text-sm ${ticket.anulado ? 'line-through text-foreground-400' : 'text-foreground-800'}`}>
                <span className="flex-1 min-w-0 truncate">{l.designacion}</span>
                <span className="flex-shrink-0 text-xs text-foreground-400 tabular-nums w-16 text-right">
                  {l.cantidad} {l.unidad}
                </span>
                <span className="flex-shrink-0 font-medium tabular-nums w-16 text-right">{formatEUR(l.importe)}</span>
                <button
                  type="button"
                  onClick={() => onEliminarLinea(l)}
                  className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full text-foreground-400 hover:bg-red-50 hover:text-red-600"
                >
                  <i className="ri-delete-bin-line text-xs"></i>
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-dashed border-background-300 flex-shrink-0">
          <span className="text-sm font-medium text-foreground-500">Total</span>
          <span className={`text-lg font-semibold tabular-nums ${ticket.anulado ? 'line-through text-foreground-400' : 'text-emerald-700'}`}>
            {formatEUR(ticket.total)}
          </span>
        </div>
      </div>
    </div>
  );
}

type FiltroOrigen = Origen | 'todas';

function VistaDia({
  fecha,
  onFechaChange,
  basculaHoy,
  ticketsHoy,
  movimientosDelDia,
  onCrear,
  onEliminar,
  resaltar,
  onResaltadoConsumido,
  onAbrirBuscador,
}: {
  fecha: string;
  onFechaChange: (fecha: string) => void;
  basculaHoy: number;
  ticketsHoy: number;
  movimientosDelDia: CajaMovimiento[];
  onCrear: (input: NewCajaMovimientoInput) => Promise<CajaMovimiento | null>;
  onEliminar: (id: string) => Promise<boolean>;
  resaltar?: ResaltarObjetivo | null;
  onResaltadoConsumido?: () => void;
  onAbrirBuscador?: () => void;
}) {
  const ingresosManuales = movimientosDelDia.filter((m) => esCajaIngreso(m.tipo));
  const gastos = movimientosDelDia.filter((m) => !esCajaIngreso(m.tipo));
  const totalIngresosManuales = ingresosManuales.reduce((n, m) => n + Number(m.importe), 0);
  const totalGastosDia = gastos.reduce((n, m) => n + Number(m.importe), 0);
  const totalIngresosDia = basculaHoy + totalIngresosManuales;
  const netoDia = totalIngresosDia - totalGastosDia;

  const [filtroOrigen, setFiltroOrigen] = useState<FiltroOrigen>('todas');
  const origenesVisibles = useMemo(() => (filtroOrigen === 'todas' ? ORIGENES : [filtroOrigen]), [filtroOrigen]);
  const [soloAnulados, setSoloAnulados] = useState(false);
  const [soloEditados, setSoloEditados] = useState(false);
  const filtrosScroll = useHorizontalWheelScroll<HTMLDivElement>();
  const [ticketAbiertoKey, setTicketAbiertoKey] = useState<string | null>(null);

  const [lineasBascula, setLineasBascula] = useState<BasculaVenta[]>([]);
  const [cargandoBascula, setCargandoBascula] = useState(true);

  const refetchLineasBascula = useCallback(() => {
    fetchBasculaVentasDelDia(fecha).then((data) => setLineasBascula(data));
  }, [fecha]);

  useRealtimeTable('bascula_ventas', refetchLineasBascula);

  const ingresosPorTiendaDia = useMemo(() => {
    const map: Partial<Record<Origen, number>> = {};
    lineasBascula.forEach((l) => {
      if (l.anulado) return;
      map[l.origen] = (map[l.origen] ?? 0) + l.importe;
    });
    ingresosManuales.forEach((m) => {
      if (!m.origen) return;
      map[m.origen] = (map[m.origen] ?? 0) + Number(m.importe);
    });
    return map;
  }, [lineasBascula, ingresosManuales]);

  const ticketsBascula = useMemo(() => agruparPorTicket(lineasBascula), [lineasBascula]);

  // Busca por key en vez de guardar el ticket seleccionado tal cual: así el
  // modal siempre refleja el estado actual (p.ej. si se borra una línea
  // desde dentro) y se cierra solo si el ticket deja de existir.
  const ticketAbierto = useMemo(
    () => (ticketAbiertoKey ? (ticketsBascula.find((t) => t.key === ticketAbiertoKey) ?? null) : null),
    [ticketsBascula, ticketAbiertoKey],
  );

  // Al llegar desde una búsqueda con un objetivo concreto (p.ej. "Capotinas
  // del 18 de septiembre"), localiza esa fila exacta — por id si es un
  // movimiento a mano, por nombre de producto si es una venta de báscula —
  // y la desplaza a la vista con un resalte temporal, en vez de dejar al
  // usuario en lo alto de la vista del día (donde antes aterrizaba siempre
  // en la sección de Ingresos, aunque el resultado fuera un gasto).
  const [resaltadoId, setResaltadoId] = useState<string | null>(null);
  useEffect(() => {
    if (!resaltar || cargandoBascula) return;
    if (resaltar.origen) setFiltroOrigen(resaltar.origen);
    const t = setTimeout(() => {
      let targetId: string | null = null;
      if (resaltar.fuente === 'manual') {
        targetId = `mov-${resaltar.key}`;
      } else {
        const ticket = ticketsBascula.find((tk) => tk.lineas.some((l) => l.designacion === resaltar.titulo));
        targetId = ticket ? `ticket-${ticket.key}` : null;
      }
      const el = document.getElementById(targetId ?? 'caja-ingresos-panel');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (targetId) {
        setResaltadoId(targetId);
        setTimeout(() => setResaltadoId(null), 2200);
      }
      onResaltadoConsumido?.();
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resaltar, cargandoBascula, ticketsBascula]);

  // Filtrado por tienda (usado también para los totales, que nunca deben
  // depender de si se está buscando anulados/editados o no) y, aparte,
  // los filtros de "solo anulados" / "solo editados" que solo afectan a
  // qué se muestra en la lista — si se activan los dos a la vez, se
  // muestran ambos tipos de excepción juntos.
  const ticketsBasculaOrigen = useMemo(
    () => ticketsBascula.filter((t) => origenesVisibles.includes(t.origen)),
    [ticketsBascula, origenesVisibles],
  );
  const anuladosVisibles = useMemo(() => ticketsBasculaOrigen.filter((t) => t.anulado).length, [ticketsBasculaOrigen]);
  const editadosVisibles = useMemo(() => ticketsBasculaOrigen.filter((t) => t.editadoDeNumero != null).length, [ticketsBasculaOrigen]);
  const ticketsBasculaFiltrados = useMemo(() => {
    if (!soloAnulados && !soloEditados) return ticketsBasculaOrigen;
    return ticketsBasculaOrigen.filter((t) => (soloAnulados && t.anulado) || (soloEditados && t.editadoDeNumero != null));
  }, [ticketsBasculaOrigen, soloAnulados, soloEditados]);
  const ingresosManualesFiltrados = useMemo(
    () => (soloAnulados || soloEditados ? [] : ingresosManuales.filter((m) => m.origen && origenesVisibles.includes(m.origen))),
    [ingresosManuales, origenesVisibles, soloAnulados, soloEditados],
  );
  const totalIngresosFiltrado =
    ticketsBasculaOrigen.filter((t) => !t.anulado).reduce((n, t) => n + t.total, 0) +
    ingresosManuales.filter((m) => m.origen && origenesVisibles.includes(m.origen)).reduce((n, m) => n + Number(m.importe), 0);
  const ticketsFiltrados = ticketsBasculaOrigen.filter((t) => !t.anulado).length;

  useEffect(() => {
    let cancelado = false;
    setCargandoBascula(true);
    fetchBasculaVentasDelDia(fecha).then((data) => {
      if (cancelado) return;
      setLineasBascula(data);
      setCargandoBascula(false);
    });
    return () => {
      cancelado = true;
    };
  }, [fecha]);

  const eliminar = async (m: CajaMovimiento) => {
    if (!confirm(`¿Eliminar este movimiento de ${formatEUR(m.importe)}?`)) return;
    await onEliminar(m.id);
  };

  const eliminarBascula = async (l: BasculaVenta) => {
    if (!confirm(`¿Eliminar esta venta de báscula de ${formatEUR(l.importe)}? No se puede deshacer.`)) return;
    const ok = await deleteBasculaVenta(l.id);
    if (!ok) {
      alert('No se pudo eliminar la venta.');
      return;
    }
    setLineasBascula((prev) => prev.filter((x) => x.id !== l.id));
  };

  const sinIngresos = !cargandoBascula && ticketsBasculaFiltrados.length === 0 && ingresosManualesFiltrados.length === 0;

  const [y, m, d] = fecha.split('-').map(Number);
  const fechaDate = new Date(y, m - 1, d);
  const cambiarDia = (nueva: Date) => onFechaChange(nueva.toLocaleDateString('sv-SE'));

  // Flechas ← → del teclado para pasar de día, salvo escribiendo en un campo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      onFechaChange(sumarDias(fecha, e.key === 'ArrowLeft' ? -1 : 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fecha, onFechaChange]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <DiaNavigator value={fechaDate} onChange={cambiarDia} label={formatFechaLarga(fecha)} />
      </div>
      {onAbrirBuscador && (
        <button
          type="button"
          onClick={onAbrirBuscador}
          className="w-full flex items-center gap-2.5 h-12 px-4 bg-background-50 border border-background-200/70 rounded-xl text-sm text-foreground-400 shadow-card hover:border-foreground-300/60 hover:text-foreground-500 transition-colors"
        >
          <i className="ri-search-line text-base flex-shrink-0"></i>
          <span className="flex-1 text-left truncate">Buscar en ingresos y gastos…</span>
          <i className="ri-arrow-right-s-line flex-shrink-0"></i>
        </button>
      )}

      <FormNuevoMovimiento fecha={fecha} onFechaChange={onFechaChange} onCrear={onCrear} />

      <div ref={filtrosScroll.ref} onWheel={filtrosScroll.onWheel} className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
        <button
          type="button"
          onClick={() => setFiltroOrigen('todas')}
          className={`flex-shrink-0 whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            filtroOrigen === 'todas' ? 'bg-primary-500 text-background-50' : 'bg-background-50 border border-background-200/70 text-foreground-500 hover:bg-background-200/70'
          }`}
        >
          Todas
        </button>
        {ORIGENES.map((o) => {
          const activo = filtroOrigen === o;
          const c = ORIGEN_COLORS[o];
          return (
            <button
              key={o}
              type="button"
              onClick={() => setFiltroOrigen(o)}
              className={`flex-shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activo ? `${c.bg} ${c.text} ring-1 ${c.ring}` : 'bg-background-50 border border-background-200/70 text-foreground-500 hover:bg-background-200/70'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`}></span>
              {ORIGEN_LABELS[o]}
            </button>
          );
        })}
        {anuladosVisibles > 0 && (
          <button
            type="button"
            onClick={() => setSoloAnulados((v) => !v)}
            className={`flex-shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              soloAnulados ? 'bg-red-500 text-background-50' : 'bg-background-50 border border-background-200/70 text-red-600 hover:bg-red-50'
            }`}
          >
            <i className="ri-close-circle-line"></i>
            Anulados ({anuladosVisibles})
          </button>
        )}
        {editadosVisibles > 0 && (
          <button
            type="button"
            onClick={() => setSoloEditados((v) => !v)}
            className={`flex-shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              soloEditados ? 'bg-amber-500 text-background-50' : 'bg-background-50 border border-background-200/70 text-amber-600 hover:bg-amber-50'
            }`}
          >
            <i className="ri-pencil-line"></i>
            Editados ({editadosVisibles})
          </button>
        )}
      </div>

      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full bg-emerald-50 text-emerald-600 text-[11px]">
          <i className="ri-arrow-up-line"></i>
        </span>
        <p className="text-[11px] text-foreground-400">
          {filtroOrigen === 'todas' ? (
            <>
              Ingresos del día por tienda — {formatEUR(totalIngresosDia)} en total
              {ticketsHoy > 0 && ` · ${ticketsHoy} ticket${ticketsHoy === 1 ? '' : 's'} de báscula`}
              {totalIngresosManuales > 0 && ` · ${formatEUR(totalIngresosManuales)} a mano`}
            </>
          ) : (
            <>
              Ingresos del día — {ORIGEN_LABELS[filtroOrigen]} — {formatEUR(totalIngresosFiltrado)} en total
              {ticketsFiltrados > 0 && ` · ${ticketsFiltrados} ticket${ticketsFiltrados === 1 ? '' : 's'} de báscula`}
            </>
          )}
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {origenesVisibles.map((o) => {
          const c = ORIGEN_COLORS[o];
          return (
            <div key={o} className="bg-background-50 border border-background-200/70 rounded-xl p-3 shadow-card">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`}></span>
                <p className="text-[11px] text-foreground-400 truncate">{ORIGEN_LABELS[o]}</p>
              </div>
              <p className={`text-lg font-semibold tabular-nums ${c.text}`}>{formatEUR(ingresosPorTiendaDia[o] ?? 0)}</p>
            </div>
          );
        })}
        <div className="bg-background-50 border border-background-200/70 rounded-xl p-3 shadow-card">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full bg-red-50 text-red-500 text-[11px]">
              <i className="ri-arrow-down-line"></i>
            </span>
            <p className="text-[11px] text-foreground-400">Gastos</p>
          </div>
          <p className="text-lg font-semibold text-red-600 tabular-nums">{formatEUR(totalGastosDia)}</p>
        </div>
        <div className="bg-background-50 border border-background-200/70 rounded-xl p-3 shadow-card">
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full text-[11px] ${
                netoDia >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
              }`}
            >
              <i className="ri-scales-3-line"></i>
            </span>
            <p className="text-[11px] text-foreground-400">Neto del día</p>
          </div>
          <p className="text-lg tabular-nums"><NetoBadge valor={netoDia} /></p>
        </div>
      </div>

      <p className="text-sm font-medium text-foreground-950">{formatFechaLarga(fecha)}</p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div id="caja-ingresos-panel" className="bg-background-50 border border-background-200/70 rounded-xl overflow-hidden shadow-card">
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-500">Ingresos</p>
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] bg-emerald-50 text-emerald-600">
              {ticketsBasculaFiltrados.length + ingresosManualesFiltrados.length}
            </span>
          </div>
          {cargandoBascula ? (
            <p className="text-xs text-foreground-400 px-3 py-3">Cargando…</p>
          ) : sinIngresos ? (
            <p className="text-xs text-foreground-400 px-3 py-3">Sin ingresos registrados.</p>
          ) : (
            <>
              {ticketsBasculaFiltrados.map((t) => (
                <FilaTicketBascula
                  key={t.key}
                  ticket={t}
                  resaltado={resaltadoId === `ticket-${t.key}`}
                  onClick={() => setTicketAbiertoKey(t.key)}
                />
              ))}
              {ingresosManualesFiltrados.map((m) => (
                <FilaMovimiento key={m.id} m={m} resaltado={resaltadoId === `mov-${m.id}`} onEliminar={eliminar} />
              ))}
            </>
          )}
        </div>
        <div className="bg-background-50 border border-background-200/70 rounded-xl overflow-hidden shadow-card">
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-500">Gastos</p>
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] bg-red-50 text-red-500">
              {gastos.length}
            </span>
          </div>
          {gastos.length === 0 ? (
            <p className="text-xs text-foreground-400 px-3 pb-3">Sin gastos registrados.</p>
          ) : (
            gastos.map((m) => <FilaMovimiento key={m.id} m={m} resaltado={resaltadoId === `mov-${m.id}`} onEliminar={eliminar} />)
          )}
        </div>
      </div>

      {ticketAbierto && (
        <TicketDetalleModal ticket={ticketAbierto} onClose={() => setTicketAbiertoKey(null)} onEliminarLinea={eliminarBascula} />
      )}
    </div>
  );
}

interface DiaResumen {
  totales: Totales;
  tickets: number;
  bascula: number;
}

type ResumenDia = (fecha: string) => DiaResumen;

function fechasEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) out.push(f);
  return out;
}

function fechaISO(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function diasDelMes(anio: number, mes: number): string[] {
  const n = new Date(anio, mes + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => fechaISO(anio, mes, i + 1));
}

// Número de semana ISO 8601 (la que usa el calendario de pared).
function numeroSemana(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dia = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil(((dt.getTime() - inicio.getTime()) / 86400000 + 1) / 7);
}

// Fila de un día con su comparación "mismo día de la semana anterior" —
// para el pescadero es la referencia natural (un sábado se compara con el
// sábado pasado, no con el día 26 del mes anterior, que puede ser lunes).
function filaDia(fecha: string, labelCorto: string, hoy: string, resumenDia: ResumenDia): FilaPeriodo {
  const ant = sumarDias(fecha, -7);
  return {
    key: fecha,
    label: formatFechaSemana(fecha),
    labelCorto,
    ...resumenDia(fecha),
    esActual: fecha === hoy,
    futuro: fecha > hoy,
    anterior: { label: formatFechaSemana(ant), totales: resumenDia(ant).totales },
  };
}

// Ventas medias por día de la semana en las últimas 12 semanas cerradas
// hasta `hasta` (sin contar hoy, que va a medias). Sirve para prever qué
// días hace falta más género.
function calcularPatronSemanal(hasta: string, resumenDia: ResumenDia): PatronDia[] {
  const hoy = hoyISO();
  const fin = hasta >= hoy ? sumarDias(hoy, -1) : hasta;
  const acc = Array.from({ length: 7 }, () => ({ total: 0, dias: 0, tickets: 0 }));
  fechasEntre(sumarDias(fin, -83), fin).forEach((f) => {
    const r = resumenDia(f);
    if (r.totales.ingresos <= 0) return;
    const [y, m, d] = f.split('-').map(Number);
    const i = (new Date(y, m - 1, d).getDay() + 6) % 7;
    acc[i].total += r.totales.ingresos;
    acc[i].dias += 1;
    acc[i].tickets += r.tickets;
  });
  return ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((label, i) => ({
    label,
    media: acc[i].dias ? acc[i].total / acc[i].dias : 0,
    tickets: acc[i].dias ? acc[i].tickets / acc[i].dias : 0,
    dias: acc[i].dias,
  }));
}

// Para comparar un periodo en curso con el anterior de forma justa, del
// anterior solo se cuenta el mismo tramo transcurrido (p.ej. a jueves, la
// semana pasada de lunes a jueves) — si no, el periodo actual siempre
// saldría "peor" hasta que terminara.
function VistaSemana({ lunes, onLunesChange, resumenDia, onIrADia }: { lunes: string; onLunesChange: (l: string) => void; resumenDia: ResumenDia; onIrADia: (f: string) => void }) {
  const hoy = hoyISO();
  const domingo = sumarDias(lunes, 6);
  const lunesActual = lunesDe(hoy);
  const enCurso = lunes === lunesActual;
  const lunesAnt = sumarDias(lunes, -7);

  const filas = useMemo<FilaPeriodo[]>(
    () => fechasEntre(lunes, domingo).map((f) => filaDia(f, formatFechaSemana(f).split(',')[0], hoy, resumenDia)),
    [lunes, domingo, hoy, resumenDia],
  );
  const filasAnteriores = useMemo<FilaPeriodo[]>(
    () => fechasEntre(lunesAnt, sumarDias(lunesAnt, 6)).map((f) => filaDia(f, formatFechaSemana(f).split(',')[0], hoy, resumenDia)),
    [lunesAnt, hoy, resumenDia],
  );
  const anterior = useMemo(() => {
    const hasta = sumarDias(lunesAnt, enCurso ? (new Date().getDay() + 6) % 7 : 6);
    return agregar(fechasEntre(lunesAnt, hasta).map(resumenDia));
  }, [lunesAnt, enCurso, resumenDia]);
  const patron = useMemo(() => calcularPatronSemanal(domingo, resumenDia), [domingo, resumenDia]);

  return (
    <CajaResumenPeriodo
      titulo={`${formatFechaCorta(lunes)} – ${formatFechaCorta(domingo)}`}
      subtitulo={`${enCurso ? 'Esta semana' : `Semana ${numeroSemana(lunes)}`} · ${domingo.slice(0, 4)}`}
      onAnterior={() => onLunesChange(sumarDias(lunes, -7))}
      onSiguiente={() => onLunesChange(sumarDias(lunes, 7))}
      onIrAActual={enCurso ? undefined : () => onLunesChange(lunesActual)}
      actualLabel="Esta semana"
      filas={filas}
      filasAnteriores={filasAnteriores}
      anterior={anterior}
      anteriorLabel="semana anterior"
      comparadoCon={enCurso ? 'vs. mismo tramo sem. anterior' : 'vs. semana anterior'}
      comparaFilaLabel="vs sem. ant."
      patronSemanal={patron}
      unidad="día"
      totalLabel="Total de la semana"
      nombreArchivo={`contabilidad-semana-${lunes}`}
      onFilaClick={onIrADia}
    />
  );
}

function VistaMes({
  anio,
  mes,
  onMesChange,
  resumenDia,
  onIrADia,
}: {
  anio: number;
  mes: number;
  onMesChange: (anio: number, mes: number) => void;
  resumenDia: ResumenDia;
  onIrADia: (f: string) => void;
}) {
  const hoy = hoyISO();
  const [anioHoy, mesHoy, diaHoy] = hoy.split('-').map(Number);
  const enCurso = anio === anioHoy && mes === mesHoy - 1;
  const ant = new Date(anio, mes - 1, 1);
  const anioAnt = ant.getFullYear();
  const mesAnt = ant.getMonth();

  const filas = useMemo<FilaPeriodo[]>(
    () => diasDelMes(anio, mes).map((f) => filaDia(f, String(Number(f.slice(8))), hoy, resumenDia)),
    [anio, mes, hoy, resumenDia],
  );
  const filasAnteriores = useMemo<FilaPeriodo[]>(
    () => diasDelMes(anioAnt, mesAnt).map((f) => filaDia(f, String(Number(f.slice(8))), hoy, resumenDia)),
    [anioAnt, mesAnt, hoy, resumenDia],
  );
  const anterior = useMemo(
    () => agregar(enCurso ? filasAnteriores.slice(0, diaHoy) : filasAnteriores),
    [filasAnteriores, enCurso, diaHoy],
  );
  const ultimoDia = fechaISO(anio, mes, filas.length);
  const patron = useMemo(() => calcularPatronSemanal(ultimoDia, resumenDia), [ultimoDia, resumenDia]);

  const mover = (delta: number) => {
    const d = new Date(anio, mes + delta, 1);
    onMesChange(d.getFullYear(), d.getMonth());
  };
  const mesAnterior = MESES[mesAnt].toLowerCase();

  return (
    <CajaResumenPeriodo
      titulo={`${MESES[mes]} ${anio}`}
      subtitulo={enCurso ? `Mes en curso · día ${diaHoy} de ${filas.length}` : `${filas.length} días`}
      onAnterior={() => mover(-1)}
      onSiguiente={() => mover(1)}
      onIrAActual={enCurso ? undefined : () => onMesChange(anioHoy, mesHoy - 1)}
      actualLabel="Este mes"
      filas={filas}
      filasAnteriores={filasAnteriores}
      anterior={anterior}
      anteriorLabel={mesAnterior}
      comparadoCon={enCurso ? `vs. mismo tramo de ${mesAnterior}` : `vs. ${mesAnterior}`}
      comparaFilaLabel="vs sem. ant."
      patronSemanal={patron}
      unidad="día"
      totalLabel="Total del mes"
      nombreArchivo={`contabilidad-${anio}-${String(mes + 1).padStart(2, '0')}`}
      ocultarVaciosInicial
      onFilaClick={onIrADia}
    />
  );
}

function filasDeAnio(anio: number, hoy: string, resumenDia: ResumenDia): FilaPeriodo[] {
  const [anioHoy, mesHoy] = hoy.split('-').map(Number);
  return MESES.map((nombre, mes) => ({
    key: String(mes),
    label: `${nombre} ${anio}`,
    labelCorto: nombre.slice(0, 3),
    ...agregar(diasDelMes(anio, mes).map(resumenDia)),
    esActual: anio === anioHoy && mes === mesHoy - 1,
    futuro: fechaISO(anio, mes, 1) > hoy,
  }));
}

function VistaAnio({ anio, onAnioChange, resumenDia, onIrAMes }: { anio: number; onAnioChange: (a: number) => void; resumenDia: ResumenDia; onIrAMes: (mes: number) => void }) {
  const hoy = hoyISO();
  const [anioHoy] = hoy.split('-').map(Number);
  const enCurso = anio === anioHoy;

  const filasAnteriores = useMemo(() => filasDeAnio(anio - 1, hoy, resumenDia), [anio, hoy, resumenDia]);
  // Cada mes se compara con el mismo mes del año anterior.
  const filas = useMemo<FilaPeriodo[]>(
    () => filasDeAnio(anio, hoy, resumenDia).map((f, i) => ({ ...f, anterior: { label: filasAnteriores[i].label, totales: filasAnteriores[i].totales } })),
    [anio, hoy, resumenDia, filasAnteriores],
  );
  const anterior = useMemo(() => {
    const hasta = enCurso ? `${anio - 1}${hoy.slice(4)}` : `${anio - 1}-12-31`;
    return agregar(fechasEntre(`${anio - 1}-01-01`, hasta).map(resumenDia));
  }, [anio, enCurso, hoy, resumenDia]);
  const patron = useMemo(() => calcularPatronSemanal(`${anio}-12-31`, resumenDia), [anio, resumenDia]);

  return (
    <CajaResumenPeriodo
      titulo={String(anio)}
      subtitulo={enCurso ? `Año en curso · hasta el ${formatFechaCorta(hoy)}` : 'Año completo'}
      onAnterior={() => onAnioChange(anio - 1)}
      onSiguiente={() => onAnioChange(anio + 1)}
      onIrAActual={enCurso ? undefined : () => onAnioChange(anioHoy)}
      actualLabel="Este año"
      filas={filas}
      filasAnteriores={filasAnteriores}
      anterior={anterior}
      anteriorLabel={String(anio - 1)}
      comparadoCon={enCurso ? `vs. ${anio - 1} a misma fecha` : `vs. ${anio - 1}`}
      comparaFilaLabel={`vs ${anio - 1}`}
      patronSemanal={patron}
      unidad="mes"
      totalLabel="Total del año"
      nombreArchivo={`contabilidad-${anio}`}
      onFilaClick={(key) => onIrAMes(Number(key))}
    />
  );
}

type Vista = 'dia' | 'semana' | 'mes' | 'anio' | 'buscar';

export default function CajaPanel() {
  const { movimientos, loading: loadingMovimientos, crearMovimiento, eliminarMovimiento } = useCaja();
  const { dias, porTienda, loading: loadingBascula } = useBasculaVentasDiarias();
  const { porOrigen: syncPorOrigen } = useBasculaSyncEstado();
  const [vista, setVista] = useState<Vista>('dia');
  const [fecha, setFecha] = useState(hoyISO());
  const [lunes, setLunes] = useState(() => lunesDe(hoyISO()));
  const [mes, setMes] = useState(new Date().getMonth());
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [resaltar, setResaltar] = useState<ResaltarObjetivo | null>(null);

  const ingresosPorFecha = useMemo(() => {
    const map = new Map<string, number>();
    dias.forEach((d) => map.set(d.fecha, d.total_importe));
    return map;
  }, [dias]);

  const ingresosPorFechaPorTienda = useMemo(() => {
    const map = new Map<string, Partial<Record<Origen, number>>>();
    porTienda.forEach((t) => {
      const actual = map.get(t.fecha) ?? {};
      actual[t.origen] = (actual[t.origen] ?? 0) + t.total_importe;
      map.set(t.fecha, actual);
    });
    return map;
  }, [porTienda]);

  const ticketsPorFecha = useMemo(() => {
    const map = new Map<string, number>();
    dias.forEach((d) => map.set(d.fecha, d.num_tickets));
    return map;
  }, [dias]);

  const movimientosDelDia = useMemo(() => movimientos.filter((m) => m.fecha === fecha), [movimientos, fecha]);

  const movimientosPorFecha = useMemo(() => {
    const map = new Map<string, CajaMovimiento[]>();
    movimientos.forEach((m) => map.set(m.fecha, [...(map.get(m.fecha) ?? []), m]));
    return map;
  }, [movimientos]);

  // Totales de un día: ingresos de báscula por tienda + movimientos manuales.
  const resumenDia = useCallback<ResumenDia>(
    (f) => {
      const bascula = ingresosPorFecha.get(f) ?? 0;
      const base: Totales = { ...totalesVacios(), ingresos: bascula, ingresos_por_tienda: { ...(ingresosPorFechaPorTienda.get(f) ?? {}) } };
      return {
        totales: (movimientosPorFecha.get(f) ?? []).reduce(acumularTotales, base),
        tickets: ticketsPorFecha.get(f) ?? 0,
        bascula,
      };
    },
    [ingresosPorFecha, ingresosPorFechaPorTienda, movimientosPorFecha, ticketsPorFecha],
  );

  const irADia = (nuevaFecha: string, objetivo?: ResaltarObjetivo) => {
    setFecha(nuevaFecha);
    setVista('dia');
    setResaltar(objetivo ?? null);
  };

  const irAMes = (nuevoMes: number) => {
    setMes(nuevoMes);
    setVista('mes');
  };

  const irABuscar = () => setVista('buscar');

  const loading = loadingMovimientos || loadingBascula;

  return (
    <>
      <div
        className="sticky z-10 bg-background-100/95 backdrop-blur-sm border-b border-background-200/50 px-4 md:px-8 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-1.5"
        style={{ top: 'var(--admin-header-height, 0px)' }}
      >
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {([
            { value: 'dia', label: 'Día' },
            { value: 'semana', label: 'Semana' },
            { value: 'mes', label: 'Mes' },
            { value: 'anio', label: 'Año' },
            { value: 'buscar', label: 'Buscar', icon: 'ri-search-line' },
          ] as { value: Vista; label: string; icon?: string }[]).map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setVista(v.value)}
              className={`flex-shrink-0 whitespace-nowrap inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                vista === v.value ? 'bg-primary-500 text-background-50' : 'bg-background-50 text-foreground-500 hover:bg-background-200/70'
              }`}
            >
              {v.icon && <i className={v.icon}></i>}
              {v.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {ORIGENES.map((o) => (
            <WatchdogBascula key={o} origen={o} info={syncPorOrigen[o]} />
          ))}
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 pb-28">
        {loading ? (
          <p className="text-sm text-foreground-400">Cargando…</p>
        ) : vista === 'dia' ? (
          <VistaDia
            fecha={fecha}
            onFechaChange={setFecha}
            basculaHoy={ingresosPorFecha.get(fecha) ?? 0}
            ticketsHoy={ticketsPorFecha.get(fecha) ?? 0}
            movimientosDelDia={movimientosDelDia}
            onCrear={crearMovimiento}
            onEliminar={eliminarMovimiento}
            resaltar={resaltar}
            onResaltadoConsumido={() => setResaltar(null)}
            onAbrirBuscador={irABuscar}
          />
        ) : vista === 'semana' ? (
          <VistaSemana lunes={lunes} onLunesChange={setLunes} resumenDia={resumenDia} onIrADia={irADia} />
        ) : vista === 'mes' ? (
          <VistaMes
            anio={anio}
            mes={mes}
            onMesChange={(a, m) => {
              setAnio(a);
              setMes(m);
            }}
            resumenDia={resumenDia}
            onIrADia={irADia}
          />
        ) : vista === 'buscar' ? (
          <CajaBuscador movimientos={movimientos} basculaPorTienda={porTienda} onIrADia={irADia} />
        ) : (
          <VistaAnio anio={anio} onAnioChange={setAnio} resumenDia={resumenDia} onIrAMes={irAMes} />
        )}
      </div>
    </>
  );
}
