import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getMiClienteId } from '@/lib/clienteContext';
import { useRealtimeTable } from './useRealtimeTable';
import type { Resena, ResenaEstado } from '@/types/resena';

// Vista de administración: trae todas las reseñas (pendientes incluidas)
// para que el pescadero las modere.
//
// Filtramos explícitamente por cliente_id (en vez de confiar solo en RLS)
// porque la política "resenas_select_admin" deja pasar a las cuentas de
// desarrollador (is_developer()) sin restringir por cliente, y sin este
// filtro esas cuentas ven reseñas de todos los negocios de Supabase.
export function useResenas() {
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchResenas = useCallback(async () => {
    setLoading(true);
    try {
      const clienteId = await getMiClienteId();
      const { data } = await supabase
        .from('resenas')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false });
      setResenas(data ?? []);
    } catch {
      setResenas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResenas();
  }, [fetchResenas]);

  useRealtimeTable('resenas', fetchResenas);

  const setEstado = useCallback(async (id: string, estado: ResenaEstado) => {
    const { error } = await supabase.from('resenas').update({ estado }).eq('id', id);
    if (error) return false;
    setResenas((prev) => prev.map((r) => (r.id === id ? { ...r, estado } : r)));
    return true;
  }, []);

  const deleteResena = useCallback(async (id: string) => {
    const { error } = await supabase.from('resenas').delete().eq('id', id);
    if (error) return false;
    setResenas((prev) => prev.filter((r) => r.id !== id));
    return true;
  }, []);

  return { resenas, loading, refetch: fetchResenas, setEstado, deleteResena };
}
