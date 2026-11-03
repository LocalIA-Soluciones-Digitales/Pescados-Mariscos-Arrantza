import type { Origen } from './origen';

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
  // Solo los ingresos llevan tienda — los gastos son generales para el
  // negocio conjunto (David compra una vez y reparte entre las dos).
  origen: Origen | null;
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

// El ingreso normal se coge solo de bascula_ventas (ver CajaPanel); estos
// tipos son la vía manual de respaldo por si la báscula falla algún día o
// se le escapa una venta, no la forma habitual de registrar ingresos.
export const CAJA_TIPOS_INGRESO: CajaMovimientoTipo[] = ['ingreso_tarjeta', 'ingreso_efectivo', 'ingreso_bares'];
export const CAJA_TIPOS_GASTO: CajaMovimientoTipo[] = ['gasto_factura', 'gasto_extra'];

export function esCajaIngreso(tipo: CajaMovimientoTipo): boolean {
  return (CAJA_TIPOS_INGRESO as string[]).includes(tipo);
}
