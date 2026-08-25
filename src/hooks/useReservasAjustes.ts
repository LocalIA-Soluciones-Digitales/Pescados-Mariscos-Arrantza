import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getMiClienteId } from '@/lib/clienteContext';
import { useRealtimeTable } from './useRealtimeTable';
import type { ReservaAjuste } from '@/types/reserva';

export function useReservasAjustes() {
  const [ajustes, setAjustes] = useState<ReservaAjuste[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAjustes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('reservas_ajustes')
      .select('*')
      .order('created_at', { ascending: false });
    setAjustes(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAjustes();
  }, [fetchAjustes]);

  useRealtimeTable('reservas_ajustes', fetchAjustes);

  const registrarAjuste = useCallback(
    async (input: { evento_id: string; producto_id: string | null; producto_nombre: string; kg: number; nota?: string | null }) => {
      const cliente_id = await getMiClienteId();
      const { data, error } = await supabase
        .from('reservas_ajustes')
        .insert({ ...input, cliente_id })
        .select()
        .single();
      if (error) return null;
      setAjustes((prev) => [data as ReservaAjuste, ...prev]);
      return data as ReservaAjuste;
    },
    [],
  );

  const eliminarAjuste = useCallback(async (id: string) => {
    const { error } = await supabase.from('reservas_ajustes').delete().eq('id', id);
    if (error) return false;
    setAjustes((prev) => prev.filter((a) => a.id !== id));
    return true;
  }, []);

  return { ajustes, loading, refetch: fetchAjustes, registrarAjuste, eliminarAjuste };
}
