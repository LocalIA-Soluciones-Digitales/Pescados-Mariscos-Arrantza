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
  bascula_origen: string | null;
  bascula_familia: string | null;
  created_at: string;
  updated_at: string;
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

// Artículo propio de una tarifa de hostelería (importado de su familia de la báscula).
export interface HosteleriaArticulo {
  id: string;
  lista_id: string;
  codigo_bascula: string | null;
  nombre: string;
  precio: number;
  unidad: 'kg' | 'un';
  orden: number;
  activo: boolean;
}

// Shape devuelto por get_catalogo_hosteleria — mismos campos que Producto
// (para reutilizar el carrito), pero cada fila es un artículo de la tarifa.
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
  precio_num: number;
  unidad: 'kg' | 'un';
}
