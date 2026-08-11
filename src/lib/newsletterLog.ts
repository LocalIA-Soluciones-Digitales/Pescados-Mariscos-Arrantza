import { supabase, SITE_KEY } from './supabaseClient';

export type SubmitNewsletterResult = { ok: true; alreadySubscribed: boolean } | { ok: false; error: string };

export async function submitNewsletter(email: string, idioma: 'es' | 'eu'): Promise<SubmitNewsletterResult> {
  const { data, error } = await supabase.rpc('crear_newsletter_subscriber', {
    p_site_key: SITE_KEY,
    p_email: email.trim().toLowerCase().slice(0, 255),
    p_idioma: idioma,
  });

  if (error) return { ok: false, error: error.message };

  // data === false: ya estaba suscrito (la función no inserta duplicados), no es un error para el usuario.
  return { ok: true, alreadySubscribed: data === false };
}
