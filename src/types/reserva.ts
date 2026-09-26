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
  imagen_url: string | null;
  // Campaña enlazada a una familia de la báscula (p. ej. Navidad = familia 6
  // de pescaderia_1): ofrece sus propios artículos (reservas_articulos) con
  // precio en vez del catálogo de la tienda.
  bascula_origen?: string | null;
  bascula_familia?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReservaArticulo {
  id: string;
  codigo_bascula: string | null;
  nombre_es: string;
  nombre_eu: string | null;
  precio: number;
  unidad: 'kg' | 'un';
  imagen_url: string | null;
  orden: number;
}

export interface ReservaItem {
  productoId: string;
  nombre: string;
  kg: number;
  nota: string;
  precioKg: number;
  // Solo en campañas con artículos propios: productoId va vacío (no es un
  // producto de la tienda) y la cantidad puede ir en unidades.
  articuloId?: string;
  unidad?: 'kg' | 'ud';
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
