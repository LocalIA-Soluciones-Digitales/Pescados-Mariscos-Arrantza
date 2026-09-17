import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeTable } from './useRealtimeTable';
import type { ProfesionalSolicitud, ProfesionalSolicitudEstado } from '@/types/profesional';

export function useProfesionalesSolicitudes() {
  const [solicitudes, setSolicitudes] = useState<ProfesionalSolicitud[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSolicitudes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('profesionales_solicitudes').select('*').order('created_at', { ascending: false });
    setSolicitudes(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSolicitudes();
  }, [fetchSolicitudes]);

  useRealtimeTable('profesionales_solicitudes', fetchSolicitudes);

  const setEstado = useCallback(async (id: string, estado: ProfesionalSolicitudEstado) => {
    const { error } = await supabase.from('profesionales_solicitudes').update({ estado }).eq('id', id);
    if (error) return false;
    setSolicitudes((prev) => prev.map((s) => (s.id === id ? { ...s, estado } : s)));
    return true;
  }, []);

  const eliminar = useCallback(async (id: string) => {
    const { error } = await supabase.from('profesionales_solicitudes').delete().eq('id', id);
    if (error) return false;
    setSolicitudes((prev) => prev.filter((s) => s.id !== id));
    return true;
  }, []);

  return { solicitudes, loading, refetch: fetchSolicitudes, setEstado, eliminar };
}
