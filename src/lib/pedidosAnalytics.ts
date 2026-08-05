import type { Pedido } from '@/types/pedido';

export interface PedidosStats {
  totalPedidos: number;
  ticketMedio: number;
  pesoMedioKg: number;
}

export interface ProductoPedidoBreakdown {
  nombre: string;
  vecesPedido: number;
  kgTotal: number;
}

const ACTIVOS: Pedido['estado'][] = ['nuevo', 'confirmado', 'completado'];

export function buildPedidosStats(pedidos: Pedido[]): PedidosStats {
  const activos = pedidos.filter((p) => ACTIVOS.includes(p.estado));
  const totalPedidos = activos.length;
  const sumaImportes = activos.reduce((sum, p) => sum + (p.importe_estimado ?? 0), 0);
  const sumaPeso = activos.reduce((sum, p) => sum + p.peso_total, 0);

  return {
    totalPedidos,
    ticketMedio: totalPedidos > 0 ? sumaImportes / totalPedidos : 0,
    pesoMedioKg: totalPedidos > 0 ? sumaPeso / totalPedidos : 0,
  };
}

// Qué se pide de verdad (no solo qué se mira) — por nombre de producto tal
// como quedó guardado en el pedido, así sigue siendo válido aunque el
// producto se elimine o cambie de nombre más tarde.
export function buildProductoPedidoBreakdown(pedidos: Pedido[], limit = 10): ProductoPedidoBreakdown[] {
  const activos = pedidos.filter((p) => ACTIVOS.includes(p.estado));
  const byNombre = new Map<string, ProductoPedidoBreakdown>();

  for (const pedido of activos) {
    for (const item of pedido.items) {
      if (!byNombre.has(item.nombre)) {
        byNombre.set(item.nombre, { nombre: item.nombre, vecesPedido: 0, kgTotal: 0 });
      }
      const entry = byNombre.get(item.nombre)!;
      entry.vecesPedido += 1;
      entry.kgTotal += item.kg;
    }
  }

  return Array.from(byNombre.values())
    .sort((a, b) => b.vecesPedido - a.vecesPedido)
    .slice(0, limit);
}
