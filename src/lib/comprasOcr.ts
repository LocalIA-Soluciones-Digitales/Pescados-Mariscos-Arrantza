// Interpreta lo que el OCR lee de un albarán de compra (Mercabilbao):
// junta los trozos de texto en líneas por su posición y saca proveedor,
// fecha, número, total y las líneas de producto (kg, €/kg, importe).
// El modelo solo localiza y lee letras; todo lo de aquí son reglas
// sencillas, la más importante «kg × €/kg = importe», que delata y
// corrige casi cualquier número mal leído.

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

export interface AlbaranLeido {
  proveedor: string | null;
  fecha: string | null; // YYYY-MM-DD
  numero: string | null;
  base: number | null;
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

// Trozos a la misma altura = misma línea, ordenados de izquierda a derecha.
export function agruparLineas(cajas: OcrCaja[]): string[] {
  const ordenadas = cajas
    .map((c) => ({ ...c, text: c.text.trim(), cy: c.y + c.height / 2 }))
    .filter((c) => c.text)
    .sort((a, b) => a.cy - b.cy);
  const lineas: { cy: number; h: number; cajas: typeof ordenadas }[] = [];
  for (const c of ordenadas) {
    const ultima = lineas.at(-1);
    if (ultima && Math.abs(c.cy - ultima.cy) < Math.min(c.height, ultima.h) * 0.55) ultima.cajas.push(c);
    else lineas.push({ cy: c.cy, h: c.height, cajas: [c] });
  }
  return lineas.map((l) => l.cajas.sort((a, b) => a.x - b.x).map((c) => c.text).join('  '));
}

const NUM = String.raw`\d{1,4}(?:\.\d{3})*[.,]\d{1,3}`;

function aNumero(s: string): number {
  // 1.234,56 / 1,234.56 / 18,4 / 18.40 → el último separador es el decimal
  const limpio = s.replace(/[.,](?=\d{3}(?:[.,]|$))/g, '');
  return Number(limpio.replace(',', '.'));
}

const redondear = (n: number, dec = 2) => Math.round(n * 10 ** dec) / 10 ** dec;

// Si kg × precio no da el importe, el número mal leído suele ser uno solo:
// se recalcula el que haga cuadrar la línea con un valor razonable.
export function cuadrarLinea(texto: string, kg: number | null, precio: number | null, importe: number | null): LineaLeida {
  if (kg != null && precio != null && importe != null) {
    if (Math.abs(kg * precio - importe) <= 0.06) return { texto, kg, precio, importe, estado: 'ok' };
    if (kg > 0) {
      const p = redondear(importe / kg);
      if (p > 0.2 && p < 400) return { texto, kg, precio: p, importe, estado: 'corregida' };
    }
    return { texto, kg, precio, importe, estado: 'revisar' };
  }
  if (kg != null && importe != null && kg > 0) {
    return { texto, kg, precio: redondear(importe / kg), importe, estado: 'corregida' };
  }
  if (kg != null && precio != null) {
    return { texto, kg, precio, importe: redondear(kg * precio), estado: 'corregida' };
  }
  return { texto, kg, precio, importe, estado: 'revisar' };
}

const NO_PRODUCTO = /(base\s*imponible|\biva\b|\btotal\b|\bsubtotal\b|\btel[eé]?f?\b|\bcif\b|\bnif\b|\bfecha\b|\bcliente\b|\bdescuento\b|\bbultos?\b|\bentrega\b|\bp[aá]gina\b)/i;
const LINEA_PRODUCTO = new RegExp(
  // [código] descripción [cajas] kg precio importe
  String.raw`^(?:\d{3,6}\s+)?([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][^\d]*?(?:\s\d+\/\d+|\sn[º°o]\s?\d+)?[^\d]*?)\s+(?:\d{1,3}\s+)?(${NUM})\s+(${NUM})\s+(${NUM})\s*(?:€|eur)?\s*$`,
  'i',
);

const SOLO_NUMEROS = new RegExp(String.raw`^(?:\d{1,3}\s+)?(${NUM})\s+(${NUM})\s+(${NUM})\s*(?:€|eur)?\s*$`, 'i');

function leerFecha(l: string): string | null {
  const m = l.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])];
  if (d < 1 || d > 31 || mes < 1 || mes > 12 || a < 2020 || a > 2100) return null;
  return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function leerProveedor(texto: string[]): string | null {
  const conLetras = texto.slice(0, 6).filter((l) => /[A-Za-z]{3,}/.test(l));
  const empresa = conLetras.find((l) => /\b(s\.?\s?l\.?u?|s\.?\s?a\.?|s\.?\s?coop|pescados?|mariscos?|frigor[ií]ficos?|distribuci)/i.test(l));
  const elegido = empresa ?? conLetras.find((l) => !/albar[aá]n|fecha|cliente|cif|nif|tel/i.test(l));
  return elegido ? elegido.replace(/\s{2,}/g, ' ').trim() : null;
}

export function leerAlbaran(texto: string[]): AlbaranLeido {
  const r: AlbaranLeido = { proveedor: leerProveedor(texto), fecha: null, numero: null, base: null, total: null, lineas: [], texto };
  for (const l of texto) {
    r.fecha ??= leerFecha(l);
    r.numero ??= l.match(/albar[aá]n\b.*?n[º°o.]*\s*:?\s*([A-Z]{0,3}-?\d[\dA-Z/-]{2,})/i)?.[1] ?? null;
    const base = l.match(new RegExp(String.raw`base\s*imponible[^\d]*(${NUM})`, 'i'));
    if (base) r.base = aNumero(base[1]);
    // El último «total» con número gana (el título de columna «Total» no lleva número).
    const tot = l.match(new RegExp(String.raw`\btotal\b(?!\s*l[ií]neas)[^\d]*(${NUM})`, 'i'));
    if (tot && !/sub\s*total/i.test(l)) r.total = aNumero(tot[1]);

    const m = l.match(LINEA_PRODUCTO);
    const soloNumeros = l.match(SOLO_NUMEROS);
    if (m && !NO_PRODUCTO.test(m[1])) {
      r.lineas.push(cuadrarLinea(m[1].replace(/\s{2,}/g, ' ').trim(), aNumero(m[2]), aNumero(m[3]), aNumero(m[4])));
    } else if (soloNumeros) {
      // El nombre se ha perdido (a veces se funde con la línea de arriba)
      // pero kg × precio = importe: es un producto, David elige cuál.
      const linea = cuadrarLinea('', aNumero(soloNumeros[1]), aNumero(soloNumeros[2]), aNumero(soloNumeros[3]));
      if (linea.estado === 'ok') r.lineas.push(linea);
    } else if (/^(?:\d{3,6}\s+)?[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}.*\d[.,]\d{2}/.test(l) && !NO_PRODUCTO.test(l)) {
      // Parece un producto pero le falta algún número: se deja para revisar
      // con los que se hayan leído (el último suele ser el importe).
      const nums = [...l.matchAll(new RegExp(NUM, 'g'))].map((x) => aNumero(x[0]));
      const nombre = l.replace(new RegExp(String.raw`(\s+(?:${NUM}|\d{1,3}))+\s*$`), '').replace(/^\d{3,6}\s+/, '').trim();
      const [kg, precio, importe] =
        nums.length >= 3 ? nums.slice(-3) : nums.length === 2 ? [nums[0], null, nums[1]] : [null, null, nums[0] ?? null];
      r.lineas.push(cuadrarLinea(nombre, kg, precio, importe));
    }
  }
  return r;
}

export function sumaLineas(lineas: { importe: number | null }[]): number {
  return redondear(lineas.reduce((t, l) => t + (l.importe ?? 0), 0));
}
