import { describe, expect, it } from 'vitest';
import { agruparHojas, buscarRepetida, esContinuacion } from './comprasHojas';

const hoja = (proveedor: string | null, numero: string | null, total: number | null = null) => ({ proveedor, numero, total });

describe('esContinuacion', () => {
  it('con número en las dos hojas manda el número', () => {
    expect(esContinuacion(hoja('Adelaida', 'A26 / 5055'), hoja('Adelaida', 'A26/5055', 244.47))).toBe(true);
    expect(esContinuacion(hoja('Adelaida', 'A26/5055', 244.47), hoja('Adelaida', 'A26/5056'))).toBe(false);
  });

  it('una hoja sin cabecera es la página siguiente', () => {
    expect(esContinuacion(hoja('Txalupa', '1234', 80), hoja(null, null, 120))).toBe(true);
  });

  it('otro proveedor es otro albarán', () => {
    expect(esContinuacion(hoja('Pescados Txalupa, S.L.', null), hoja('Conifres, S.L.', null))).toBe(false);
  });

  it('mismo proveedor sin número: se junta solo si lo anterior no tenía total', () => {
    expect(esContinuacion(hoja('Conifres, S.L.', null, null), hoja('Conifres, S.L.', null, 50))).toBe(true);
    expect(esContinuacion(hoja('Conifres, S.L.', null, 40), hoja('Conifres, S.L.', null, 50))).toBe(false);
  });
});

describe('agruparHojas', () => {
  it('tres fotos: dos páginas de un albarán y otro aparte', () => {
    const hojas = [hoja('Adelaida', 'A26/5055'), hoja(null, null, 244.47), hoja('Gaizka', '915.874', 50.8)];
    expect(agruparHojas(hojas)).toEqual([false, true, false]);
  });

  it('respeta lo unido o separado a mano', () => {
    const hojas = [hoja('Adelaida', 'A26/5055'), hoja(null, null, 244.47), hoja('Gaizka', '915.874', 50.8)];
    expect(agruparHojas(hojas, [null, false, true])).toEqual([false, false, true]);
  });

  it('la cabecera del albarán es la de su primera página', () => {
    const hojas = [hoja('Adelaida', 'A26/5055'), hoja(null, null), hoja('Adelaida', 'A26/5055', 244.47)];
    expect(agruparHojas(hojas)).toEqual([false, true, true]);
  });
});

describe('buscarRepetida', () => {
  const compras = [
    { id: '1', estado: 'pendiente', proveedor: 'Pescados y Mariscos Adelaida, S.L.', numero: 'A26 / 5055' },
    { id: '2', estado: 'anulada', proveedor: 'Conifres, S.L.', numero: '7777' },
  ];
  it('el PDF del email y la foto del papel son el mismo albarán', () => {
    expect(buscarRepetida(compras, 'Pescados y Mariscos Adelaida, S.L.', 'A26/5055')?.id).toBe('1');
  });
  it('no cuenta las anuladas, ni a sí misma, ni números cortos', () => {
    expect(buscarRepetida(compras, 'Conifres, S.L.', '7777')).toBeNull();
    expect(buscarRepetida(compras, null, 'A26/5055', '1')).toBeNull();
    expect(buscarRepetida(compras, null, '12')).toBeNull();
  });
  it('otro proveedor con el mismo número no es repetido', () => {
    expect(buscarRepetida(compras, 'Pescados Txalupa, S.L.', 'A26/5055')).toBeNull();
  });
});
