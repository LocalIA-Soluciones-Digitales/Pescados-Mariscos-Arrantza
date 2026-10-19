// Interpreta lo que el OCR lee de un albarán de compra (Mercabilbao) a
// partir de los trozos de texto y su posición en la foto: proveedor,
// fecha, número, total y las líneas de producto (kg, €/kg, importe).
// El modelo solo localiza y lee letras; todo lo de aquí son reglas
// sencillas, la más importante «kg × €/kg = importe», que delata y
// corrige casi cualquier número mal leído.
//
// Las líneas se reconstruyen por columnas y no por renglones: en muchos
// albaranes (Adelaida, Bizkaimar, Capotinas…) la descripción sale medio
// renglón más abajo que sus números, así que se buscan por un lado las
// filas de números (kg · precio · importe) y por otro las de nombres, y se
// emparejan en orden.

export interface OcrCaja {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LineaLeida {
  texto: string;
  kg: number | null;
  precio: number | null;
  importe: number | null;
  // 'ok': kg × precio = importe · 'corregida': un número no cuadraba y se
  // ha recalculado con los otros dos · 'revisar': falta algún número.
  estado: 'ok' | 'corregida' | 'revisar';
}

// Un recibo del listado semanal del gremio de minoristas (Mercabilbao):
// una factura de un mayorista. Solo sirve para contrastar con Compras.
export interface ReciboListado {
  proveedor: string;
  fecha: string; // YYYY-MM-DD
  factura: string;
  importe: number;
}

export interface AlbaranLeido {
  // Factura: la que llega por email (diaria o semanal); su `numero` es el de
  // la factura y `albaranes` los nº de albarán que nombra, si los nombra.
  tipo: 'albaran' | 'factura';
  // 'genero': pescado o marisco, suma al stock · 'gasto': limpieza, agua…
  // (solo gasto, nunca stock) · 'listado': resumen del gremio, ni gasto ni
  // stock, solo para contrastar (ver `recibos`).
  clase: 'genero' | 'gasto' | 'listado';
  recibos: ReciboListado[];
  proveedor: string | null;
  fecha: string | null; // YYYY-MM-DD
  numero: string | null;
  albaranes: string[];
  total: number | null;
  lineas: LineaLeida[];
  texto: string[];
}

// Misma normalización que compras_norm() en supabase/schema.sql: la usa la
// memoria de nombres (compras_alias) para reconocer "LUBINA RAC 2/3".
export function normalizarCompra(texto: string | null | undefined): string {
  const sinTildes = (texto ?? '').replace(/[ÁÉÍÓÚÜÑáéíóúüñ]/g, (c) => 'AEIOUUNaeiouun'['ÁÉÍÓÚÜÑáéíóúüñ'.indexOf(c)]);
  return sinTildes.toLowerCase().replace(/\s+/g, ' ').trim();
}

type Caja = OcrCaja & { cy: number };
type Fila = { cy: number; h: number; cajas: Caja[] };

// Trozos a la misma altura = misma fila, ordenados de izquierda a derecha.
function agruparFilas(cajas: Caja[]): Fila[] {
  const filas: Fila[] = [];
  for (const c of [...cajas].sort((a, b) => a.cy - b.cy)) {
    const ultima = filas.at(-1);
    if (ultima && Math.abs(c.cy - ultima.cy) < Math.min(c.height, ultima.h) * 0.55) {
      ultima.cajas.push(c);
      ultima.cy = ultima.cajas.reduce((t, k) => t + k.cy, 0) / ultima.cajas.length;
    } else {
      filas.push({ cy: c.cy, h: c.height, cajas: [c] });
    }
  }
  for (const f of filas) f.cajas.sort((a, b) => a.x - b.x);
  return filas;
}

const textoFila = (f: Fila) => f.cajas.map((c) => c.text).join('  ');

// Un trozo con nombre y números juntos ("MERLUZA 18,40 9,80 180,32", típico
// de los PDF con texto y a veces del OCR) se parte: cada número va aparte,
// con su posición estimada por la de sus letras dentro del trozo.
function partir(c: OcrCaja): OcrCaja[] {
  const texto = c.text.trim();
  if (!/[a-zñ]/i.test(texto) || !new RegExp(NUM).test(texto)) return [{ ...c, text: texto }];
  const ancho = c.width / Math.max(1, c.text.length);
  const partes: OcrCaja[] = [];
  let palabras: { t: string; i: number }[] = [];
  const cerrar = () => {
    if (!palabras.length) return;
    const ini = palabras[0].i;
    const fin = palabras.at(-1)!.i + palabras.at(-1)!.t.length;
    partes.push({ ...c, text: palabras.map((p) => p.t).join(' '), x: c.x + ini * ancho, width: (fin - ini) * ancho });
    palabras = [];
  };
  for (const m of c.text.matchAll(/\S+/g)) {
    if (new RegExp(`^${NUM}$`).test(m[0])) {
      cerrar();
      partes.push({ ...c, text: m[0], x: c.x + m.index! * ancho, width: m[0].length * ancho });
    } else {
      palabras.push({ t: m[0], i: m.index! });
    }
  }
  cerrar();
  return partes;
}

function preparar(cajas: OcrCaja[]): Caja[] {
  return cajas
    .flatMap(partir)
    .map((c) => ({ ...c, text: c.text.trim(), cy: c.y + c.height / 2 }))
    .filter((c) => c.text);
}

export function agruparLineas(cajas: OcrCaja[]): string[] {
  return agruparFilas(preparar(cajas)).map(textoFila);
}

// Número con decimales: 18,4 · 11,600 · -14,50 · 1.520,62 · 31'94 (a mano).
const NUM = String.raw`-?\d{1,6}(?:[.,]\d{3})*[.,'’′]\d{1,3}`;

// El último separador es siempre el decimal (11,600 kg son once kilos y
// seiscientos gramos, no 11.600); los anteriores son de miles (1.520,62).
export function aNumero(s: string): number {
  let t = s.replace(/\s/g, '').replace(/['’′]/g, ',');
  const negativo = t.startsWith('-');
  t = t.replace(/^-/, '');
  const ultimo = Math.max(t.lastIndexOf('.'), t.lastIndexOf(','));
  if (ultimo >= 0) t = `${t.slice(0, ultimo).replace(/[.,]/g, '')}.${t.slice(ultimo + 1)}`;
  const n = Number(t);
  return negativo ? -n : n;
}

const decimales = (texto: string) => [...texto.matchAll(new RegExp(NUM, 'g'))].map((m) => aNumero(m[0]));

// Trozo que solo contiene números (y quizá el código de IVA, "r" o "€").
function esNumerica(texto: string): boolean {
  const t = texto.replace(/\s*(€|eur|-?r-?|%)\s*$/i, '').trim();
  return /^(-?\d[\d.,'’′]*\s*)+$/.test(t) && decimales(t).length > 0;
}

const redondear = (n: number, dec = 2) => Math.round(n * 10 ** dec) / 10 ** dec;

// Si kg × precio no da el importe, el número mal leído suele ser uno solo:
// se recalcula el que haga cuadrar la línea con un valor razonable.
export function cuadrarLinea(texto: string, kg: number | null, precio: number | null, importe: number | null): LineaLeida {
  if (kg != null && precio != null && importe != null) {
    if (Math.abs(kg * precio - importe) <= Math.max(0.06, Math.abs(importe) * 0.002)) return { texto, kg, precio, importe, estado: 'ok' };
    if (kg !== 0) {
      const p = redondear(importe / kg);
      if (p > 0.1 && p < 400) return { texto, kg, precio: p, importe, estado: 'corregida' };
    }
    return { texto, kg, precio, importe, estado: 'revisar' };
  }
  if (kg != null && importe != null && kg !== 0) {
    const p = redondear(importe / kg);
    return { texto, kg, precio: p, importe, estado: p > 0.1 && p < 400 ? 'corregida' : 'revisar' };
  }
  if (kg != null && precio != null) {
    return { texto, kg, precio, importe: redondear(kg * precio), estado: 'corregida' };
  }
  return { texto, kg, precio, importe, estado: 'revisar' };
}

const CABECERA = /(precio|importe|kilos|peso|unidades|cantidad|\bneto\b)/i;
const TITULOS = /(descripci|art[ií]culo|detalle|concepto|clase|\bc[oó]d(igo)?\b|bultuak|azalpena|lotea|partida)/i;
// Cabecera de la tabla: sin números con decimales («SECAMANOS (FARDO DE 6
// UNIDADES 1 6,000 2,63 15,75» es un producto) y, si no nombra columnas de
// números, al menos dos títulos («CÓDIGO DESCRIPCIÓN» de Castañares).
const esCabecera = (t: string) =>
  decimales(t).length === 0 && (CABECERA.test(t) || (t.match(new RegExp(TITULOS.source, 'gi'))?.length ?? 0) >= 2);
// «IVA» solo como palabra: «Almeja fina viva» no es la fila del IVA.
const FIN_TABLA = /(\btotal|\bbase\b|base\s*i|subtotal|\bbruto\b|\bsuma\b|\bi\.?\s?v\.?\s?a\b|recargo|observaciones|conforme|l[ií]quido)/i;
// Fila de totales que también nombra columnas («IMPORTE BRUTO … TOTAL» de
// Adelaida): corta la tabla aunque parezca cabecera.
const FIN_FUERTE = /(\bbruto\b|base\s*imponible|subtotal|\btotal\b)/i;
// Renglones que no son producto aunque caigan entre ellos: trazabilidad
// («Técnica de pesca…» de Conifres) y pie («Forma de pago… Transfer.»).
const NO_NOMBRE =
  /(t[eé]cnica de pesca|[aá]rea de pesca|zona de pesca|arte de pesca|nombre t[eé]cnico|m[eé]todo de producci|forma de pago|vencimiento|transfer|iban\b|albar[aá]n\s*(n[º°o.]|:)|\balb\.?\s*:|tamayo|huerta)/i;

// "SALMONETE DE ROC MULLUS SURMULENTUS CS20260902" → sin el lote; "0041
// JUREL" → sin el código; deja tallas como 40/50, 1.5/2 o 400+.
// "BESUGO/PANCHETA / Pagellus Bogaraveo ( SBR )" → sin el nombre científico
// ni el código FAO; "[4002] CAMARON…" → sin el código de artículo.
export function limpiarNombre(texto: string): string {
  let t = texto
    .replace(/\s+/g, ' ')
    .replace(/^\s*\[\d+\]\s*/, '')
    .replace(/\(\s*[A-Z]{2,4}\s*\)/g, ' ')
    .replace(/\(\s*\)/g, ' ');
  // Nombre científico: lo que va tras el último « / » si son 2+ palabras
  // («JUREL / CHICHARRO» se queda, es un solo nombre comercial).
  const barra = t.lastIndexOf(' / ');
  if (barra > 0 && /^\s*[a-zñ]{3,}\s+[a-zñ]{3,}/i.test(t.slice(barra + 3))) t = t.slice(0, barra);
  const tokens = t.replace(/[\s(]+$/, '').trim().split(' ');
  while (tokens.length && /^-?[\d.,'’′]+$/.test(tokens[0])) tokens.shift();
  const corte = tokens.findIndex(
    // «LANG.20/30» (Frío Bilbao) lleva la talla pegada: no es un lote.
    (t) => /^\d{5,}$/.test(t) || (t.length >= 4 && /[a-z]/i.test(t) && /\d/.test(t) && !/^n[º°o]/i.test(t) && !/\d\/\d/.test(t)),
  );
  const nombre = corte >= 0 ? tokens.slice(0, corte) : tokens;
  // Cajas o envases sueltos al final ("GALLO 200/300 … 6") y restos como
  // "0," o "1/" ("PIL PIL 1/" de Triana).
  // También la unidad de venta («… A BORD KGR»).
  while (nombre.length && (/^[\d.,'’′]+\/?$/.test(nombre.at(-1)!) || /^(kgr?s?|uds?|un)$/i.test(nombre.at(-1)!))) nombre.pop();
  return nombre.join(' ').trim();
}

function leerFecha(l: string): string | null {
  const m = l.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/);
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])];
  if (d < 1 || d > 31 || mes < 1 || mes > 12 || a < 2020 || a > 2100) return null;
  return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const SUFIJO_EMPRESA = /\b(s\.?\s?l\.?\s?u?\.?|s\.?\s?a\.?|s\.?\s?coop)(\s|$|,|-)/i;

// Datos de David como cliente, que también salen en la cabecera.
const DATOS_CLIENTE = /tamayo|huerta|arrantza|zorrilla|arana|barakaldo|baracaldo|bizkaia|españa|espana/i;
// «Pescados y Mariscos Gaizka S.L.» dentro de una frase (la letra pequeña
// de protección de datos), por si el nombre de la cabecera es un logo.
const EMPRESA_EN_FRASE = /((?:[A-ZÁÉÍÓÚÑ][\wáéíóúñ.&'-]*\s+(?:y\s+|de\s+)?){1,5})(S\.\s?L\.?\s?U?\.?|S\.\s?A\.?|SL|SA)(?=[\s.,;]|$)/;

// Proveedores de David en Mercabilbao (sacados de sus albaranes). El CIF
// casi siempre se lee bien aunque el nombre salga destrozado («ANMAT2A
// 007128882, 8.5. - B48077069» es Arraiza); las pistas se buscan solo en
// la cabecera, porque la letra pequeña puede nombrar a otra empresa.
// `gasto`: no vende género (limpieza, agua…): solo se apunta el gasto.
export const PROVEEDORES_CONOCIDOS: { nombre: string; cif?: string; pistas: string[]; gasto?: true }[] = [
  { nombre: 'Pescados y Mariscos Adelaida, S.L.', cif: 'B95719746', pistas: ['adelaida'] },
  { nombre: 'Arraiza Gutiérrez, S.L.', cif: 'B48077069', pistas: ['arraiza', 'pescadosarraiza'] },
  { nombre: 'Arrainko Anaiak, S.L.', cif: 'B75560151', pistas: ['arrainko'] },
  { nombre: 'Pescados Bizkaimar, S.L.U.', cif: 'B95750824', pistas: ['bizkaimar'] },
  { nombre: 'Las Capotinas, S.A.', cif: 'A48142921', pistas: ['capotinas'] },
  { nombre: 'Conifres, S.L.', cif: 'B48482376', pistas: ['conifres'] },
  { nombre: 'José Crespo, S.A.', cif: 'A48102883', pistas: ['jose crespo', 'crespopescados'] },
  { nombre: 'Pescados y Mariscos Gaizka, S.L.', cif: 'B95091203', pistas: ['gaizka'] },
  // Factura con el nombre en un logo: el CIF sale en el código TicketBAI.
  { nombre: 'Pérez Viñas Comercial, S.L.', cif: 'B95903530', pistas: ['perez vinas', 'perez vins', 'perez vinns'] },
  { nombre: 'Pescados Triana, S.A.', cif: 'A48161715', pistas: ['triana'] },
  { nombre: 'Pescados Txalupa, S.L.', cif: 'B95681201', pistas: ['txalupa'] },
  { nombre: 'Kazaeder, S.L.', cif: 'B95523791', pistas: ['kazaeder'] },
  // Cabecera en logo: se reconoce por el CIF del pie.
  { nombre: 'Frío Bilbao, S.A.', cif: 'A48137426', pistas: ['frio bilbao', 'friobilbao'] },
  // Bolsas, secamanos y papel: material de limpieza.
  { nombre: 'J.L. Castañares, S.L.', cif: 'B95555421', pistas: ['castanares', 'castaares'], gasto: true },
  { nombre: 'Consorcio de Aguas Bilbao Bizkaia', cif: 'P4800005C', pistas: ['consorcio de aguas', 'consorciodeaguas', 'partzuergoa'], gasto: true },
  // Luz (Yoigo LUZ y GAS), teléfono e internet (Yoigo) y cuota de autónomos.
  { nombre: 'Energía Colectiva, S.L. (Yoigo Luz y Gas)', cif: 'B98670003', pistas: ['energia colectiva', 'yoigo luz'], gasto: true },
  { nombre: 'Xfera Móviles, S.A.U. (Yoigo)', cif: 'A82528548', pistas: ['xfera'], gasto: true },
  { nombre: 'Seguridad Social (autónomos)', cif: 'Q2827003A', pistas: ['tgss', 'seguridad social'], gasto: true },
  // Modelos 130, 110 y 115 que presenta la gestoría (Gestiones AIO).
  { nombre: 'Hacienda Foral de Bizkaia', pistas: ['hacienda foral', 'foru ogasun'], gasto: true },
];

function proveedorConocido(filas: string[]): (typeof PROVEEDORES_CONOCIDOS)[number] | null {
  const todo = filas.join(' ').toUpperCase().replace(/[\s.-]/g, '');
  const porCif = PROVEEDORES_CONOCIDOS.find((p) => p.cif && todo.includes(p.cif));
  if (porCif) return porCif;
  const cabecera = normalizarCompra(filas.slice(0, 12).join(' '));
  return PROVEEDORES_CONOCIDOS.find((p) => p.pistas.some((k) => cabecera.includes(k))) ?? null;
}

// ¿Es de un proveedor que no vende género? Por el nombre ya guardado.
export function esProveedorGasto(proveedor: string | null | undefined): boolean {
  const p = normalizarCompra(proveedor);
  return !!p && PROVEEDORES_CONOCIDOS.some((k) => k.gasto && (normalizarCompra(k.nombre) === p || k.pistas.some((x) => p.includes(x))));
}

function leerProveedor(filas: string[]): string | null {
  const conocido = proveedorConocido(filas)?.nombre;
  if (conocido) return conocido;
  const limpiar = (t: string) => t.replace(/\s*-\s*[A-Z]-?\d{7,8}\s*$/, '').replace(/[.\s]+$/, (m) => (m.includes('.') ? '.' : '')).replace(/\s+/g, ' ').trim();
  const trozos = filas.slice(0, 14).flatMap((l) => l.split(/\s{2,}/));
  const valido = (t: string) =>
    /[a-z]{3,}/i.test(t) &&
    !/\d/.test(t) &&
    !DATOS_CLIENTE.test(t) &&
    !/asociaci|asentadores|cliente|albar[aá]n|factura|fecha|tel[eé]?f|e-?mail|@|www|\.(com|es|net|org|eus)\b/i.test(t);
  const conSufijo = (t: string) =>
    t.trim().split(/\s+/).length <= 7 && SUFIJO_EMPRESA.test(t + ' ') && /[a-z]{3,}/i.test(t) && !DATOS_CLIENTE.test(t) && !/@/.test(t);
  const cabecera = trozos.find(conSufijo);
  if (cabecera) return limpiar(cabecera);
  for (const l of filas) {
    const m = l.match(EMPRESA_EN_FRASE);
    if (m && !DATOS_CLIENTE.test(m[0]) && !/^(De|En|La|El|Los|Las)\s/.test(m[1])) return limpiar(m[0]);
  }
  const elegido = trozos.find((t) => valido(t) && /pescados?|mariscos?|frigor/i.test(t)) ?? trozos.find(valido);
  return elegido ? limpiar(elegido) : null;
}

// «PESCA S BIZKAIMAR,S.L.U» leído hoy y «Pescados Bizkaimar, S.L.U» de otra
// vez son el mismo: se usa el nombre ya conocido, así la memoria de
// productos (que va por proveedor) no se reparte entre variantes.
export function unificarProveedor(leido: string | null, conocidos: string[]): string | null {
  if (!leido) return leido;
  const palabras = (t: string) =>
    new Set(
      normalizarCompra(t)
        .replace(/\bs\.?\s?(l|a)\.?\s?u?\.?\b/g, ' ')
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !['pescados', 'mariscos', 'comercial', 'distribucion'].includes(w)),
    );
  const a = palabras(leido);
  let mejor: { nombre: string; parecido: number } | null = null;
  for (const c of new Set(conocidos)) {
    const b = palabras(c);
    if (!a.size || !b.size) continue;
    let comunes = 0;
    for (const w of a) if ([...b].some((v) => v === w || (w.length >= 5 && v.length >= 5 && (v.startsWith(w.slice(0, 5)) || w.startsWith(v.slice(0, 5)))))) comunes++;
    const parecido = comunes / Math.min(a.size, b.size);
    if (parecido >= 0.99 && (!mejor || parecido > mejor.parecido)) mejor = { nombre: c, parecido };
  }
  return mejor?.nombre ?? leido;
}

function leerNumero(filas: string[]): string | null {
  for (const l of filas) {
    const m =
      l.match(/albar[aá]n\b[^\d]{0,25}?([A-Z]{0,3}\d{1,4}\/[\d.]+|[A-Z]{1,3}-?\d{3,}|\d{4,}|\d{1,3}(?:\.\d{3})+)/i) ??
      l.match(/\bn[º°o.]{1,2}\s*:?\s*([A-Z]{0,3}-?\d{4,})/i);
    if (m) return m[1];
  }
  return null;
}

// Nº de documento: «A26 / 5055», «M10780», «2026_1_21914», «12.345»,
// «AM/OUT/11121» (Conifres), «G / 926.237» (Gaizka).
const NUM_DOC = String.raw`[A-Z]{1,3}\/[A-Z]{2,4}\/\d{3,}|[A-Z]{1,3}\s*\/\s*\d{1,3}(?:\.\d{3})+|[A-Z]{0,3}\d{1,4}\s?\/\s?[\d.]+|\d{4}_\d+_\d+|[A-Z]{1,3}\d{0,4}-?\d{3,}|\d{4,}|\d{1,3}(?:\.\d{3})+`;
// Fecha que va delante del nº («Albarán: 16/10/2026 AM/OUT/11121»).
const FECHA_DELANTE = String.raw`(?:\d{1,2}\/\d{1,2}\/\d{2,4}\s+)?`;

// Factura o albarán: manda la palabra que sale antes en la cabecera (los
// albaranes a veces dicen «factura» en la letra pequeña, y las facturas
// tienen una columna «Albarán»).
function leerTipo(filas: string[]): 'albaran' | 'factura' {
  for (const l of filas.slice(0, 20)) {
    const f = l.search(/\bfactura\b/i);
    const a = l.search(/\balbar[aá]n\b/i);
    if (f >= 0 && (a < 0 || f < a)) return 'factura';
    if (a >= 0) return 'albaran';
  }
  return 'albaran';
}

function leerNumeroFactura(filas: string[]): string | null {
  for (const l of filas) {
    const m = l.match(new RegExp(String.raw`factura\b(?:\s*simplificada)?[^\d]{0,25}?(${NUM_DOC})`, 'i'));
    if (m) return m[1].replace(/\s+/g, ' ').trim();
  }
  // El nº va en la fila de debajo de los títulos de columna:
  //  · «Serie  Número  F. Expedición» → «G  7638  17/10/2026» (Capotinas).
  //  · «NUMERO  FECHA  COD_CLI…» → «21779  15/10/2026…» (Arraiza, Kazaeder).
  //  · «FACTURA  FECHA OPERACIÓN  N.I.F.» → «4 910611  17/10/26» (Pérez Viñas).
  for (let i = 0; i + 1 < filas.length; i++) {
    const cab = filas[i];
    if (/\bserie\b/i.test(cab) && /\bn[uú]mero\b/i.test(cab)) {
      const m = filas[i + 1].match(/\b([A-Z]{1,3})\s+(\d{3,7})\s+\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/);
      if (m) return `${m[1]} ${m[2]}`;
    }
    if (/\d/.test(cab) || !/\bfecha\b/i.test(cab) || !/^\s*(n[uú]mero|factura|n[º°o]\.?\s*factura)\b/i.test(cab)) continue;
    const n = filas[i + 1].split(/\s+/).find((t) => /^[A-Z]{0,3}\d{4,}$/.test(t));
    if (n) return n;
  }
  return null;
}

// Albaranes que nombra una factura («Albarán A26/5055 de 16/10/2026»,
// «Alb. nº 12345»), sin repetir.
function leerAlbaranesCitados(filas: string[]): string[] {
  const vistos = new Map<string, string>();
  const re = new RegExp(String.raw`\balb(?:ar[aá]n(?:es)?|\.)\s*(?:n[º°o.]{1,2}\s*)?:?\s*(?:\/\s*)?${FECHA_DELANTE}(${NUM_DOC})`, 'gi');
  for (const l of filas) {
    for (const m of l.matchAll(re)) {
      const n = m[1].replace(/\s+/g, ' ').trim();
      const clave = n.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (clave.length >= 3 && !vistos.has(clave)) vistos.set(clave, n);
    }
  }
  return [...vistos.values()];
}

export function leerAlbaran(ocr: OcrCaja[]): AlbaranLeido {
  const cajas = preparar(ocr);
  const filas = agruparFilas(cajas);
  const texto = filas.map(textoFila);
  const tipo = leerTipo(texto);
  const albaranes = tipo === 'factura' ? leerAlbaranesCitados(texto) : [];
  // En una factura, leerNumero() cogería el primer albarán que nombra.
  const numeroSuelto = leerNumero(texto);
  const r: AlbaranLeido = {
    tipo,
    clase: proveedorConocido(texto)?.gasto ? 'gasto' : 'genero',
    recibos: [],
    proveedor: leerProveedor(texto),
    fecha: null,
    numero:
      tipo === 'factura'
        ? (leerNumeroFactura(texto) ?? (albaranes.some((a) => a.replace(/\s/g, '') === numeroSuelto?.replace(/\s/g, '')) ? null : numeroSuelto))
        : numeroSuelto,
    albaranes,
    total: null,
    lineas: [],
    texto,
  };
  for (const l of texto) r.fecha ??= leerFecha(l);

  const listado = leerListado(texto);
  if (listado) return { ...r, ...listado, tipo: 'factura', clase: 'listado', proveedor: 'Listado del gremio', numero: null, albaranes: [] };
  const aguas = leerAguas(texto);
  if (aguas) return { ...r, ...aguas, tipo: 'factura', numero: leerNumeroFactura(texto) ?? r.numero };
  const fijo = leerLuz(texto) ?? leerTelefono(texto) ?? leerAutonomos(texto) ?? leerModeloHacienda(texto);
  if (fijo) return { ...r, ...fijo, tipo: 'factura', clase: 'gasto', albaranes: [] };

  // 1) Filas de números de producto, por debajo de la cabecera de la tabla.
  const iCab = filas.findIndex((f) => esCabecera(textoFila(f)));
  const yCab = iCab >= 0 ? filas[iCab].cy : -Infinity;
  const numericas = cajas.filter((c) => c.cy > yCab && esNumerica(c.text));
  const candidatas = agruparFilas(numericas)
    .map((f) => {
      const nums = f.cajas.flatMap((c) => decimales(c.text.replace(/\s*(€|eur|-?r-?|%)\s*$/i, '')).map((n) => ({ n, x: c.x })));
      return { cy: f.cy, h: f.h, nums: nums.slice(-3), filaTexto: textoFila(f) };
    })
    // Fuera las filas a cero («NOTA OBIETA 0,000 0,00»: una nota, no un producto).
    .filter((f) => f.nums.length >= 2 && !/%/.test(f.filaTexto) && f.nums.some((x) => x.n !== 0));

  // 2) La tabla acaba en la primera fila de totales tras el primer producto.
  const yPrimera = candidatas[0]?.cy ?? Infinity;
  const yFin =
    filas.find((f) => {
      const t = textoFila(f);
      // «suma y sigue … 1.245,02»: la tabla sigue en la página siguiente.
      return f.cy > yPrimera + 1 && FIN_TABLA.test(t) && !/suma\s+y\s+sigue/i.test(t) && (!CABECERA.test(t) || FIN_FUERTE.test(t));
    })?.cy ?? Infinity;
  const productos = candidatas.filter((f) => f.cy < yFin - 1);
  // Filas con solo dos números: kg y, en principio, importe (en 4b se
  // comprueba si era el precio).
  const dosNumeros: { linea: LineaLeida; kg: number; segundo: number }[] = [];

  if (productos.length > 0) {
    // 3) Nombres: lo que hay a la izquierda de la primera columna de números.
    const xs = productos.map((p) => Math.min(...p.nums.map((n) => n.x))).sort((a, b) => a - b);
    const colX = xs[Math.floor(xs.length / 2)];
    const paso = productos.length > 1 ? (productos.at(-1)!.cy - productos[0].cy) / (productos.length - 1) : productos[0].h * 1.6;
    const desde = Math.max(yCab, productos[0].cy - paso * 0.9);
    const hasta = Math.min(yFin, productos.at(-1)!.cy + paso * 0.9);
    const nombres = agruparFilas(cajas.filter((c) => c.x + c.width / 2 < colX - 4 && c.cy > desde && c.cy < hasta))
      .map((f) => ({ cy: f.cy, crudo: textoFila(f), nombre: limpiarNombre(textoFila(f)) }))
      .filter(
        (f) =>
          // «PIL PIL» vale: basta una palabra de 3 letras y 4 letras en total.
          /[a-zñ]{3,}/i.test(f.nombre) &&
          (f.nombre.match(/[a-zñ]/gi)?.length ?? 0) >= 4 &&
          !/^[(*]/.test(f.crudo.trim()) &&
          !TITULOS.test(f.crudo) &&
          !FIN_TABLA.test(f.crudo) &&
          // «SECAMANOS (FARDO DE 6 UNIDADES» no es la cabecera.
          !CABECERA.test(f.crudo.replace(/\(.*$/, '')) &&
          !NO_NOMBRE.test(f.crudo),
      );

    // 4) Emparejar: si hay tantos nombres como filas de números, en orden
    // (aguanta el desfase); si no, cada fila con el nombre más cercano.
    const usados = new Set<number>();
    productos.forEach((p, i) => {
      let nombre = '';
      if (nombres.length === productos.length) {
        nombre = nombres[i].nombre;
      } else {
        let mejor = -1;
        for (let k = 0; k < nombres.length; k++) {
          if (usados.has(k) || Math.abs(nombres[k].cy - p.cy) > paso * 0.75) continue;
          if (mejor < 0 || Math.abs(nombres[k].cy - p.cy) < Math.abs(nombres[mejor].cy - p.cy)) mejor = k;
        }
        if (mejor >= 0) {
          usados.add(mejor);
          nombre = nombres[mejor].nombre;
        }
      }
      let n = p.nums.map((x) => x.n);
      // Cantidad entera («KGR 3 13,20 39,60» de Frío Bilbao): sin decimales
      // no entra en las columnas; vale si 3 × 13,20 = 39,60.
      if (n.length === 2) {
        const entero = cajas.find(
          (c) => Math.abs(c.cy - p.cy) < p.h * 0.55 && c.x < p.nums[0].x && /^\d{1,3}$/.test(c.text) && Math.abs(Number(c.text) * n[0] - n[1]) <= 0.06,
        );
        if (entero && Number(entero.text) > 0) n = [Number(entero.text), ...n];
      }
      const linea = n.length === 3 ? cuadrarLinea(nombre, n[0], n[1], n[2]) : cuadrarLinea(nombre, n[0], null, n[1]);
      // Una fila de números sin nombre solo cuenta si cuadra, aunque sea
      // corrigiendo un número (si no, es basura).
      if (nombre || linea.estado !== 'revisar') {
        r.lineas.push(linea);
        if (n.length === 2) dosNumeros.push({ linea, kg: n[0], segundo: n[1] });
      }
    });
  }

  const yTotales = productos.length ? productos.at(-1)!.cy : -Infinity;
  const numsTras = filas
    .filter((f) => f.cy > yTotales && !/cr[eé]dito|acumulado/i.test(textoFila(f)))
    .flatMap((f) => decimales(textoFila(f)));
  const aparece = (s: number) => numsTras.some((n) => Math.abs(n - s) <= 0.05);

  // 4b) Foto cortada por la derecha (Capotinas sin la columna Importe):
  // los dos números son kg y €/kg. Se sabe porque así la suma de las
  // líneas coincide con la base o el total de abajo, y si no, no.
  if (dosNumeros.length) {
    const alternativa = r.lineas.map((l) => {
      const d = dosNumeros.find((x) => x.linea === l);
      return d ? { ...l, precio: d.segundo, importe: redondear(d.kg * d.segundo), estado: 'ok' as const } : l;
    });
    if (!aparece(sumaLineas(r.lineas)) && aparece(sumaLineas(alternativa))) r.lineas = alternativa;
  }

  // 5) Total: el mayor importe tras la tabla que quede entre la suma de las
  // líneas y la suma + IVA + recargo. Sin líneas, el que acompañe a "total".
  const suma = sumaLineas(r.lineas);
  if (suma > 0) {
    const posibles = numsTras.filter((n) => n >= suma - 0.05 && n <= suma * 1.3 + 0.05);
    r.total = posibles.length ? Math.max(...posibles) : null;
    // Solo se ve la base (el líquido cortado en la foto): base + cuota de
    // IVA leída + recargo del 1,4 % si aparece.
    if (r.total != null && Math.abs(r.total - suma) <= 0.05) {
      const iva = [0.1, 0.21, 0.04].map((t) => redondear(suma * t)).find(aparece);
      if (iva != null) r.total = redondear(suma + iva + (numsTras.includes(1.4) ? redondear(suma * 0.014) : 0));
    }
  }
  if (r.total == null) {
    for (const l of texto) {
      const m = l.match(new RegExp(String.raw`(total|l[ií]quido|a\s+pagar)[^\d-]{0,30}(${NUM})`, 'i'));
      if (m && !/cr[eé]dito/i.test(l)) r.total = aNumero(m[2]);
    }
  }
  return r;
}

// Listado de recibos del gremio de minoristas («LISTADO RECIBOS ENTREGADOS
// … TOTAL MAYORISTA»): una fila por factura de cada mayorista de la semana.
// No es una compra: no cuenta como gasto ni suma al stock.
function leerListado(texto: string[]): Pick<AlbaranLeido, 'recibos' | 'total' | 'lineas'> | null {
  if (!texto.some((l) => /listado\s+recibos|total\s+mayorista/i.test(l))) return null;
  const fila = new RegExp(String.raw`^\s*\d{1,3}\s+(.+?)\s+(\d{1,2})-(\d{1,2})-(\d{4})\s+(\S+)\s+(${NUM})\s*$`);
  const recibos: ReciboListado[] = [];
  for (const l of texto) {
    const m = l.match(fila);
    if (!m) continue;
    recibos.push({
      proveedor: m[1].replace(/\s+/g, ' ').replace(/¥/g, 'Ñ').trim(),
      fecha: `${m[4]}-${m[3].padStart(2, '0')}-${m[2].padStart(2, '0')}`,
      factura: m[5],
      importe: aNumero(m[6]),
    });
  }
  const t = texto.map((l) => l.match(new RegExp(String.raw`total\s+facturas[^\d-]*(${NUM})`, 'i'))).find(Boolean);
  return { recibos, total: t ? aNumero(t[1]) : sumaLineas(recibos), lineas: [] };
}

// Recibo del Consorcio de Aguas: dos apartados sin kg, «Total tasas
// consorcio» (agua: abastecimiento, saneamiento, contador e IVA) y «Total
// tasas municipales» (basuras). Los importes van en la fila de al lado de
// esos títulos (en euskera y castellano, encima o debajo).
function leerAguas(texto: string[]): Pick<AlbaranLeido, 'lineas' | 'total' | 'clase'> | null {
  const i = texto.findIndex((l) => /total\s+tasas\s+consorcio/i.test(l));
  if (i < 0 || !texto.some((l) => /consorcio\s*de\s*aguas|partzuergoa/i.test(l))) return null;
  const nums = [i, i - 1, i + 1, i - 2, i + 2]
    .filter((k) => k >= 0 && k < texto.length)
    .map((k) => decimales(texto[k]))
    .find((n) => n.length >= 2);
  if (!nums) return null;
  const lineas: LineaLeida[] = [
    { texto: 'Agua', kg: null, precio: null, importe: nums[0], estado: 'ok' },
    { texto: 'Basuras', kg: null, precio: null, importe: nums[1], estado: 'ok' },
  ];
  return { clase: 'gasto', lineas, total: sumaLineas(lineas) };
}

// Gastos fijos de cada mes (luz, teléfono, autónomos): todo en una línea
// por concepto, sin kg ni stock. `texto` son las filas ya agrupadas.
type GastoFijo = Pick<AlbaranLeido, 'proveedor' | 'numero' | 'fecha' | 'total' | 'lineas'>;

const buscar = (texto: string[], re: RegExp) => {
  for (const l of texto) {
    const m = l.match(re);
    if (m) return m;
  }
  return null;
};
const importeDe = (texto: string[], re: RegExp) => {
  const m = buscar(texto, new RegExp(re.source + String.raw`\s*:?\s*(${NUM})`, 'i'));
  return m ? aNumero(m[m.length - 1]) : null;
};
const gasto = (texto: string, importe: number): LineaLeida => ({ texto, kg: null, precio: null, importe, estado: 'ok' });

// Yoigo LUZ y GAS (Energía Colectiva): «Total a pagar 148,56 €», una por
// contrato (cada suministro tiene el suyo).
function leerLuz(texto: string[]): GastoFijo | null {
  if (!texto.some((l) => /energ[ií]a colectiva|yoigo\s*luz/i.test(l))) return null;
  const tipo = buscar(texto, /factura de(?:l)?\s+(?:la\s+)?(luz|gas)/i);
  const total = importeDe(texto, /total a pagar/);
  if (!tipo || total == null) return null;
  const concepto = tipo[1].toLowerCase() === 'gas' ? 'Gas' : 'Luz';
  const contrato = buscar(texto, /\bcontrato\s+(\d{5,})/i)?.[1];
  const emision = buscar(texto, /fecha emisi[oó]n:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1];
  return {
    proveedor: 'Energía Colectiva, S.L. (Yoigo Luz y Gas)',
    numero: buscar(texto, /\b(E\d{2}[A-Z]{2}\d{6,})\b/)?.[1] ?? null,
    fecha: emision ? leerFecha(emision) : null,
    total,
    lineas: [gasto(contrato ? `${concepto} (contrato ${contrato})` : concepto, total)],
  };
}

// Yoigo (Xfera Móviles): fibra y móviles, una factura por contrato. El
// plazo del móvil («Servicios de terceros») va aparte del «Total factura»
// pero se paga en el mismo recibo.
function leerTelefono(texto: string[]): GastoFijo | null {
  if (!texto.some((l) => /xfera\s+m[oó]viles/i.test(l))) return null;
  const total = importeDe(texto, /total a pagar/);
  if (total == null) return null;
  const factura = importeDe(texto, /total factura/);
  const terceros = importeDe(texto, /servicios de terceros y otros pagos/);
  const contrato = buscar(texto, /n[uú]mero de contrato:?\s*\S*?(\d{8})\b/i)?.[1];
  const emision = buscar(texto, /fecha de emisi[oó]n:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];
  const concepto = `Teléfono e internet${contrato ? ` (contrato ${contrato})` : ''}`;
  const lineas =
    factura != null && terceros != null && Math.abs(factura + terceros - total) < 0.01
      ? [gasto(concepto, factura), gasto('Plazo del móvil (servicios de terceros)', terceros)]
      : [gasto(concepto, total)];
  return {
    proveedor: 'Xfera Móviles, S.A.U. (Yoigo)',
    numero: buscar(texto, /n[uú]mero de factura:?\s*([A-Z0-9]{8,})/i)?.[1] ?? null,
    fecha: emision ? leerFecha(emision) : null,
    total,
    lineas,
  };
}

// Recibo del banco de la cuota de autónomos (TGSS): «PERIODO LIQUIDACION:
// 08/2026-08/2026» y el importe debajo de «Importe». El nº es el mes, para
// que el mismo recibo no entre dos veces.
function leerAutonomos(texto: string[]): GastoFijo | null {
  if (!texto.some((l) => /tgss.*aut[oó]nomos|cotizaci[oó]n.*aut[oó]nomos/i.test(l))) return null;
  const periodo = buscar(texto, /periodo liquidaci[oó]n:?\s*(\d{2})\/(\d{4})/i);
  const i = texto.findIndex((l) => /^\s*importe\s*$/i.test(l));
  const total = i >= 0 ? texto.slice(i + 1, i + 4).map(decimales).find((n) => n.length)?.at(-1) ?? null : null;
  if (total == null) return null;
  const mes = periodo ? `${periodo[1]}/${periodo[2]}` : null;
  const cargo = buscar(texto, /^\s*(\d{2}\.\d{2}\.\d{2})\s+tgss/i)?.[1];
  return {
    proveedor: 'Seguridad Social (autónomos)',
    numero: mes ? `RETA ${mes}` : null,
    fecha: cargo ? leerFecha(cargo) : null,
    total,
    lineas: [gasto(mes ? `Cuota de autónomos ${mes}` : 'Cuota de autónomos', total)],
  };
}

// Autoliquidaciones de la Hacienda Foral que manda la gestoría cada
// trimestre: 130 (pago fraccionado del IRPF), 110 (retenciones de la
// nómina) y 115 (retención del alquiler). El nº es el de liquidación.
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MODELOS: { re: RegExp; modelo: string; concepto: string }[] = [
  { re: /pago fraccionado/i, modelo: '130', concepto: 'IRPF pago fraccionado' },
  { re: /arrendamiento o subarrendamiento/i, modelo: '115', concepto: 'Retención del alquiler' },
  { re: /rendimientos del trabajo/i, modelo: '110', concepto: 'Retenciones de la nómina' },
];

function leerModeloHacienda(texto: string[]): GastoFijo | null {
  if (!texto.some((l) => /hacienda foral|foru ogasun/i.test(l)) || !texto.some((l) => /autoliquidaci/i.test(l))) return null;
  const m = MODELOS.find((k) => texto.some((l) => k.re.test(l)));
  const fila = texto.find((l) => /total pago fraccionado|importe total a ingresar/i.test(l));
  const total = fila ? (decimales(fila).at(-1) ?? null) : null;
  if (!m || total == null) return null;
  const trimestre = buscar(texto, /\b(20\d{2})\s+TRIM\s*([1-4])\b/i);
  const periodo = trimestre ? ` ${trimestre[2]}T ${trimestre[1]}` : '';
  const envio = buscar(texto, /\b(\d{1,2}) de ([a-z]+) de (\d{4})\b/i);
  const mes = envio ? MESES.indexOf(envio[2].toLowerCase()) + 1 : 0;
  return {
    proveedor: 'Hacienda Foral de Bizkaia',
    numero: buscar(texto, /n\.?\s*º\s*liquidaci[oó]n\s+([A-Z0-9]{6,})/i)?.[1] ?? `${m.modelo}${periodo}`,
    fecha: envio && mes ? `${envio[3]}-${String(mes).padStart(2, '0')}-${envio[1].padStart(2, '0')}` : null,
    total,
    lineas: [gasto(`${m.concepto} (modelo ${m.modelo})${periodo}`, total)],
  };
}

export function sumaLineas(lineas: { importe: number | null }[]): number {
  return redondear(lineas.reduce((t, l) => t + (l.importe ?? 0), 0));
}
