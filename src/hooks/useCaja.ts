import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getMiClienteId } from '@/lib/clienteContext';
import { useRealtimeTable } from './useRealtimeTable';
import type { CajaMovimiento, CajaMovimientoTipo } from '@/types/caja';

const MAX_ROWS = 10_000;

export interface NewCajaMovimientoInput {
  fecha: string;
  tipo: CajaMovimientoTipo;
  concepto: string | null;
  importe: number;
  foto_url?: string | null;
}

function ordenarMovimientos(movimientos: CajaMovimiento[]): CajaMovimiento[] {
  return [...movimientos].sort(
    (a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at),
  );
}

export function useCaja() {
  const [movimientos, setMovimientos] = useState<CajaMovimiento[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMovimientos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('caja_movimientos')
      .select('*')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);
    setMovimientos(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMovimientos();
  }, [fetchMovimientos]);

  useRealtimeTable('caja_movimientos', fetchMovimientos);

  const crearMovimiento = useCallback(async (input: NewCajaMovimientoInput) => {
    const cliente_id = await getMiClienteId();
    const { data, error } = await supabase
      .from('caja_movimientos')
      .insert({ ...input, cliente_id })
      .select()
      .single();
    if (error) return null;
    setMovimientos((prev) => ordenarMovimientos([...prev, data as CajaMovimiento]));
    return data as CajaMovimiento;
  }, []);

  const actualizarMovimiento = useCallback(async (id: string, patch: Partial<NewCajaMovimientoInput>) => {
    const { error } = await supabase.from('caja_movimientos').update(patch).eq('id', id);
    if (error) return false;
    setMovimientos((prev) => ordenarMovimientos(prev.map((m) => (m.id === id ? { ...m, ...patch } : m))));
    return true;
  }, []);

  const eliminarMovimiento = useCallback(async (id: string) => {
    const { error } = await supabase.from('caja_movimientos').delete().eq('id', id);
    if (error) return false;
    setMovimientos((prev) => prev.filter((m) => m.id !== id));
    return true;
  }, []);

  return { movimientos, loading, refetch: fetchMovimientos, crearMovimiento, actualizarMovimiento, eliminarMovimiento };
}
