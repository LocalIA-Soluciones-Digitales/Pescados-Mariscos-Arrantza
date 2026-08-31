import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeTable } from './useRealtimeTable';
import type { BasculaVenta, BasculaVentaDiaria } from '@/types/basculaVenta';

// Totales por día (vista bascula_ventas_diarias). Se suscribe a cambios en
// la tabla base bascula_ventas, no en la vista — Postgres Changes no emite
// eventos sobre vistas.
export function useBasculaVentasDiarias() {
  const [dias, setDias] = useState<BasculaVentaDiaria[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDias = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('bascula_ventas_diarias').select('*').order('fecha', { ascending: false });
    setDias(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDias();
  }, [fetchDias]);

  useRealtimeTable('bascula_ventas', fetchDias);

  return { dias, loading, refetch: fetchDias };
}

// Detalle de líneas de un día concreto, cargado bajo demanda al desplegar
// ese día en el panel (en vez de traer todo el histórico de golpe).
export async function fetchBasculaVentasDelDia(fecha: string): Promise<BasculaVenta[]> {
  const { data } = await supabase.from('bascula_ventas').select('*').eq('fecha', fecha).order('hora', { ascending: true });
  return data ?? [];
}

// Borra una línea de venta sincronizada de la báscula (p.ej. si se coló una
// venta errónea) sin riesgo de que la sincronización la vuelva a traer: esa
// función solo mira si el oid es mayor que el último visto, no si la fila
// sigue existiendo en bascula_ventas.
export async function deleteBasculaVenta(id: string): Promise<boolean> {
  const { error } = await supabase.from('bascula_ventas').delete().eq('id', id);
  return !error;
}
