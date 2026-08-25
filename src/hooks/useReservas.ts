import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeTable } from './useRealtimeTable';
import type { Reserva, ReservaEstado } from '@/types/reserva';

const MAX_ROWS = 5_000;

export function useReservas() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReservas = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('reservas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);
    setReservas(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReservas();
  }, [fetchReservas]);

  useRealtimeTable('reservas', fetchReservas);

  const setEstado = useCallback(async (id: string, estado: ReservaEstado) => {
    const { error } = await supabase.from('reservas').update({ estado }).eq('id', id);
    if (error) return false;
    setReservas((prev) => prev.map((r) => (r.id === id ? { ...r, estado } : r)));
    return true;
  }, []);

  const deleteReserva = useCallback(async (id: string) => {
    const { error } = await supabase.from('reservas').delete().eq('id', id);
    if (error) return false;
    setReservas((prev) => prev.filter((r) => r.id !== id));
    return true;
  }, []);

  return { reservas, loading, refetch: fetchReservas, setEstado, deleteReserva };
}
