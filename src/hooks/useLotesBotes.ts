import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getMiClienteId } from '@/lib/clienteContext';
import { useRealtimeTable } from './useRealtimeTable';
import type { LoteBote, NewLoteBoteInput } from '@/types/loteBote';

const MAX_ROWS = 2_000;

export function useLotesBotes() {
  const [lotes, setLotes] = useState<LoteBote[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLotes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase
      .from('lotes_botes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);
    setLotes(data ?? []);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    fetchLotes();
  }, [fetchLotes]);

  const fetchLotesSilent = useCallback(() => fetchLotes(true), [fetchLotes]);
  useRealtimeTable('lotes_botes', fetchLotesSilent);

  // El nº de lote lo pone la base de datos (trigger asignar_lote_bote).
  const crearLote = useCallback(async (input: NewLoteBoteInput) => {
    let cliente_id: string;
    try {
      cliente_id = await getMiClienteId();
    } catch {
      return null;
    }
    const { data, error } = await supabase
      .from('lotes_botes')
      .insert({ ...input, cliente_id })
      .select()
      .single();
    if (error) return null;
    const creado = data as LoteBote;
    setLotes((prev) => [creado, ...prev.filter((l) => l.id !== creado.id)]);
    return creado;
  }, []);

  const eliminarLote = useCallback(async (id: string) => {
    const { error } = await supabase.from('lotes_botes').delete().eq('id', id);
    if (error) return false;
    setLotes((prev) => prev.filter((l) => l.id !== id));
    return true;
  }, []);

  return { lotes, loading, crearLote, eliminarLote };
}
