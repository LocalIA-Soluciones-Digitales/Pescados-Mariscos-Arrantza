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

  // 1) El mismo documento.
  if (clave.length >= 3) {
    const mismo = vivas.filter(
      (c) => c.tipo === nuevo.tipo && claveNumero(c.numero) === clave && (!c.proveedor || !nuevo.proveedor || mismoProveedor(nuevo.proveedor, c.proveedor)),
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
