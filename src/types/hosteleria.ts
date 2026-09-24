export type HosteleriaSolicitudEstado = 'pendiente' | 'contactado' | 'aprobada' | 'rechazada';

export interface HosteleriaSolicitud {
  id: string;
  nombre_negocio: string;
  persona_contacto: string;
  tipo_negocio: string;
  telefono: string;
  email: string | null;
  necesidades: string;
  estado: HosteleriaSolicitudEstado;
  created_at: string;
}

export interface HosteleriaListaPrecio {
  id: string;
  nombre: string;
  created_at: string;
  updated_at: string;
}

export interface HosteleriaPrecio {
  id: string;
  lista_id: string;
  producto_id: string;
  precio: string;
}

export interface HosteleriaCliente {
  id: string;
  lista_precio_id: string;
  nombre_negocio: string;
  codigo_acceso: string;
  activo: boolean;
  notas: string | null;
  created_at: string;
}

// Shape devuelto por get_catalogo_hosteleria — mismos campos que Producto,
// pero sin los de gestión de stock (el cliente de hostelería no los necesita).
export interface ProductoHosteleria {
  id: string;
  nombre_es: string;
  nombre_eu: string | null;
  descripcion_es: string | null;
  descripcion_eu: string | null;
  origen_es: string | null;
  origen_eu: string | null;
  precio: string;
  categoria: string;
  subcategoria: string | null;
  imagen_url: string | null;
  estado: string;
  disponible: boolean;
  orden: number;
  destacado: boolean;
}
