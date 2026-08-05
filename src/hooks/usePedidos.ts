import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Pedido, PedidoEstado } from '@/types/pedido';

const MAX_ROWS = 5_000;

export function usePedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('pedidos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);
    setPedidos(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  const setEstado = useCallback(async (id: string, estado: PedidoEstado) => {
    await supabase.from('pedidos').update({ estado }).eq('id', id);
    setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, estado } : p)));
  }, []);

  const deletePedido = useCallback(async (id: string) => {
    await supabase.from('pedidos').delete().eq('id', id);
    setPedidos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { pedidos, loading, refetch: fetchPedidos, setEstado, deletePedido };
}
