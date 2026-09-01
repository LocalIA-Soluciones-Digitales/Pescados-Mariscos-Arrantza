// Las dos pescaderías físicas de David, cada una con su propia báscula
// BM5. Comparten catálogo, stock y facturación combinada — el origen
// solo distingue de qué terminal vino cada venta.
export type Origen = 'pescaderia_1' | 'pescaderia_2';

export const ORIGENES: Origen[] = ['pescaderia_1', 'pescaderia_2'];

export const ORIGEN_LABELS: Record<Origen, string> = {
  pescaderia_1: 'Pescadería I',
  pescaderia_2: 'Pescadería II',
};
