import { describe, expect, it } from 'vitest';
import { buildPedidosStats, buildProductoPedidoBreakdown } from './pedidosAnalytics';
import type { Pedido } from '@/types/pedido';

function pedido(overrides: Partial<Pedido>): Pedido {
  return {
    id: crypto.randomUUID(),
    items: [],
    total_productos: 0,
    peso_total: 0,
    importe_estimado: 0,
    metodo_entrega: 'pickup',
    cliente_nombre: null,
    cliente_negocio: null,
    cliente_telefono: null,
    cliente_email: null,
    cliente_direccion: null,
    cliente_ciudad: null,
    cliente_cp: null,
    fecha_preferida: null,
    hora_preferida: null,
    notas: null,
    estado: 'nuevo',
    created_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildPedidosStats', () => {
  it('averages the estimated amount only over active orders', () => {
    const pedidos = [
      pedido({ importe_estimado: 20, peso_total: 2 }),
      pedido({ importe_estimado: 40, peso_total: 4 }),
      pedido({ importe_estimado: 999, peso_total: 99, estado: 'cancelado' }),
    ];

    const stats = buildPedidosStats(pedidos);

    expect(stats.totalPedidos).toBe(2);
    expect(stats.ticketMedio).toBeCloseTo(30);
    expect(stats.pesoMedioKg).toBeCloseTo(3);
  });

  it('returns zeros when there are no active orders', () => {
    const stats = buildPedidosStats([pedido({ estado: 'cancelado' })]);
    expect(stats.totalPedidos).toBe(0);
    expect(stats.ticketMedio).toBe(0);
  });
});

describe('buildProductoPedidoBreakdown', () => {
  it('ranks products by how often they were actually ordered', () => {
    const pedidos = [
      pedido({ items: [{ productoId: '1', nombre: 'Merluza', kg: 1, preparacion: 'whole', nota: '', precioKg: 15 }] }),
      pedido({ items: [{ productoId: '1', nombre: 'Merluza', kg: 2, preparacion: 'whole', nota: '', precioKg: 15 }] }),
      pedido({ items: [{ productoId: '2', nombre: 'Rodaballo', kg: 1, preparacion: 'whole', nota: '', precioKg: 30 }] }),
      pedido({
        estado: 'cancelado',
        items: [{ productoId: '2', nombre: 'Rodaballo', kg: 5, preparacion: 'whole', nota: '', precioKg: 30 }],
      }),
    ];

    const breakdown = buildProductoPedidoBreakdown(pedidos);

    expect(breakdown[0]).toEqual({ nombre: 'Merluza', vecesPedido: 2, kgTotal: 3 });
    expect(breakdown[1]).toEqual({ nombre: 'Rodaballo', vecesPedido: 1, kgTotal: 1 });
  });
});
