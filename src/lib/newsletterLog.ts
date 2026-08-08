import { supabase } from './supabaseClient';

export type SubmitNewsletterResult = { ok: true; alreadySubscribed: boolean } | { ok: false; error: string };

export async function submitNewsletter(email: string, idioma: 'es' | 'eu'): Promise<SubmitNewsletterResult> {
  const { error } = await supabase.from('newsletter_subscribers').insert({
    email: email.trim().toLowerCase().slice(0, 255),
    idioma,
  });

  if (!error) return { ok: true, alreadySubscribed: false };

  // Violación de la restricción unique(email): ya estaba suscrito, no es un error para el usuario.
  if (error.code === '23505') return { ok: true, alreadySubscribed: true };

  return { ok: false, error: error.message };
}
