import { useCallback, useEffect, useState } from 'react';
import { supabase, SITE_KEY } from '@/lib/supabaseClient';
import type { Producto } from '@/types/producto';

// Uso público (tienda): pasa por get_productos_publico en vez de leer la
// tabla directamente, para que un visitante nunca pueda ver el catálogo de
// otro cliente aunque comparta el mismo proyecto de Supabase.
export function useProductosPublicos() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase.rpc('get_productos_publico', {
      p_site_key: SITE_KEY,
    });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setError(null);
      setProductos(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  return { productos, loading, error, refetch: fetchProductos };
}
