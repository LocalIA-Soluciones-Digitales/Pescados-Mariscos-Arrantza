import { describe, expect, it } from 'vitest';
import { leerAlbaran, type OcrCaja } from './comprasOcr';
import { calcularMarcas, type TipoMarca } from './comprasMarcas';

// Mismo truco que en comprasOcr.test: cada grupo separado por 2+ espacios
// es una caja, a 10 px por carácter y 30 px por fila.
function cajas(filas: string[]): OcrCaja[] {
  return filas.flatMap((fila, i) => {
    let x = 0;
    return fila.split(/(\s{2,})/).flatMap((t) => {
      const caja = { text: t, x, y: i * 30, width: t.length * 10, height: 20 };
      x += t.length * 10;
      return t.trim() ? [caja] : [];
    });
  });
}

const TICKET = [
  'PESCADOS ITSASBERRI S.L.',
  'ALBARAN N. 2026/018734',
  'Fecha: 15/10/2026 Hora: 05:42',
  'ARTICULO          KG    EUR/KG     IMPORTE',
  'MERLUZA PINCHO    18,400    9,80    180,32',
  'RAPE BLANCO G     6,250    14,50     90,63',
  'BASE IMPONIBLE: 270,95',
  'TOTAL EUR: 298,05',
];

function porTipo(filas: string[]) {
  const c = cajas(filas);
  const { m } = calcularMarcas(c, leerAlbaran(c), 1000, filas.length * 30);
  const r: Partial<Record<TipoMarca, number>> = {};
  for (const [k] of m) r[k] = (r[k] ?? 0) + 1;
  return { r, m };
}

describe('calcularMarcas', () => {
  it('colorea proveedor, fecha, número, líneas y total', () => {
    const { r } = porTipo(TICKET);
    expect(r.proveedor).toBe(2); // PESCADOS · ITSASBERRI
    expect(r.fecha).toBe(1);
    expect(r.numero).toBe(1);
    expect(r.kg).toBe(2);
    expect(r.precio).toBe(2);
    expect(r.importe).toBe(2);
    expect(r.producto).toBe(4); // MERLUZA PINCHO · RAPE BLANCO (la G suelta no)
    expect(r.total).toBe(1);
    expect(r.texto).toBe(cajas(TICKET).length);
  });

  it('posiciones en milésimas de la imagen', () => {
    const { m } = porTipo(TICKET);
    for (const [, x, y, w, h] of m) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(1001);
      expect(y + h).toBeLessThanOrEqual(1001);
    }
  });

  it('el total se busca solo debajo de las líneas', () => {
    const { r } = porTipo([
      'PESCADOS GAIZKA S.L.',
      'Descripción  Unidades  Precio  Importe(EUR)',
      'LENGUADO  0,950  48,000  45,60',
      'Forma de pago  Base IVA  %IVA  Cuota IVA  %Rec',
      'GREMIO  45,60  10,00  4,56  1,40  0,64',
      '09/10/2026  50,80  Líquido(EUR):  50,80',
    ]);
    expect(r.importe).toBe(1);
    expect(r.total).toBe(2);
    expect(r.producto).toBe(1);
  });
});
