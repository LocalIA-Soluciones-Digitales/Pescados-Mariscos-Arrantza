import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Red de seguridad ante WebSockets que se quedan colgados o pierden algún
// evento (p.ej. tras el 502 recurrente de ETPROXY en báscula): sin esto, un
// panel puede quedarse mostrando datos obsoletos indefinidamente aunque el
// canal siga "conectado". 20s es lo bastante frecuente para no notarlo como
// un refresco manual y lo bastante espaciado para no saturar Supabase.
const POLL_INTERVAL_MS = 20_000;

// Refresca los datos de un panel de gestión en cuanto cambian en Supabase
// (INSERT, UPDATE o DELETE), sin que el pescadero tenga que recargar la
// página. La tabla debe estar añadida a la publicación `supabase_realtime`
// (ver supabase/schema.sql) o Postgres Changes no emite ningún evento.
//
// Además del canal realtime, se refresca por sondeo periódico y al volver a
// la pestaña o recuperar la conexión, por si el WebSocket se cae o pierde un
// evento sin notificarlo (visto en la práctica: cambios que no llegaban a
// reflejarse hasta recargar la página a mano).
export function useRealtimeTable(table: string, onChange: () => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    // supabase-js puede lanzar de forma síncrona al abrir el WebSocket (p.ej.
    // "WebSocket not available: The operation is insecure." en navegadores o
    // redes que lo bloquean). Sin este try/catch, ese fallo tumba TODA la app
    // vía el ErrorBoundary global en vez de limitarse a desactivar el
    // autorefresco en vivo de este panel.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`admin-${table}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => onChangeRef.current())
        .subscribe();
    } catch (error) {
      console.error(`No se pudo suscribir a cambios en tiempo real de "${table}":`, error);
    }

    const interval = window.setInterval(() => onChangeRef.current(), POLL_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') onChangeRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);

    return () => {
      if (channel) supabase.removeChannel(channel);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [table]);
}
