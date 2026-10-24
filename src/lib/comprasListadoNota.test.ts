import { describe, expect, it } from 'vitest';
import { conRecibos, contrastarListado, leerNotaListado, notaListado } from './comprasListado';

describe('leerNotaListado', () => {
  it('lee la nota real del 24-10', () => {
    const nota =
      'Listado del gremio al 24-10: no cuenta como gasto, solo para contrastar. 21 facturas, 6561,77 €. En Gastos: 14 de 21. ' +
      'Faltan: ARRAINKO ANAIAK 20-10 nº 013519 41,64 €; LAS CAPOTINAS 24-10 nº 007830 3530,84 €; ARRAIZA GUTIERREZ 24-10 nº 022640 124,52 €. ' +
      'En Gastos y no en el listado (¿repetidas o proveedor mal leído?): LUZA 24-10 513,56 €; Las Capotinas, S.A. 22-10 184,70 €.';
    const l = leerNotaListado(nota)!;
    expect(l).toMatchObject({ al: '24-10', recibos: 21, total: 6561.77, estan: 14, distintos: [] });
    expect(l.faltan).toEqual([
      { proveedor: 'ARRAINKO ANAIAK', dia: '20-10', factura: '013519', importe: 41.64 },
      { proveedor: 'LAS CAPOTINAS', dia: '24-10', factura: '007830', importe: 3530.84 },
      { proveedor: 'ARRAIZA GUTIERREZ', dia: '24-10', factura: '022640', importe: 124.52 },
    ]);
    expect(l.sobran).toEqual([
      { proveedor: 'LUZA', dia: '24-10', total: 513.56 },
      { proveedor: 'Las Capotinas, S.A.', dia: '22-10', total: 184.7 },
    ]);
  });

  it('vuelve a leer lo que escribe notaListado', () => {
    const c = contrastarListado(
      [
        { proveedor: 'CONIFRES, S.L.', fecha: '2026-10-16', factura: 'M10780', importe: 111.4 },
        { proveedor: 'PEREZ VIÑAS COMERCIAL, S.L.', fecha: '2026-10-14', factura: '910428', importe: 1125.08 },
      ],
      [{ proveedor: 'Pérez Viñas Comercial, S.L.', fecha: '2026-10-14', numero: '910428', total: 120, estado: 'confirmada' }],
    );
    const l = leerNotaListado(notaListado(c, '2026-10-17'))!;
    expect(l.faltan).toEqual([{ proveedor: 'CONIFRES', dia: '16-10', factura: 'M10780', importe: 111.4 }]);
    expect(l.distintos).toEqual([{ proveedor: 'PEREZ VIÑAS COMERCIAL', factura: '910428', importe: 1125.08, guardado: 120 }]);
  });

  it('el listado del 24-10 contrastado en vivo: faltan 2 y Capotinas factura la semana entera', () => {
    const recibos = (
      [
        ['ARRAINKO ANAIAK, S.L.', '2026-10-20', '013519', 41.64],
        ['ARRAINKO ANAIAK, S.L.', '2026-10-21', '013595', 108.34],
        ['ARRAINKO ANAIAK, S.L.', '2026-10-24', '013806', 44.98],
        ['PESCADOS TRIANA, S.A.', '2026-10-24', '012189', 15.88],
        ['CONIFRES, S.L.', '2026-10-23', 'M11031', 536.67],
        ['CONIFRES, S.L.', '2026-10-24', 'M11063', 288.65],
        ['PEREZ VIÑAS COMERCIAL, S.L.', '2026-10-21', '910719', 159.17],
        ['PEREZ VIÑAS COMERCIAL, S.L.', '2026-10-23', '910828', 261.41],
        ['PEREZ VIÑAS COMERCIAL, S.L.', '2026-10-24', '910879', 152.73],
        ['JOSE CRESPO, S.A.', '2026-10-20', '019483', 226.24],
        ['JOSE CRESPO, S.A.', '2026-10-21', '019569', 22.28],
        ['JOSE CRESPO, S.A.', '2026-10-23', '019818', 44.56],
        ['PESCADOS BIZKAIMAR, S.L.', '2026-10-20', '016728', 166.42],
        ['PESCADOS BIZKAIMAR, S.L.', '2026-10-23', '017078', 10.92],
        ['PESCADOS BIZKAIMAR, S.L.', '2026-10-24', '017173', 10.92],
        ['LAS CAPOTINAS, S.A.', '2026-10-24', '007830', 3530.84],
        ['ARRAIZA GUTIERREZ, S.L.', '2026-10-20', '022160', 179.8],
        ['ARRAIZA GUTIERREZ, S.L.', '2026-10-21', '022281', 179.16],
        ['ARRAIZA GUTIERREZ, S.L.', '2026-10-23', '022536', 386.66],
        ['ARRAIZA GUTIERREZ, S.L.', '2026-10-24', '022640', 124.52],
        ['PESCADOS TXALUPA, S.L.', '2026-10-23', '007926', 69.98],
      ] as const
    ).map(([proveedor, fecha, factura, importe]) => ({ proveedor, fecha, factura, importe }));
    const g = (proveedor: string, fecha: string, numero: string | null, total: number, estado = 'confirmada') => ({ proveedor, fecha, numero, total, estado });
    const compras = [
      g('Arrainko Anaiak, S.L.', '2026-10-21', '13595', 108.34),
      g('Arrainko Anaiak, S.L.', '2026-10-24', '13806', 44.98, 'pendiente'),
      g('Arraiza Gutiérrez, S.L.', '2026-10-20', '22160', 179.8),
      g('Arraiza Gutiérrez, S.L.', '2026-10-21', '22281', 179.16),
      g('Arraiza Gutiérrez, S.L.', '2026-10-23', '22536', 386.66),
      g('Arraiza Gutiérrez, S.L.', '2026-10-24', '22640', 124.52, 'pendiente'),
      g('Conifres, S.L.', '2026-10-23', 'M11031', 536.67),
      g('Conifres, S.L.', '2026-10-24', 'M11063', 288.65, 'pendiente'),
      g('J.L. Castañares, S.L.', '2026-10-22', '22/10', 85.16),
      g('José Crespo, S.A.', '2026-10-20', '19483', 226.24),
      g('José Crespo, S.A.', '2026-10-23', '19818', 44.56),
      g('Las Capotinas, S.A.', '2026-10-20', null, 802.44),
      g('Las Capotinas, S.A.', '2026-10-22', null, 184.7),
      g('Las Capotinas, S.A.', '2026-10-23', null, 1301.28),
      g('Las Capotinas, S.A.', '2026-10-24', null, 513.56),
      g('Pérez Viñas Comercial, S.L.', '2026-10-21', '910719', 159.17),
      g('Pérez Viñas Comercial, S.L.', '2026-10-23', '910828', 261.41),
      g('Pérez Viñas Comercial, S.L.', '2026-10-24', '910879', 152.73, 'pendiente'),
      g('Pescados Bizkaimar, S.L.U.', '2026-10-20', '16728', 166.42),
      g('Pescados Bizkaimar, S.L.U.', '2026-10-23', '17078', 10.92),
      g('Pescados Bizkaimar, S.L.U.', '2026-10-24', '17173', 10.92, 'pendiente'),
      g('Pescados Triana, S.A.', '2026-10-24', '12189', 15.88, 'pendiente'),
      g('Pescados Txalupa, S.L.', '2026-10-23', '7926', 69.98),
      g('Pescados y Mariscos Adelaida, S.L.', '2026-10-22', 'A26/5.079', 307.03),
    ];
    // Lo que se guardó al llegar (antes de leer las facturas del mismo correo).
    const nota = conRecibos(notaListado(contrastarListado(recibos, []), '2026-10-24'), '2026-10-24', recibos);
    expect(leerNotaListado(nota)!.faltan).toHaveLength(21);
    const l = leerNotaListado(nota, compras)!;
    expect(l).toMatchObject({ al: '24-10', recibos: 21, estan: 18, sobran: [] });
    expect(l.faltan.map((f) => [f.proveedor, f.factura])).toEqual([
      ['ARRAINKO ANAIAK', '013519'],
      ['JOSE CRESPO', '019569'],
    ]);
    expect(l.distintos).toEqual([{ proveedor: 'LAS CAPOTINAS', factura: '007830', importe: 3530.84, guardado: 2801.98 }]);
  });

  it('los listados viejos sin datos', () => {
    expect(leerNotaListado('Listado del gremio: no cuenta como gasto, solo para contrastar.')).toMatchObject({ recibos: null, faltan: [] });
    expect(leerNotaListado('Otra nota')).toBeNull();
  });
});
