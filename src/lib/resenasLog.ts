import { supabase } from './supabaseClient';

export interface NewResenaInput {
  nombre: string;
  valoracion: number;
  comentario: string;
}

// La reseña queda 'pendiente' hasta que el pescadero la apruebe desde el
// panel de administración — nunca se publica directamente.
export async function submitResena(input: NewResenaInput): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('resenas').insert({
    nombre: input.nombre.trim().slice(0, 100),
    valoracion: input.valoracion,
    comentario: input.comentario.trim().slice(0, 1000),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
