import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Origen } from '@/types/origen';

// Umbral para marcar una báscula como "sin conexión": el cron de
// bascula-sync se dispara cada 5 min (ver supabase/functions/bascula-sync),
// así que un margen de 2 vueltas cubre el jitter normal sin disparar falsos
// positivos por un solo ciclo lento.
const UMBRAL_SIN_CONEXION_MS = 12 * 60 * 1000;
const INTERVALO_REFRESCO_MS = 30 * 1000;

export type EstadoBascula = 'conectada' | 'sin_conexion' | 'desconocido';

export interface BasculaSyncInfo {
  estado: EstadoBascula;
  ultimaSync: Date | null;
}

// Hora de la última sincronización correcta de cada báscula (se actualiza
// en cada ejecución del cron aunque no haya vendido nada esa vez), para
// mostrar un indicador tipo watchdog "conectada / sin conexión" en Caja —
// ver bascula_sync_estado() en supabase/schema.sql.
export function useBasculaSyncEstado() {
  const [porOrigen, setPorOrigen] = useState<Partial<Record<Origen, BasculaSyncInfo>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;

    const refrescar = async () => {
      const { data } = await supabase.rpc('bascula_sync_estado');
      if (cancelado) return;
      const ahora = Date.now();
      const map: Partial<Record<Origen, BasculaSyncInfo>> = {};
      (data ?? []).forEach((fila: { origen: string; ultima_sync: string }) => {
        const ultimaSync = new Date(fila.ultima_sync);
        const estado: EstadoBascula = ahora - ultimaSync.getTime() > UMBRAL_SIN_CONEXION_MS ? 'sin_conexion' : 'conectada';
        map[fila.origen as Origen] = { estado, ultimaSync };
      });
      setPorOrigen(map);
      setLoading(false);
    };

    refrescar();
    const intervalo = setInterval(refrescar, INTERVALO_REFRESCO_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

  return { porOrigen, loading };
}
