import { describe, expect, it } from 'vitest';
import { canon, leerDictado, lineasDeCompra, notaQuitadas, sugerirProducto, type ProductoBasico } from './comprasProductos';

// Nombres reales de la carta de Arrantza.
const PRODUCTOS: ProductoBasico[] = [
  ['bakalao', 'Bakalao', false],
  ['filete-bakalao', 'Filete de Bakalao al Punto de Sal', true],
  ['lomo-desalado', 'Lomo de Bakalao Desalado', true],
  ['txitxarro', 'Txitxarro', true],
  ['txitxarrito', 'Txitxarrito', true],
  ['lirios', 'Lirios', true],
  ['sardinas', 'Sardinas', false],
  ['sapito', 'Sapito / Rape', false],
  ['cola-rape', 'Cola de Rape', true],
  ['lang-cocido', 'Langostino Cocido', true],
  ['lang-3040', 'Langostino 30/40', false],
  ['nekora', 'Nekora', true],
  ['bonito', 'Bonito del Norte', false],
  ['salmon', 'Salmón', true],
  ['salmon-ahumado', 'Salmón Ahumado', false],
  ['salmonete', 'Salmonete', true],
  ['gallo', 'Gallo', true],
  ['gallitos', 'Gallitos', true],
  ['merluza', 'Merluza', true],
  ['merluza-pintxo', 'Merluza Pintxo (Luarca)', false],
  ['mejillon', 'Mejillón', true],
  ['buey', 'Buey', true],
  ['patas-buey', 'Patas Buey Cocida', true],
].map(([id, nombre_es, gestion_stock]) => ({ id: id as string, nombre_es: nombre_es as string, gestion_stock: gestion_stock as boolean }));

const sugerir = (texto: string) => sugerirProducto(texto, 'Proveedor', [], PRODUCTOS)?.id ?? null;

describe('sugerirProducto', () => {
  it('iguala la escritura vasca y castellana', () => {
    expect(sugerir('CHICHARRO 400+')).toBe('txitxarro');
    expect(sugerir('JUREL/ CHICHARRO / Trachurus murphyi HOM')).toBe('txitxarro');
    expect(sugerir('JUR /CHIC RO/ra O')).toBe('txitxarro');
    expect(sugerir('NECORA')).toBe('nekora');
    expect(sugerir('MERLUZA PINCHO')).toBe('merluza-pintxo');
  });

  it('entiende plurales, abreviaturas y tallas', () => {
    expect(sugerir('LIRIO')).toBe('lirios');
    expect(sugerir('SARDINA G')).toBe('sardinas');
    expect(sugerir('FILETE BACALAO G')).toBe('filete-bakalao');
    expect(sugerir('BAC.DESALADO TAJADA CENTRAL')).toBe('lomo-desalado');
    expect(sugerir('LANGOSTINO CDO 30-40')).toBe('lang-3040');
    expect(sugerir('LANGOSTINO COCIDO')).toBe('lang-cocido');
    expect(sugerir('BONITO / THUNNUS ALALUNGA ALB')).toBe('bonito');
  });

  it('elige el nombre más parecido y no uno más largo que lo contiene', () => {
    expect(sugerir('SALMON 7/8')).toBe('salmon');
    expect(sugerir('SALMONETE DE ROCA')).toBe('salmonete');
    expect(sugerir('SALMONETEDEROC MULLUS SURMULENTUS')).toBe('salmonete');
    expect(sugerir('GALLO 200/300')).toBe('gallo');
    expect(sugerir('RAPE')).toBe('sapito');
    expect(sugerir('PINZA BUEY')).toBe('buey');
  });

  it('hielo, transporte o algo que no tenemos no se asigna a nada', () => {
    expect(sugerir('HIELO')).toBeNull();
    expect(sugerir('TRAN TRANSPORTE')).toBeNull();
    expect(sugerir('CENTOLLO')).toBeNull();
  });

  it('volanta es merluza (Capotinas)', () => {
    expect(sugerir('VOLANTA')).toBe('merluza');
  });

  it('lo recordado manda sobre el parecido', () => {
    const alias = [{ proveedor_norm: 'capotinas', texto_norm: 'rape', producto_id: 'cola-rape' }];
    expect(sugerirProducto('RAPE', 'Capotinas', alias, PRODUCTOS)).toEqual({ id: 'cola-rape', motivo: 'recordado' });
    expect(sugerirProducto('CHICHARRO', 'Capotinas', alias, PRODUCTOS)).toEqual({ id: 'txitxarro', motivo: 'parecido' });
  });

  it('una línea quitada otras veces no sale más en los albaranes de ese proveedor', () => {
    const alias = [{ proveedor_norm: 'adelaida', texto_norm: 'forma de pago............... transfer.', producto_id: null }];
    const leidas = [
      { texto: 'MERLUZA PINCHO', kg: 18, precio: 6, importe: 108, estado: 'ok' as const },
      { texto: 'Forma de pago............... Transfer.', kg: 19.95, precio: 0.14, importe: 2.79, estado: 'corregida' as const },
    ];
    const r = lineasDeCompra(leidas, 'Adelaida', alias, PRODUCTOS);
    expect(r.lineas.map((l) => [l.texto, l.producto_id])).toEqual([['MERLUZA PINCHO', 'merluza-pintxo']]);
    expect(r.quitadas).toEqual(['Forma de pago............... Transfer.']);
    expect(notaQuitadas(r.quitadas)).toBe('Quitada como otras veces: Forma de pago............... Transfer..');
    // Otro proveedor no la quita.
    expect(lineasDeCompra(leidas, 'Capotinas', alias, PRODUCTOS).lineas).toHaveLength(2);
  });

  it('una línea quitada no propone producto aunque otro proveedor lo recuerde', () => {
    const alias = [
      { proveedor_norm: 'adelaida', texto_norm: 'rape', producto_id: null },
      { proveedor_norm: 'capotinas', texto_norm: 'rape', producto_id: 'cola-rape' },
    ];
    expect(sugerirProducto('RAPE', 'Adelaida', alias, PRODUCTOS)).toBeNull();
    expect(sugerirProducto('RAPE', 'Gaizka', alias, PRODUCTOS)?.id).toBe('cola-rape');
  });

  it('canon', () => {
    expect(canon('Bakalao')).toBe(canon('BACALAO'));
    expect(canon('Txipirón')).toBe(canon('CHIPIRON'));
  });
});

describe('leerDictado', () => {
  it('cifras como las escribe el reconocimiento de voz', () => {
    expect(leerDictado('rape 4,64 kilos a 21,50')).toEqual({ texto: 'RAPE', kg: 4.64, precio: 21.5 });
    expect(leerDictado('Nécora 2.2 kg a 16.80 €')).toEqual({ texto: 'NECORA', kg: 2.2, precio: 16.8 });
  });

  it('cifras dichas con palabras', () => {
    expect(leerDictado('besugo dos coma seis a siete con cincuenta')).toEqual({ texto: 'BESUGO', kg: 2.6, precio: 7.5 });
    expect(leerDictado('buey medio kilo a 26')).toEqual({ texto: 'BUEY', kg: 0.5, precio: 26 });
  });

  it('sin precio deja el precio vacío', () => {
    expect(leerDictado('merluza 6 kilos')).toEqual({ texto: 'MERLUZA', kg: 6, precio: null });
  });
});
