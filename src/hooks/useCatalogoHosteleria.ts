import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { ProductoHosteleria } from '@/types/hosteleria';

// Catálogo privado de un cliente de hostelería autenticado (get_catalogo_hosteleria),
// con los precios de su lista asignada. Si el token ha caducado o ha sido
// invalidado (p.ej. el pescadero cambió el PIN), invalida = true para que
// la página cierre la sesión local y vuelva a pedir código+PIN.
export function useCatalogoHosteleria(token: string | null) {
  const [productos, setProductos] = useState<ProductoHosteleria[]>([]);
  const [loading, setLoading] = useState(true);
  const [invalida, setInvalida] = useState(false);

  const fetchCatalogo = useCallback(async () => {
    if (!token) {
      setProductos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('get_catalogo_hosteleria', { p_token: token });
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
