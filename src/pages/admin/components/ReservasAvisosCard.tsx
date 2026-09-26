import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { ReservaEvento } from '@/types/reserva';

interface ReservaAviso {
  id: string;
  nombre: string;
  telefono: string;
  idioma: 'es' | 'eu';
  avisado_at: string | null;
  created_at: string;
}

function mensajeAviso(aviso: ReservaAviso, evento: ReservaEvento | null): string {
  const url = `${window.location.origin}/reservas`;
  const nombreEvento = evento ? (aviso.idioma === 'eu' && evento.nombre_eu ? evento.nombre_eu : evento.nombre_es) : null;
  if (aviso.idioma === 'eu') {
    return `Kaixo ${aviso.nombre}, Arrantzatik idazten dizugu. ${nombreEvento ? `${nombreEvento} kanpainako` : 'Denboraldiko'} erreserbak zabalik daude jada: ${url}`;
  }
  return `Hola ${aviso.nombre}, te escribimos de Arrantza. Ya están abiertas las reservas${nombreEvento ? ` de ${nombreEvento}` : ''}: ${url}`;
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// Clientes que pidieron desde /reservas (sin campaña abierta) que les
// avisáramos. Si la tabla aún no existe o no hay nadie, no se muestra.
export default function ReservasAvisosCard({ eventoAbierto }: { eventoAbierto: ReservaEvento | null }) {
  const [avisos, setAvisos] = useState<ReservaAviso[]>([]);
  const [verAvisados, setVerAvisados] = useState(false);

  const fetchAvisos = useCallback(async () => {
    const { data } = await supabase.from('reservas_avisos').select('*').order('created_at', { ascending: false }).limit(1000);
    setAvisos((data as ReservaAviso[] | null) ?? []);
  }, []);

  useEffect(() => {
    fetchAvisos();
  }, [fetchAvisos]);

  const avisar = async (aviso: ReservaAviso) => {
    window.open(`https://api.whatsapp.com/send?phone=34${aviso.telefono}&text=${encodeURIComponent(mensajeAviso(aviso, eventoAbierto))}`, '_blank');
    const avisado_at = new Date().toISOString();
    const { error } = await supabase.from('reservas_avisos').update({ avisado_at }).eq('id', aviso.id);
    if (!error) setAvisos((prev) => prev.map((a) => (a.id === aviso.id ? { ...a, avisado_at } : a)));
  };

  const quitar = async (aviso: ReservaAviso) => {
    if (!confirm(`¿Quitar a ${aviso.nombre} de la lista de avisos?`)) return;
    const { error } = await supabase.from('reservas_avisos').delete().eq('id', aviso.id);
    if (!error) setAvisos((prev) => prev.filter((a) => a.id !== aviso.id));
  };

  if (avisos.length === 0) return null;

  const pendientes = avisos.filter((a) => !a.avisado_at);
  const lista = verAvisados ? avisos : pendientes;

  return (
    <div className="mb-6 rounded-2xl border border-background-200 bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-heading font-semibold text-foreground-950 flex items-center gap-1.5">
            <i className="ri-notification-3-line text-primary-500"></i>
            Quieren que les avisemos
            {pendientes.length > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 text-[11px] font-medium tabular-nums">{pendientes.length}</span>
            )}
          </h3>
          <p className="text-xs text-foreground-400 mt-0.5">
            {eventoAbierto
              ? `Pulsa "Avisar" para mandarles por WhatsApp que ya pueden reservar para ${eventoAbierto.nombre_es}.`
              : 'Se apuntaron desde la web sin campaña abierta. Avísales cuando abras la siguiente.'}
          </p>
        </div>
        {avisos.length > pendientes.length && (
          <button type="button" onClick={() => setVerAvisados((v) => !v)} className="text-xs text-foreground-500 hover:text-foreground-800">
            {verAvisados ? 'Ocultar avisados' : `Ver avisados (${avisos.length - pendientes.length})`}
          </button>
        )}
      </div>

      {lista.length === 0 ? (
        <p className="text-xs text-foreground-400">Todos avisados.</p>
      ) : (
        <ul className="divide-y divide-background-100">
          {lista.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground-800 truncate">
                  {a.nombre}
                  {a.idioma === 'eu' && <span className="ml-1.5 text-[10px] font-medium text-foreground-400">EU</span>}
                </p>
                <p className="text-xs text-foreground-400 tabular-nums">
                  {a.telefono} · {formatFecha(a.created_at)}
                  {a.avisado_at && ` · avisado ${formatFecha(a.avisado_at)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => avisar(a)}
                disabled={!eventoAbierto}
                title={eventoAbierto ? undefined : 'Abre una campaña para poder avisar'}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <i className="ri-whatsapp-line mr-1"></i>
                {a.avisado_at ? 'Reenviar' : 'Avisar'}
              </button>
              <button type="button" onClick={() => quitar(a)} aria-label={`Quitar a ${a.nombre}`} className="w-7 h-7 flex items-center justify-center rounded-full text-foreground-300 hover:text-red-500 hover:bg-red-50">
                <i className="ri-close-line"></i>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
