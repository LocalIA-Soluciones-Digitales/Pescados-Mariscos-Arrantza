import { describe, expect, it } from 'vitest';
import { buscarCoincidencia, mismasLineas, type DocCompra } from './comprasCoincidencias';

const ADELAIDA = 'Pescados y Mariscos Adelaida, S.L.';
const GAIZKA = 'Pescados y Mariscos Gaizka, S.L.';

let n = 0;
const doc = (d: Partial<DocCompra>): DocCompra => ({
  id: `c${++n}`,
  estado: 'confirmada',
  tipo: 'albaran',
  proveedor: ADELAIDA,
  numero: null,
  fecha: '2026-10-16',
  total: null,
  albaranes: [],
  ...d,
});
const nuevo = (d: Partial<DocCompra>) => {
  const { id: _id, estado: _e, ...r } = doc(d);
  return r;
};

describe('buscarCoincidencia', () => {
  it('el PDF del email de un albarán ya subido en foto es el mismo', () => {
    const foto = doc({ numero: 'A26/5055', total: 244.47 });
    const r = buscarCoincidencia(nuevo({ numero: 'A26 / 5055', total: 244.47 }), [foto]);
    expect(r?.tipo).toBe('mismo');
  });

  it('factura semanal que nombra sus albaranes, todos ya subidos: no cuenta', () => {
    const a = doc({ numero: 'A26/5001', total: 100, fecha: '2026-10-12' });
    const b = doc({ numero: 'A26/5030', total: 150.5, fecha: '2026-10-14' });
    const r = buscarCoincidencia(nuevo({ tipo: 'factura', numero: 'A26/2905', total: 250.5, albaranes: ['A26/5001', 'A26 / 5030'] }), [a, b]);
    expect(r).toEqual({ tipo: 'cubierta', con: [a, b] });
  });

  it('factura semanal con un albarán sin subir: cuenta solo la diferencia', () => {
    const a = doc({ numero: 'A26/5001', total: 100 });
    const r = buscarCoincidencia(nuevo({ tipo: 'factura', total: 180, albaranes: ['A26/5001', 'A26/5002'] }), [a]);
    expect(r).toEqual({ tipo: 'parcial', con: [a], resto: 80 });
  });

  it('factura sin nº de albaranes que suma lo mismo que varios de la semana', () => {
    const a = doc({ numero: '1', total: 60.1, fecha: '2026-10-10' });
    const b = doc({ numero: '2', total: 39.9, fecha: '2026-10-13' });
    const c = doc({ numero: '3', total: 75, fecha: '2026-10-14' });
    const r = buscarCoincidencia(nuevo({ tipo: 'factura', total: 100 }), [a, b, c]);
    expect(r?.tipo).toBe('cubierta');
    expect(r?.con).toEqual(expect.arrayContaining([a, b]));
  });

  it('factura diaria sin albarán guardado (albarán a mano): cuenta la factura', () => {
    expect(buscarCoincidencia(nuevo({ tipo: 'factura', proveedor: GAIZKA, total: 312.4 }), [doc({ proveedor: ADELAIDA, total: 312.4 })])).toBeNull();
  });

  it('foto del albarán a mano tras la factura del email del mismo día y mismo total: ya está', () => {
    const f = doc({ tipo: 'factura', proveedor: GAIZKA, numero: 'F-889', total: 312.4 });
    expect(buscarCoincidencia(nuevo({ proveedor: GAIZKA, total: 312.4 }), [f])?.tipo).toBe('en_factura');
  });

  it('foto del albarán a mano sin total leído: solo avisa', () => {
    const f = doc({ tipo: 'factura', proveedor: GAIZKA, total: 312.4 });
    expect(buscarCoincidencia(nuevo({ proveedor: GAIZKA }), [f])?.tipo).toBe('posible');
  });

  it('albarán nombrado en una factura ya guardada', () => {
    const f = doc({ tipo: 'factura', numero: 'A26/2905', albaranes: ['A26/5055'], total: 244.47 });
    expect(buscarCoincidencia(nuevo({ numero: 'A26/5055', total: 244.47, fecha: '2026-10-20' }), [f])?.tipo).toBe('en_factura');
  });

  it('las anuladas no cuentan y otro proveedor tampoco', () => {
    const anulada = doc({ numero: 'A26/5055', estado: 'anulada' });
    const otro = doc({ numero: 'A26/5055', proveedor: GAIZKA });
    expect(buscarCoincidencia(nuevo({ numero: 'A26/5055' }), [anulada, otro])).toBeNull();
  });

  it('un albarán de hace dos meses no cubre la factura de hoy', () => {
    const viejo = doc({ numero: '9', total: 100, fecha: '2026-08-01' });
    expect(buscarCoincidencia(nuevo({ tipo: 'factura', total: 100 }), [viejo])).toBeNull();
  });
});

describe('casos reales 16/17-10', () => {
  const CONIFRES = 'Conifres, S.L.';
  const CRESPO = 'José Crespo, S.A.';

  it('captura de la factura de Conifres leída como albarán + el PDF del email: el mismo', () => {
    const foto = doc({ proveedor: CONIFRES, tipo: 'albaran', numero: 'M10780', total: 111.4 });
    const r = buscarCoincidencia(nuevo({ proveedor: CONIFRES, tipo: 'factura', numero: 'M10780', total: 111.4, albaranes: ['AM/OUT/11121'] }), [foto]);
    expect(r?.tipo).toBe('mismo');
  });

  it('mismo nº pero otro tipo y otro importe: no es el mismo', () => {
    const foto = doc({ proveedor: CONIFRES, tipo: 'albaran', numero: 'M10780', total: 50 });
    expect(buscarCoincidencia(nuevo({ proveedor: CONIFRES, tipo: 'factura', numero: 'M10780', total: 111.4 }), [foto])).toBeNull();
  });

  it('mismasLineas compara kg e importes, no los nombres', () => {
    const foto = [
      { kg: 4.5, importe: 72 },
      { kg: 1, importe: 28 },
    ];
    expect(mismasLineas(foto, [{ kg: 1, importe: 28 }, { kg: 4.5, importe: 72 }])).toBe(true);
    expect(mismasLineas(foto, [{ kg: 4.5, importe: 72 }])).toBe(false);
  });

  it('José Crespo: el mismo pedido otro día es otra compra; el mismo día, solo se avisa', () => {
    const ayer = doc({ proveedor: CRESPO, fecha: '2026-10-16', total: 22.28 });
    expect(buscarCoincidencia(nuevo({ proveedor: CRESPO, fecha: '2026-10-17', total: 22.28 }), [ayer])).toBeNull();
    expect(buscarCoincidencia(nuevo({ proveedor: CRESPO, fecha: '2026-10-16', total: 22.28 }), [ayer])?.tipo).toBe('posible');
  });
});
