// Listado semanal del gremio de minoristas («LISTADO RECIBOS ENTREGADOS»):
// la lista de facturas de cada mayorista de Mercabilbao. No es una compra
// (no cuenta como gasto ni suma stock): solo sirve para ver si en Compras
// está todo lo que el gremio dice que se ha comprado.
import { normalizarCompra, PROVEEDORES_CONOCIDOS, unificarProveedor, type ReciboListado } from './comprasOcr';

type CompraBasica = { proveedor: string | null; fecha: string; numero: string | null; total: number | null; estado: string };

export interface ContrasteListado {
  total: number;
  recibos: number;
  // En Gastos con el mismo importe (o el mismo nº).
  estan: number;
  faltan: ReciboListado[];
  // Mismo nº de factura (o mismo día) pero otro importe.
  distintos: { recibo: ReciboListado; guardado: number | null }[];
  // En Gastos de un mayorista del listado, en esas fechas, y que el
  // listado no trae: repetidas o con el proveedor mal puesto.
  sobran: CompraBasica[];
}

const dias = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
// «013337» y «13337», «M10780» y «M-10780» son el mismo nº.
const claveNumero = (n: string | null) => (n ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');

export function contrastarListado(recibos: ReciboListado[], compras: CompraBasica[]): ContrasteListado {
  const vivas = compras.filter((c) => c.estado !== 'anulada' && c.proveedor);
  const conocidos = vivas.map((c) => c.proveedor!);
  const usadas = new Set<CompraBasica>();
  const r: ContrasteListado = { total: 0, recibos: recibos.length, estan: 0, faltan: [], distintos: [], sobran: [] };
  const delProveedor = (rec: ReciboListado) => {
    const prov = normalizarCompra(unificarProveedor(rec.proveedor, conocidos));
    return vivas.filter((c) => !usadas.has(c) && normalizarCompra(c.proveedor) === prov);
  };
  const mismoImporte = (c: CompraBasica, rec: ReciboListado) => c.total != null && Math.abs(c.total - rec.importe) <= 0.05;
  r.total = recibos.reduce((t, rec) => t + rec.importe, 0);
  // Primero el mismo nº o el mismo importe el mismo día; luego, con hasta 3
  // días de margen (tres recibos iguales de Crespo no se cruzan de día).
  let pendientes = recibos;
  for (const margen of [0, 3]) {
    const siguen: ReciboListado[] = [];
    for (const rec of pendientes) {
      const suyas = delProveedor(rec);
      const porNumero = suyas.find((c) => claveNumero(c.numero) && claveNumero(c.numero) === claveNumero(rec.factura));
      const porImporte = suyas.find((c) => mismoImporte(c, rec) && Math.abs(dias(c.fecha, rec.fecha)) <= margen);
      const hallada = porNumero ?? porImporte;
      if (!hallada) {
        siguen.push(rec);
        continue;
      }
      usadas.add(hallada);
      if (mismoImporte(hallada, rec)) r.estan++;
      else r.distintos.push({ recibo: rec, guardado: hallada.total });
    }
    pendientes = siguen;
  }
  const sinCasar = pendientes;
  // Varios albaranes por una sola factura: los del mismo día o, si no
  // cuadran, los de la semana hasta la factura (Capotinas factura el sábado
  // todos los albaranes de la semana, 24-10).
  for (const rec of sinCasar) {
    const prov = normalizarCompra(unificarProveedor(rec.proveedor, conocidos));
    const suyos = (margen: number) =>
      vivas.filter((c) => !usadas.has(c) && normalizarCompra(c.proveedor) === prov && dias(rec.fecha, c.fecha) >= 0 && dias(rec.fecha, c.fecha) <= margen);
    const sumar = (cs: CompraBasica[]) => Math.round(cs.reduce((t, c) => t + (c.total ?? 0), 0) * 100) / 100;
    const mismoDia = suyos(0);
    const delDia = mismoDia.length && Math.abs(sumar(mismoDia) - rec.importe) <= 0.05 ? mismoDia : suyos(6);
    delDia.forEach((c) => usadas.add(c));
    const suma = sumar(delDia);
    if (!delDia.length) r.faltan.push(rec);
    else if (Math.abs(suma - rec.importe) <= 0.05) r.estan++;
    else r.distintos.push({ recibo: rec, guardado: suma });
  }
  const fechas = recibos.map((x) => x.fecha).sort();
  if (fechas.length) {
    const provs = new Set(recibos.map((x) => normalizarCompra(unificarProveedor(x.proveedor, conocidos))));
    // También las de proveedor mal leído («Código»): no es ninguno conocido.
    const nombres = PROVEEDORES_CONOCIDOS.map((k) => k.nombre);
    const desconocido = (c: CompraBasica) => !nombres.includes(unificarProveedor(c.proveedor, nombres) ?? '');
    r.sobran = vivas.filter(
      (c) => !usadas.has(c) && c.fecha >= fechas[0] && c.fecha <= fechas.at(-1)! && (provs.has(normalizarCompra(c.proveedor)) || desconocido(c)),
    );
  }
  r.total = Math.round(r.total * 100) / 100;
  return r;
}

const eur = (n: number | null) => (n == null ? 'sin total' : `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const dia = (f: string) => `${f.slice(8, 10)}-${f.slice(5, 7)}`;
const nombre = (p: string) => p.replace(/,?\s*S\.?\s?[AL]\.?\s?U?\.?\s*$/i, '').trim();

// Texto para la nota del correo: lo primero que dice es que no cuenta.
export const MARCA_LISTADO = 'Listado del gremio';

export function notaListado(c: ContrasteListado, al: string | null): string {
  const partes = [
    `${MARCA_LISTADO}${al ? ` al ${dia(al)}` : ''}: no cuenta como gasto, solo para contrastar. ${c.recibos} facturas, ${eur(c.total)}.`,
    c.estan === c.recibos ? 'Todas están en Gastos.' : `En Gastos: ${c.estan} de ${c.recibos}.`,
  ];
  if (c.faltan.length)
    partes.push(`Faltan: ${c.faltan.map((f) => `${nombre(f.proveedor)} ${dia(f.fecha)} nº ${f.factura} ${eur(f.importe)}`).join('; ')}.`);
  if (c.distintos.length)
    partes.push(
      `Con otro importe: ${c.distintos.map((d) => `${nombre(d.recibo.proveedor)} nº ${d.recibo.factura} ${eur(d.recibo.importe)} (en Gastos ${eur(d.guardado)})`).join('; ')}.`,
    );
  if (c.sobran.length)
    partes.push(
      `En Gastos y no en el listado (¿repetidas o proveedor mal leído?): ${c.sobran.map((s) => `${s.proveedor} ${dia(s.fecha)} ${eur(s.total)}`).join('; ')}.`,
    );
  return partes.join(' ');
}

// Los recibos van en una segunda línea de la nota (no se enseña): así el
// contraste se rehace con lo que hay en Gastos ahora, no con lo que había
// cuando llegó el listado (las facturas del mismo correo se leen después).
export function conRecibos(nota: string, al: string | null, recibos: ReciboListado[]): string {
  return `${nota}\n${JSON.stringify({ al, recibos })}`;
}

function recibosDeNota(nota: string): { al: string | null; recibos: ReciboListado[] } | null {
  const linea = nota.split('\n')[1];
  if (!linea) return null;
  try {
    const d = JSON.parse(linea) as { al?: string | null; recibos?: ReciboListado[] };
    return Array.isArray(d.recibos) ? { al: d.al ?? null, recibos: d.recibos } : null;
  } catch {
    return null;
  }
}

// La nota guardada, otra vez en datos, para enseñarla como tabla.
export interface NotaListado {
  al: string | null;
  recibos: number | null;
  total: number | null;
  estan: number | null;
  faltan: { proveedor: string; dia: string; factura: string; importe: number | null }[];
  distintos: { proveedor: string; factura: string; importe: number | null; guardado: number | null }[];
  sobran: { proveedor: string; dia: string; total: number | null }[];
}

const SECCIONES = {
  faltan: 'Faltan: ',
  distintos: 'Con otro importe: ',
  sobran: 'En Gastos y no en el listado (¿repetidas o proveedor mal leído?): ',
} as const;

// «3530,84 €» o «3.530,84 €» → 3530.84; «sin total» → null.
const aEuros = (s: string): number | null => {
  const n = Number(s.replace(/[€\s.]/g, '').replace(',', '.'));
  return s.includes('sin total') || !Number.isFinite(n) ? null : n;
};
const IMPORTE = '(-?[\\d.]+,\\d{2} €|sin total)';

// Con los recibos guardados, contrastado en vivo con `compras`; si no
// (listados viejos), lo que dijo la nota al llegar.
export function leerNotaListado(texto: string | null, compras?: CompraBasica[]): NotaListado | null {
  if (!texto?.startsWith(MARCA_LISTADO)) return null;
  const guardado = compras && recibosDeNota(texto);
  if (guardado) {
    const c = contrastarListado(guardado.recibos, compras);
    return {
      al: guardado.al && dia(guardado.al),
      recibos: c.recibos,
      total: c.total,
      estan: c.estan,
      faltan: c.faltan.map((f) => ({ proveedor: nombre(f.proveedor), dia: dia(f.fecha), factura: f.factura, importe: f.importe })),
      distintos: c.distintos.map((d) => ({ proveedor: nombre(d.recibo.proveedor), factura: d.recibo.factura, importe: d.recibo.importe, guardado: d.guardado })),
      sobran: c.sobran.map((s) => ({ proveedor: s.proveedor ?? '', dia: dia(s.fecha), total: s.total })),
    };
  }
  const nota = texto.split('\n')[0];
  const al = nota.match(/^[^:]* al (\d{2}-\d{2}):/)?.[1] ?? null;
  const cab = nota.match(/(\d+) facturas, ([\d.]+,\d{2}) €\./);
  const estan = /Todas están en Gastos\./.test(nota) && cab ? Number(cab[1]) : Number(nota.match(/En Gastos: (\d+) de \d+\./)?.[1] ?? NaN);
  // Cada sección llega hasta la siguiente (o hasta el final), sin el punto.
  const trozo = (clave: keyof typeof SECCIONES) => {
    const i = nota.indexOf(SECCIONES[clave]);
    if (i < 0) return [];
    const desde = i + SECCIONES[clave].length;
    const fin = Math.min(
      ...Object.values(SECCIONES)
        .map((m) => nota.indexOf(m, desde))
        .filter((j) => j >= 0),
      nota.length,
    );
    return nota.slice(desde, fin).trim().replace(/\.$/, '').split('; ');
  };
  const faltan = trozo('faltan').flatMap((t) => {
    const m = t.match(new RegExp(`^(.+) (\\d{2}-\\d{2}) nº (\\S+) ${IMPORTE}$`));
    return m ? [{ proveedor: m[1], dia: m[2], factura: m[3], importe: aEuros(m[4]) }] : [];
  });
  const distintos = trozo('distintos').flatMap((t) => {
    const m = t.match(new RegExp(`^(.+) nº (\\S+) ${IMPORTE} \\(en Gastos ${IMPORTE}\\)$`));
    return m ? [{ proveedor: m[1], factura: m[2], importe: aEuros(m[3]), guardado: aEuros(m[4]) }] : [];
  });
  const sobran = trozo('sobran').flatMap((t) => {
    const m = t.match(new RegExp(`^(.+) (\\d{2}-\\d{2}) ${IMPORTE}$`));
    return m ? [{ proveedor: m[1], dia: m[2], total: aEuros(m[3]) }] : [];
  });
  return {
    al,
    recibos: cab ? Number(cab[1]) : null,
    total: cab ? aEuros(cab[2]) : null,
    estan: Number.isFinite(estan) ? estan : null,
    faltan,
    distintos,
    sobran,
  };
}
