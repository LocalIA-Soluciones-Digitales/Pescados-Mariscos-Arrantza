export type PromoTipoCondicion = 'gasto_total' | 'num_pedidos';
export type PromoTipoRecompensa = 'producto_gratis' | 'descuento_eur' | 'descuento_pct';
export type PromoOtorgadaEstado = 'pendiente' | 'canjeada';

export interface PromoRegla {
  id: string;
  cliente_id: string;
  nombre: string;
  activo: boolean;
  orden: number;
  tipo_condicion: PromoTipoCondicion;
  umbral: number;
  importe_min_pedido: number | null;
  tipo_recompensa: PromoTipoRecompensa;
  producto_id: string | null;
  valor_recompensa: number | null;
  mensaje_plantilla: string;
  created_at: string;
  updated_at: string;
}

export interface PromoOtorgada {
  id: string;
  cliente_id: string;
  regla_id: string;
  cliente_key: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  valor_disparador: number;
  mensaje: string;
  estado: PromoOtorgadaEstado;
  email_enviado_at: string | null;
  whatsapp_enviado_at: string | null;
  canjeada_at: string | null;
  created_at: string;
}
