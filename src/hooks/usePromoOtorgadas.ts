import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeTable } from './useRealtimeTable';
import type { PromoOtorgada } from '@/types/promo';

export function usePromoOtorgadas() {
  const [otorgadas, setOtorgadas] = useState<PromoOtorgada[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOtorgadas = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase.from('promo_otorgadas').select('*').order('created_at', { ascending: false });
    setOtorgadas((data as PromoOtorgada[]) ?? []);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    fetchOtorgadas();
  }, [fetchOtorgadas]);

  const fetchOtorgadasSilent = useCallback(() => fetchOtorgadas(true), [fetchOtorgadas]);
  useRealtimeTable('promo_otorgadas', fetchOtorgadasSilent);

  // No se crean ni se borran desde el cliente: las inserta siempre el
  // trigger evaluar_promo_reglas() al cumplirse una regla.
  const patchOtorgada = useCallback(async (id: string, patch: Partial<PromoOtorgada>) => {
    const { error } = await supabase.from('promo_otorgadas').update(patch).eq('id', id);
    if (error) return false;
    setOtorgadas((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    return true;
  }, []);

  return { otorgadas, loading, refetch: fetchOtorgadas, patchOtorgada };
}
