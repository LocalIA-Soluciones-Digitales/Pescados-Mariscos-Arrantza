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

export interface AlbaranLeido {
  proveedor: string | null;
  fecha: string | null; // YYYY-MM-DD
  numero: string | null;
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
// «IVA» solo como palabra: «Almeja fina viva» no es la fila del IVA.
const FIN_TABLA = /(\btotal|\bbase\b|base\s*i|subtotal|\bbruto\b|\bsuma\b|\bi\.?\s?v\.?\s?a\b|recargo|observaciones|conforme|l[ií]quido)/i;

// "SALMONETE DE ROC MULLUS SURMULENTUS CS20260902" → sin el lote; "0041
// JUREL" → sin el código; deja tallas como 40/50, 1.5/2 o 400+.
export function limpiarNombre(texto: string): string {
  const tokens = texto.replace(/\s+/g, ' ').trim().split(' ');
  while (tokens.length && /^-?[\d.,'’′]+$/.test(tokens[0])) tokens.shift();
  const corte = tokens.findIndex(
    (t) => /^\d{5,}$/.test(t) || (t.length >= 4 && /[a-z]/i.test(t) && /\d/.test(t) && !/^n[º°o]/i.test(t)),
  );
  const nombre = corte >= 0 ? tokens.slice(0, corte) : tokens;
  // Cajas o envases sueltos al final ("GALLO 200/300 … 6") y restos como "0,".
  while (nombre.length && /^[\d.,'’′]+$/.test(nombre.at(-1)!)) nombre.pop();
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
export const PROVEEDORES_CONOCIDOS: { nombre: string; cif?: string; pistas: string[] }[] = [
  { nombre: 'Pescados y Mariscos Adelaida, S.L.', cif: 'B95719746', pistas: ['adelaida'] },
  { nombre: 'Arraiza Gutiérrez, S.L.', cif: 'B48077069', pistas: ['arraiza', 'pescadosarraiza'] },
  { nombre: 'Arrainko Anaiak, S.L.', cif: 'B75560151', pistas: ['arrainko'] },
  { nombre: 'Pescados Bizkaimar, S.L.U.', cif: 'B95750824', pistas: ['bizkaimar'] },
  { nombre: 'Las Capotinas, S.A.', pistas: ['capotinas'] },
  { nombre: 'Conifres, S.L.', cif: 'B48482376', pistas: ['conifres'] },
  { nombre: 'José Crespo, S.A.', cif: 'A48102883', pistas: ['jose crespo', 'crespopescados'] },
  { nombre: 'Pescados y Mariscos Gaizka, S.L.', cif: 'B95091203', pistas: ['gaizka'] },
  { nombre: 'Pérez Viñas Comercial, S.L.', pistas: ['perez vinas', 'perez vins', 'perez vinns'] },
  { nombre: 'Pescados Triana, S.A.', cif: 'A48161715', pistas: ['triana'] },
  { nombre: 'Pescados Txalupa, S.L.', cif: 'B95681201', pistas: ['txalupa'] },
];

function proveedorConocido(filas: string[]): string | null {
  const todo = filas.join(' ').toUpperCase().replace(/[\s.-]/g, '');
  const porCif = PROVEEDORES_CONOCIDOS.find((p) => p.cif && todo.includes(p.cif));
  if (porCif) return porCif.nombre;
  const cabecera = normalizarCompra(filas.slice(0, 12).join(' '));
  return PROVEEDORES_CONOCIDOS.find((p) => p.pistas.some((k) => cabecera.includes(k)))?.nombre ?? null;
}

function leerProveedor(filas: string[]): string | null {
  const conocido = proveedorConocido(filas);
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

export function leerAlbaran(ocr: OcrCaja[]): AlbaranLeido {
  const cajas = preparar(ocr);
  const filas = agruparFilas(cajas);
  const texto = filas.map(textoFila);
  const r: AlbaranLeido = { proveedor: leerProveedor(texto), fecha: null, numero: leerNumero(texto), total: null, lineas: [], texto };
  for (const l of texto) r.fecha ??= leerFecha(l);

  // 1) Filas de números de producto, por debajo de la cabecera de la tabla.
  const iCab = filas.findIndex((f) => CABECERA.test(textoFila(f)));
  const yCab = iCab >= 0 ? filas[iCab].cy : -Infinity;
  const numericas = cajas.filter((c) => c.cy > yCab && esNumerica(c.text));
  const candidatas = agruparFilas(numericas)
    .map((f) => {
      const nums = f.cajas.flatMap((c) => decimales(c.text.replace(/\s*(€|eur|-?r-?|%)\s*$/i, '')).map((n) => ({ n, x: c.x })));
      return { cy: f.cy, h: f.h, nums: nums.slice(-3), filaTexto: textoFila(f) };
    })
    .filter((f) => f.nums.length >= 2 && !/%/.test(f.filaTexto));

  // 2) La tabla acaba en la primera fila de totales tras el primer producto.
  const yPrimera = candidatas[0]?.cy ?? Infinity;
  const yFin = filas.find((f) => f.cy > yPrimera + 1 && FIN_TABLA.test(textoFila(f)) && !CABECERA.test(textoFila(f)))?.cy ?? Infinity;
  const productos = candidatas.filter((f) => f.cy < yFin - 1);

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
          /[a-zñ]{4,}/i.test(f.nombre) && !/^[(*]/.test(f.crudo.trim()) && !TITULOS.test(f.crudo) && !FIN_TABLA.test(f.crudo) && !CABECERA.test(f.crudo),
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
      const n = p.nums.map((x) => x.n);
      const linea = n.length === 3 ? cuadrarLinea(nombre, n[0], n[1], n[2]) : cuadrarLinea(nombre, n[0], null, n[1]);
      // Una fila de números sin nombre solo cuenta si cuadra, aunque sea
      // corrigiendo un número (si no, es basura).
      if (nombre || linea.estado !== 'revisar') r.lineas.push(linea);
    });
  }

  // 5) Total: el mayor importe tras la tabla que quede entre la suma de las
  // líneas y la suma + IVA + recargo. Sin líneas, el que acompañe a "total".
  const suma = sumaLineas(r.lineas);
  const yTotales = productos.length ? productos.at(-1)!.cy : -Infinity;
  if (suma > 0) {
    const tras = filas.filter((f) => f.cy > yTotales && !/cr[eé]dito|acumulado/i.test(textoFila(f)));
    const posibles = tras.flatMap((f) => decimales(textoFila(f))).filter((n) => n >= suma - 0.05 && n <= suma * 1.3 + 0.05);
    r.total = posibles.length ? Math.max(...posibles) : null;
  }
  if (r.total == null) {
    for (const l of texto) {
      const m = l.match(new RegExp(String.raw`(total|l[ií]quido|a\s+pagar)[^\d-]{0,30}(${NUM})`, 'i'));
      if (m && !/cr[eé]dito/i.test(l)) r.total = aNumero(m[2]);
    }
  }
  return r;
}

export function sumaLineas(lineas: { importe: number | null }[]): number {
  return redondear(lineas.reduce((t, l) => t + (l.importe ?? 0), 0));
}
