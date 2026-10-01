// Los pedidos guardan la preparación como clave interna ('filleted', 'oven_ready'…);
// el panel la muestra en castellano. Mismos textos que cart.prep_* en es/common.ts.
const PREPARACION_LABELS: Record<string, string> = {
  whole: 'Entero',
  cleaned: 'Limpio',
  filleted: 'En filetes',
  steaks: 'En rodajas',
  butterflied: 'En mariposa',
  oven_ready: 'Listo para horno',
  vacuum_packed: 'Envasado al vacío',
  cooked: 'Cocido',
  other: 'Otro (ver nota)',
};

/** Texto " (Limpio)" para añadir tras el nombre; vacío si es entero o no hay preparación. */
export function sufijoPreparacion(preparacion?: string): string {
  if (!preparacion || preparacion === 'whole') return '';
  return ` (${PREPARACION_LABELS[preparacion] ?? preparacion})`;
}
