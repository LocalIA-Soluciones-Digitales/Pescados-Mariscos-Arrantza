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
    const channel = supabase
      .channel(`admin-${table}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => onChangeRef.current())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table]);
}
