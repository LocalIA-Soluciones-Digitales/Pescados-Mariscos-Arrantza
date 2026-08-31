import { useMemo, useState } from 'react';
import { useResenas } from '@/hooks/useResenas';
import type { ResenaEstado } from '@/types/resena';
import InfoHint from '@/components/base/InfoHint';

const INFO_ITEMS = [
  { icon: 'ri-chat-3-line', text: 'Las reseñas las escriben los clientes desde la web.' },
  { icon: 'ri-shield-check-line', text: 'Apruébalas para que aparezcan en público — nada se publica solo.' },
  { icon: 'ri-delete-bin-line', text: 'Puedes rechazarlas o eliminarlas si no proceden.' },
];

const ESTADO_LABELS: Record<ResenaEstado, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

const ESTADO_STYLES: Record<ResenaEstado, string> = {
  pendiente: 'bg-sky-100/80 text-sky-700',
  aprobada: 'bg-emerald-100/80 text-emerald-700',
  rechazada: 'bg-foreground-200/70 text-foreground-500',
};

const FILTROS: { value: 'todas' | ResenaEstado; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'aprobada', label: 'Aprobadas' },
  { value: 'rechazada', label: 'Rechazadas' },
];

export default function ResenasPanel() {
  const { resenas, loading, setEstado, deleteResena } = useResenas();
  const [filtro, setFiltro] = useState<'todas' | ResenaEstado>('pendiente');

  const handleSetEstado = async (id: string, estado: ResenaEstado) => {
    const ok = await setEstado(id, estado);
    if (!ok) alert('No se pudo actualizar la reseña. Comprueba tu conexión o vuelve a iniciar sesión e inténtalo de nuevo.');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta reseña definitivamente?')) return;
    const ok = await deleteResena(id);
    if (!ok) alert('No se pudo eliminar la reseña. Comprueba tu conexión o vuelve a iniciar sesión e inténtalo de nuevo.');
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { todas: resenas.length };
    (['pendiente', 'aprobada', 'rechazada'] as ResenaEstado[]).forEach((e) => {
      c[e] = resenas.filter((r) => r.estado === e).length;
    });
    return c;
  }, [resenas]);

  const visibles = useMemo(
    () => (filtro === 'todas' ? resenas : resenas.filter((r) => r.estado === filtro)),
    [resenas, filtro],
  );

  return (
    <div className="px-4 md:px-8 py-6 pb-28">
      <div className="flex items-center gap-2 mb-4">
        <InfoHint items={INFO_ITEMS} />
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide flex-1 min-w-0">
          {FILTROS.map((f) => (
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
      </div>

      {loading ? (
        <p className="text-sm text-foreground-400">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-foreground-400">No hay reseñas que coincidan con el filtro.</p>
      ) : (
        <div className="space-y-2">
          {visibles.map((resena) => (
            <div key={resena.id} className="bg-background-50 border border-background-200/70 rounded-xl shadow-card hover:shadow-card-hover transition-shadow duration-200 p-3">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ESTADO_STYLES[resena.estado]}`}>
                    {ESTADO_LABELS[resena.estado]}
                  </span>
                  <span className="text-sm font-medium text-foreground-950">{resena.nombre}</span>
                  <span className="text-amber-500 text-xs">{'★'.repeat(resena.valoracion)}{'☆'.repeat(5 - resena.valoracion)}</span>
                </div>
                <span className="text-[10px] text-foreground-400 flex-shrink-0">{new Date(resena.created_at).toLocaleDateString('es-ES')}</span>
              </div>

              <p className="text-sm text-foreground-700 mb-2 break-words">{resena.comentario}</p>

              <div className="flex items-center gap-1.5">
                {resena.estado !== 'aprobada' && (
                  <button
                    type="button"
                    onClick={() => handleSetEstado(resena.id, 'aprobada')}
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  >
                    Aprobar
                  </button>
                )}
                {resena.estado !== 'rechazada' && (
                  <button
                    type="button"
                    onClick={() => handleSetEstado(resena.id, 'rechazada')}
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-background-100 text-foreground-500 hover:bg-background-200/70"
                  >
                    Rechazar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(resena.id)}
                  className="ml-auto px-2 py-1 rounded-full text-[11px] font-medium text-foreground-400 hover:text-red-600"
                >
                  <i className="ri-delete-bin-line"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
