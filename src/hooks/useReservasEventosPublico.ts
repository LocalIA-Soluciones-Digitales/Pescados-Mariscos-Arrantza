import { useCallback, useEffect, useState } from 'react';
import { supabase, SITE_KEY } from '@/lib/supabaseClient';
import type { ReservaEvento } from '@/types/reserva';

// Uso público (web de cliente): pasa por get_reservas_eventos_publico en
// vez de leer la tabla directamente, igual que useProductosPublicos.
export function useReservasEventosPublico() {
  const [eventos, setEventos] = useState<ReservaEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEventos = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase.rpc('get_reservas_eventos_publico', {
      p_site_key: SITE_KEY,
    });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setError(null);
      setEventos(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEventos();
  }, [fetchEventos]);

  return { eventos, loading, error, refetch: fetchEventos };
}
