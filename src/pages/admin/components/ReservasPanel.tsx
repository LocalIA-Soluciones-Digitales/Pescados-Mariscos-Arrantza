import { useMemo, useState } from 'react';
import { useReservasEventos } from '@/hooks/useReservasEventos';
import { useReservas } from '@/hooks/useReservas';
import { useReservasAjustes } from '@/hooks/useReservasAjustes';
import ReservaEventoModal from './ReservaEventoModal';
import type { Reserva, ReservaAjuste, ReservaEstado, ReservaEvento } from '@/types/reserva';

const ESTADO_LABELS: Record<ReservaEstado, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  entregada: 'Entregada',
  cancelada: 'Cancelada',
};

const ESTADO_STYLES: Record<ReservaEstado, string> = {
  pendiente: 'bg-sky-100/80 text-sky-700',
  confirmada: 'bg-amber-100/80 text-amber-700',
  entregada: 'bg-emerald-100/80 text-emerald-700',
  cancelada: 'bg-foreground-200/70 text-foreground-500',
};

const ESTADO_FILTROS: { value: 'todas' | ReservaEstado; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'confirmada', label: 'Confirmadas' },
  { value: 'entregada', label: 'Entregadas' },
  { value: 'cancelada', label: 'Canceladas' },
];

const NEXT_ESTADO: Record<ReservaEstado, ReservaEstado | null> = {
  pendiente: 'confirmada',
  confirmada: 'entregada',
  entregada: null,
  cancelada: null,
};

// Permite deshacer un clic equivocado (p.ej. "Marcar entregada" en la reserva
// que no era) volviendo un paso atrás, en vez de dejar el estado "entregada"
// como definitivo sin salida.
const PREV_ESTADO: Record<ReservaEstado, ReservaEstado | null> = {
  pendiente: null,
  confirmada: 'pendiente',
  entregada: 'confirmada',
  cancelada: null,
};

function formatFecha(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Fecha larga en español para las cabeceras de grupo, p.ej. "Lunes, 10 de agosto".
function formatFechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const texto = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Días de diferencia entre hoy y la fecha deseada, para destacar visualmente
// qué día de recogida es más urgente (el pescadero compra el mismo día).
function diasHasta(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  target.setHours(0, 0, 0, 0);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - hoy.getTime()) / 86_400_000);
}

function EtiquetaUrgencia({ fecha }: { fecha: string }) {
  const dias = diasHasta(fecha);
  let texto: string;
  let estilo: string;
  if (dias < 0) {
    texto = 'Vencido';
    estilo = 'bg-red-100/80 text-red-700';
  } else if (dias === 0) {
    texto = 'Hoy';
    estilo = 'bg-red-100/80 text-red-700';
  } else if (dias === 1) {
    texto = 'Mañana';
    estilo = 'bg-amber-100/80 text-amber-700';
  } else {
    texto = `En ${dias} días`;
    estilo = 'bg-background-200/70 text-foreground-500';
  }
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${estilo}`}>{texto}</span>;
}

function formatKg(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `${rounded} kg`;
}

/* ------------------------------------------------------------------ */
/*  Resumen por producto — lo que el pescadero necesita comprar        */
/* ------------------------------------------------------------------ */
interface ResumenRow {
  key: string;
  nombre: string;
  productoId: string | null;
  reservado: number;
  entregado: number;
  pendiente: number;
}

function ResumenRowCard({
  row,
  ajustes,
  onRegistrarEntrega,
  onDeshacerAjuste,
}: {
  row: ResumenRow;
  ajustes: ReservaAjuste[];
  onRegistrarEntrega: (kg: number) => Promise<void>;
  onDeshacerAjuste: (id: string) => Promise<void>;
}) {
  const [entrada, setEntrada] = useState('');
  const [saving, setSaving] = useState(false);

  const kgValido = (() => {
    const kg = Number(entrada);
    return Number.isFinite(kg) && kg > 0 ? kg : null;
  })();

  const registrar = async () => {
    if (kgValido === null) return;
    if (!confirm(`¿Registrar entrega de ${formatKg(kgValido)} de "${row.nombre}"? Se restará del pendiente.`)) return;
    setSaving(true);
    await onRegistrarEntrega(kgValido);
    setSaving(false);
    setEntrada('');
  };

  const deshacer = async (ajuste: ReservaAjuste) => {
    if (!confirm(`¿Deshacer esta entrega de ${formatKg(ajuste.kg)} de "${row.nombre}"? Volverá a sumarse al pendiente.`)) return;
    setSaving(true);
    await onDeshacerAjuste(ajuste.id);
    setSaving(false);
  };

  const completo = row.pendiente <= 0 && row.reservado > 0;

  return (
    <div
      className={`rounded-xl border px-4 py-3 shadow-card hover:shadow-card-hover transition-all duration-200 ${
        completo ? 'bg-emerald-50/50 border-emerald-200' : 'bg-background-50 border-background-200/70'
      } ${saving ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground-950 truncate">{row.nombre}</p>
          <p className="text-xs text-foreground-400 mt-0.5">
            Reservado: {formatKg(row.reservado)} · Entregado: {formatKg(row.entregado)}
          </p>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right">
            <p className={`text-lg font-bold leading-none tabular-nums ${completo ? 'text-emerald-600' : 'text-foreground-950'}`}>
              {completo ? '✓' : formatKg(row.pendiente)}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-foreground-400 mt-0.5">
              {completo ? 'Completado' : 'Pendiente de comprar'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-background-200/60">
        <label className="text-[11px] text-foreground-400">Registrar entrega</label>
        <input
          type="number"
          step="0.5"
          min="0"
          placeholder="0"
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') registrar();
          }}
          disabled={saving}
          className="w-16 px-2 py-1 bg-background-100 border border-background-200/70 rounded-md text-sm text-right"
        />
        <span className="text-xs text-foreground-400">kg</span>
        <button
          type="button"
          onClick={registrar}
          disabled={saving || kgValido === null}
          className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Registrar
        </button>
        <span className="text-[11px] text-foreground-300 ml-1">— o marca la reserva como "Entregada" en la pestaña Reservas</span>
      </div>

      {ajustes.length > 0 && (
        <div className="mt-2 pt-2 border-t border-background-200/40 space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-foreground-400">Entregas manuales registradas</p>
          {ajustes.map((a) => (
            <div key={a.id} className="flex items-center justify-between text-[11px] text-foreground-500">
              <span>
                {formatKg(a.kg)} — {new Date(a.created_at).toLocaleString('es-ES')}
              </span>
              <button
                type="button"
                onClick={() => deshacer(a)}
                disabled={saving}
                className="inline-flex items-center gap-1 text-foreground-400 hover:text-red-600 disabled:opacity-40"
              >
                <i className="ri-arrow-go-back-line"></i>
                Deshacer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Resumen agrupado por día de recogida — lo primero que mira el      */
/*  pescadero: qué tiene que comprar HOY en la lonja, no la suma de    */
/*  todo el pescado de la campaña mezclado entre fechas distintas.     */
/* ------------------------------------------------------------------ */
interface ResumenFechaGroup {
  key: string;
  fecha: string | null;
  clientes: number;
  totalKg: number;
  productos: ResumenRow[];
}

function ResumenFechaCard({ grupo }: { grupo: ResumenFechaGroup }) {
  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl shadow-card p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <i className="ri-calendar-check-line text-primary-600"></i>
          <h4 className="text-sm font-heading font-semibold text-foreground-950">
            {grupo.fecha ? formatFechaLarga(grupo.fecha) : 'Sin fecha indicada'}
          </h4>
          {grupo.fecha && <EtiquetaUrgencia fecha={grupo.fecha} />}
        </div>
        <p className="text-xs text-foreground-400">
          {grupo.clientes} cliente{grupo.clientes === 1 ? '' : 's'} · {formatKg(grupo.totalKg)} en total
        </p>
      </div>

      <div className="divide-y divide-background-200/50">
        {grupo.productos.map((row) => {
          const completo = row.pendiente <= 0 && row.reservado > 0;
          return (
            <div key={row.key} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <p className="text-sm text-foreground-800 truncate">{row.nombre}</p>
              <div className="text-right flex-shrink-0">
                <p className={`text-sm font-bold tabular-nums ${completo ? 'text-emerald-600' : 'text-foreground-950'}`}>
                  {completo ? '✓ Entregado' : formatKg(row.pendiente)}
                </p>
                {!completo && row.entregado > 0 && (
                  <p className="text-[10px] text-foreground-400">de {formatKg(row.reservado)} reservado</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tarjeta de reserva individual                                      */
/* ------------------------------------------------------------------ */
function ReservaCard({
  reserva,
  onSetEstado,
  onDelete,
}: {
  reserva: Reserva;
  onSetEstado: (id: string, estado: ReservaEstado) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const next = NEXT_ESTADO[reserva.estado];
  const prev = PREV_ESTADO[reserva.estado];
  const telefono = reserva.cliente_telefono?.replace(/\D/g, '');

  const handleSetEstado = (estado: ReservaEstado, mensaje: string) => {
    if (!confirm(mensaje)) return;
    onSetEstado(reserva.id, estado);
  };

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl shadow-card hover:shadow-card-hover transition-shadow duration-200 p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ESTADO_STYLES[reserva.estado]}`}>
              {ESTADO_LABELS[reserva.estado]}
            </span>
            {reserva.fecha_deseada && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary-100/70 text-primary-700">
                <i className="ri-calendar-check-line"></i>
                Recoge: {formatFecha(reserva.fecha_deseada)}
              </span>
            )}
            <span className="text-[10px] text-foreground-400">{new Date(reserva.created_at).toLocaleString('es-ES')}</span>
          </div>
          <p className="text-sm font-medium text-foreground-950 mt-1">{reserva.cliente_nombre}</p>
        </div>
        <p className="text-sm font-semibold text-foreground-950 flex-shrink-0">
          {reserva.importe_estimado != null ? `${reserva.importe_estimado.toFixed(2)} €` : '—'}
        </p>
      </div>

      <button type="button" onClick={() => setExpanded((v) => !v)} className="text-xs text-foreground-500 hover:text-foreground-950 mb-2">
        {reserva.total_productos} producto{reserva.total_productos === 1 ? '' : 's'} · {reserva.peso_total} kg {expanded ? '▲' : '▼'}
      </button>

      {expanded && (
        <div className="bg-background-100 rounded-lg p-2.5 mb-2 space-y-1">
          {reserva.items.map((item, idx) => (
            <p key={idx} className="text-xs text-foreground-600">
              {item.kg} kg — {item.nombre}
              {item.nota ? ` — "${item.nota}"` : ''}
            </p>
          ))}
          {reserva.notas && <p className="text-xs text-foreground-500 italic mt-1">Notas: {reserva.notas}</p>}
          {reserva.cliente_email && <p className="text-xs text-foreground-500 mt-1">{reserva.cliente_email}</p>}
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {telefono && (
          <>
            <a href={`tel:+34${telefono.replace(/^34/, '')}`} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-background-100 text-foreground-600 hover:bg-background-200/70">
              Llamar
            </a>
            <a href={`https://wa.me/34${telefono.replace(/^34/, '')}`} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
              WhatsApp
            </a>
          </>
        )}
        {next && (
          <button
            type="button"
            onClick={() => handleSetEstado(next, `¿Marcar esta reserva como "${ESTADO_LABELS[next]}"?`)}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-primary-500 text-background-50 hover:bg-primary-600"
          >
            Marcar {ESTADO_LABELS[next].toLowerCase()}
          </button>
        )}
        {prev && (
          <button
            type="button"
            onClick={() => handleSetEstado(prev, `¿Deshacer y volver esta reserva a "${ESTADO_LABELS[prev]}"?`)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-background-100 text-foreground-500 hover:bg-background-200/70"
          >
            <i className="ri-arrow-go-back-line"></i>
            Deshacer
          </button>
        )}
        {reserva.estado !== 'cancelada' && reserva.estado !== 'entregada' && (
          <button
            type="button"
            onClick={() => handleSetEstado('cancelada', '¿Cancelar esta reserva?')}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-50 text-red-600 hover:bg-red-100"
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (confirm('¿Eliminar esta reserva del historial?')) onDelete(reserva.id);
          }}
          className="ml-auto px-2 py-1 rounded-full text-[11px] font-medium text-foreground-400 hover:text-red-600"
        >
          <i className="ri-delete-bin-line"></i>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Selector de campañas (eventos de reserva)                          */
/* ------------------------------------------------------------------ */
function EventoTabs({
  eventos,
  selectedId,
  onSelect,
  onNuevo,
}: {
  eventos: ReservaEvento[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNuevo: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
      {eventos.map((ev) => (
        <button
          key={ev.id}
          type="button"
          onClick={() => onSelect(ev.id)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
            selectedId === ev.id ? 'bg-primary-500 text-background-50' : 'bg-background-50 text-foreground-500 hover:bg-background-200/70'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${ev.activo ? 'bg-emerald-400' : 'bg-foreground-300'}`}></span>
          {ev.nombre_es}
          <span className={`text-[10px] ${selectedId === ev.id ? 'text-background-50/80' : 'text-foreground-400'}`}>
            {formatFecha(ev.fecha_entrega)}
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={onNuevo}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 border border-dashed border-background-300 text-foreground-500 hover:bg-background-100"
      >
        <i className="ri-add-line"></i>
        Nueva campaña
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel principal                                                    */
/* ------------------------------------------------------------------ */
export default function ReservasPanel() {
  const { eventos, loading: loadingEventos, crearEvento, patchEvento, eliminarEvento } = useReservasEventos();
  const { reservas, loading: loadingReservas, setEstado, deleteReserva } = useReservas();
  const { ajustes, registrarAjuste, eliminarAjuste } = useReservasAjustes();

  const [selectedEventoId, setSelectedEventoId] = useState<string | null>(null);
  const [vista, setVista] = useState<'resumen' | 'reservas'>('resumen');
  const [filtroEstado, setFiltroEstado] = useState<'todas' | ReservaEstado>('todas');
  const [search, setSearch] = useState('');
  const [modalEvento, setModalEvento] = useState<'new' | ReservaEvento | null>(null);

  const eventoActivo = useMemo(() => {
    if (selectedEventoId) return eventos.find((e) => e.id === selectedEventoId) ?? null;
    return eventos.find((e) => e.activo) ?? eventos[0] ?? null;
  }, [eventos, selectedEventoId]);

  const reservasDelEvento = useMemo(
    () => (eventoActivo ? reservas.filter((r) => r.evento_id === eventoActivo.id) : []),
    [reservas, eventoActivo],
  );
  const ajustesDelEvento = useMemo(
    () => (eventoActivo ? ajustes.filter((a) => a.evento_id === eventoActivo.id) : []),
    [ajustes, eventoActivo],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { todas: reservasDelEvento.length };
    (['pendiente', 'confirmada', 'entregada', 'cancelada'] as ReservaEstado[]).forEach((e) => {
      c[e] = reservasDelEvento.filter((r) => r.estado === e).length;
    });
    return c;
  }, [reservasDelEvento]);

  const visibles = useMemo(() => {
    let result = filtroEstado === 'todas' ? reservasDelEvento : reservasDelEvento.filter((r) => r.estado === filtroEstado);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => r.cliente_nombre.toLowerCase().includes(q) || r.cliente_telefono?.toLowerCase().includes(q));
    }
    return result;
  }, [reservasDelEvento, filtroEstado, search]);

  const resumen = useMemo(() => {
    const map = new Map<string, ResumenRow>();
    reservasDelEvento
      .filter((r) => r.estado !== 'cancelada')
      .forEach((r) => {
        r.items.forEach((item) => {
          const key = item.productoId || item.nombre;
          const row = map.get(key) ?? { key, nombre: item.nombre, productoId: item.productoId || null, reservado: 0, entregado: 0, pendiente: 0 };
          row.reservado += item.kg;
          if (r.estado === 'entregada') row.entregado += item.kg;
          map.set(key, row);
        });
      });
    ajustesDelEvento.forEach((a) => {
      const key = a.producto_id || a.producto_nombre;
      const row = map.get(key) ?? { key, nombre: a.producto_nombre, productoId: a.producto_id, reservado: 0, entregado: 0, pendiente: 0 };
      row.entregado += a.kg;
      map.set(key, row);
    });
    return Array.from(map.values())
      .map((row) => ({ ...row, pendiente: Math.max(row.reservado - row.entregado, 0) }))
      .sort((a, b) => b.pendiente - a.pendiente || b.reservado - a.reservado || a.nombre.localeCompare(b.nombre, 'es'));
  }, [reservasDelEvento, ajustesDelEvento]);

  // Mismo cálculo que `resumen`, pero agrupado primero por fecha_deseada:
  // sumar el bacalao de dos clientes que lo recogen en días distintos no
  // sirve de nada, el pescadero compra en la lonja el mismo día que se recoge.
  const resumenPorFecha = useMemo<ResumenFechaGroup[]>(() => {
    const map = new Map<string, { fecha: string | null; reservaIds: Set<string>; productos: Map<string, ResumenRow> }>();
    reservasDelEvento
      .filter((r) => r.estado !== 'cancelada')
      .forEach((r) => {
        const groupKey = r.fecha_deseada || '__sin_fecha__';
        if (!map.has(groupKey)) {
          map.set(groupKey, { fecha: r.fecha_deseada, reservaIds: new Set(), productos: new Map() });
        }
        const group = map.get(groupKey)!;
        group.reservaIds.add(r.id);
        r.items.forEach((item) => {
          const key = item.productoId || item.nombre;
          const row = group.productos.get(key) ?? {
            key,
            nombre: item.nombre,
            productoId: item.productoId || null,
            reservado: 0,
            entregado: 0,
            pendiente: 0,
          };
          row.reservado += item.kg;
          if (r.estado === 'entregada') row.entregado += item.kg;
          group.productos.set(key, row);
        });
      });

    return Array.from(map.values())
      .map((g) => {
        const productos = Array.from(g.productos.values())
          .map((row) => ({ ...row, pendiente: Math.max(row.reservado - row.entregado, 0) }))
          .sort((a, b) => b.pendiente - a.pendiente || a.nombre.localeCompare(b.nombre, 'es'));
        return {
          key: g.fecha ?? '__sin_fecha__',
          fecha: g.fecha,
          clientes: g.reservaIds.size,
          totalKg: productos.reduce((sum, row) => sum + row.reservado, 0),
          productos,
        };
      })
      .sort((a, b) => {
        if (!a.fecha && !b.fecha) return 0;
        if (!a.fecha) return 1;
        if (!b.fecha) return -1;
        return a.fecha.localeCompare(b.fecha);
      });
  }, [reservasDelEvento]);

  const visiblesPorFecha = useMemo(() => {
    const map = new Map<string, Reserva[]>();
    visibles.forEach((r) => {
      const key = r.fecha_deseada || '__sin_fecha__';
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    });
    return Array.from(map.entries())
      .map(([key, lista]) => ({ key, fecha: lista[0].fecha_deseada, reservas: lista }))
      .sort((a, b) => {
        if (!a.fecha && !b.fecha) return 0;
        if (!a.fecha) return 1;
        if (!b.fecha) return -1;
        return a.fecha.localeCompare(b.fecha);
      });
  }, [visibles]);

  const totalPendienteKg = useMemo(() => resumen.reduce((sum, r) => sum + r.pendiente, 0), [resumen]);
  const clientesUnicos = useMemo(
    () => new Set(reservasDelEvento.filter((r) => r.estado !== 'cancelada').map((r) => r.cliente_nombre.trim().toLowerCase())).size,
    [reservasDelEvento],
  );

  const loading = loadingEventos || loadingReservas;

  const handleSaveEvento = async (input: Parameters<typeof crearEvento>[0] & { activo: boolean }) => {
    if (modalEvento === 'new') {
      const created = await crearEvento(input);
      if (created) setSelectedEventoId(created.id);
      return !!created;
    }
    if (modalEvento) {
      return patchEvento(modalEvento.id, input);
    }
    return false;
  };

  const handleEliminarEvento = async () => {
    if (!eventoActivo) return;
    if (!confirm(`¿Eliminar la campaña "${eventoActivo.nombre_es}"? Solo es posible si no tiene reservas asociadas.`)) return;
    const ok = await eliminarEvento(eventoActivo.id);
    if (!ok) alert('No se pudo eliminar: esta campaña tiene reservas asociadas. Cancélalas o consérvala como cerrada.');
    else setSelectedEventoId(null);
  };

  if (loading && eventos.length === 0) {
    return (
      <div className="px-4 md:px-8 py-6">
        <p className="text-sm text-foreground-400">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 pb-28">
      <p className="text-xs text-foreground-400 mb-4">
        Crea una campaña por cada fecha especial (Navidad, Nochevieja...). Los clientes reservan productos, cantidades
        y su día de recogida desde la web; aquí lo ves agrupado por ese día, para saber qué comprar en la lonja cada
        jornada. Al marcar una reserva como "Entregada" se descuenta automáticamente del pendiente de ese día.
      </p>

      {eventos.length === 0 ? (
        <div className="text-center py-16">
          <span className="w-14 h-14 flex items-center justify-center mx-auto mb-4 rounded-full bg-background-100 text-foreground-400 text-2xl">
            <i className="ri-calendar-event-line"></i>
          </span>
          <p className="text-sm font-medium text-foreground-700 mb-1">Todavía no hay ninguna campaña de reservas</p>
          <p className="text-xs text-foreground-400 mb-4">Crea la primera, por ejemplo "Navidad 2026", con su fecha de entrega.</p>
          <button
            type="button"
            onClick={() => setModalEvento('new')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600"
          >
            <i className="ri-add-line"></i>
            Crear campaña de reservas
          </button>
        </div>
      ) : (
        <>
          <EventoTabs eventos={eventos} selectedId={eventoActivo?.id ?? null} onSelect={setSelectedEventoId} onNuevo={() => setModalEvento('new')} />

          {eventoActivo && (
            <>
              {/* Cabecera de la campaña seleccionada */}
              <div className="mt-4 bg-background-50 border border-background-200/70 rounded-xl shadow-card p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-heading font-semibold text-foreground-950">{eventoActivo.nombre_es}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${eventoActivo.activo ? 'bg-emerald-100/80 text-emerald-700' : 'bg-background-200/70 text-foreground-500'}`}>
                      {eventoActivo.activo ? 'Abierta' : 'Cerrada'}
                    </span>
                  </div>
                  <p className="text-xs text-foreground-400 mt-1">
                    Recogidas desde: {formatFecha(eventoActivo.fecha_entrega)}
                    {eventoActivo.fecha_limite && <> · Fecha límite de pedido: {formatFecha(eventoActivo.fecha_limite)}</>}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-center">
                  <div>
                    <p className="text-lg font-bold text-foreground-950 leading-none tabular-nums">{counts.todas}</p>
                    <p className="text-[10px] text-foreground-400 mt-1">reservas</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground-950 leading-none tabular-nums">{clientesUnicos}</p>
                    <p className="text-[10px] text-foreground-400 mt-1">clientes</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-primary-600 leading-none tabular-nums">{formatKg(totalPendienteKg)}</p>
                    <p className="text-[10px] text-foreground-400 mt-1">pendiente</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => patchEvento(eventoActivo.id, { activo: !eventoActivo.activo })}
                    className="px-2.5 py-1.5 rounded-full text-[11px] font-medium bg-background-100 text-foreground-600 hover:bg-background-200/70"
                  >
                    {eventoActivo.activo ? 'Cerrar campaña' : 'Reabrir'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalEvento(eventoActivo)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-background-100 text-foreground-600 hover:bg-background-200/70"
                    aria-label="Editar campaña"
                  >
                    <i className="ri-pencil-line text-sm"></i>
                  </button>
                  <button
                    type="button"
                    onClick={handleEliminarEvento}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100"
                    aria-label="Eliminar campaña"
                  >
                    <i className="ri-delete-bin-line text-sm"></i>
                  </button>
                </div>
              </div>

              {/* Cambio de vista */}
              <div className="flex items-center gap-1.5 mt-4 mb-3">
                <button
                  type="button"
                  onClick={() => setVista('resumen')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium ${vista === 'resumen' ? 'bg-foreground-950 text-background-50' : 'bg-background-100 text-foreground-500 hover:bg-background-200/70'}`}
                >
                  <i className="ri-bar-chart-2-line mr-1"></i>
                  Resumen por producto
                </button>
                <button
                  type="button"
                  onClick={() => setVista('reservas')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium ${vista === 'reservas' ? 'bg-foreground-950 text-background-50' : 'bg-background-100 text-foreground-500 hover:bg-background-200/70'}`}
                >
                  <i className="ri-list-check-2 mr-1"></i>
                  Reservas ({counts.todas})
                </button>
              </div>

              {vista === 'resumen' ? (
                resumenPorFecha.length === 0 ? (
                  <p className="text-sm text-foreground-400 mt-6">Todavía no hay reservas para esta campaña.</p>
                ) : (
                  <>
                    <div className="space-y-3 mt-2">
                      {resumenPorFecha.map((grupo) => (
                        <ResumenFechaCard key={grupo.key} grupo={grupo} />
                      ))}
                    </div>

                    <details className="mt-5 group">
                      <summary className="cursor-pointer text-xs font-medium text-foreground-500 hover:text-foreground-950 select-none">
                        <i className="ri-add-box-line mr-1"></i>
                        Total de toda la campaña y entregas manuales por teléfono
                      </summary>
                      <p className="text-[11px] text-foreground-400 mt-2 mb-2">
                        Vista agregada de todas las fechas juntas — útil solo para registrar una entrega que no está
                        ligada a ninguna reserva concreta (p. ej. gestionada por teléfono).
                      </p>
                      <div className="space-y-2">
                        {resumen.map((row) => (
                          <ResumenRowCard
                            key={row.key}
                            row={row}
                            ajustes={ajustesDelEvento.filter((a) => (a.producto_id || a.producto_nombre) === row.key)}
                            onRegistrarEntrega={async (kg) => {
                              await registrarAjuste({
                                evento_id: eventoActivo.id,
                                producto_id: row.productoId,
                                producto_nombre: row.nombre,
                                kg,
                              });
                            }}
                            onDeshacerAjuste={async (id) => {
                              await eliminarAjuste(id);
                            }}
                          />
                        ))}
                      </div>
                    </details>
                  </>
                )
              ) : (
                <>
                  <div className="relative max-w-[280px] mb-3">
                    <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por cliente o teléfono…"
                      className="w-full pl-9 pr-3 py-2 bg-background-50 border border-background-200/70 rounded-full text-sm focus:outline-none focus:border-foreground-300/60"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide mb-3">
                    {ESTADO_FILTROS.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setFiltroEstado(f.value)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                          filtroEstado === f.value ? 'bg-primary-500 text-background-50' : 'bg-background-50 text-foreground-500 hover:bg-background-200/70'
                        }`}
                      >
                        {f.label}
                        <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] ${filtroEstado === f.value ? 'bg-background-50/20' : 'bg-background-200/60 text-foreground-400'}`}>
                          {counts[f.value] ?? 0}
                        </span>
                      </button>
                    ))}
                  </div>

                  {visibles.length === 0 ? (
                    <p className="text-sm text-foreground-400">No hay reservas que coincidan con el filtro.</p>
                  ) : (
                    <div className="space-y-4">
                      {visiblesPorFecha.map((grupo) => (
                        <div key={grupo.key}>
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <i className="ri-calendar-check-line text-primary-600 text-sm"></i>
                            <h4 className="text-xs font-semibold text-foreground-700">
                              {grupo.fecha ? formatFechaLarga(grupo.fecha) : 'Sin fecha indicada'}
                            </h4>
                            {grupo.fecha && <EtiquetaUrgencia fecha={grupo.fecha} />}
                            <span className="text-[10px] text-foreground-400">
                              {grupo.reservas.length} reserva{grupo.reservas.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {grupo.reservas.map((reserva) => (
                              <ReservaCard key={reserva.id} reserva={reserva} onSetEstado={setEstado} onDelete={deleteReserva} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {modalEvento !== null && (
        <ReservaEventoModal evento={modalEvento === 'new' ? null : modalEvento} onClose={() => setModalEvento(null)} onSave={handleSaveEvento} />
      )}
    </div>
  );
}
