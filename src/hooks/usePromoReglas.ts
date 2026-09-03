import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getMiClienteId } from '@/lib/clienteContext';
import { useRealtimeTable } from './useRealtimeTable';
import type { PromoRegla, PromoTipoCondicion, PromoTipoRecompensa } from '@/types/promo';

export interface NewPromoReglaInput {
  nombre: string;
  tipo_condicion: PromoTipoCondicion;
  umbral: number;
  importe_min_pedido: number | null;
  tipo_recompensa: PromoTipoRecompensa;
  producto_id: string | null;
  valor_recompensa: number | null;
  mensaje_plantilla: string;
}

function ordenarReglas(reglas: PromoRegla[]): PromoRegla[] {
  return [...reglas].sort((a, b) => a.orden - b.orden || a.created_at.localeCompare(b.created_at));
}

export function usePromoReglas() {
  const [reglas, setReglas] = useState<PromoRegla[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReglas = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('promo_reglas')
      .select('*')
      .order('orden', { ascending: true })
      .order('created_at', { ascending: true });
    setReglas((data as PromoRegla[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReglas();
  }, [fetchReglas]);

  useRealtimeTable('promo_reglas', fetchReglas);

  const crearRegla = useCallback(async (input: NewPromoReglaInput) => {
    let cliente_id: string;
    try {
      cliente_id = await getMiClienteId();
    } catch {
      return null;
    }
    const { data, error } = await supabase
      .from('promo_reglas')
      .insert({ ...input, cliente_id })
      .select()
      .single();
    if (error) return null;
    setReglas((prev) => ordenarReglas([...prev, data as PromoRegla]));
    return data as PromoRegla;
  }, []);

  const patchRegla = useCallback(async (id: string, patch: Partial<NewPromoReglaInput> & { activo?: boolean }) => {
    const { error } = await supabase.from('promo_reglas').update(patch).eq('id', id);
    if (error) return false;
    setReglas((prev) => ordenarReglas(prev.map((r) => (r.id === id ? { ...r, ...patch } : r))));
    return true;
  }, []);

  const eliminarRegla = useCallback(async (id: string) => {
    const { error } = await supabase.from('promo_reglas').delete().eq('id', id);
    if (error) return false;
    setReglas((prev) => prev.filter((r) => r.id !== id));
    return true;
  }, []);

  return { reglas, loading, refetch: fetchReglas, crearRegla, patchRegla, eliminarRegla };
}
