import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Resena } from '@/types/resena';

// Solo trae reseñas aprobadas — es lo único que la política RLS deja ver
// a un visitante anónimo, pero filtramos también aquí por claridad.
export function useResenasPublicas() {
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('resenas')
      .select('*')
      .eq('estado', 'aprobada')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Error al cargar reseñas públicas:', error);
        }
        setResenas(data ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { resenas, loading };
}
