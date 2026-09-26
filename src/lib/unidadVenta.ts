// Los precios llegan como texto: "19,90€/kg" o "3,20€/ud" (los copia la
// función bascula-precios-diario desde la báscula, y get_catalogo_hosteleria
// usa el mismo formato). Lo que se vende por unidad se pide en unidades
// enteras; el resto, por peso en pasos de 0,5 kg. La cantidad del carrito
// se guarda siempre en CartItem.kg, sea en kilos o en unidades.

export function esPorUnidad(precio: string): boolean {
  return /\/\s*(ud|un)\b/i.test(precio);
}

/** Paso de los botones +/− y cantidad mínima. */
export function pasoCantidad(precio: string): number {
  return esPorUnidad(precio) ? 1 : 0.5;
}

export function formatCantidad(cantidad: number, precio: string): string {
  return esPorUnidad(precio) ? `${cantidad} ud` : `${cantidad} kg`;
}

// ── Venta por piezas ─────────────────────────────────────────────────
// Pescado entero a €/kg que el cliente puede pedir como "2 piezas de
// ~2 kg" en vez de "4 kg". La línea guarda SIEMPRE el total en kg (así el
// trigger de stock y los totales no cambian) y además el nº de piezas; el
// peso de cada pieza sale de kg / piezas.

export const PESOS_PIEZA_POR_DEFECTO = [0.5, 1, 1.5, 2, 2.5, 3, 4];

interface ProductoPiezas {
  precio: string;
  por_piezas?: boolean | null;
  pesos_pieza?: number[] | null;
}

/** Si el producto ofrece elegir por piezas (solo tiene sentido a €/kg). */
export function admitePiezas(p: ProductoPiezas | undefined | null): boolean {
  return Boolean(p?.por_piezas) && !esPorUnidad(p?.precio ?? '');
}

/** Pesos por pieza que se ofrecen, en kg, ordenados. */
export function pesosPieza(p: ProductoPiezas | undefined | null): number[] {
  const propios = (p?.pesos_pieza ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return propios.length > 0 ? [...new Set(propios)].sort((a, b) => a - b) : PESOS_PIEZA_POR_DEFECTO;
}

export function redondearKg(n: number): number {
  return Math.round(n * 100) / 100;
}

export function kgPorPieza(kg: number, piezas: number): number {
  return piezas > 0 ? redondearKg(kg / piezas) : kg;
}

/** "1,5" — número de kilos con coma decimal. */
export function formatNumKg(n: number): string {
  return String(redondearKg(n)).replace('.', ',');
}

/** "2 piezas de ~2 kg (≈ 4 kg)" */
export function formatPiezas(piezas: number, kg: number): string {
  return `${piezas} ${piezas === 1 ? 'pieza' : 'piezas'} de ~${formatNumKg(kgPorPieza(kg, piezas))} kg (≈ ${formatNumKg(kg)} kg)`;
}

/** Cantidad de una línea ya guardada (pedido o reserva), para listados y mensajes. */
export function formatLineaCantidad(item: { kg: number; unidad?: 'kg' | 'ud'; piezas?: number | null }): string {
  if (item.unidad === 'ud') return `${item.kg} ud`;
  if (item.piezas && item.piezas > 0) return formatPiezas(item.piezas, item.kg);
  return `${formatNumKg(item.kg)} kg`;
}

/** Nº de piezas válido (entero positivo) o undefined. */
export function piezasValidas(n: unknown): number | undefined {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : undefined;
}

/** 19.9 a partir de "19,90€/kg" (admite coma o punto decimal). */
export function precioDeTexto(precio: string): number {
  const match = precio.match(/(\d+(?:[.,]\d+)?)/);
  return match ? parseFloat(match[1].replace(',', '.')) : 0;
}
