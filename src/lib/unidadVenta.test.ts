import { describe, expect, it } from 'vitest';
import { admitePiezas, formatLineaCantidad, formatPiezas, kgPorPieza, pesosPieza, PESOS_PIEZA_POR_DEFECTO } from './unidadVenta';

describe('venta por piezas', () => {
  it('2 merluzas de 2 kg = 4 kg en total', () => {
    expect(formatPiezas(2, 4)).toBe('2 piezas de ~2 kg (≈ 4 kg)');
    expect(kgPorPieza(4, 2)).toBe(2);
  });

  it('usa coma decimal y singular', () => {
    expect(formatPiezas(1, 1.5)).toBe('1 pieza de ~1,5 kg (≈ 1,5 kg)');
    expect(formatPiezas(3, 4.5)).toBe('3 piezas de ~1,5 kg (≈ 4,5 kg)');
  });

  it('formatea líneas guardadas por peso, unidades y piezas', () => {
    expect(formatLineaCantidad({ kg: 2.5 })).toBe('2,5 kg');
    expect(formatLineaCantidad({ kg: 3, unidad: 'ud' })).toBe('3 ud');
    expect(formatLineaCantidad({ kg: 4, unidad: 'kg', piezas: 2 })).toBe('2 piezas de ~2 kg (≈ 4 kg)');
  });

  it('solo admite piezas a €/kg y con la casilla marcada', () => {
    expect(admitePiezas({ precio: '14,90€/kg', por_piezas: true })).toBe(true);
    expect(admitePiezas({ precio: '14,90€/kg', por_piezas: false })).toBe(false);
    expect(admitePiezas({ precio: '3,50€/ud', por_piezas: true })).toBe(false);
  });

  it('pesos propios ordenados o la lista por defecto', () => {
    expect(pesosPieza({ precio: '', pesos_pieza: [2, 1, 1.5, 2] })).toEqual([1, 1.5, 2]);
    expect(pesosPieza({ precio: '', pesos_pieza: null })).toEqual(PESOS_PIEZA_POR_DEFECTO);
  });
});
