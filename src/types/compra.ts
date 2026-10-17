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
  // Factura: puede cubrir varios albaranes (sus nº en `albaranes`).
  tipo: 'albaran' | 'factura';
  // 'email': entró sola desde el correo (compras_correo).
  origen: 'foto' | 'email';
  albaranes: string[];
  // Por qué cuenta lo que cuenta (p. ej. la diferencia de una factura semanal).
  nota: string | null;
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
  // null: «esto no es producto», David quitó la línea al revisar.
  producto_id: string | null;
}

export type CompraCorreoEstado = 'nuevo' | 'leyendo' | 'metido' | 'repetido' | 'error';

// Un adjunto (PDF o foto) recogido del correo: ver compras_correo en schema.sql.
export interface CompraCorreo {
  id: string;
  nombre: string;
  tipo_mime: string;
  remitente: string | null;
  remitente_original: string | null;
  asunto: string | null;
  recibido: string | null;
  archivo_path: string;
  estado: CompraCorreoEstado;
  compra_id: string | null;
  nota: string | null;
  tomado_at: string | null;
  created_at: string;
}
