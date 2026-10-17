// ¿Este albarán o factura ya está contado? David sube la foto del albarán
// en papel y además llegan por email las facturas (y algunos albaranes en
// PDF): el mismo género puede entrar dos veces.
//
// Regla: cuenta el primero que entra; lo que llega después y coincide no se
// guarda (o, si es una factura que solo cubre parte, cuenta la diferencia).
//   · Albarán a mano: no se lee → cuenta la factura del email (llega antes,
//     o la foto no tiene total y solo se avisa).
//   · Factura semanal: sus albaranes ya entraron por foto → no cuenta.
import { claveNumero, mismoProveedor } from './comprasHojas';

export interface DocCompra {
  id: string;
  estado: string;
  tipo: 'albaran' | 'factura';
  proveedor: string | null;
  numero: string | null;
  fecha: string; // YYYY-MM-DD
  total: number | null;
  albaranes: string[];
}

export type DocNuevo = Omit<DocCompra, 'id' | 'estado'>;

export type Coincidencia<T> =
  // El mismo documento (mismo nº y proveedor): papel + PDF del email.
  | { tipo: 'mismo'; con: T[] }
  // Albarán que ya va dentro de una factura guardada.
  | { tipo: 'en_factura'; con: T[] }
  // Factura cuyos albaranes ya están todos guardados.
  | { tipo: 'cubierta'; con: T[] }
  // Factura con parte de sus albaranes ya guardados: cuenta `resto`.
  | { tipo: 'parcial'; con: T[]; resto: number }
  // Puede ser el mismo, pero no hay con qué comprobarlo (foto sin total):
  // solo se avisa.
  | { tipo: 'posible'; con: T[] };

const DIAS_FACTURA = 35;
const MAX_SUBCONJUNTO = 14;

const redondear = (n: number) => Math.round(n * 100) / 100;
// Mismo importe, con margen para el redondeo de IVA línea a línea.
const mismoImporte = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.002);

function dias(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);
}

const delProveedor = (c: { proveedor: string | null }, proveedor: string | null) =>
  !!c.proveedor && !!proveedor && mismoProveedor(proveedor, c.proveedor);

// Albaranes cuyo total suma `total` (todos los subconjuntos hasta
// MAX_SUBCONJUNTO candidatos; con más, solo los más cercanos en fecha).
function subconjuntoQueSuma<T extends DocCompra>(candidatos: T[], total: number): T[] | null {
  const lista = candidatos.slice(0, MAX_SUBCONJUNTO);
  const n = lista.length;
  let mejor: T[] | null = null;
  for (let mask = 1; mask < 1 << n; mask++) {
    let suma = 0;
    const elegidos: T[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        suma += lista[i].total!;
        elegidos.push(lista[i]);
      }
    }
    if (mismoImporte(suma, total) && (!mejor || elegidos.length < mejor.length)) mejor = elegidos;
  }
  return mejor;
}

export function buscarCoincidencia<T extends DocCompra>(nuevo: DocNuevo, compras: T[], excepto?: string): Coincidencia<T> | null {
  const vivas = compras.filter((c) => c.id !== excepto && c.estado !== 'anulada');
  const clave = claveNumero(nuevo.numero);

  // 1) El mismo documento. Una captura de la factura del PDF puede haberse
  // leído como albarán (Conifres M10780: foto + email): con otro tipo hace
  // falta además el mismo proveedor y, si se sabe, el mismo total.
  if (clave.length >= 3) {
    const mismo = vivas.filter(
      (c) =>
        claveNumero(c.numero) === clave &&
        (c.tipo === nuevo.tipo
          ? !c.proveedor || !nuevo.proveedor || mismoProveedor(nuevo.proveedor, c.proveedor)
          : delProveedor(c, nuevo.proveedor) && (c.total == null || nuevo.total == null || mismoImporte(c.total, nuevo.total))),
    );
    if (mismo.length) return { tipo: 'mismo', con: mismo };
  }

  const facturas = vivas.filter((c) => c.tipo === 'factura' && delProveedor(c, nuevo.proveedor));
  const albaranes = vivas.filter((c) => c.tipo !== 'factura' && delProveedor(c, nuevo.proveedor));

  if (nuevo.tipo === 'albaran') {
    // 2) Una factura guardada que nombra este albarán…
    if (clave.length >= 3) {
      const f = facturas.filter((c) => c.albaranes.some((a) => claveNumero(a) === clave));
      if (f.length) return { tipo: 'en_factura', con: f };
    }
    // …o una factura del mismo día por el mismo importe (albarán a mano).
    const cerca = facturas.filter((c) => !c.albaranes.length && Math.abs(dias(c.fecha, nuevo.fecha)) <= 1);
    if (nuevo.total != null) {
      const f = cerca.filter((c) => c.total != null && mismoImporte(c.total, nuevo.total!));
      if (f.length) return { tipo: 'en_factura', con: f };
    } else if (cerca.length) {
      return { tipo: 'posible', con: cerca };
    }
    // La misma foto subida dos veces: albarán sin nº del mismo día y total.
    // Otro día con el mismo importe es otro pedido (José Crespo repite a
    // menudo 2 kg de langostino), así que solo se avisa.
    if (nuevo.total != null && clave.length < 3) {
      const igual = albaranes.filter((c) => c.fecha === nuevo.fecha && c.total != null && mismoImporte(c.total, nuevo.total!) && claveNumero(c.numero).length < 3);
      if (igual.length) return { tipo: 'posible', con: igual };
    }
    return null;
  }

  // 3) Factura que nombra sus albaranes.
  if (nuevo.albaranes.length) {
    const claves = new Set(nuevo.albaranes.map(claveNumero));
    const ya = albaranes.filter((c) => claves.has(claveNumero(c.numero)));
    if (!ya.length) return null;
    const suma = redondear(ya.reduce((t, c) => t + (c.total ?? 0), 0));
    if (ya.length >= claves.size || (nuevo.total != null && mismoImporte(suma, nuevo.total))) return { tipo: 'cubierta', con: ya };
    if (nuevo.total == null) return { tipo: 'posible', con: ya };
    return { tipo: 'parcial', con: ya, resto: redondear(nuevo.total - suma) };
  }

  // 4) Factura sin nº de albaranes: albaranes del proveedor de las semanas
  // anteriores que no estén ya en otra factura y sumen lo mismo.
  if (nuevo.total == null) return null;
  const enOtra = new Set(facturas.flatMap((f) => f.albaranes.map(claveNumero)));
  const candidatos = albaranes
    .filter((c) => c.total != null && !enOtra.has(claveNumero(c.numero)))
    .filter((c) => {
      const d = dias(nuevo.fecha, c.fecha);
      return d >= -1 && d <= DIAS_FACTURA;
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const exacto = candidatos.filter((c) => mismoImporte(c.total!, nuevo.total!));
  if (exacto.length) return { tipo: 'cubierta', con: [exacto[0]] };
  const suma = subconjuntoQueSuma(candidatos, nuevo.total);
  if (suma) return { tipo: 'cubierta', con: suma };
  // Un albarán del mismo día sin total (a mano, sin leer): solo se avisa.
  const sinTotal = vivas.filter((c) => c.tipo !== 'factura' && delProveedor(c, nuevo.proveedor) && c.total == null && Math.abs(dias(c.fecha, nuevo.fecha)) <= 1);
  return sinTotal.length ? { tipo: 'posible', con: sinTotal } : null;
}

// ¿Dos lecturas del mismo documento traen las mismas líneas? Se comparan
// kg e importes (los nombres cambian entre la foto y el PDF).
export function mismasLineas(a: { kg: number | null; importe: number | null }[], b: { kg: number | null; importe: number | null }[]): boolean {
  const clave = (l: { kg: number | null; importe: number | null }) => `${redondear(l.kg ?? 0)}|${redondear(l.importe ?? 0)}`;
  const ordenar = (ls: typeof a) => ls.filter((l) => l.importe != null && l.importe !== 0).map(clave).sort().join(';');
  return ordenar(a) === ordenar(b);
}

type LineaImporte = { kg: number | null; importe: number | null };
type ConLineas = { total: number | null; lineas: LineaImporte[] };

const conImporte = (ls: LineaImporte[]) => ls.filter((l) => l.importe != null && l.importe !== 0);
const claveLinea = (l: LineaImporte) => `${redondear(l.kg ?? 0)}|${redondear(l.importe ?? 0)}`;

// ¿Todas las líneas de `a` salen en `b`? (una por una, kg e importe)
function lineasDentro(a: LineaImporte[], b: LineaImporte[]): boolean {
  const resto = conImporte(b).map(claveLinea);
  return conImporte(a).every((l) => {
    const i = resto.indexOf(claveLinea(l));
    if (i < 0) return false;
    resto.splice(i, 1);
    return true;
  });
}

// Mismos productos y precios (kg e importe) y mismo total. Lo que no se
// sabe (foto sin total, albarán a mano sin líneas) no cuenta, pero algo
// tiene que poder compararse.
function mismoContenido(a: ConLineas, b: ConLineas): boolean {
  const total = a.total != null && b.total != null ? mismoImporte(a.total, b.total) : null;
  const lineas = conImporte(a.lineas).length && conImporte(b.lineas).length ? mismasLineas(a.lineas, b.lineas) : null;
  if (total == null && lineas == null) return false;
  return total !== false && lineas !== false;
}

// El nº (o el total) coincide, pero ¿es de verdad lo mismo? Solo si además
// traen los mismos productos, precios y total; si no, es otra compra
// (Adelaida: el albarán A26/5.055 nombrado en la factura A26/2.905, que
// lleva además un abono y otro total).
export function confirmarCoincidencia<T extends DocCompra & ConLineas>(c: Coincidencia<T>, nuevo: ConLineas): boolean {
  switch (c.tipo) {
    case 'mismo':
    case 'en_factura':
      return c.con.some((d) => mismoContenido(d, nuevo));
    case 'cubierta':
      return mismoContenido(
        { total: c.con.some((d) => d.total == null) ? null : redondear(c.con.reduce((t, d) => t + d.total!, 0)), lineas: c.con.flatMap((d) => d.lineas) },
        nuevo,
      );
    default:
      return false;
  }
}

// Para los avisos: «ya está: albarán nº 5055 del 16 oct».
export function describirCoincidencia<T extends DocCompra>(c: Coincidencia<T>, fecha: (iso: string) => string): string {
  const doc = (d: T) => `${d.tipo === 'factura' ? 'la factura' : 'el albarán'}${d.numero ? ` nº ${d.numero}` : ''} del ${fecha(d.fecha)}`;
  const lista = c.con.map(doc).join(', ');
  switch (c.tipo) {
    case 'mismo':
      return `Ya está guardado: ${lista}.`;
    case 'en_factura':
      return `Ya va dentro de ${lista}.`;
    case 'cubierta':
      return `Sus albaranes ya están guardados: ${lista}.`;
    case 'parcial':
      return `Parte ya está guardada (${lista}): solo cuenta la diferencia.`;
    case 'posible':
      return `Puede ser lo mismo que ${lista}: compruébalo antes de confirmar.`;
  }
}

// Parecía repetido pero no coinciden productos, precios o total: se guarda
// como otra compra. Si aun así sus líneas salen en lo guardado, se avisa
// para que no se cuente dos veces sin querer.
export function describirNoCoincide<T extends DocCompra & ConLineas>(c: Coincidencia<T>, nuevo: ConLineas, fecha: (iso: string) => string): string {
  const doc = (d: T) => `${d.tipo === 'factura' ? 'la factura' : 'el albarán'}${d.numero ? ` nº ${d.numero}` : ''} del ${fecha(d.fecha)}`;
  const lista = c.con.map(doc).join(', ');
  const parecido = c.tipo === 'mismo' ? `Tiene el mismo nº que ${lista}` : `Se nombra o suma como ${lista}`;
  const dentro = conImporte(nuevo.lineas).length > 0 && lineasDentro(nuevo.lineas, c.con.flatMap((d) => d.lineas));
  return (
    `${parecido}, pero no coinciden los productos, los precios o el total: se cuenta como otra compra.` +
    (dentro ? ' Ojo: sus productos también salen allí; si es la misma compra, anula una de las dos.' : '')
  );
}
