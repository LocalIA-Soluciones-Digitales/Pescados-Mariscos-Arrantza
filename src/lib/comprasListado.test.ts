import { describe, expect, it } from 'vitest';
import { contrastarListado, notaListado } from './comprasListado';

const compra = (proveedor: string, fecha: string, numero: string | null, total: number | null, estado = 'confirmada') => ({
  proveedor,
  fecha,
  numero,
  total,
  estado,
});

describe('contrastarListado', () => {
  it('cruza por importe o nº, avisa de lo que falta y de lo que tiene otro importe', () => {
    const c = contrastarListado(
      [
        { proveedor: 'CONIFRES, S.L.', fecha: '2026-10-16', factura: 'M10780', importe: 111.4 },
        { proveedor: 'PEREZ VIÑAS COMERCIAL, S.L.', fecha: '2026-10-14', factura: '910428', importe: 125.08 },
        { proveedor: 'ARRAINKO ANAIAK, S.L.', fecha: '2026-10-15', factura: '013337', importe: 34.94 },
        { proveedor: 'PESCADOS TRIANA, S.A.', fecha: '2026-10-16', factura: '011784', importe: 32.23 },
      ],
      [
        compra('Conifres, S.L.', '2026-10-16', 'AM/OUT/11121', 111.4),
        compra('Pérez Viñas Comercial, S.L.', '2026-10-14', '910428', 120),
        compra('Pescados Triana, S.A.', '2026-10-16', null, 32.23, 'anulada'),
      ],
    );
    expect(c.estan).toBe(1);
    expect(c.distintos).toEqual([{ recibo: expect.objectContaining({ factura: '910428' }), guardado: 120 }]);
    expect(c.faltan.map((f) => f.factura)).toEqual(['013337', '011784']);
    const nota = notaListado(c, '2026-10-17');
    expect(nota).toMatch(/^Listado del gremio al 17-10: no cuenta como gasto/);
    expect(nota).toContain('Faltan: ARRAINKO ANAIAK 15-10 nº 013337 34,94 €');
  });
});

describe('listado real del 17-10 contra Compras', () => {
  it('avisa del Arraiza repetido, del proveedor «Código» y de la diferencia de Capotinas', () => {
    const recibos = [
      ['ARRAINKO ANAIAK, S.L.', '2026-10-15', '013337', 34.94],
      ['PESCADOS TRIANA, S.A.', '2026-10-16', '011784', 32.23],
      ['CONIFRES, S.L.', '2026-10-14', 'M10643', 127.57],
      ['CONIFRES, S.L.', '2026-10-16', 'M10780', 111.4],
      ['CONIFRES, S.L.', '2026-10-17', 'M10837', 259.29],
      ['PEREZ VIÑAS COMERCIAL, S.L.', '2026-10-17', '910611', 245.19],
      ['LAS CAPOTINAS, S.A.', '2026-10-17', '007638', 2994.49],
      ['PESCADOS GAIZKA, S.L.', '2026-10-16', '000241', 19.38],
      ['ARRAIZA GUTIERREZ, S.L.', '2026-10-17', '022028', 109.55],
    ].map(([proveedor, fecha, factura, importe]) => ({ proveedor, fecha, factura, importe }) as { proveedor: string; fecha: string; factura: string; importe: number });
    const c = contrastarListado(recibos, [
      compra('Arraiza Gutiérrez, S.L.', '2026-10-17', null, 109.55),
      compra('Arraiza Gutiérrez, S.L.', '2026-10-17', null, 109.55),
      compra('Código', '2026-10-17', null, 245.19),
      compra('Conifres, S.L.', '2026-10-16', 'M10780', 111.4, 'anulada'),
      compra('Conifres, S.L.', '2026-10-16', 'M10780', 111.4),
      compra('Conifres, S.L.', '2026-10-17', 'M10837', 259.29),
      compra('Las Capotinas, S.A.', '2026-10-17', '27.713', 1245.02),
      compra('Las Capotinas, S.A.', '2026-10-17', null, 779.23),
      compra('Pescados Triana, S.A.', '2026-10-16', null, 32.23),
      compra('Pescados y Mariscos Adelaida, S.L.', '2026-10-16', 'A26/5.055', 244.47),
      compra('Pescados y Mariscos Gaizka, S.L.', '2026-10-16', '926.237', 19.38),
    ]);
    expect(c.estan).toBe(5);
    expect(c.faltan.map((f) => f.factura)).toEqual(['013337', 'M10643', '910611']);
    expect(c.distintos).toEqual([{ recibo: expect.objectContaining({ factura: '007638' }), guardado: 2024.25 }]);
    expect(c.sobran.map((s) => [s.proveedor, s.total])).toEqual([
      ['Arraiza Gutiérrez, S.L.', 109.55],
      ['Código', 245.19],
    ]);
  });
});
