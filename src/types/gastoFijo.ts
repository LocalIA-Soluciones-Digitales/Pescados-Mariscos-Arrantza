// Gasto que se paga cada mes sin factura ni albarán (alquiler, limpieza,
// nómina en metálico…). El día 1 se apunta solo en Contabilidad como gasto
// extra: ver gastos_fijos en schema.sql.
export interface GastoFijo {
  id: string;
  cliente_id: string;
  concepto: string;
  importe: number;
  activo: boolean;
  orden: number;
  // Día 1 del último mes en que ya se apuntó.
  ultimo_mes: string | null;
  created_at: string;
  updated_at: string;
}
