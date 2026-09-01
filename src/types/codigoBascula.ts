import type { Origen } from './origen';

export interface ProductoCodigoBascula {
  id: string;
  producto_id: string;
  origen: Origen;
  codigo_bascula: string;
}
