// Recuadros de colores sobre la foto del albarán: dónde ha leído el
// proveedor, la fecha, el número, el total y cada línea (nombre, kg, €/kg,
// importe). Se calculan una vez al leer la foto, comparando lo que ha
// entendido leerAlbaran con la posición de cada palabra, y se guardan con
// la compra (unos pocos KB) para no tener que volver a pasar el OCR.
import { aNumero, normalizarCompra, type AlbaranLeido, type OcrCaja } from './comprasOcr';

export type TipoMarca = 'proveedor' | 'fecha' | 'numero' | 'total' | 'producto' | 'kg' | 'precio' | 'importe' | 'texto';

// Posiciones en milésimas del ancho (x, w) y del alto (y, h) de la imagen
// guardada, para dibujarlas a cualquier tamaño.
export type Marca = [tipo: TipoMarca, x: number, y: number, w: number, h: number];

export interface MarcasAlbaran {
  v: 1;
  m: Marca[];
}

type Trozo = { t: string; x: number; y: number; w: number; h: number; cy: number };

// Cada caja del OCR se parte en palabras, con su posición estimada por la
// de sus letras: «LENGUADO 0,950 48,000 45,60» suele venir en una sola caja.
function palabras(cajas: OcrCaja[]): Trozo[] {
  return cajas.flatMap((c) => {
    const ancho = c.width / Math.max(1, c.text.length);
    return [...c.text.matchAll(/\S+/g)].map((m) => ({
      t: m[0],
      x: c.x + m.index! * ancho,
      y: c.y,
      w: m[0].length * ancho,
      h: c.height,
      cy: c.y + c.height / 2,
    }));
  });
}

function filas(trozos: Trozo[]): Trozo[][] {
  const r: { cy: number; h: number; t: Trozo[] }[] = [];
  for (const t of [...trozos].sort((a, b) => a.cy - b.cy)) {
    const f = r.at(-1);
    if (f && Math.abs(t.cy - f.cy) < Math.min(t.h, f.h) * 0.55) {
      f.t.push(t);
      f.cy = f.t.reduce((s, k) => s + k.cy, 0) / f.t.length;
    } else {
      r.push({ cy: t.cy, h: t.h, t: [t] });
    }
  }
  return r.map((f) => f.t.sort((a, b) => a.x - b.x));
}

const NUM = /^-?\d{1,6}(?:[.,]\d{3})*[.,'’′]\d{1,3}$/;
function numero(t: string): number | null {
  const s = t.replace(/(€|eur|-?r-?|%|:)$/i, '');
  return NUM.test(s) ? aNumero(s) : null;
}
const igual = (a: number | null, b: number | null) => a != null && b != null && Math.abs(a - b) < 0.005;
const limpio = (t: string) => normalizarCompra(t).replace(/[^a-z0-9ñ/+]/g, '');

export function calcularMarcas(cajas: OcrCaja[], leido: AlbaranLeido, ancho: number, alto: number): MarcasAlbaran {
  const lista = filas(palabras(cajas));
  const tipo = new Map<Trozo, TipoMarca>();
  const marcar = (t: Trozo, k: TipoMarca) => {
    if (!tipo.has(t)) tipo.set(t, k);
  };

  // Líneas: la fila donde están al menos dos de sus números, en orden.
  let desde = 0;
  let ultimaFila = -1;
  for (const l of leido.lineas) {
    const valores: [TipoMarca, number | null][] = [
      ['kg', l.kg],
      ['precio', l.precio],
      ['importe', l.importe],
    ];
    let mejor: { i: number; asignados: [Trozo, TipoMarca][] } | null = null;
    for (let i = desde; i < lista.length; i++) {
      const libres = new Set(valores.filter(([, v]) => v != null).map(([k]) => k));
      const asignados: [Trozo, TipoMarca][] = [];
      for (const t of lista[i]) {
        const n = numero(t.t);
        const k = valores.find(([k2, v]) => libres.has(k2) && igual(n, v))?.[0];
        if (k && !tipo.has(t)) {
          libres.delete(k);
          asignados.push([t, k]);
        }
      }
      if (asignados.length >= 2 && (!mejor || asignados.length > mejor.asignados.length)) mejor = { i, asignados };
      if (mejor?.asignados.length === 3) break;
    }
    if (!mejor) continue;
    for (const [t, k] of mejor.asignados) marcar(t, k);
    desde = mejor.i + 1;
    ultimaFila = mejor.i;

    // El nombre: en esa fila o en la de al lado (a veces sale medio renglón
    // más abajo que los números).
    const buscadas = new Set(normalizarCompra(l.texto).split(/\s+/).map(limpio).filter((w) => w.length >= 2));
    let nombre: Trozo[] = [];
    for (const i of [mejor.i, mejor.i + 1, mejor.i - 1]) {
      const encontrados = (lista[i] ?? []).filter((t) => !tipo.has(t) && buscadas.has(limpio(t.t)));
      if (encontrados.length > nombre.length) nombre = encontrados;
    }
    for (const t of nombre) marcar(t, 'producto');
  }

  // Total: el mismo importe en las filas de debajo de la tabla.
  if (leido.total != null) {
    for (const fila of lista.slice(ultimaFila + 1)) for (const t of fila) if (igual(numero(t.t), leido.total)) marcar(t, 'total');
  }

  if (leido.fecha) {
    const [a, m, d] = leido.fecha.split('-').map(Number);
    const t = lista.flat().find((k) => {
      const f = k.t.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})/);
      return f && Number(f[1]) === d && Number(f[2]) === m && Number(f[3]) % 100 === a % 100;
    });
    if (t) marcar(t, 'fecha');
  }

  if (leido.numero && leido.numero.length >= 3) {
    const t = lista.flat().find((k) => !tipo.has(k) && k.t.includes(leido.numero!));
    if (t) marcar(t, 'numero');
  }

  // Proveedor: la fila con más palabras suyas.
  if (leido.proveedor) {
    const buscadas = new Set(normalizarCompra(leido.proveedor).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 3));
    let mejor: Trozo[] = [];
    for (const fila of lista) {
      const encontrados = fila.filter((t) => !tipo.has(t) && buscadas.has(limpio(t.t)));
      if (encontrados.length > mejor.length) mejor = encontrados;
    }
    if (mejor.length >= Math.min(2, buscadas.size)) for (const t of mejor) marcar(t, 'proveedor');
  }

  const caja = (x: number, y: number, w: number, h: number) =>
    [Math.round((x / ancho) * 1000), Math.round((y / alto) * 1000), Math.max(1, Math.round((w / ancho) * 1000)), Math.max(1, Math.round((h / alto) * 1000))] as const;
  // Primero el resto del texto en gris (las cajas tal cual, que son menos)
  // y encima lo que se ha entendido.
  const m: Marca[] = cajas.filter((c) => c.text.trim()).map((c) => ['texto', ...caja(c.x, c.y, c.width, c.height)]);
  for (const [t, k] of tipo) m.push([k, ...caja(t.x, t.y, t.w, t.h)]);
  return { v: 1, m };
}
