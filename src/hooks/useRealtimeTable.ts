import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Refresca los datos de un panel de gestión en cuanto cambian en Supabase
// (INSERT, UPDATE o DELETE), sin que el pescadero tenga que recargar la
// página. La tabla debe estar añadida a la publicación `supabase_realtime`
// (ver supabase/schema.sql) o Postgres Changes no emite ningún evento.
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

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [table]);
}
