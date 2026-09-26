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
