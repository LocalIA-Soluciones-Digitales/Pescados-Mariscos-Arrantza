import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeTable } from './useRealtimeTable';
import type { SolicitudStock, SolicitudStockEstado } from '@/types/solicitudStock';

const MAX_ROWS = 5_000;

export function useSolicitudesStock() {
  const [solicitudes, setSolicitudes] = useState<SolicitudStock[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSolicitudes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase
      .from('solicitudes_stock')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);
    setSolicitudes(data ?? []);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    fetchSolicitudes();
  }, [fetchSolicitudes]);

  const fetchSolicitudesSilent = useCallback(() => fetchSolicitudes(true), [fetchSolicitudes]);
  useRealtimeTable('solicitudes_stock', fetchSolicitudesSilent);

  const setEstado = useCallback(async (id: string, estado: SolicitudStockEstado) => {
    const { error } = await supabase.from('solicitudes_stock').update({ estado }).eq('id', id);
    if (error) return false;
    setSolicitudes((prev) => prev.map((s) => (s.id === id ? { ...s, estado } : s)));
    return true;
  }, []);

  const deleteSolicitud = useCallback(async (id: string) => {
    const { error } = await supabase.from('solicitudes_stock').delete().eq('id', id);
    if (error) return false;
    setSolicitudes((prev) => prev.filter((s) => s.id !== id));
    return true;
  }, []);

  return { solicitudes, loading, refetch: fetchSolicitudes, setEstado, deleteSolicitud };
}
