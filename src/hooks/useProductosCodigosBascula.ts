import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Origen } from '@/types/origen';

export type CodigosPorProducto = Map<string, Partial<Record<Origen, string>>>;

// Códigos de báscula de cada producto, uno por cada pescadería (cada
// terminal tiene su propio catálogo interno de códigos, así que el mismo
// producto puede tener un código distinto en cada una). Se usa en el
// panel de Stock para mostrar esos códigos; su asignación es de solo
// lectura ahí — se hace directamente en base de datos para evitar que se
// rompa el enlace báscula↔producto por un cambio accidental.
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

  return { codigos, loading };
}
