import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Resena, ResenaEstado } from '@/types/resena';

// Vista de administración: trae todas las reseñas (pendientes incluidas)
// para que el pescadero las modere.
export function useResenas() {
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchResenas = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('resenas')
      .select('*')
      .order('created_at', { ascending: false });
    setResenas(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchResenas();
  }, [fetchResenas]);

  const setEstado = useCallback(async (id: string, estado: ResenaEstado) => {
    await supabase.from('resenas').update({ estado }).eq('id', id);
    setResenas((prev) => prev.map((r) => (r.id === id ? { ...r, estado } : r)));
  }, []);

  const deleteResena = useCallback(async (id: string) => {
    await supabase.from('resenas').delete().eq('id', id);
    setResenas((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { resenas, loading, refetch: fetchResenas, setEstado, deleteResena };
}
