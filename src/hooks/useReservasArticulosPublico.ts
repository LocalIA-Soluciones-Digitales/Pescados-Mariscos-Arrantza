import { useEffect, useState } from 'react';
import { supabase, SITE_KEY } from '@/lib/supabaseClient';
import type { ReservaArticulo } from '@/types/reserva';

// Artículos propios de una campaña de reservas (p. ej. Navidad, sacados de
// la familia de la báscula). Lista vacía = la campaña usa el catálogo de la
// tienda.
export function useReservasArticulosPublico(eventoId: string | null) {
  const [articulos, setArticulos] = useState<ReservaArticulo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!eventoId) {
      setArticulos([]);
      return;
    }
    let cancelado = false;
    setLoading(true);
    supabase
      .rpc('get_reservas_articulos_publico', { p_site_key: SITE_KEY, p_evento_id: eventoId })
      .then(({ data }) => {
        if (cancelado) return;
        setArticulos(((data ?? []) as ReservaArticulo[]).map((a) => ({ ...a, precio: Number(a.precio), pesos_pieza: a.pesos_pieza?.map(Number) ?? null })));
        setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [eventoId]);

  return { articulos, loading };
}
