// Las dos pescaderías físicas de David, cada una con su propia báscula
// BM5. Comparten catálogo, stock y facturación combinada — el origen
// solo distingue de qué tienda vino cada venta o ingreso.
export type Origen = 'pescaderia_1' | 'pescaderia_2';

export const ORIGENES: Origen[] = ['pescaderia_1', 'pescaderia_2'];

export const ORIGEN_LABELS: Record<Origen, string> = {
  pescaderia_1: 'Pescadería I',
  pescaderia_2: 'Pescadería II',
};

// Colores consistentes por tienda, reutilizados en Ventas y en Caja para
// que se reconozca de un vistazo a cuál pertenece cada dato.
export const ORIGEN_COLORS: Record<Origen, { bg: string; text: string; dot: string; ring: string }> = {
  pescaderia_1: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500', ring: 'ring-sky-200' },
  pescaderia_2: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', ring: 'ring-amber-200' },
};
