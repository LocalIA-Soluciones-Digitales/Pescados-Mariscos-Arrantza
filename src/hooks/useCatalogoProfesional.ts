import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { ProductoProfesional } from '@/types/profesional';

// Catálogo privado de un profesional autenticado (get_catalogo_profesional),
// con los precios de su lista asignada. Si el token ha caducado o ha sido
// invalidado (p.ej. el pescadero cambió el PIN), invalida = true para que
// la página cierre la sesión local y vuelva a pedir código+PIN.
export function useCatalogoProfesional(token: string | null) {
  const [productos, setProductos] = useState<ProductoProfesional[]>([]);
  const [loading, setLoading] = useState(true);
  const [invalida, setInvalida] = useState(false);

  const fetchCatalogo = useCallback(async () => {
    if (!token) {
      setProductos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('get_catalogo_profesional', { p_token: token });
    if (error) {
      setInvalida(true);
      setProductos([]);
    } else {
      setInvalida(false);
      setProductos(data ?? []);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchCatalogo();
  }, [fetchCatalogo]);

  return { productos, loading, invalida, refetch: fetchCatalogo };
}
