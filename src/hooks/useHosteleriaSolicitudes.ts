import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeTable } from './useRealtimeTable';
import type { HosteleriaSolicitud, HosteleriaSolicitudEstado } from '@/types/hosteleria';

export function useHosteleriaSolicitudes() {
  const [solicitudes, setSolicitudes] = useState<HosteleriaSolicitud[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSolicitudes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase.from('hosteleria_solicitudes').select('*').order('created_at', { ascending: false });
    setSolicitudes(data ?? []);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    fetchSolicitudes();
  }, [fetchSolicitudes]);

  const fetchSolicitudesSilent = useCallback(() => fetchSolicitudes(true), [fetchSolicitudes]);
  useRealtimeTable('hosteleria_solicitudes', fetchSolicitudesSilent);

  const setEstado = useCallback(async (id: string, estado: HosteleriaSolicitudEstado) => {
    const { error } = await supabase.from('hosteleria_solicitudes').update({ estado }).eq('id', id);
    if (error) return false;
    setSolicitudes((prev) => prev.map((s) => (s.id === id ? { ...s, estado } : s)));
    return true;
  }, []);

  const eliminar = useCallback(async (id: string) => {
    const { error } = await supabase.from('hosteleria_solicitudes').delete().eq('id', id);
    if (error) return false;
    setSolicitudes((prev) => prev.filter((s) => s.id !== id));
    return true;
  }, []);

  return { solicitudes, loading, refetch: fetchSolicitudes, setEstado, eliminar };
}
