export type CompraEstado = 'pendiente' | 'confirmada' | 'anulada';

export interface CompraLinea {
  // Nombre tal como viene impreso en el albarán.
  texto: string;
  kg: number | null;
  precio: number | null;
  importe: number | null;
  producto_id: string | null;
  sumar_stock: boolean;
}

export interface Compra {
  id: string;
  cliente_id: string;
  estado: CompraEstado;
  fecha: string; // YYYY-MM-DD
  proveedor: string | null;
  numero: string | null;
  total: number | null;
  lineas: CompraLinea[];
  foto_path: string | null;
  ocr_texto: string | null;
  caja_movimiento_id: string | null;
  confirmada_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompraAlias {
  proveedor_norm: string;
  texto_norm: string;
  producto_id: string;
}
