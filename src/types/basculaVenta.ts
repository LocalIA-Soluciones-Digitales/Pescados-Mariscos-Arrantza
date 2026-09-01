import type { Origen } from './origen';

export interface BasculaVentaDiaria {
  fecha: string;
  num_tickets: number;
  total_importe: number;
  total_peso_kg: number | null;
}

export interface BasculaVentaDiariaPorTienda {
  fecha: string;
  origen: Origen;
  num_tickets: number;
  total_importe: number;
  total_peso_kg: number | null;
}

export interface BasculaVenta {
  id: string;
  origen: Origen;
  producto_id: string | null;
  linea_oid: number;
  ticket_tipo_doc: number;
  ticket_posto: number;
  ticket_numero: number;
  fecha: string;
  hora: string | null;
  codigo_bascula: string;
  designacion: string;
  unidad: string;
  cantidad: number;
  precio_unit: number;
  importe: number;
  created_at: string;
}
