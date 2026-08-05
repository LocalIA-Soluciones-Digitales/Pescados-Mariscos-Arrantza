export type ResenaEstado = 'pendiente' | 'aprobada' | 'rechazada';

export interface Resena {
  id: string;
  nombre: string;
  valoracion: number;
  comentario: string;
  estado: ResenaEstado;
  created_at: string;
}
