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

  it('el ticket es un albarán y no nombra otros albaranes', () => {
    const a = leerAlbaran(cajas(TICKET));
    expect(a.tipo).toBe('albaran');
    expect(a.albaranes).toEqual([]);
  });
});

describe('facturas', () => {
  it('factura que nombra sus albaranes: nº de factura y lista de albaranes', () => {
    const a = leerAlbaran(
      cajas([
        'PESCADOS Y MARISCOS ADELAIDA, S.L.   B95719746',
        'FACTURA   A26 / 2905   Fecha 16/10/2026',
        'Albarán A26 / 5040 de 14/10/2026',
        'ARTICULO          KG    EUR/KG     IMPORTE',
        'MERLUZA PINCHO    10,000    9,80    98,00',
        'Albarán A26 / 5055 de 16/10/2026',
        'RAPE BLANCO G     6,000    14,50     87,00',
        'BASE IMPONIBLE: 185,00',
        'TOTAL FACTURA: 206,09',
      ]),
    );
    expect(a.tipo).toBe('factura');
    expect(a.numero).toBe('A26 / 2905');
    expect(a.albaranes).toEqual(['A26 / 5040', 'A26 / 5055']);
    expect(a.fecha).toBe('2026-10-16');
  });

  it('un albarán que menciona «factura» en la letra pequeña sigue siendo albarán', () => {
    const a = leerAlbaran(cajas(['PESCADOS TRIANA, S.A.', 'ALBARAN Nº 11784', 'ARTICULO   KG   PRECIO   IMPORTE', 'Este documento no es factura']));
    expect(a.tipo).toBe('albaran');
    expect(a.numero).toBe('11784');
  });

  it('factura TicketBAI sin albaranes: el nº es el de la factura', () => {
    const a = leerAlbaran(cajas(['PESCADOS Y MARISCOS GAIZKA S.L.', 'FACTURA SIMPLIFICADA Nº: F26-00889', 'TOTAL 312,40']));
    expect(a.tipo).toBe('factura');
    expect(a.numero).toBe('F26-00889');
    expect(a.albaranes).toEqual([]);
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

  it('limpiarNombre quita nombre científico, código FAO y código de artículo; deja «JUREL / CHICHARRO»', () => {
    expect(limpiarNombre('BESUGO/PANCHETA / Pagellus Bogaraveo ( SBR )')).toBe('BESUGO/PANCHETA');
    expect(limpiarNombre('BONITO / THUNNUS ALALUNGA ALB')).toBe('BONITO');
    expect(limpiarNombre('JUREL / CHICHARRO')).toBe('JUREL / CHICHARRO');
    expect(limpiarNombre('[4002]CAMARON COCIDO PEQUEÑO +350 PZAS KILO 43256')).toBe('CAMARON COCIDO PEQUEÑO +350 PZAS KILO');
  });
});

// Albaranes y facturas reales del 16 y 17-10-2026 que se leyeron mal.
describe('casos reales 16/17-10', () => {
  // Fila de tabla con columnas alineadas: el nombre ocupa siempre el mismo
  // ancho y cada número va en su columna.
  const fila = (nombre: string, ...nums: string[]) => nombre.padEnd(70) + nums.map((n) => n.padStart(12)).join('');

  it('Adelaida: corta la tabla en «IMPORTE BRUTO … TOTAL» (sin «Forma de pago») y quita el nombre científico', () => {
    const a = leerAlbaran(
      cajas([
        'PESCADOS Y MARISCOS ADELAIDA, S.L.  FACTURA  A26/2.905',
        'FECHA  16/10/2026',
        fila('CODIGO  DESCRIPCIÓN  LOTE', 'KILOS', 'PRECIO', 'IMPORTE'),
        'ALBARAN:  A26/5.040  FECHA:  13/10/2026',
        fila('CCO  CAJA COLOR TG / TG ( )', '-2,00', '10,000', '-20,00'),
        'ALBARAN:  A26/5.055  FECHA:  16/10/2026',
        fila('0009  MERLUZA-CARIOCA-PESCADILLA / Merluccius Merluccius  ST20261007', '18,00', '6,000', '108,00'),
        '( HKE )',
        fila('0004  BESUGO/PANCHETA / Pagellus Bogaraveo ( SBR )  LA20261015', '5,25', '14,000', '73,50'),
        fila('0070  ZAPATERO/PALOMETA / LITHOGNATHUS MORMYRUS (  ST20261005', '2,30', '16,500', '37,95'),
        'SSB )',
        'IMPORTE BRUTO  DTO.  BASE IMPONIBLE  I.V.A.  R.E.  TOTAL',
        fila('199,45  199,45  10,00  %', '19,95', '1,40  %', '2,79'),
        '222,19  €',
        fila('Forma de pago...............  Transfer. ES7501825937470201526707', '19,95', '1,40', '2,79'),
      ]),
    );
    expect(a.lineas.map((l) => [l.texto, l.kg, l.precio, l.importe])).toEqual([
      ['CCO CAJA COLOR TG / TG', -2, 10, -20],
      ['MERLUZA-CARIOCA-PESCADILLA', 18, 6, 108],
      ['BESUGO/PANCHETA', 5.25, 14, 73.5],
      ['ZAPATERO/PALOMETA', 2.3, 16.5, 37.95],
    ]);
    expect(a.albaranes).toEqual(['A26/5.040', 'A26/5.055']);
    expect(a.total).toBe(222.19);
  });

  it('Capotinas con la columna Importe cortada en la foto: kg y €/kg, total con IVA y recargo', () => {
    const a = leerAlbaran(
      cajas([
        'Las Capotinas, S.A.',
        fila('Articulo  Descripción', 'Unidades', 'Precio'),
        fila('34  ANCHOA', '6,000', '2,900'),
        fila('239  VOLANTA', '19,000', '10,900'),
        fila('29  COLA DE RAPE X', '4,400', '17,800'),
        fila('330  hielo', '2,000', '7,000'),
        fila('23  SALMON', '18,400', '11,800'),
        fila('004  LUBINA 800/900', '6,000', '11,000'),
        fila('006  LUBINA 1100/1400', '6,000', '12,200'),
        fila('007  LUBINA 1400/1800', '1,700', '15,500'),
        'Observaciones  Base I.V.A.  %I.V.A  I.V.A.  %Rec  Reca',
        '699,49  10,00  69,95  1,40',
        'Importe Neto  699,49  Líquido(EUR):',
      ]),
    );
    expect(a.lineas.map((l) => [l.texto, l.kg, l.precio, l.importe])).toEqual([
      ['ANCHOA', 6, 2.9, 17.4],
      ['VOLANTA', 19, 10.9, 207.1],
      ['COLA DE RAPE X', 4.4, 17.8, 78.32],
      ['hielo', 2, 7, 14],
      ['SALMON', 18.4, 11.8, 217.12],
      ['LUBINA 800/900', 6, 11, 66],
      ['LUBINA 1100/1400', 6, 12.2, 73.2],
      ['LUBINA 1400/1800', 1.7, 15.5, 26.35],
    ]);
    expect(sumaLineas(a.lineas)).toBe(699.49);
    expect(a.total).toBe(779.23);
  });

  it('Triana: «PIL PIL» es un nombre aunque tenga palabras de 3 letras', () => {
    const a = leerAlbaran(
      cajas([
        'PESCADOS TRIANA, S.A.',
        'FACTURA',
        fila('Bultos  Detalle Producto  Lote', 'Bruto', 'Neto', 'Precio', 'Importe'),
        fila('PIL PIL 1/  0283701  2837', '1,02', '1,02', '28,50', '28,93'),
        'SUBTOTAL  DESCUENTOS  BASES  IVA%  CUOTAS  REC%  CUOTA/R  TOTAL',
        '28,93  28,93  10,00  2,89  1,40  0,41  32,23 €',
      ]),
    );
    expect(a.lineas.map((l) => [l.texto, l.kg, l.importe])).toEqual([['PIL PIL', 1.02, 28.93]]);
    expect(a.total).toBe(32.23);
  });

  it('Conifres: no toma «Técnica de pesca…» por producto y lee el albarán que cita', () => {
    const a = leerAlbaran(
      cajas([
        'Factura Nº M10780',
        'Fecha:  Cliente Código:',
        '16/10/2026  43002926  78880797C',
        fila('Descripción  Lote', 'Cantidad', 'Precio', 'Importe'),
        'Pedido: PV24560 ( Orden 01474-006-0107 ) Albarán: 16/10/2026 AM/OUT/11121',
        fila('[4306] LANG. SALVAJE 20/30 PEIX  [L2PEIX28 20/24]PEIX0001', '4,500', '16,000', '72,00 €'),
        'Técnica de pesca:  Redes de arrastre  Área de pesca:  31.0  Atlantic, Western Central',
        fila('[4002] CAMARON COCIDO PEQUEÑO +350 PZAS KILO  43256', '1,000', '28,000', '28,00 €'),
        'Técnica de pesca:  Nasas y trampas  Área de pesca:  27.0  Atlantic, Northeast',
        'Subtotal:  100,00  €',
        'Base Imponible  100,00 €',
        'Total  111,40 €',
      ]),
    );
    expect(a.tipo).toBe('factura');
    expect(a.numero).toBe('M10780');
    expect(a.albaranes).toEqual(['AM/OUT/11121']);
    expect(a.lineas.map((l) => [l.texto, l.kg, l.importe])).toEqual([
      ['LANG. SALVAJE 20/30 PEIX', 4.5, 72],
      ['CAMARON COCIDO PEQUEÑO +350 PZAS KILO', 1, 28],
    ]);
    expect(a.total).toBe(111.4);
  });

  it('Gaizka: el albarán que cita la factura lleva serie («G / 926.237»)', () => {
    const a = leerAlbaran(cajas(['FACTURA', 'Albarán nº  G /  926.237  de fecha  10/10/2026']));
    expect(a.albaranes).toEqual(['G / 926.237']);
  });
});

describe('casos reales 18-10: gastos sin stock y listado del gremio', () => {
  it('Castañares (limpieza): es gasto, lee las dos líneas y el total de 90,45', () => {
    const a = leerAlbaran(
      cajas([
        '.L. CASTAÑARES, S.L.  Coa Es  Fabricación de Papeles:  2en 1',
        'NIF: B95555421  de basura, kraft, manias, fim',
        'DAVID TAMAYO HUERTA  balanza, secamanos',
        'FACTURA',
        'BIZKAIA  48950  ERANDIO  Número Factura  00/5.551',
        'N..F 78880797  Fecha  08/10/2026',
        'DIRECCIÓN DE ENTREGA',
        'CÓDIGO  DESCRIPCIÓN',
        'ALBARÁN 00 /  6.136  DE FECHA 08/10/202',
        'BA35X50KGA  KA 5 X NI  1  20,000  2,95  59,00',
        'SECAMANOS  SECAMANOS (FARDO DE 6 UNIDADES  1  6,000  2,63  15,75',
        'NOTA  OBIETA  0,000  0,00',
        'TOTALIIMPORTEDto P.P  BASE  % IVA  IMP. IVA  % RE  RECARGO  TOTAL FACTURA',
        '74,75  74,75  21,00  15,70',
        '90,45 €',
        'Vencimientos  08/10/2026  90,45 €  0',
      ]),
    );
    expect(a.clase).toBe('gasto');
    expect(a.proveedor).toBe('J.L. Castañares, S.L.');
    expect(a.total).toBe(90.45);
    expect(a.lineas.map((l) => [l.kg, l.precio, l.importe])).toEqual([
      [20, 2.95, 59],
      [6, 2.63, 15.75],
    ]);
    expect(a.lineas[1].texto).toContain('SECAMANOS');
  });

  it('Frío Bilbao: cantidad entera (3 kg), langostino 20/30 y no la fila del cliente', () => {
    const a = leerAlbaran(
      cajas([
        'TAMAYO HUERTA DAVID',
        'CIF/NIF  78880797C',
        '14/05/25  101  No. Factura:  500964  6129260',
        'REF.  ARTÍCULO  CANTIDAD  PRECIO  IMPORTE  %IVA',
        '6129260  TAMAYO HUERTA DAVID  Alb:  2505-979853  Fecha:  14/05/25',
        '13075  LANG.20/30 L2 BLANCO A BORD  KGR  3  13,20  39,60  10',
        'SUMA  39,60  39,60',
        'Vencimiento:  14/05/25  39,60  10  1,4  3,96  0,55  4,51',
        'TOTAL IMPORTE  44,11',
        'Registro Mercantil de Vizaya, Tomo 1.171, Libro 727 - Fecha 7/2/83. C.I.F: A48137426',
      ]),
    );
    expect(a.proveedor).toBe('Frío Bilbao, S.A.');
    expect(a.clase).toBe('genero');
    expect(a.lineas).toEqual([{ texto: 'LANG.20/30 L2 BLANCO A BORD', kg: 3, precio: 13.2, importe: 39.6, estado: 'ok' }]);
    expect(a.total).toBe(44.11);
  });

  it('Consorcio de Aguas: gasto con Agua (tasas consorcio) y Basuras (tasas municipales)', () => {
    const a = leerAlbaran(
      cajas([
        'Faktura  Factura',
        '15258935  2026251  08/09/2026',
        'IFK / C.I.F.: P4800005C  12609063278  25/05/2026  21/08/2026',
        'www.consorciodeaguas.eus',
        'PARTZUERGOAREN TASAK  TASAS CONSORCIO  UDALAREN TASAK  TASAS MUNICIPALES',
        'Ur hornidura  Abastecimiento  55,38  Zaborra  Basura  137,57',
        'Saneamendua  Saneamiento  56,94',
        'Kontagailua  Contador  2,05',
        'BEZ  IVA  11,66',
        'PARTZUERGOAREN TASAK GUZTIRA  UDALAREN TASAK GUZTIRA',
        '126,03  €  137,57  €',
        'TOTAL TASAS CONSORCIO  TOTAL TASAS MUNICIPALES',
        'GUZTIRA',
        '263,60  €',
        'Faktura zk  Nº de factura  12609063278',
      ]),
    );
    expect(a.clase).toBe('gasto');
    expect(a.proveedor).toBe('Consorcio de Aguas Bilbao Bizkaia');
    expect(a.fecha).toBe('2026-09-08');
    expect(a.numero).toBe('12609063278');
    expect(a.lineas.map((l) => [l.texto, l.kg, l.importe])).toEqual([
      ['Agua', null, 126.03],
      ['Basuras', null, 137.57],
    ]);
    expect(a.total).toBe(263.6);
  });

  it('listado de recibos del gremio: ni gasto ni líneas, solo los recibos', () => {
    const a = leerAlbaran(
      cajas([
        'LISTADO  RECIBOS ENTREGADOS  AL  17-10-2026  PAG.: 1',
        'CODIGO  NOMBRE  FECHA  FACTURA  IMPORTE',
        '03  ARRAINKO ANAIAK, S.L.  15-10-2026  013337  34,94',
        'TOTAL MAYORISTA  ........  34,94',
        '07  PEREZ  VI¥AS  COMERCIAL, S.L.  14-10-2026  910428  125,08',
        '18  LAS  CAPOTINAS,  S.A.  17-10-2026  007638  2.994,49',
        'TOTAL FACTURAS .....  4.627,87',
      ]),
    );
    expect(a.clase).toBe('listado');
    expect(a.lineas).toEqual([]);
    expect(a.total).toBe(4627.87);
    expect(a.recibos).toEqual([
      { proveedor: 'ARRAINKO ANAIAK, S.L.', fecha: '2026-10-15', factura: '013337', importe: 34.94 },
      { proveedor: 'PEREZ VIÑAS COMERCIAL, S.L.', fecha: '2026-10-14', factura: '910428', importe: 125.08 },
      { proveedor: 'LAS CAPOTINAS, S.A.', fecha: '2026-10-17', factura: '007638', importe: 2994.49 },
    ]);
  });
});

describe('formatos revisados 18-10', () => {
  const CABECERA_CAPOTINAS = [
    'Cliente:  2926',
    'TAMAYO HUERTA DAVID',
    'Las Capotinas, S.A.',
    'FACTURA',
    'MERCABILBAO - Puestos 121-123',
    '48970 Basauri (Bizkaia)  Serie  Número  F. Expedición  F. Operación',
    'Tfno Oficina: 944079261 - Tfno Gaizka: 664460570 - FAX: 944594017  G  7638  17/10/2026  17/10/2026',
    'Código Artículo  Descripción  Unidades  Precio  Importe(EUR)',
  ];

  it('Capotinas, factura semanal de 2 páginas: todas las líneas, sus albaranes, nº G 7638 y el líquido', () => {
    const a = leerAlbaran(
      cajas([
        ...CABECERA_CAPOTINAS,
        'Albarán nº  / 27.713  de fecha13/10/2026',
        '34  ANCHOA  6,000  3,400  20,40',
        '3330  hielo  3,000  7,000  21,00',
        'Albarán nº  / 27.871  de fecha14/10/2026',
        '72  CALAMAR  4,000  8,900  35,60',
        'suma y sigue ...  1.245,02',
        ...CABECERA_CAPOTINAS,
        'Albarán nº  / 28.289  de fecha17/10/2026',
        '239  VOLANTA  19,000  10,900  207,10',
        '324  SALMON 6/7  18,400  8,800  161,92',
        'Forma de pago  Base IVA  %IVA  Cuota IVA  %Rec  Recargo',
        'GREMIO  424,62  10,00  42,46  1,40  5,94',
        'Vencimientos',
        '17-10-2026  473,02',
        'Importe neto  424,62  Líquido(EUR):  473,02',
        'TBAI-A48142921-171026-FiyQlckqQaVeA-103',
      ]),
    );
    expect(a.tipo).toBe('factura');
    expect(a.proveedor).toBe('Las Capotinas, S.A.');
    expect(a.numero).toBe('G 7638');
    expect(a.albaranes).toEqual(['27.713', '27.871', '28.289']);
    expect(a.lineas.map((l) => [l.texto, l.importe])).toEqual([
      ['ANCHOA', 20.4],
      ['hielo', 21],
      ['CALAMAR', 35.6],
      ['VOLANTA', 207.1],
      ['SALMON 6/7', 161.92],
    ]);
    expect(a.total).toBe(473.02);
  });

  it('Pérez Viñas (logo sin nombre): proveedor por el CIF del TicketBAI y nº de la fila de debajo', () => {
    const a = leerAlbaran(
      cajas([
        'TAMAYO HUERTA DAVID',
        'FACTURA  FECHA OPERACIÓN  N.I.F.',
        '4 910611  17/10/26  78880797C  Cod.Cliente: 2926',
        'Código  Descripción artículo  Lote  Unidad/Kg  Precio  Importe  %IVA',
        'ALBARAN:254.707  FECHA:17/10/2026',
        '6951  CAMARON COCIDO CONGELADO 300 U  1,00  23,000  23,00  10',
        '6601  PATAS DE PULPO  0,25  6,00  7,900  47,40  10',
        '9031058  CIGALA ESCOCESA 0 (8-12) 4x1.5  6,00  24,950  149,70  10',
        'Fecha expedición 17/10/2026  Base Imponible  %IVA  Importe IVA  %R.E.  Importe R.E.  TOTAL FACTURA',
        'TBAI-B95903530-171026-  220,10  220,10  10,00  22,01  1,40  3,08',
        '245,19',
      ]),
    );
    expect(a.proveedor).toBe('Pérez Viñas Comercial, S.L.');
    expect(a.numero).toBe('910611');
    expect(a.albaranes).toEqual(['254.707']);
    expect(a.lineas.map((l) => [l.kg, l.importe])).toEqual([
      [1, 23],
      [6, 47.4],
      [6, 149.7],
    ]);
    expect(a.total).toBe(245.19);
  });

  it('Kazaeder y Arraiza (mismo programa): nº de la fila NUMERO/FECHA y la línea VIRREY', () => {
    const a = leerAlbaran(
      cajas([
        'KAZAEDER, S.L.',
        'Nif B95523791',
        'FACTURA',
        'NUMERO  FECHA  COD_CLI  NIF  PEDIDO  PROVEEDOR  PAG',
        '13118  21/08/2026  2926  78880797C  1',
        'Bultos  Detalle Producto  Lote  Talla  Zona  Arte  Marca  Env  Bruto  Neto  Precio  Importe',
        '1  VIRREY  0313303  VI  27  SF  SFVI  3,80  3,80  15,50  58,90',
        'SUBTOTAL  DESCUENTOS  BASES  IVA%  CUOTAS  REC%  CUOTA/R  TOTAL',
        '58,90  58,90  10,00  5,89  1,40  0,82  65,61 €',
      ]),
    );
    expect(a.proveedor).toBe('Kazaeder, S.L.');
    expect(a.numero).toBe('13118');
    expect(a.fecha).toBe('2026-08-21');
    expect(a.lineas).toEqual([{ texto: 'VIRREY', kg: 3.8, precio: 15.5, importe: 58.9, estado: 'ok' }]);
    expect(a.total).toBe(65.61);
  });
});

describe('gastos fijos: luz, teléfono y autónomos (facturas reales de 07–10/2026)', () => {
  it('luz de Yoigo LUZ y GAS: total a pagar, nº E26… y contrato; sin stock', () => {
    const a = leerAlbaran(
      cajas([
        'Factura de la luz del  DAVID TAMAYO HUERTA',
        '2 al 30 de junio de 2026  Cl Jesus Aranburu , 1 Ba 3 48950 (Erandio)',
        'Número de factura  RESUMEN DE LA FACTURA',
        'E26YG0000489549',
        'Fecha emisión: 14/07/26',
        'Potencia  37,57 €',
        'Energía  77,97 €',
        'IVA 21%  (sobre  122,78  €)  25,78 €',
        'electrodomésticos  Total a pagar  148,56 €',
        'Periodo P1 (Punta) — 4,058701 €/kW·mes  ×  0,97  meses  ×  6,6  kW  25,98 €',
        'Contrato 1027848',
        'Factura emitida en València por Energía Colectiva SL. CIF ES B98670003',
      ]),
    );
    expect(a).toMatchObject({ tipo: 'factura', clase: 'gasto', numero: 'E26YG0000489549', fecha: '2026-07-14', total: 148.56 });
    expect(a.proveedor).toBe('Energía Colectiva, S.L. (Yoigo Luz y Gas)');
    expect(a.lineas).toEqual([{ texto: 'Luz (contrato 1027848)', kg: null, precio: null, importe: 148.56, estado: 'ok' }]);
  });

  it('teléfono de Yoigo: el plazo del móvil va en línea aparte y suma al total', () => {
    const a = leerAlbaran(
      cajas([
        'Número de Factura:  YC260013946816',
        'Periodo facturado:  Del  01/09/2026  al  30/09/2026',
        'Fecha de emisión:  01/10/2026  DAVID TAMAYO HUERTA',
        'Número de contrato:  YGC26060125194833',
        'TOTAL A PAGAR  37,80€',
        'FIBRA 600Mb + LA SINFÍN GB ILIMITADOS + PRIME  01 Sep - 30 Sep  28,60€  34,60€',
        'LA DUO ADICIONAL  01 Sep -  30Sep  7,44€  9,00€',
        'Base imponible  (21%)  25,04€',
        'Total factura  30,30€',
        'Servicios de terceros y otros pagos  7,50€',
        'TOTAL A PAGAR  37,80€',
        'XFERA MÓVILES, S.A.U. Parque Empresarial CIF A-82528548',
      ]),
    );
    expect(a).toMatchObject({ clase: 'gasto', numero: 'YC260013946816', fecha: '2026-10-01', total: 37.8 });
    expect(a.lineas.map((l) => [l.texto, l.importe])).toEqual([
      ['Teléfono e internet (contrato 25194833)', 30.3],
      ['Plazo del móvil (servicios de terceros)', 7.5],
    ]);
  });

  it('cuota de autónomos: recibo del banco con el mes como nº', () => {
    const a = leerAlbaran(
      cajas([
        'Domiciliación de pagos',
        'Cargo',
        '31.08.26 XXXX XXXX XX XXXXXX2123 ES10 XXXX XXXX XXXX XXXX 2123',
        'Fecha Valor  Entidad ordenante/Identificador(*)  Titular',
        '31.08.26 TGSS. COTIZACION 005 R.E.AUTONOMOS  DAVID TAMAYO HUERTA',
        'ES75005Q2827003A',
        'PERIODO LIQUIDACION: 08/2026-08/2026',
        'Importe',
        'DAVID TAMAYO HUERTA  03810-00  328,61',
        '48901 BARAKALDO  BIZKAIA  328,61  Director Ejecutivo',
      ]),
    );
    expect(a).toMatchObject({ tipo: 'factura', clase: 'gasto', proveedor: 'Seguridad Social (autónomos)', numero: 'RETA 08/2026', fecha: '2026-08-31', total: 328.61 });
    expect(a.lineas).toEqual([{ texto: 'Cuota de autónomos 08/2026', kg: null, precio: null, importe: 328.61, estado: 'ok' }]);
  });
});

describe('impuestos de la gestoría (Hacienda Foral, 3T 2026)', () => {
  it('modelo 115: retención del alquiler, nº de liquidación y fecha de envío', () => {
    const a = leerAlbaran(
      cajas([
        'Atxikipenak eta konturako sarrerak',
        'Retenciones e ingresos a cuenta',
        'Autolikidazioa / Autoliquidación',
        'Likidazio zk. / N.º liquidación  W55943231',
        'Rendimientos procedentes del arrendamiento o subarrendamiento de inmuebles urbanos',
        '2026  TRIM3',
        'Errentamenduen zenbatekoa /Importe arrendamientos  02  4.800,00',
        'Atxikipenak / Retenciones  03  912,00',
        'Sartu beharreko zenbatekoa, guztira / Importe total a ingresar ( 03 +  06 )  07  912,00',
        'Data eta bidalketa zk. / Fecha y n.º envío',
        '06 de Octubre de 2026  016599500',
        'Foru Ogasunaren zigilu elektronikoa / Sello electrónico de la Hacienda Foral',
      ]),
    );
    expect(a).toMatchObject({ clase: 'gasto', proveedor: 'Hacienda Foral de Bizkaia', numero: 'W55943231', fecha: '2026-10-06', total: 912 });
    expect(a.lineas.map((l) => l.texto)).toEqual(['Retención del alquiler (modelo 115) 3T 2026']);
  });

  it('modelo 130: cuenta el total del pago fraccionado, no el 5 % bruto', () => {
    const a = leerAlbaran(
      cajas([
        'Pago fraccionado  130',
        'Autoliquidación',
        'N.º liquidación  W55995184',
        '2026  TRIM3',
        'Importe pago fraccionado  (5% 01 )  5,00  %  02  2.769,42',
        'Cuota a ingresar  ( 02 – 03 )  04  769,42',
        'Total pago fraccionado  ( 04 + 08 + 12 + 18 + 20 )  28  769,42',
        '19 de Octubre de 2026  016641930',
        'Sello electrónico de la Hacienda Foral',
      ]),
    );
    expect(a).toMatchObject({ numero: 'W55995184', fecha: '2026-10-19', total: 769.42 });
    expect(a.lineas[0].texto).toBe('IRPF pago fraccionado (modelo 130) 3T 2026');
  });
});
