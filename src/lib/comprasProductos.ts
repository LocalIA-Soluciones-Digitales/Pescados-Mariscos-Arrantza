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
import { normalizarCompra } from './comprasOcr';

export interface ProductoBasico {
  id: string;
  nombre_es: string;
  gestion_stock?: boolean;
}

export interface AliasBasico {
  proveedor_norm: string;
  texto_norm: string;
  producto_id: string;
}

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
};

export const NO_PRODUCTO = /\b(hielo|transporte|portes?|envases?|cajas?|bolsas?|palets?|gastos?)\b/i;

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
// Más un poco por cada letra que coincide de verdad, para desempatar.
function coincide(a: string, p: string): number {
  if (a === p) return 2 + p.length * 0.01;
  if (!/^[a-z]+$/.test(a)) return 0;
  if (a.length >= 3 && p.length >= 5 && p.startsWith(a)) return 1.5 + a.length * 0.01;
  if (p.length >= 5 && a.length >= p.length + 3 && a.startsWith(p)) return 1.5 + p.length * 0.01;
  return 0;
}

// Puntos: por cada palabra del producto, lo que valga su coincidencia en el
// albarán, y −0,5 si no aparece; a igualdad, gana el nombre más largo que
// coincide (Salmonete antes que Salmón). Un producto con «/» («Sapito /
// Rape») cuenta cada nombre aparte.
function puntuar(albaran: string[], nombreProducto: string): number {
  let mejor = -Infinity;
  for (const alternativa of nombreProducto.split('/')) {
    const ps = palabras(alternativa);
    if (!ps.length) continue;
    let puntos = 0;
    let util = false;
    for (const p of ps) {
      const v = Math.max(0, ...albaran.map((a) => coincide(a, p)));
      puntos += v || -0.5;
      // Al menos una palabra con chicha (no solo la talla o un número).
      if (v && /[a-z]{4,}/.test(p)) util = true;
    }
    if (util) mejor = Math.max(mejor, puntos);
  }
  return mejor;
}

export function sugerirProducto(
  texto: string,
  proveedor: string | null,
  alias: AliasBasico[],
  productos: ProductoBasico[],
): Sugerencia | null {
  const t = normalizarCompra(texto);
  if (!t) return null;
  const p = normalizarCompra(proveedor);
  const recordado = alias.find((a) => a.texto_norm === t && a.proveedor_norm === p) ?? alias.find((a) => a.texto_norm === t);
  if (recordado && productos.some((x) => x.id === recordado.producto_id)) return { id: recordado.producto_id, motivo: 'recordado' };
  if (NO_PRODUCTO.test(t)) return null;

  const albaran = palabras(texto.replace(/\//g, ' '));
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
