import { useMemo, useState } from 'react';
import { usePedidos } from '@/hooks/usePedidos';
import type { Pedido, PedidoEstado, PedidoEstadoPago } from '@/types/pedido';

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

function PedidoCard({ pedido, onSetEstado, onDelete }: { pedido: Pedido; onSetEstado: (id: string, estado: PedidoEstado) => void; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const next = NEXT_ESTADO[pedido.estado];
  const telefono = pedido.cliente_telefono?.replace(/\D/g, '');

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ESTADO_STYLES[pedido.estado]}`}>
              {ESTADO_LABELS[pedido.estado]}
            </span>
            <span className="text-[10px] text-foreground-400">{new Date(pedido.created_at).toLocaleString('es-ES')}</span>
            <span className="text-[10px] text-foreground-400">
              {pedido.metodo_entrega === 'home' ? 'A domicilio' : 'Recogida en tienda'}
            </span>
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
          {(pedido.fecha_preferida || pedido.hora_preferida) && (
            <p className="text-xs text-foreground-500">
              Preferencia: {pedido.fecha_preferida} {pedido.hora_preferida}
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
        {next && (
          <button
            type="button"
            onClick={() => onSetEstado(pedido.id, next)}
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
  const { pedidos, loading, setEstado, deletePedido } = usePedidos();
  const [filtro, setFiltro] = useState<'todos' | PedidoEstado>('todos');

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: pedidos.length };
    (['nuevo', 'confirmado', 'completado', 'cancelado'] as PedidoEstado[]).forEach((e) => {
      c[e] = pedidos.filter((p) => p.estado === e).length;
    });
    return c;
  }, [pedidos]);

  const visibles = useMemo(
    () => (filtro === 'todos' ? pedidos : pedidos.filter((p) => p.estado === filtro)),
    [pedidos, filtro],
  );

  return (
    <div className="px-4 md:px-8 py-6 pb-28">
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
        <div className="space-y-2">
          {visibles.map((pedido) => (
            <PedidoCard key={pedido.id} pedido={pedido} onSetEstado={setEstado} onDelete={deletePedido} />
          ))}
        </div>
      )}
    </div>
  );
}
