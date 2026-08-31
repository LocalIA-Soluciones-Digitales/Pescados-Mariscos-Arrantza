export type CajaMovimientoTipo =
  | 'ingreso_tarjeta'
  | 'ingreso_efectivo'
  | 'ingreso_bares'
  | 'gasto_factura'
  | 'gasto_extra';

export interface CajaMovimiento {
  id: string;
  cliente_id: string;
  fecha: string; // YYYY-MM-DD
  tipo: CajaMovimientoTipo;
  concepto: string | null;
  importe: number;
  foto_url: string | null;
  created_at: string;
  updated_at: string;
}

export const CAJA_TIPO_LABELS: Record<CajaMovimientoTipo, string> = {
  ingreso_tarjeta: 'Tarjeta',
  ingreso_efectivo: 'Efectivo',
  ingreso_bares: 'Bares',
  gasto_factura: 'Factura',
  gasto_extra: 'Gasto extra',
};

// 'ingreso_bares' es un ingreso (venta a hostelería), no un gasto — igual
// que en la hoja de cálculo original, donde se sumaba al total del día.
export const CAJA_TIPOS_INGRESO: CajaMovimientoTipo[] = ['ingreso_tarjeta', 'ingreso_efectivo', 'ingreso_bares'];
export const CAJA_TIPOS_GASTO: CajaMovimientoTipo[] = ['gasto_factura', 'gasto_extra'];

export function esCajaIngreso(tipo: CajaMovimientoTipo): boolean {
  return (CAJA_TIPOS_INGRESO as string[]).includes(tipo);
}
