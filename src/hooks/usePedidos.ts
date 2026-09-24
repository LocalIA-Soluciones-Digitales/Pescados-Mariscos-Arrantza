import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeTable } from './useRealtimeTable';
import type { Pedido, PedidoEstado, PedidoEstadoPago } from '@/types/pedido';

const MAX_ROWS = 5_000;

export function usePedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPedidos = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase
      .from('pedidos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);
    setPedidos(data ?? []);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  const fetchPedidosSilent = useCallback(() => fetchPedidos(true), [fetchPedidos]);
  useRealtimeTable('pedidos', fetchPedidosSilent);

  const setEstado = useCallback(async (id: string, estado: PedidoEstado) => {
    await supabase.from('pedidos').update({ estado }).eq('id', id);
    setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, estado } : p)));
  }, []);

  const deletePedido = useCallback(async (id: string) => {
    await supabase.from('pedidos').delete().eq('id', id);
    setPedidos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Marca a mano un pago (Bizum, transferencia...) como recibido. No toca el
  // estado del pedido: confirmarlo es siempre un paso manual aparte.
  const setEstadoPago = useCallback(async (id: string, estadoPago: PedidoEstadoPago) => {
    await supabase.from('pedidos').update({ estado_pago: estadoPago }).eq('id', id);
    setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, estado_pago: estadoPago } : p)));
  }, []);

  return { pedidos, loading, refetch: fetchPedidos, setEstado, setEstadoPago, deletePedido };
}
