import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface LineaConProducto {
  productoId: string;
  articuloId?: string;
}

// Código de báscula de cada línea de un pedido o reserva, para que David
// la teclee directamente en la báscula al prepararlo. Cada línea apunta a
// uno de estos tres sitios (todos con id uuid, así que comparten mapa):
//   - producto de la tienda → su código en la báscula 1 (la que manda en la
//     web), o el de la báscula 2 si la 1 no lo tiene;
//   - artículo de una tarifa de hostelería (pedidos «a cuenta»);
//   - artículo propio de una campaña de reservas (p. ej. Navidad).
// Se resuelve al mostrar, así también sale en los pedidos ya hechos.
export function useCodigosPedido() {
  const [codigos, setCodigos] = useState<Map<string, string>>(new Map());

  const fetchCodigos = useCallback(async () => {
    const [{ data: productos }, { data: hosteleria }, { data: reservas }] = await Promise.all([
      supabase.from('productos_codigos_bascula').select('producto_id, origen, codigo_bascula'),
      supabase.from('hosteleria_articulos').select('id, codigo_bascula'),
      supabase.from('reservas_articulos').select('id, codigo_bascula'),
    ]);
    const map = new Map<string, string>();
    (productos ?? []).forEach((row) => {
      if (row.origen === 'pescaderia_1' || !map.has(row.producto_id)) map.set(row.producto_id, row.codigo_bascula);
    });
    [...(hosteleria ?? []), ...(reservas ?? [])].forEach((row) => {
      if (row.codigo_bascula) map.set(row.id, row.codigo_bascula);
    });
    setCodigos(map);
  }, []);

  useEffect(() => {
    fetchCodigos();
  }, [fetchCodigos]);

  const codigoDe = useCallback(
    (item: LineaConProducto): string | null =>
      (item.articuloId && codigos.get(item.articuloId)) || (item.productoId && codigos.get(item.productoId)) || null,
    [codigos],
  );

  return { codigoDe };
}
