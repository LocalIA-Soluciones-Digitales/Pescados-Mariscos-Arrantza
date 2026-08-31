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
