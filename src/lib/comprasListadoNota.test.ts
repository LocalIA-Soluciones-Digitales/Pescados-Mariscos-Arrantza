import { describe, expect, it } from 'vitest';
import { contrastarListado, leerNotaListado, notaListado } from './comprasListado';

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

  it('los listados viejos sin datos', () => {
    expect(leerNotaListado('Listado del gremio: no cuenta como gasto, solo para contrastar.')).toMatchObject({ recibos: null, faltan: [] });
    expect(leerNotaListado('Otra nota')).toBeNull();
  });
});
