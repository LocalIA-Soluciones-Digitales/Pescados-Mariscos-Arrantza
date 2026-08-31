import { useMemo, useState } from 'react';
import { useSolicitudesStock } from '@/hooks/useSolicitudesStock';
import type { SolicitudStock, SolicitudStockEstado } from '@/types/solicitudStock';
import InfoHint from '@/components/base/InfoHint';

const INFO_ITEMS = [
  { icon: 'ri-notification-3-line', text: 'Aparece cuando un cliente pide en la web que le avisen de un producto agotado.' },
  { icon: 'ri-check-line', text: 'Marca "Atendida" al reponerlo o contactar con el cliente.' },
  { icon: 'ri-close-line', text: 'O "Descartar" si no procede.' },
];

const ESTADO_LABELS: Record<SolicitudStockEstado, string> = {
  pendiente: 'Pendiente',
  atendida: 'Atendida',
  descartada: 'Descartada',
};

const ESTADO_STYLES: Record<SolicitudStockEstado, string> = {
  pendiente: 'bg-sky-100/80 text-sky-700',
  atendida: 'bg-emerald-100/80 text-emerald-700',
  descartada: 'bg-foreground-200/70 text-foreground-500',
};

const ESTADO_FILTROS: { value: 'todas' | SolicitudStockEstado; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'atendida', label: 'Atendidas' },
  { value: 'descartada', label: 'Descartadas' },
];

/* ------------------------------------------------------------------ */
/*  Tarjeta de solicitud individual                                    */
/* ------------------------------------------------------------------ */
function SolicitudCard({
  solicitud,
  onSetEstado,
  onDelete,
}: {
  solicitud: SolicitudStock;
  onSetEstado: (id: string, estado: SolicitudStockEstado) => void;
  onDelete: (id: string) => void;
}) {
  const telefono = solicitud.cliente_telefono?.replace(/\D/g, '');

  const handleSetEstado = (estado: SolicitudStockEstado, mensaje: string) => {
    if (!confirm(mensaje)) return;
    onSetEstado(solicitud.id, estado);
  };

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl shadow-card hover:shadow-card-hover transition-shadow duration-200 p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ESTADO_STYLES[solicitud.estado]}`}>
              {ESTADO_LABELS[solicitud.estado]}
            </span>
            <span className="text-[10px] text-foreground-400">{new Date(solicitud.created_at).toLocaleString('es-ES')}</span>
          </div>
          <p className="text-sm font-semibold text-foreground-950 mt-1">{solicitud.producto_nombre}</p>
          <p className="text-xs text-foreground-500 mt-0.5">
            {solicitud.cliente_nombre || 'Cliente anónimo'}
            {solicitud.cantidad_kg != null && <> · {solicitud.cantidad_kg} kg aprox.</>}
          </p>
        </div>
      </div>

      {solicitud.notas && (
        <div className="bg-background-100 rounded-lg p-2.5 mb-2">
          <p className="text-xs text-foreground-600 italic">"{solicitud.notas}"</p>
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
        {solicitud.estado === 'pendiente' && (
          <>
            <button
              type="button"
              onClick={() => handleSetEstado('atendida', '¿Marcar esta solicitud como atendida?')}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-primary-500 text-background-50 hover:bg-primary-600"
            >
              Marcar atendida
            </button>
            <button
              type="button"
              onClick={() => handleSetEstado('descartada', '¿Descartar esta solicitud?')}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-50 text-red-600 hover:bg-red-100"
            >
              Descartar
            </button>
          </>
        )}
        {solicitud.estado !== 'pendiente' && (
          <button
            type="button"
            onClick={() => handleSetEstado('pendiente', '¿Volver a marcar esta solicitud como pendiente?')}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-background-100 text-foreground-500 hover:bg-background-200/70"
          >
            <i className="ri-arrow-go-back-line"></i>
            Deshacer
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (confirm('¿Eliminar esta solicitud del historial?')) onDelete(solicitud.id);
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
/*  Panel principal                                                    */
/* ------------------------------------------------------------------ */
export default function SolicitudesStockPanel() {
  const { solicitudes, loading, setEstado, deleteSolicitud } = useSolicitudesStock();
  const [filtroEstado, setFiltroEstado] = useState<'todas' | SolicitudStockEstado>('todas');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => {
    const c: Record<string, number> = { todas: solicitudes.length };
    (['pendiente', 'atendida', 'descartada'] as SolicitudStockEstado[]).forEach((e) => {
      c[e] = solicitudes.filter((s) => s.estado === e).length;
    });
    return c;
  }, [solicitudes]);

  const visibles = useMemo(() => {
    let result = filtroEstado === 'todas' ? solicitudes : solicitudes.filter((s) => s.estado === filtroEstado);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (s) => s.producto_nombre.toLowerCase().includes(q) || (s.cliente_nombre ?? '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [solicitudes, filtroEstado, search]);

  if (loading && solicitudes.length === 0) {
    return (
      <div className="px-4 md:px-8 py-6">
        <p className="text-sm text-foreground-400">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 pb-28">
      <div className="flex items-center gap-2 mb-3 sm:max-w-[280px]">
        <div className="relative flex-1">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por producto o cliente…"
            className="w-full pl-9 pr-3 py-2 bg-background-50 border border-background-200/70 rounded-full text-sm focus:outline-none focus:border-foreground-300/60"
          />
        </div>
        <InfoHint items={INFO_ITEMS} align="right" className="flex-shrink-0" />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide mb-4">
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
            <span
              className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] ${
                filtroEstado === f.value ? 'bg-background-50/20' : 'bg-background-200/60 text-foreground-400'
              }`}
            >
              {counts[f.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <div className="text-center py-16">
          <span className="w-14 h-14 flex items-center justify-center mx-auto mb-4 rounded-full bg-background-100 text-foreground-400 text-2xl">
            <i className="ri-notification-3-line"></i>
          </span>
          <p className="text-sm font-medium text-foreground-700 mb-1">No hay solicitudes que coincidan con el filtro</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map((solicitud) => (
            <SolicitudCard key={solicitud.id} solicitud={solicitud} onSetEstado={setEstado} onDelete={deleteSolicitud} />
          ))}
        </div>
      )}
    </div>
  );
}
