import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeTable } from './useRealtimeTable';
import type { BasculaVenta, BasculaVentaDiaria, BasculaVentaDiariaPorTienda, BasculaVentaResumenProducto } from '@/types/basculaVenta';
import type { Origen } from '@/types/origen';

// Totales por día combinando ambas pescaderías (vista bascula_ventas_diarias).
// Se suscribe a cambios en la tabla base bascula_ventas, no en la vista —
// Postgres Changes no emite eventos sobre vistas.
export function useBasculaVentasDiarias() {
  const [dias, setDias] = useState<BasculaVentaDiaria[]>([]);
  const [porTienda, setPorTienda] = useState<BasculaVentaDiariaPorTienda[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDias = useCallback(async () => {
    setLoading(true);
    const [{ data: combinado }, { data: desglose }] = await Promise.all([
      supabase.from('bascula_ventas_diarias').select('*').order('fecha', { ascending: false }),
      supabase.from('bascula_ventas_diarias_por_tienda').select('*').order('fecha', { ascending: false }),
    ]);
    setDias(combinado ?? []);
    setPorTienda(desglose ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDias();
  }, [fetchDias]);

  useRealtimeTable('bascula_ventas', fetchDias);

  return { dias, porTienda, loading, refetch: fetchDias };
}

// Detalle de líneas de un día concreto, cargado bajo demanda al desplegar
// ese día en el panel (en vez de traer todo el histórico de golpe).
export async function fetchBasculaVentasDelDia(fecha: string): Promise<BasculaVenta[]> {
  const { data } = await supabase
    .from('bascula_ventas')
    .select('*')
    .eq('fecha', fecha)
    .order('hora', { ascending: false })
    .order('linea_oid', { ascending: false });
  return data ?? [];
}

// Resumen por producto (agrupando todas las líneas por designación +
// unidad) para el listado que se abre al pulsar los recuadros de Kg a
// peso / Piezas: en vez del histórico cronológico de tickets, muestra
// cuánto se ha vendido en total de cada producto. La agregación se hace
// en el cliente porque el volumen de líneas por día es bajo.
export async function fetchBasculaVentasResumenProductos(fechas: string[], origen: Origen | null): Promise<BasculaVentaResumenProducto[]> {
  let query = supabase.from('bascula_ventas').select('designacion, unidad, cantidad, importe').in('fecha', fechas);
  if (origen) query = query.eq('origen', origen);
  const { data } = await query;

  const map = new Map<string, BasculaVentaResumenProducto>();
  (data ?? []).forEach((l) => {
    const key = `${l.designacion}__${l.unidad}`;
    const actual = map.get(key);
    if (actual) {
      actual.cantidad += l.cantidad;
      actual.importe += l.importe;
    } else {
      map.set(key, { designacion: l.designacion, unidad: l.unidad, cantidad: l.cantidad, importe: l.importe });
    }
  });
  return Array.from(map.values()).sort((a, b) => b.importe - a.importe);
}

// Borra una línea de venta sincronizada de la báscula (p.ej. si se coló una
// venta errónea) sin riesgo de que la sincronización la vuelva a traer: esa
// función solo mira si el oid es mayor que el último visto, no si la fila
// sigue existiendo en bascula_ventas.
export async function deleteBasculaVenta(id: string): Promise<boolean> {
  const { error } = await supabase.from('bascula_ventas').delete().eq('id', id);
  return !error;
}
