import { describe, expect, it } from 'vitest';
import { agruparLineas, cuadrarLinea, leerAlbaran, normalizarCompra, sumaLineas } from './comprasOcr';

// Texto real devuelto por PaddleOCR (modelo latin) sobre dos albaranes de
// prueba fotografiados torcidos y borrosos.
const TICKET = [
  'PESCADOS ITSASBERRI S.L.',
  'Mercado Central Pabellon 4 Puesto 12',
  'CIF B-00000000 Te1 944 000 000',
  'ALBARAN N. 2026/018734',
  'Fecha: 15/10/2026 Hora: 05:42',
  'Cliente: 0457 ARRANTZA',
  'ARTICULO  KG  EUR/KG  IMPORTE',
  'MERLUZA PINCHO  18.40  9.80  180.32',
  'RAPEBLANCO G  6.25  14.50  90.62',
  'LUBINA RAC 2/3  4.00  11.20  44.80',
  'BESUGO  3.15  22.00  69.30',
  'CHIPIRON ANZUELO  2.80  18.90  52.92',
  'BACALADILLA  5.60  3.40  19.04',
  'BASE IMPONIBLE: 457.01',
  'IVA 10%: 45.70',
  'TOTAL EUR: 502.71',
  'Gracias por su compra',
];

const IMPRESO = [
  'MARISCOS BIZKAIA DISTRIBUCION, S.A.',
  'Pol. Ind. Ficticio, nave 3 - 48000 Bilbao',
  'ALBARAN DE ENTREGA N° A-55120  15-10-2026',
  'Cliente: PESCADERIA ARRANTZA',
  'Cod. Descripcion  Cajas Kilos Precio Total',
  '1021 Langostino cocido 40/50  1  3,00  16,50 49,50',
  '2210 Almeja fina viva  1  2,50  28,00 70,00',
  '2305 Mejillon Galicia  1  10,00  2,10  21,00',
  '1104 Gamba blanca Huelva  1  1,20 2,00 50,40',
  '3001 Cigala n°3  1  1,75  39,50  69,12',
  'BASE IMPONIBLE: 260.02',
  'IVA 10%: 26.00',
  'TOTAL EUR: 286.03',
];

describe('leerAlbaran', () => {
  it('ticket térmico: cabecera, 6 líneas y total', () => {
    const a = leerAlbaran(TICKET);
    expect(a.proveedor).toBe('PESCADOS ITSASBERRI S.L.');
    expect(a.fecha).toBe('2026-10-15');
    expect(a.numero).toBe('2026/018734');
    expect(a.total).toBe(502.71);
    expect(a.base).toBe(457.01);
    expect(a.lineas).toHaveLength(6);
    expect(a.lineas[0]).toEqual({ texto: 'MERLUZA PINCHO', kg: 18.4, precio: 9.8, importe: 180.32, estado: 'ok' });
    expect(a.lineas.every((l) => l.estado === 'ok')).toBe(true);
    // La base impresa (457,01) redondea distinto que la suma de líneas: la
    // tarjeta de revisión da por buena una diferencia de unos céntimos.
    expect(sumaLineas(a.lineas)).toBe(457);
  });

  it('albarán impreso: código delante, cajas y coma decimal; corrige el precio mal leído', () => {
    const a = leerAlbaran(IMPRESO);
    expect(a.proveedor).toBe('MARISCOS BIZKAIA DISTRIBUCION, S.A.');
    expect(a.fecha).toBe('2026-10-15');
    expect(a.numero).toBe('A-55120');
    expect(a.total).toBe(286.03);
    expect(a.lineas.map((l) => l.texto)).toEqual([
      'Langostino cocido 40/50',
      'Almeja fina viva',
      'Mejillon Galicia',
      'Gamba blanca Huelva',
      'Cigala n°3',
    ]);
    expect(a.lineas[3]).toEqual({ texto: 'Gamba blanca Huelva', kg: 1.2, precio: 42, importe: 50.4, estado: 'corregida' });
    expect(sumaLineas(a.lineas)).toBe(260.02);
  });

  it('una fila solo con números que cuadran es un producto sin nombre', () => {
    const a = leerAlbaran(['Cod ecrpcn  Cajas lo  Precio  Total', '1  3,00  16,50  49,50', 'IVA 10%: 26.00']);
    expect(a.lineas).toEqual([{ texto: '', kg: 3, precio: 16.5, importe: 49.5, estado: 'ok' }]);
  });

  it('una línea a la que le falta un número queda para revisar', () => {
    const a = leerAlbaran(['2210 Almeja fina viva  1  2,50', '1104 Gamba blanca  1,20  50,40']);
    expect(a.lineas[0]).toMatchObject({ texto: 'Almeja fina viva', estado: 'revisar' });
    expect(a.lineas[1]).toMatchObject({ texto: 'Gamba blanca', kg: 1.2, precio: 42, importe: 50.4, estado: 'corregida' });
  });
});

describe('agruparLineas', () => {
  it('junta los trozos a la misma altura y los ordena de izquierda a derecha', () => {
    const lineas = agruparLineas([
      { text: '9.80', x: 300, y: 102, width: 50, height: 20 },
      { text: 'MERLUZA', x: 10, y: 100, width: 90, height: 22 },
      { text: 'TOTAL', x: 10, y: 140, width: 60, height: 20 },
      { text: '18.40', x: 200, y: 99, width: 50, height: 20 },
    ]);
    expect(lineas).toEqual(['MERLUZA  18.40  9.80', 'TOTAL']);
  });
});

describe('utilidades', () => {
  it('normaliza igual que compras_norm()', () => {
    expect(normalizarCompra('  Mejillón   GALICIA ')).toBe('mejillon galicia');
  });

  it('cuadrarLinea calcula el número que falta', () => {
    expect(cuadrarLinea('x', 2, 10, null)).toMatchObject({ importe: 20, estado: 'corregida' });
  });
});
