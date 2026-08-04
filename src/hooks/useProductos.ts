import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Producto } from '@/types/producto';

export function useProductos() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('productos')
      .select('*')
      .order('orden', { ascending: true })
      .order('created_at', { ascending: true });

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
