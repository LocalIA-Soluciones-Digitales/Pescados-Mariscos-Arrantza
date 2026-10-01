import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Origen } from '@/types/origen';

export type CodigosPorProducto = Map<string, Partial<Record<Origen, string>>>;
/** Códigos de hostelería (familias 7-9) que solo descuentan stock de cada producto. */
export type CodigosStockPorProducto = Map<string, string[]>;

// Códigos de báscula de cada producto, uno por cada pescadería (cada
// terminal tiene su propio catálogo interno de códigos, así que el mismo
// producto puede tener un código distinto en cada una). Se usa en el
// panel de Stock para mostrar esos códigos; su asignación es de solo
// lectura ahí — se hace directamente en base de datos para evitar que se
// rompa el enlace báscula↔producto por un cambio accidental.
export function useProductosCodigosBascula() {
  const [codigos, setCodigos] = useState<CodigosPorProducto>(new Map());
  const [codigosStock, setCodigosStock] = useState<CodigosStockPorProducto>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchCodigos = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: soloStock }] = await Promise.all([
      supabase.from('productos_codigos_bascula').select('producto_id, origen, codigo_bascula'),
      supabase.from('productos_codigos_stock').select('producto_id, codigo_bascula'),
    ]);
    const map: CodigosPorProducto = new Map();
    (data ?? []).forEach((row) => {
      const actual = map.get(row.producto_id) ?? {};
      actual[row.origen as Origen] = row.codigo_bascula;
      map.set(row.producto_id, actual);
    });
    setCodigos(map);
    // Las dos básculas tienen los mismos códigos: se muestra cada uno una vez.
    const stockMap: CodigosStockPorProducto = new Map();
    (soloStock ?? []).forEach((row) => {
      const lista = stockMap.get(row.producto_id) ?? [];
      if (!lista.includes(row.codigo_bascula)) lista.push(row.codigo_bascula);
      stockMap.set(row.producto_id, lista);
    });
    stockMap.forEach((lista) => lista.sort((a, b) => Number(a) - Number(b)));
    setCodigosStock(stockMap);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCodigos();
  }, [fetchCodigos]);

  return { codigos, codigosStock, loading };
}
