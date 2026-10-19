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
  // Varios albaranes del mismo día por una sola factura (Capotinas).
  for (const rec of sinCasar) {
    const prov = normalizarCompra(unificarProveedor(rec.proveedor, conocidos));
    const delDia = vivas.filter((c) => !usadas.has(c) && normalizarCompra(c.proveedor) === prov && c.fecha === rec.fecha);
    delDia.forEach((c) => usadas.add(c));
    const suma = Math.round(delDia.reduce((t, c) => t + (c.total ?? 0), 0) * 100) / 100;
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
