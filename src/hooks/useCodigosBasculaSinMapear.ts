import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Origen } from '@/types/origen';

export interface CodigoBasculaSinMapear {
  origen: Origen;
  codigo_bascula: string;
  designacion: string;
}

const DIAS_HACIA_ATRAS = 30;

// Códigos de báscula que han llegado en ventas a peso (kg) pero no tienen
// producto asignado en productos_codigos_bascula — sus ventas se guardan
// para la facturación pero NO descuentan stock (ver descontar_stock_bascula
// en schema.sql). Sin esto visible en el panel, ese hueco pasa
// desapercibido indefinidamente, que es justo lo que ocurrió: la tabla
// llevaba vacía desde que se activó la sincronización.
export function useCodigosBasculaSinMapear() {
  const [codigos, setCodigos] = useState<CodigoBasculaSinMapear[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      const desde = new Date();
      desde.setDate(desde.getDate() - DIAS_HACIA_ATRAS);
      const { data } = await supabase
        .from('bascula_ventas')
        .select('origen, codigo_bascula, designacion')
        .is('producto_id', null)
        .eq('unidad', 'kg')
        .gte('fecha', desde.toISOString().slice(0, 10));
      if (cancelado) return;
      const vistos = new Set<string>();
      const unicos: CodigoBasculaSinMapear[] = [];
      (data ?? []).forEach((row) => {
        const clave = `${row.origen}|${row.codigo_bascula}`;
        if (vistos.has(clave)) return;
        vistos.add(clave);
        unicos.push(row as CodigoBasculaSinMapear);
      });
      unicos.sort((a, b) => a.origen.localeCompare(b.origen) || a.codigo_bascula.localeCompare(b.codigo_bascula));
      setCodigos(unicos);
      setLoading(false);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return { codigos, loading };
}
