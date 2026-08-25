export type ReservaEstado = 'pendiente' | 'confirmada' | 'entregada' | 'cancelada';

export interface ReservaEvento {
  id: string;
  cliente_id: string;
  nombre_es: string;
  nombre_eu: string | null;
  fecha_entrega: string;
  fecha_limite: string | null;
  activo: boolean;
  orden: number;
  created_at: string;
  updated_at: string;
}

export interface ReservaItem {
  productoId: string;
  nombre: string;
  kg: number;
  nota: string;
  precioKg: number;
}

export interface Reserva {
  id: string;
  cliente_id: string;
  evento_id: string;
  items: ReservaItem[];
  total_productos: number;
  peso_total: number;
  importe_estimado: number | null;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  fecha_deseada: string | null;
  notas: string | null;
  estado: ReservaEstado;
  device_id: string | null;
  created_at: string;
}

export interface ReservaAjuste {
  id: string;
  cliente_id: string;
  evento_id: string;
  producto_id: string | null;
  producto_nombre: string;
  kg: number;
  nota: string | null;
  created_at: string;
}
