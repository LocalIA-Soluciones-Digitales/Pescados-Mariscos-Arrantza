import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';

// Fila de prevision_genero(): lo que se suele vender de un producto un día
// como el pedido (media de los mismos días de la semana de las últimas
// semanas). Ver supabase/schema.sql.
export interface PrevisionProducto {
  designacion: string;
  unidad: string;
  producto_id: string | null;
  media: number;
  media_p1: number;
  media_p2: number;
  maximo: number;
  dias_vendido: number;
  dias_referencia: number;
  importe_medio: number;
}

export interface VentaHora {
  hora: number;
  importe_hoy: number;
  tickets_hoy: number;
  importe_referencia: number;
  dias_referencia: number;
}

export function usePrevisionGenero(fecha: string) {
  const [filas, setFilas] = useState<PrevisionProducto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    supabase.rpc('prevision_genero', { p_fecha: fecha, p_semanas: 6 }).then(({ data }) => {
      if (cancelado) return;
      setFilas(
        ((data ?? []) as PrevisionProducto[]).map((f) => ({
          ...f,
          media: Number(f.media),
          media_p1: Number(f.media_p1),
          media_p2: Number(f.media_p2),
          maximo: Number(f.maximo),
          importe_medio: Number(f.importe_medio),
        })),
      );
      setLoading(false);
    });
    return () => {
      cancelado = true;
    };
  }, [fecha]);

  return { filas, loading };
}

// Ventas por hora de hoy frente a un día normal igual, refrescadas en
// directo al entrar ventas nuevas de báscula.
export function useVentasPorHora(fecha: string) {
  const [horas, setHoras] = useState<VentaHora[]>([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    const { data } = await supabase.rpc('ventas_por_hora', { p_fecha: fecha, p_semanas: 6 });
    setHoras(
      ((data ?? []) as VentaHora[]).map((h) => ({
        ...h,
        importe_hoy: Number(h.importe_hoy),
        importe_referencia: Number(h.importe_referencia),
      })),
    );
    setLoading(false);
  }, [fecha]);

  useEffect(() => {
    setLoading(true);
    cargar();
  }, [cargar]);

  useRealtimeTable('bascula_ventas', cargar);

  return { horas, loading };
}
