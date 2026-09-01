import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Origen } from '@/types/origen';

export type CodigosPorProducto = Map<string, Partial<Record<Origen, string>>>;

// Códigos de báscula de cada producto, uno por cada pescadería (cada
// terminal tiene su propio catálogo interno de códigos, así que el mismo
// producto puede tener un código distinto en cada una). Se usa en el
// panel de Stock para mostrar/editar esos códigos.
export function useProductosCodigosBascula() {
  const [codigos, setCodigos] = useState<CodigosPorProducto>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchCodigos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('productos_codigos_bascula').select('producto_id, origen, codigo_bascula');
    const map: CodigosPorProducto = new Map();
    (data ?? []).forEach((row) => {
      const actual = map.get(row.producto_id) ?? {};
      actual[row.origen as Origen] = row.codigo_bascula;
      map.set(row.producto_id, actual);
    });
    setCodigos(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCodigos();
  }, [fetchCodigos]);

  // Guarda (o borra, si el valor viene vacío) el código de un producto para
  // un origen concreto.
  const guardarCodigo = useCallback(async (productoId: string, origen: Origen, valor: string): Promise<boolean> => {
    const limpio = valor.trim();
    if (!limpio) {
      const { error } = await supabase.from('productos_codigos_bascula').delete().eq('producto_id', productoId).eq('origen', origen);
      if (error) return false;
      setCodigos((prev) => {
        const next = new Map(prev);
        const actual = { ...(next.get(productoId) ?? {}) };
        delete actual[origen];
        next.set(productoId, actual);
        return next;
      });
      return true;
    }

    const { data: cliente } = await supabase.from('productos').select('cliente_id').eq('id', productoId).single();
    if (!cliente) return false;

    const { error } = await supabase
      .from('productos_codigos_bascula')
      .upsert({ producto_id: productoId, origen, codigo_bascula: limpio, cliente_id: cliente.cliente_id }, { onConflict: 'producto_id,origen' });
    if (error) return false;

    setCodigos((prev) => {
      const next = new Map(prev);
      next.set(productoId, { ...(next.get(productoId) ?? {}), [origen]: limpio });
      return next;
    });
    return true;
  }, []);

  return { codigos, loading, guardarCodigo };
}
