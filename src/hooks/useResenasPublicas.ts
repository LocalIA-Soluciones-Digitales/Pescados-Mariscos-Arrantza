import { useEffect, useState } from 'react';
import { supabase, SITE_KEY } from '@/lib/supabaseClient';
import type { Resena } from '@/types/resena';

// Pasa por get_resenas_aprobadas (en vez de leer la tabla directamente) para
// que un visitante nunca pueda ver reseñas de otro cliente.
export function useResenasPublicas() {
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc('get_resenas_aprobadas', { p_site_key: SITE_KEY })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Error al cargar reseñas públicas:', error);
        }
        const ordenadas = (data ?? [])
          .sort((a: Resena, b: Resena) => b.created_at.localeCompare(a.created_at))
          .slice(0, 30);
        setResenas(ordenadas);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { resenas, loading };
}
