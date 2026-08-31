// Los ingresos ya no se registran a mano: se calculan a partir de
// bascula_ventas (Factura Simplificada y Factura, sincronizadas por
// bascula-sync). El pescadero solo da de alta gastos aquí.
export type CajaMovimientoTipo = 'gasto_factura' | 'gasto_extra';

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
  gasto_factura: 'Factura',
  gasto_extra: 'Gasto extra',
};
