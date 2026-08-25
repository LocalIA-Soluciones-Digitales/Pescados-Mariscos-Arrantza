import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getMiClienteId } from '@/lib/clienteContext';
import { useRealtimeTable } from './useRealtimeTable';
import type { ReservaEvento } from '@/types/reserva';

export interface NewReservaEventoInput {
  nombre_es: string;
  nombre_eu: string | null;
  fecha_entrega: string;
  fecha_limite: string | null;
}

// Mismo criterio que el order-by de fetchEventos, para que insertar o editar
// una campaña en el estado local no rompa el orden cronológico ya cargado.
function ordenarEventos(eventos: ReservaEvento[]): ReservaEvento[] {
  return [...eventos].sort((a, b) => a.orden - b.orden || a.fecha_entrega.localeCompare(b.fecha_entrega));
}

export function useReservasEventos() {
  const [eventos, setEventos] = useState<ReservaEvento[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEventos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('reservas_eventos')
      .select('*')
      .order('orden', { ascending: true })
      .order('fecha_entrega', { ascending: true });
    setEventos(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEventos();
  }, [fetchEventos]);

  useRealtimeTable('reservas_eventos', fetchEventos);

  const crearEvento = useCallback(async (input: NewReservaEventoInput) => {
    const cliente_id = await getMiClienteId();
    const { data, error } = await supabase
      .from('reservas_eventos')
      .insert({ ...input, cliente_id })
      .select()
      .single();
    if (error) return null;
    setEventos((prev) => ordenarEventos([...prev, data as ReservaEvento]));
    return data as ReservaEvento;
  }, []);

  const patchEvento = useCallback(async (id: string, patch: Partial<NewReservaEventoInput> & { activo?: boolean }) => {
    const { error } = await supabase.from('reservas_eventos').update(patch).eq('id', id);
    if (error) return false;
    setEventos((prev) => ordenarEventos(prev.map((e) => (e.id === id ? { ...e, ...patch } : e))));
    return true;
  }, []);

  const eliminarEvento = useCallback(async (id: string) => {
    const { error } = await supabase.from('reservas_eventos').delete().eq('id', id);
    if (error) return false;
    setEventos((prev) => prev.filter((e) => e.id !== id));
    return true;
  }, []);

  return { eventos, loading, refetch: fetchEventos, crearEvento, patchEvento, eliminarEvento };
}
