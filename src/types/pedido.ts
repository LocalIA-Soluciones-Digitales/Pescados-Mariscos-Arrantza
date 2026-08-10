export type PedidoEstado = 'nuevo' | 'confirmado' | 'completado' | 'cancelado';
export type PedidoMetodoEntrega = 'home' | 'pickup';

export interface PedidoItem {
  productoId: string;
  nombre: string;
  kg: number;
  preparacion: string;
  nota: string;
  precioKg: number;
}

export interface Pedido {
  id: string;
  items: PedidoItem[];
  total_productos: number;
  peso_total: number;
  importe_estimado: number | null;
  metodo_entrega: PedidoMetodoEntrega;
  cliente_nombre: string | null;
  cliente_negocio: string | null;
  cliente_telefono: string | null;
  cliente_email: string | null;
  cliente_direccion: string | null;
  cliente_ciudad: string | null;
  cliente_cp: string | null;
  fecha_preferida: string | null;
  hora_preferida: string | null;
  notas: string | null;
  estado: PedidoEstado;
  device_id: string | null;
  created_at: string;
}
