export type ProfesionalSolicitudEstado = 'pendiente' | 'contactado' | 'aprobada' | 'rechazada';

export interface ProfesionalSolicitud {
  id: string;
  nombre_negocio: string;
  persona_contacto: string;
  tipo_negocio: string;
  telefono: string;
  email: string | null;
  necesidades: string;
  estado: ProfesionalSolicitudEstado;
  created_at: string;
}

export interface ProfesionalListaPrecio {
  id: string;
  nombre: string;
  created_at: string;
  updated_at: string;
}

export interface ProfesionalPrecio {
  id: string;
  lista_id: string;
  producto_id: string;
  precio: string;
}

export interface ProfesionalCliente {
  id: string;
  lista_precio_id: string;
  nombre_negocio: string;
  codigo_acceso: string;
  activo: boolean;
  notas: string | null;
  created_at: string;
}

// Shape devuelto por get_catalogo_profesional — mismos campos que Producto,
// pero sin los de gestión de stock (el profesional no los necesita).
export interface ProductoProfesional {
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
