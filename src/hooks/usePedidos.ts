import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Pedido, PedidoEstado, PedidoEstadoPago } from '@/types/pedido';

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

  // Marca a mano un pago (Bizum, transferencia...) como recibido. Si el
  // pedido seguía en "nuevo" lo pasa también a "confirmado", igual que hace
  // el webhook de Stripe con las tarjetas — así dispara el mismo email de
  // confirmación al cliente sin duplicar esa lógica.
  const setEstadoPago = useCallback(async (id: string, estadoPago: PedidoEstadoPago) => {
    await supabase.from('pedidos').update({ estado_pago: estadoPago }).eq('id', id);
    setPedidos((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, estado_pago: estadoPago };
        if (estadoPago === 'pagado' && p.estado === 'nuevo') next.estado = 'confirmado';
        return next;
      }),
    );
    if (estadoPago === 'pagado') {
      await supabase.from('pedidos').update({ estado: 'confirmado' }).eq('id', id).eq('estado', 'nuevo');
    }
  }, []);

  return { pedidos, loading, refetch: fetchPedidos, setEstado, setEstadoPago, deletePedido };
}
