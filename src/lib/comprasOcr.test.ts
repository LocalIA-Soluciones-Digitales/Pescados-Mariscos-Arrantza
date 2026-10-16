import { describe, expect, it } from 'vitest';
import {
  agruparLineas,
  aNumero,
  cuadrarLinea,
  leerAlbaran,
  limpiarNombre,
  normalizarCompra,
  sumaLineas,
  unificarProveedor,
  type OcrCaja,
} from './comprasOcr';

// Convierte filas de texto en trozos de OCR con posición: cada grupo
// separado por 2+ espacios es un trozo, a 10 px por carácter y 30 px por
// fila. `desfase` baja los trozos sin números (las descripciones) para
// imitar albaranes en los que el nombre sale medio renglón más abajo.
function cajas(filas: string[], desfase = 0): OcrCaja[] {
  return filas.flatMap((fila, i) => {
    let x = 0;
    return fila.split(/(\s{2,})/).flatMap((t) => {
      const caja = { text: t, x, y: i * 30 + (/\d[.,]\d/.test(t) ? 0 : desfase), width: t.length * 10, height: 20 };
      x += t.length * 10;
      return t.trim() ? [caja] : [];
    });
  });
}

const TICKET = [
  'PESCADOS ITSASBERRI S.L.',
  'Mercado Central Pabellon 4 Puesto 12',
  'ALBARAN N. 2026/018734',
  'Fecha: 15/10/2026 Hora: 05:42',
  'ARTICULO          KG    EUR/KG     IMPORTE',
  'MERLUZA PINCHO    18,400    9,80    180,32',
  'RAPE BLANCO G     6,250    14,50     90,63',
  'LUBINA RAC 2/3    4,000    11,20     44,80',
  'BASE IMPONIBLE: 315,75',
  'IVA 10%: 31,58',
  'TOTAL EUR: 347,33',
];

describe('leerAlbaran', () => {
  it('ticket: cabecera, líneas con kg de 3 decimales y total', () => {
    const a = leerAlbaran(cajas(TICKET));
    expect(a.proveedor).toBe('PESCADOS ITSASBERRI S.L.');
    expect(a.fecha).toBe('2026-10-15');
    expect(a.numero).toBe('2026/018734');
    expect(a.total).toBe(347.33);
    expect(a.lineas).toEqual([
      { texto: 'MERLUZA PINCHO', kg: 18.4, precio: 9.8, importe: 180.32, estado: 'ok' },
      { texto: 'RAPE BLANCO G', kg: 6.25, precio: 14.5, importe: 90.63, estado: 'ok' },
      { texto: 'LUBINA RAC 2/3', kg: 4, precio: 11.2, importe: 44.8, estado: 'ok' },
    ]);
    expect(sumaLineas(a.lineas)).toBe(315.75);
  });

  it('formato Mercabilbao: código, lote, bruto/neto, «r» de IVA y total sin etiqueta', () => {
    const a = leerAlbaran(
      cajas([
        'JOSE CRESPO, S.A. - A48102883',
        'PEDIDO     11/09/26     2926',
        'CAJAS DETALLE PRODUCTO      LOTE      BRUTO     NETO     PRECIO     IMPORTE   Iva',
        '2  FILETE BACALAO G     0473104   27′AR     10,000    10,000    15,300    153,00   r',
        '(*)Zona de pesca 27: Atlantico Nordeste',
        'PINZA BUEY     0209301   VS2093     4,000     4,000    19,500     78,00   r',
        'SUBTOTALES     BASES    Iva%     CUOTA/I     Rec%     CUOTA/R     TOTAL',
        '231,00    231,00    10    23,10    1,40    3,23',
        '257,33',
        'Credito acumulado total. 1.520,62',
      ]),
    );
    // Por el CIF (A48102883): nombre de la lista de proveedores conocidos.
    expect(a.proveedor).toBe('José Crespo, S.A.');
    expect(a.fecha).toBe('2026-09-11');
    expect(a.lineas).toEqual([
      { texto: 'FILETE BACALAO G', kg: 10, precio: 15.3, importe: 153, estado: 'ok' },
      { texto: 'PINZA BUEY', kg: 4, precio: 19.5, importe: 78, estado: 'ok' },
    ]);
    expect(a.total).toBe(257.33);
  });

  it('empareja bien los nombres aunque salgan medio renglón más abajo que sus números', () => {
    const a = leerAlbaran(
      cajas(
        [
          'Las Capotinas, S.A.',
          'Articulo  Descripción          Unidades     Precio     Importe(EUR)',
          '34  ANCHOA                     12,000       3,200      38,40',
          '330  SARDINA G                  6,000       4,300      25,80',
          '307  RAPE                       2,800      10,200      28,56',
          'Base I.V.A.   %I.V.A.',
          '92,76   10,00   9,28',
          'Líquido(EUR):  103,34',
        ],
        16,
      ),
    );
    expect(a.lineas.map((l) => [l.texto, l.kg, l.importe])).toEqual([
      ['ANCHOA', 12, 38.4],
      ['SARDINA G', 6, 25.8],
      ['RAPE', 2.8, 28.56],
    ]);
    expect(a.total).toBe(103.34);
  });

  it('un producto que contiene «iva» (Almeja fina viva) no corta la tabla', () => {
    const a = leerAlbaran(
      cajas([
        'Descripcion       Kilos     Precio     Total',
        '2210 Almeja fina viva    1    2,50    28,00    70,00',
        '2305 Mejillon Galicia    1   10,00     2,10    21,00',
        'IVA 10%: 9,10',
      ]),
    );
    expect(a.lineas.map((l) => l.texto)).toEqual(['Almeja fina viva', 'Mejillon Galicia']);
  });

  it('corrige el precio mal leído y acepta líneas negativas (devoluciones)', () => {
    const a = leerAlbaran(
      cajas([
        'KILOS     PRECIO     IMPORTE',
        'Gamba blanca Huelva     1,20     2,00     50,40',
        'JUREL / CHICHARRO     -2,500     5,800     -14,50   10',
      ]),
    );
    expect(a.lineas[0]).toEqual({ texto: 'Gamba blanca Huelva', kg: 1.2, precio: 42, importe: 50.4, estado: 'corregida' });
    expect(a.lineas[1]).toEqual({ texto: 'JUREL / CHICHARRO', kg: -2.5, precio: 5.8, importe: -14.5, estado: 'ok' });
  });

  it('PDF con cada línea en un solo trozo de texto: separa nombre y números', () => {
    const linea = (text: string, y: number) => ({ text, x: 40, y, width: text.length * 10, height: 20 });
    const a = leerAlbaran([
      linea('Las Capotinas, S.A.', 0),
      linea('Articulo Descripción Unidades Precio Importe', 60),
      linea('34 ANCHOA 12,000 3,200 38,40', 90),
      linea('2046 MEJILLON NOVO 10,000 3,000 30,00', 120),
      linea('Base I.V.A. 68,40 10,00 6,84', 160),
      linea('Líquido(EUR): 76,20', 190),
    ]);
    expect(a.lineas.map((l) => [l.texto, l.kg, l.precio, l.importe, l.estado])).toEqual([
      ['ANCHOA', 12, 3.2, 38.4, 'ok'],
      ['MEJILLON NOVO', 10, 3, 30, 'ok'],
    ]);
    expect(a.total).toBe(76.2);
  });

  it('sin líneas legibles (albarán a mano) aún saca el total si pone «TOTAL»', () => {
    const a = leerAlbaran(cajas(['PESCADO TRIANA,', 'CLASE DE PESCADO   BRUTO   NETO   PRECIO   IMPORTE', 'de  de 20  26  TOTAL  31\'94']));
    expect(a.lineas).toEqual([]);
    expect(a.total).toBe(31.94);
  });
});

describe('proveedor', () => {
  it('si el nombre de la cabecera es un logo, lo saca de la letra pequeña y no de la dirección del cliente', () => {
    const a = leerAlbaran(
      cajas([
        'Cliente:',
        'CLIENTE DE EJEMPLO',
        'Kalea,7,pb-II',
        'MERCABILBAO Bº Ibarreta, 1 Puesto 118 - 48970 Basauri (Bizkaia)',
        'email: pescadosejemplo@gmail.com',
        'Descripción       Unidades     Precio     Importe(EUR)',
        'Albarán nº  G /  915.874  de fecha  08/10/2026',
        'LENGUADO     0,950     48,000     45,60',
        'Base IVA   %IVA   Cuota IVA',
        '45,60   10,00   4,56   1,40   0,64',
        'Líquido(EUR):   50,80',
        'serán tratados en los ficheros titularidad de Pescados y Mariscos Ejemplo S.L.. con el fin de',
      ]),
    );
    expect(a.proveedor).toBe('Pescados y Mariscos Ejemplo S.L.');
    expect(a.numero).toBe('915.874');
    expect(a.lineas).toEqual([{ texto: 'LENGUADO', kg: 0.95, precio: 48, importe: 45.6, estado: 'ok' }]);
    expect(a.total).toBe(50.8);
  });

  it('un proveedor conocido se reconoce por el CIF aunque el nombre salga destrozado', () => {
    const a = leerAlbaran(cajas(['ANMAT2A 007128882, 8.5. - B48077069', 'Mercabilbao, Pusto 124 - 48970 Basaur', 'infodperecadoearrasss.com']));
    expect(a.proveedor).toBe('Arraiza Gutiérrez, S.L.');
  });

  it('sin CIF ni nombre, nunca toma una dirección web como proveedor', () => {
    const a = leerAlbaran(cajas(['XQ 0071 8.5.', 'infodperecadoearrasss.com', 'Pescados del Puerto']));
    expect(a.proveedor).toBe('Pescados del Puerto');
  });

  it('una fila sin nombre cuyo precio se ha corregido también cuenta', () => {
    const a = leerAlbaran(cajas(['KILOS     PRECIO     IMPORTE', '11,600     2,600     32,48', 'TOTAL  32,48']));
    expect(a.lineas).toEqual([{ texto: '', kg: 11.6, precio: 2.8, importe: 32.48, estado: 'corregida' }]);
  });

  it('unificarProveedor usa el nombre ya conocido si es el mismo mal leído', () => {
    const conocidos = ['Pescados Bizkaimar, S.L.U', 'Las Capotinas, S.A.', 'Arraiza Gutierrez, S.L.'];
    expect(unificarProveedor('PESCA S BIZKAIMAR,S.L.U', conocidos)).toBe('Pescados Bizkaimar, S.L.U');
    expect(unificarProveedor('ARRAIZA GUTIERREZ, S.L.', conocidos)).toBe('Arraiza Gutierrez, S.L.');
    expect(unificarProveedor('JOSE CRESPO, S.A.', conocidos)).toBe('JOSE CRESPO, S.A.');
  });
});

describe('utilidades', () => {
  it('el último separador es el decimal', () => {
    expect(aNumero('11,600')).toBe(11.6);
    expect(aNumero('1.520,62')).toBe(1520.62);
    expect(aNumero('-14,50')).toBe(-14.5);
    expect(aNumero("31'94")).toBe(31.94);
  });

  it('limpiarNombre quita código, lote y cajas pero deja la talla', () => {
    expect(limpiarNombre('0082 SALMONETE DE ROCA CS20260902')).toBe('SALMONETE DE ROCA');
    expect(limpiarNombre('1 GALLO 200/300 0474110 27′AR 6')).toBe('GALLO 200/300');
    expect(limpiarNombre('6006 LUBINA 1100/1400')).toBe('LUBINA 1100/1400');
  });

  it('agruparLineas junta los trozos a la misma altura', () => {
    expect(agruparLineas(cajas(['MERLUZA  18,40  9,80', 'TOTAL']))).toEqual(['MERLUZA  18,40  9,80', 'TOTAL']);
  });

  it('normaliza igual que compras_norm()', () => {
    expect(normalizarCompra('  Mejillón   GALICIA ')).toBe('mejillon galicia');
  });

  it('cuadrarLinea calcula el número que falta', () => {
    expect(cuadrarLinea('x', 2, 10, null)).toMatchObject({ importe: 20, estado: 'corregida' });
  });
});
