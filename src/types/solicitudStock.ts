export type SolicitudStockEstado = 'pendiente' | 'atendida' | 'descartada';

export interface SolicitudStock {
  id: string;
  cliente_id: string;
  producto_id: string | null;
  producto_nombre: string;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  cantidad_kg: number | null;
  notas: string | null;
  estado: SolicitudStockEstado;
  device_id: string | null;
  created_at: string;
}
