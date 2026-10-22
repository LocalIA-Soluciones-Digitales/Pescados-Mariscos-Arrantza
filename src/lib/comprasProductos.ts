// De qué producto nuestro es cada línea de un albarán, y lectura de las
// líneas dictadas por voz.
//
// Orden para elegir el producto de una línea:
//   1. Memoria (compras_alias): lo que se eligió otras veces para ese mismo
//      nombre, primero de ese proveedor y si no de cualquiera.
//   2. Parecido de nombres: los albaranes escriben en castellano y abreviado
//      («FILETE BACALAO G», «CHICHARRO 400+», «BAC.DESALADO») y nuestros
//      productos en vasco («Filete de Bakalao…», «Txitxarro», «Lomo de
//      Bakalao Desalado»), así que se comparan palabras ya igualadas.
//   3. Nada: «Sin producto». HIELO, TRANSPORTE o ENVASES nunca son producto.
//
// La memoria también guarda lo que no es producto: una línea sin producto
// que David quita al revisar (p. ej. «Forma de pago…» leída como línea) se
// recuerda con producto_id null y ya no sale en los albaranes de ese
// proveedor.
import { esProveedorGasto, normalizarCompra, type LineaLeida } from './comprasOcr';
import type { CompraLinea } from '@/types/compra';

export interface ProductoBasico {
  id: string;
  nombre_es: string;
  gestion_stock?: boolean;
}

export interface AliasBasico {
  proveedor_norm: string;
  texto_norm: string;
  // null: «esto no es producto» (David quitó la línea).
  producto_id: string | null;
}

// ¿David ha quitado esta línea otras veces en albaranes de este proveedor?
export function esLineaQuitada(texto: string, proveedor: string | null, alias: AliasBasico[]): boolean {
  const t = normalizarCompra(texto);
  const p = normalizarCompra(proveedor);
  return !!t && alias.some((a) => a.producto_id == null && a.texto_norm === t && a.proveedor_norm === p);
}

// Líneas leídas → líneas de la compra, con el producto propuesto y sin las
// que David quita siempre (`quitadas`, para avisarle de que se han quitado).
export function lineasDeCompra(
  leidas: LineaLeida[],
  proveedor: string | null,
  alias: AliasBasico[],
  productos: ProductoBasico[],
  // Gasto sin género (limpieza, agua…): ni producto ni stock.
  gasto = false,
  // Documento atrasado: ese género ya se vendió (y David lo apuntó a mano),
  // así que se propone el producto pero no se suma al stock.
  atrasado = false,
): { lineas: CompraLinea[]; quitadas: string[] } {
  const quitadas = leidas.filter((l) => esLineaQuitada(l.texto, proveedor, alias)).map((l) => l.texto);
  const lineas = leidas
    .filter((l) => !esLineaQuitada(l.texto, proveedor, alias))
    .map((l) => ({
      texto: l.texto,
      kg: l.kg,
      precio: l.precio,
      importe: l.importe,
      producto_id: gasto ? null : (sugerirProducto(l.texto, proveedor, alias, productos)?.id ?? null),
      sumar_stock: !gasto && !atrasado && !NO_PRODUCTO.test(l.texto),
    }));
  return { lineas, quitadas };
}

// Más de 3 días antes de hoy: el género ya no está en la tienda.
export const DIAS_ATRASADO = 3;
export function esAtrasado(fecha: string | null, hoy = new Date()): boolean {
  if (!fecha) return false;
  const dias = (Date.parse(`${hoy.toLocaleDateString('sv-SE')}T12:00:00Z`) - Date.parse(`${fecha}T12:00:00Z`)) / 86_400_000;
  return dias > DIAS_ATRASADO;
}
export const notaAtrasado = (fecha: string) =>
  `Es del ${fecha.slice(8, 10)}-${fecha.slice(5, 7)}-${fecha.slice(0, 4)}: no suma al stock (ese género ya se vendió). Si aún lo tienes, marca «Stock» en sus líneas.`;

export const notaQuitadas = (quitadas: string[]) =>
  quitadas.length ? `Quitada${quitadas.length > 1 ? 's' : ''} como otras veces: ${quitadas.join(' · ')}.` : null;

export interface Sugerencia {
  id: string;
  // 'recordado': ya se eligió antes para este nombre · 'parecido': por
  // nombre, David debería mirarlo la primera vez.
  motivo: 'recordado' | 'parecido';
}

const VACIAS = new Set(['de', 'del', 'la', 'el', 'al', 'y', 'con', 'sin', 'en', 'a', 'kg', 'ud', 'uds', 'g', 'gr', 'p']);

// Abreviaturas habituales en los albaranes de Mercabilbao.
const ABREVIATURAS: Record<string, string> = {
  cdo: 'cocido', coc: 'cocido', cocid: 'cocido', cong: 'congelado', fte: 'filete', fil: 'filete',
  bac: 'bacalao', lgno: 'langostino', lgtno: 'langostino', mej: 'mejillon',
};

// Mismo pescado, otro nombre (todo ya escrito como lo deja `canon`).
const SINONIMOS: Record<string, string> = {
  jurel: 'chicharro', chicharrito: 'chicharrito', thunnus: 'bonito', alalunga: 'bonito', pixin: 'rape',
  legatza: 'merluza', antxoa: 'anchoa', bocarte: 'anchoa', boqueron: 'anchoa', bacaladilla: 'lirio',
  mulus: 'salmonete', nekora: 'necora', txangurro: 'changurro', chirla: 'chirla', zamburina: 'zamburina',
  // Capotinas llama «volanta» a la merluza (confirmado por David, 17-10).
  volanta: 'merluza',
  // Gaizka: «ABACANTO CANADIENSE» = Bogavante de Canadá (David, 17-10).
  abacanto: 'bogavante', canadiense: 'canada',
  // Kazaeder: «VIRREY» (alfonsino) es nuestro Rey (David, 18-10).
  virrey: 'rey',
};

export const NO_PRODUCTO = /\b(hielo|transporte|portes?|envases?|cajas?|bolsas?|palets?|gastos?)\b/i;

// «MERLUZA-CARIOCA-PESCADILLA / Merluccius Merluccius» (Adelaida) o
// «MERLUZA (MERLUCCIUS MERLUCCIUS)» (Bizkaimar) sirven igual para la merluza
// que para la pescadilla: solo cambia el precio. Hasta que David confirme una
// regla (¿por precio?), no se propone nada ni se usa la memoria: lo elige él
// en cada albarán. «Volanta», kokotxas, colas, etc. sí dicen lo que son.
export function esMerluzaGenerica(texto: string): boolean {
  const t = normalizarCompra(texto);
  return /\b(merluza|merluccius|pescadilla)\b/.test(t) && !/volanta|kokotxa|cocochas?|\bcolas?\b|pintxo|pincho|lomos?|filetes?|rodajas?|chilena/.test(t);
}

// Igualar escritura vasca y castellana y quitar plurales: «Txitxarro» y
// «CHICHARRO» quedan iguales, igual que «Bakalao»/«BACALAO» o «Lirios»/«LIRIO».
export function canon(palabra: string): string {
  let p = normalizarCompra(palabra).replace(/[^a-z0-9/+]/g, '');
  p = p.replace(/tx/g, 'ch').replace(/tz/g, 'z').replace(/k/g, 'c');
  if (p.length > 4 && p.endsWith('es') && !p.endsWith('ces')) p = p.slice(0, -2);
  else if (p.length > 4 && p.endsWith('s')) p = p.slice(0, -1);
  return SINONIMOS[p] ?? ABREVIATURAS[p] ?? p;
}

function palabras(texto: string): string[] {
  return normalizarCompra(texto)
    .replace(/\(.*?\)/g, ' ') // "(1/2 kg)", "(congelado)"
    .replace(/(\d+)\s*-\s*(\d+)/g, '$1/$2') // tallas 30-40 → 30/40
    .split(/[\s.,;:]+/)
    .map(canon)
    .filter((p) => p && !VACIAS.has(p));
}

// 2 = misma palabra · 1,5 = abreviada («BAC.» → bacalao, «LANG» →
// langostino) o pegada a otra por el OCR («SALMONETEDEROC» → salmonete).
// Más un poco por cada letra que coincide de verdad, para desempatar: así
// «LANGOSTINO CDO 30-40» va a Langostino Cocido, que es como se vende en la
// báscula (el 30/40 es el crudo).
function coincide(a: string, p: string): number {
  if (a === p) return 2 + p.length * 0.01;
  if (!/^[a-z]+$/.test(a)) return 0;
  if (a.length >= 3 && p.length >= 5 && p.startsWith(a)) return 1.5 + a.length * 0.01;
  if (p.length >= 5 && a.length >= p.length + 3 && a.startsWith(p)) return 1.5 + p.length * 0.01;
  return 0;
}

// Puntos: por cada palabra del producto, lo que valga su coincidencia en el
// albarán, y −0,5 si no aparece; a igualdad, gana el nombre más largo que
// coincide (Salmonete antes que Salmón). Un producto con « / » («Sapito /
// Rape») cuenta cada nombre aparte; la barra de una talla («30/40») no.
function puntuar(albaran: string[], nombreProducto: string): number {
  let mejor = -Infinity;
  for (const alternativa of nombreProducto.split(/\s+\/\s*|\s*\/\s+/)) {
    const ps = palabras(alternativa);
    if (!ps.length) continue;
    let puntos = 0;
    let util = false;
    for (const p of ps) {
      const v = Math.max(0, ...albaran.map((a) => coincide(a, p)));
      puntos += v || -0.5;
      // Al menos una palabra con chicha (no solo la talla o un número); de 3
      // letras («Rey») solo si es la palabra entera.
      if (v && (/[a-z]{4,}/.test(p) || (v >= 2 && /^[a-z]{3}$/.test(p)))) util = true;
    }
    if (util) mejor = Math.max(mejor, puntos);
  }
  return mejor;
}

// El lector no siempre lee igual el mismo artículo del mismo proveedor:
// «[4002] CAMARON COCIDO…» / «CAMARON COCIDO…» (Conifres) o
// «ZAPATERO/PALOMETA / LITHOGNATHUS MORMYRUS (» cortado en
// «zapatero/palometa / lithognathus» (Adelaida). Se quita el código del
// principio y el paréntesis sin cerrar del final, y vale si uno empieza por el
// otro hasta el final de una palabra.
function claveMemoria(texto: string): string {
  return normalizarCompra(texto)
    .replace(/^\[\d+\]\s*/, '')
    .replace(/\([^)]*$/, '')
    .replace(/[\s/.,;:-]+$/, '')
    .trim();
}
function mismaLectura(a: string, b: string): boolean {
  if (a === b) return true;
  const [corta, larga] = a.length <= b.length ? [a, b] : [b, a];
  return corta.length >= 5 && larga.startsWith(corta) && /^[\s/(-]/.test(larga.slice(corta.length));
}

// Lo que David ya eligió para otra lectura del mismo artículo de este
// proveedor; solo si todas esas lecturas van al mismo producto («LUBINA» a
// secas no vale: «LUBINA 800/900» y «LUBINA 1100/1400» son productos distintos).
function recordadoParecido(texto: string, proveedor: string, alias: AliasBasico[], productos: ProductoBasico[]): string | null {
  const t = claveMemoria(texto);
  if (!t) return null;
  const ids = new Set(alias.filter((a) => a.proveedor_norm === proveedor && mismaLectura(t, claveMemoria(a.texto_norm))).map((a) => a.producto_id));
  if (ids.size !== 1) return null;
  const [id] = [...ids];
  return id && productos.some((x) => x.id === id) ? id : null;
}

export function sugerirProducto(
  texto: string,
  proveedor: string | null,
  alias: AliasBasico[],
  productos: ProductoBasico[],
): Sugerencia | null {
  const t = normalizarCompra(texto);
  if (!t || esMerluzaGenerica(texto)) return null;
  const p = normalizarCompra(proveedor);
  const delProveedor = alias.find((a) => a.texto_norm === t && a.proveedor_norm === p);
  if (delProveedor && delProveedor.producto_id == null) return null;
  const recordado = delProveedor ?? alias.find((a) => a.texto_norm === t && a.producto_id != null);
  if (recordado?.producto_id && productos.some((x) => x.id === recordado.producto_id)) return { id: recordado.producto_id, motivo: 'recordado' };
  const otraLectura = delProveedor ? null : recordadoParecido(texto, p, alias, productos);
  if (otraLectura) return { id: otraLectura, motivo: 'recordado' };
  if (NO_PRODUCTO.test(t)) return null;

  // «JUREL/ CHICHARRO» son dos nombres; la barra de una talla («30/40») no.
  const albaran = palabras(texto.replace(/(?<!\d)\/|\/(?!\d)/g, ' '));
  let mejor: { id: string; puntos: number; stock: boolean; largo: number } | null = null;
  for (const prod of productos) {
    const puntos = puntuar(albaran, prod.nombre_es);
    if (puntos < 1.5) continue;
    const cand = { id: prod.id, puntos, stock: !!prod.gestion_stock, largo: prod.nombre_es.length };
    // Empate: mejor el que lleva control de stock, y si no el nombre más corto.
    if (
      !mejor ||
      cand.puntos > mejor.puntos ||
      (cand.puntos === mejor.puntos && (cand.stock > mejor.stock || (cand.stock === mejor.stock && cand.largo < mejor.largo)))
    ) {
      mejor = cand;
    }
  }
  return mejor ? { id: mejor.id, motivo: 'parecido' } : null;
}

// Lo que David tiene que mirar a mano antes de confirmar una línea:
// 'sin_producto' = no se ha sabido ligar a un producto nuestro ·
// 'parecido' = elegido solo por parecido de nombre (puede estar mal) ·
// 'merluza' = la factura no dice si es merluza o pescadilla.
// No cuentan los gastos (agua, limpieza…), el hielo o los portes, ni lo
// que David ya quitó otras veces.
export type DudaLinea = 'sin_producto' | 'parecido' | 'merluza';
export function dudaLinea(
  linea: { texto: string; producto_id: string | null; importe?: number | null },
  proveedor: string | null,
  alias: AliasBasico[],
  productos: ProductoBasico[],
): DudaLinea | null {
  if (esProveedorGasto(proveedor)) return null;
  if (!linea.producto_id) {
    if (!linea.texto.trim()) return linea.importe != null ? 'sin_producto' : null;
    if (NO_PRODUCTO.test(linea.texto) || esLineaQuitada(linea.texto, proveedor, alias)) return null;
    return esMerluzaGenerica(linea.texto) ? 'merluza' : 'sin_producto';
  }
  const s = sugerirProducto(linea.texto, proveedor, alias, productos);
  return s?.motivo === 'parecido' && s.id === linea.producto_id ? 'parecido' : null;
}

/* ------------------------------------------------------------------ */
/*  Dictado por voz                                                    */
/* ------------------------------------------------------------------ */

export interface LineaDictada {
  texto: string;
  kg: number | null;
  precio: number | null;
}

const NUMEROS_PALABRA: Record<string, string> = {
  cero: '0', un: '1', uno: '1', una: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7', ocho: '8',
  nueve: '9', diez: '10', once: '11', doce: '12', trece: '13', catorce: '14', quince: '15', dieciseis: '16',
  diecisiete: '17', dieciocho: '18', diecinueve: '19', veinte: '20', treinta: '30', cuarenta: '40', cincuenta: '50',
};

// "rape 4,64 kilos a 21,50" · "nécora dos coma dos a 16 con 80 euros" ·
// "buey medio kilo a 26" → producto, kg y €/kg (el importe se calcula).
export function leerDictado(frase: string): LineaDictada {
  let t = ` ${normalizarCompra(frase)} `
    .replace(/\bmedio kilo\b/g, ' 0,5 kilos ')
    .replace(/\bkilo y medio\b/g, ' 1,5 kilos ')
    .replace(/\b(\d+) y medio\b/g, ' $1,5 ')
    .replace(/[a-z]+/g, (w) => NUMEROS_PALABRA[w] ?? w)
    .replace(/(\d)\s*(?:coma|con|punto)\s*(\d)/g, '$1,$2')
    .replace(/(\d)\.(\d)/g, '$1,$2')
    .replace(/€/g, ' euros ');
  t = t.replace(/\s+/g, ' ').trim();
  const nums = [...t.matchAll(/\d+(?:,\d+)?/g)];
  const aNum = (s: string) => Number(s.replace(',', '.'));
  const primero = nums[0];
  const texto = (primero ? t.slice(0, primero.index) : t)
    .replace(/\b(kilos?|kg|a|de|el|la)\s*$/g, '')
    .trim();
  return {
    texto: texto.toUpperCase(),
    kg: primero ? aNum(primero[0]) : null,
    precio: nums[1] ? aNum(nums[1][0]) : null,
  };
}
