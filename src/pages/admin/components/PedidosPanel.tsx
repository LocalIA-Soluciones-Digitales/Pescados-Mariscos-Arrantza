import { useMemo, useState } from 'react';
import { usePedidos } from '@/hooks/usePedidos';
import type { Pedido, PedidoEstado, PedidoEstadoPago } from '@/types/pedido';
import DiaNavigator from '@/components/base/DiaNavigator';

const ESTADO_PAGO_LABELS: Record<PedidoEstadoPago, string> = {
  no_aplica: '',
  pendiente: 'Pago pendiente',
  pagado: 'Pagado con tarjeta',
  fallido: 'Pago fallido',
};

const ESTADO_PAGO_STYLES: Record<PedidoEstadoPago, string> = {
  no_aplica: '',
  pendiente: 'bg-amber-100/80 text-amber-700',
  pagado: 'bg-emerald-100/80 text-emerald-700',
  fallido: 'bg-red-100/80 text-red-700',
};

const ESTADO_LABELS: Record<PedidoEstado, string> = {
  nuevo: 'Nuevo',
  confirmado: 'Confirmado',
  completado: 'Completado',
  cancelado: 'Cancelado',
};

const ESTADO_STYLES: Record<PedidoEstado, string> = {
  nuevo: 'bg-sky-100/80 text-sky-700',
  confirmado: 'bg-amber-100/80 text-amber-700',
  completado: 'bg-emerald-100/80 text-emerald-700',
  cancelado: 'bg-foreground-200/70 text-foreground-500',
};

const ESTADO_FILTROS: { value: 'todos' | PedidoEstado; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'nuevo', label: 'Nuevos' },
  { value: 'confirmado', label: 'Confirmados' },
  { value: 'completado', label: 'Completados' },
  { value: 'cancelado', label: 'Cancelados' },
];

const NEXT_ESTADO: Record<PedidoEstado, PedidoEstado | null> = {
  nuevo: 'confirmado',
  confirmado: 'completado',
  completado: null,
  cancelado: null,
};

function formatPrecio(n: number | null): string {
  if (n === null) return '—';
  return `${n.toFixed(2)} €`;
}

// Fecha larga en español para las cabeceras de grupo, p.ej. "Lunes, 10 de agosto".
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

// Días de diferencia entre hoy y la fecha preferida, para destacar visualmente
// qué pedidos son más urgentes de preparar.
function diasHasta(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  target.setHours(0, 0, 0, 0);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - hoy.getTime()) / 86_400_000);
}

// Centraliza el texto y los colores de urgencia para reutilizarlos tanto en
// la insignia como en el acento de la cabecera del día (icono).
function urgenciaInfo(fecha: string): { texto: string; badge: string; acento: string } {
  const dias = diasHasta(fecha);
  if (dias < 0) return { texto: 'Vencido', badge: 'bg-red-100/80 text-red-700', acento: 'bg-red-500' };
  if (dias === 0) return { texto: 'Hoy', badge: 'bg-red-100/80 text-red-700', acento: 'bg-red-500' };
  if (dias === 1) return { texto: 'Mañana', badge: 'bg-amber-100/80 text-amber-700', acento: 'bg-amber-500' };
  return { texto: `En ${dias} días`, badge: 'bg-background-200/70 text-foreground-500', acento: 'bg-foreground-300' };
}

function EtiquetaUrgencia({ fecha }: { fecha: string }) {
  const { texto, badge } = urgenciaInfo(fecha);
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${badge}`}>{texto}</span>;
}

// Mensaje que recibe el cliente por WhatsApp al confirmar su pedido — se abre
// ya redactado, David solo tiene que revisar y pulsar enviar.
function buildMensajeConfirmacion(pedido: Pedido): string {
  const nombre = pedido.cliente_nombre?.trim().split(' ')[0] || '';
  const isHome = pedido.metodo_entrega === 'home';
  const lines: string[] = [];

  lines.push(`Hola${nombre ? ` ${nombre}` : ''} 👋`);
  lines.push('');
  lines.push('Le confirmamos su pedido en *Pescados y Mariscos Arrantza* ✅');
  lines.push('');
  lines.push(`📅 Fecha: ${pedido.fecha_preferida ? formatFechaLarga(pedido.fecha_preferida) : 'A confirmar'}`);
  lines.push(`🕒 Hora: ${pedido.hora_preferida || 'A confirmar'}`);
  lines.push('');

  if (isHome) {
    lines.push('🚚 Se lo entregaremos a domicilio en:');
    lines.push(`${pedido.cliente_direccion || ''}, ${pedido.cliente_ciudad || ''} ${pedido.cliente_cp || ''}`.trim());
  } else {
    lines.push('🏪 Podrá recogerlo en tienda:');
    lines.push('Calle Jesús Aramburu, 1, 48950 Erandio, Bizkaia');
  }

  lines.push('');
  lines.push(`🛒 ${pedido.total_productos} producto${pedido.total_productos === 1 ? '' : 's'} · ${pedido.peso_total} kg`);
  if (pedido.importe_estimado !== null) {
    lines.push(`💶 Total estimado: ${formatPrecio(pedido.importe_estimado)}`);
  }

  lines.push('');
  lines.push('Si necesita cambiar algo, puede responder a este mensaje.');
  lines.push('');
  lines.push('¡Gracias por su confianza! 🐟');
  lines.push('Pescados y Mariscos Arrantza');

  return lines.join('\n');
}

// Mensaje que recibe el cliente por WhatsApp al completar su pedido —
// agradece la compra y anima a que vuelva.
function buildMensajeAgradecimiento(pedido: Pedido): string {
  const nombre = pedido.cliente_nombre?.trim().split(' ')[0] || '';
  const lines: string[] = [];

  lines.push(`Hola${nombre ? ` ${nombre}` : ''} 👋`);
  lines.push('');
  lines.push('Su pedido en *Pescados y Mariscos Arrantza* ya está completado ✅');
  lines.push('');
  lines.push('Muchas gracias por su confianza. Esperamos que disfrute del producto y estaremos encantados de atenderle de nuevo en su próxima compra.');
  lines.push('');
  lines.push('¡Hasta pronto! 🐟');
  lines.push('Pescados y Mariscos Arrantza');

  return lines.join('\n');
}

function PedidoCard({
  pedido,
  onSetEstado,
  onSetEstadoPago,
  onDelete,
}: {
  pedido: Pedido;
  onSetEstado: (id: string, estado: PedidoEstado) => void;
  onSetEstadoPago: (id: string, estadoPago: PedidoEstadoPago) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const next = NEXT_ESTADO[pedido.estado];
  const telefono = pedido.cliente_telefono?.replace(/\D/g, '');

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl shadow-card hover:shadow-card-hover transition-shadow duration-200 p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ESTADO_STYLES[pedido.estado]}`}>
              {ESTADO_LABELS[pedido.estado]}
            </span>
            {pedido.hora_preferida && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary-100/70 text-primary-700">
                <i className="ri-time-line"></i>
                {pedido.hora_preferida}
              </span>
            )}
            <span className="text-[10px] text-foreground-400">
              {pedido.metodo_entrega === 'home' ? 'A domicilio' : 'Recogida en tienda'}
            </span>
            <span className="text-[10px] text-foreground-400">Pedido: {new Date(pedido.created_at).toLocaleString('es-ES')}</span>
            {pedido.estado_pago !== 'no_aplica' && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ESTADO_PAGO_STYLES[pedido.estado_pago]}`}>
                {ESTADO_PAGO_LABELS[pedido.estado_pago]}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground-950 mt-1">
            {pedido.cliente_nombre || 'Sin nombre'}
            {pedido.cliente_negocio ? ` · ${pedido.cliente_negocio}` : ''}
          </p>
        </div>
        <p className="text-sm font-semibold text-foreground-950 flex-shrink-0">{formatPrecio(pedido.importe_estimado)}</p>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-foreground-500 hover:text-foreground-950 mb-2"
      >
        {pedido.total_productos} producto{pedido.total_productos === 1 ? '' : 's'} · {pedido.peso_total} kg {expanded ? '▲' : '▼'}
      </button>

      {expanded && (
        <div className="bg-background-100 rounded-lg p-2.5 mb-2 space-y-1">
          {pedido.items.map((item, idx) => (
            <p key={idx} className="text-xs text-foreground-600">
              {item.kg} kg — {item.nombre}
              {item.preparacion && item.preparacion !== 'whole' ? ` (${item.preparacion})` : ''}
              {item.nota ? ` — "${item.nota}"` : ''}
            </p>
          ))}
          {pedido.notas && <p className="text-xs text-foreground-500 italic mt-1">Notas: {pedido.notas}</p>}
          {pedido.metodo_entrega === 'home' && (
            <p className="text-xs text-foreground-500 mt-1">
              {pedido.cliente_direccion}, {pedido.cliente_ciudad} {pedido.cliente_cp}
            </p>
          )}
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
        {pedido.metodo_pago === 'bizum' && pedido.estado_pago === 'pendiente' && (
          <button
            type="button"
            onClick={() => onSetEstadoPago(pedido.id, 'pagado')}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-sky-500 text-background-50 hover:bg-sky-600"
          >
            Marcar pagado (Bizum)
          </button>
        )}
        {next && (
          <button
            type="button"
            onClick={() => {
              onSetEstado(pedido.id, next);
              if (telefono && (next === 'confirmado' || next === 'completado')) {
                const mensaje = next === 'confirmado' ? buildMensajeConfirmacion(pedido) : buildMensajeAgradecimiento(pedido);
                window.open(`https://api.whatsapp.com/send?phone=34${telefono}&text=${encodeURIComponent(mensaje)}`, '_blank');
              }
            }}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-primary-500 text-background-50 hover:bg-primary-600"
          >
            Marcar {ESTADO_LABELS[next].toLowerCase()}
          </button>
        )}
        {pedido.estado !== 'cancelado' && pedido.estado !== 'completado' && (
          <button
            type="button"
            onClick={() => onSetEstado(pedido.id, 'cancelado')}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-50 text-red-600 hover:bg-red-100"
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (confirm('¿Eliminar este pedido del historial?')) onDelete(pedido.id);
          }}
          className="ml-auto px-2 py-1 rounded-full text-[11px] font-medium text-foreground-400 hover:text-red-600"
        >
          <i className="ri-delete-bin-line"></i>
        </button>
      </div>
    </div>
  );
}

export default function PedidosPanel() {
  const { pedidos, loading, setEstado, setEstadoPago, deletePedido } = usePedidos();
  const [filtro, setFiltro] = useState<'todos' | PedidoEstado>('todos');
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<Date>(() => new Date());

  const toggleColapsado = (key: string) => {
    setColapsados((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Solo se muestran los pedidos del día seleccionado (más los que aún no
  // tienen fecha asignada, para que no se pierdan de vista) — se navega a
  // otras fechas con el DiaNavigator en vez de listarlas todas de golpe.
  const cursorIso = isoDeFecha(cursor);
  const pedidosDelDia = useMemo(
    () => pedidos.filter((p) => !p.fecha_preferida || p.fecha_preferida === cursorIso),
    [pedidos, cursorIso],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: pedidosDelDia.length };
    (['nuevo', 'confirmado', 'completado', 'cancelado'] as PedidoEstado[]).forEach((e) => {
      c[e] = pedidosDelDia.filter((p) => p.estado === e).length;
    });
    return c;
  }, [pedidosDelDia]);

  const visibles = useMemo(
    () => (filtro === 'todos' ? pedidosDelDia : pedidosDelDia.filter((p) => p.estado === filtro)),
    [pedidosDelDia, filtro],
  );

  // Agrupar por fecha preferida de recogida/entrega, igual que en Reservas,
  // para ver de un vistazo qué hay que preparar cada día.
  const visiblesPorFecha = useMemo(() => {
    const map = new Map<string, Pedido[]>();
    visibles.forEach((p) => {
      const key = p.fecha_preferida || '__sin_fecha__';
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    });
    return Array.from(map.entries())
      .map(([key, lista]) => ({ key, fecha: lista[0].fecha_preferida, pedidos: lista }))
      .sort((a, b) => {
        if (!a.fecha && !b.fecha) return 0;
        if (!a.fecha) return 1;
        if (!b.fecha) return -1;
        return a.fecha.localeCompare(b.fecha);
      });
  }, [visibles]);

  return (
    <div className="px-4 md:px-8 py-6 pb-28">
      <div className="mb-4">
        <DiaNavigator value={cursor} onChange={setCursor} label={formatFechaLarga(cursorIso)} />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide mb-4">
        {ESTADO_FILTROS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFiltro(f.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
              filtro === f.value ? 'bg-primary-500 text-background-50' : 'bg-background-50 text-foreground-500 hover:bg-background-200/70'
            }`}
          >
            {f.label}
            <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] ${filtro === f.value ? 'bg-background-50/20' : 'bg-background-200/60 text-foreground-400'}`}>
              {counts[f.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-foreground-400">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-foreground-400">No hay pedidos que coincidan con el filtro.</p>
      ) : (
        <div className="space-y-5">
          {visiblesPorFecha.map((grupo) => {
            const urgencia = grupo.fecha ? urgenciaInfo(grupo.fecha) : null;
            const colapsado = colapsados.has(grupo.key);
            return (
              <div key={grupo.key} className="rounded-2xl border border-background-200/70 bg-background-100/50 p-2.5 md:p-3">
                <button
                  type="button"
                  onClick={() => toggleColapsado(grupo.key)}
                  className="flex items-center justify-between gap-2.5 mb-2.5 px-1 py-1 w-full text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-background-50 ${urgencia?.acento ?? 'bg-primary-500'}`}
                    >
                      <i className="ri-calendar-check-line text-sm"></i>
                    </span>
                    <h4 className="text-sm md:text-base font-heading font-bold text-foreground-950 truncate min-w-0">
                      {grupo.fecha ? formatFechaLarga(grupo.fecha) : 'Sin fecha indicada'}
                    </h4>
                    {grupo.fecha && (
                      <span className="flex-shrink-0">
                        <EtiquetaUrgencia fecha={grupo.fecha} />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[11px] font-medium text-foreground-500 whitespace-nowrap">
                      {grupo.pedidos.length} pedido{grupo.pedidos.length === 1 ? '' : 's'}
                    </span>
                    <i className={`ri-arrow-down-s-line text-foreground-400 text-lg transition-transform ${colapsado ? '-rotate-90' : ''}`}></i>
                  </div>
                </button>
                {!colapsado && (
                  <div className="space-y-2">
                    {grupo.pedidos.map((pedido) => (
                      <PedidoCard key={pedido.id} pedido={pedido} onSetEstado={setEstado} onSetEstadoPago={setEstadoPago} onDelete={deletePedido} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
