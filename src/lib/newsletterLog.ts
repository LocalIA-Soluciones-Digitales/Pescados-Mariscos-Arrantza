import { supabase, SITE_KEY } from './supabaseClient';

export type SubmitNewsletterStatus = 'nuevo' | 'reenviado' | 'confirmado';
export type SubmitNewsletterResult = { ok: true; status: SubmitNewsletterStatus } | { ok: false; error: string };

// La suscripción usa doble confirmación (double opt-in): esto solo deja al
// suscriptor "pendiente" y dispara un correo de confirmación (ver Edge
// Function supabase/functions/newsletter-confirm). No queda activo hasta
// que confirme el enlace de ese correo.
export async function submitNewsletter(email: string, idioma: 'es' | 'eu'): Promise<SubmitNewsletterResult> {
  const { data, error } = await supabase.rpc('crear_newsletter_subscriber', {
    p_site_key: SITE_KEY,
    p_email: email.trim().toLowerCase().slice(0, 255),
    p_idioma: idioma,
  });

  if (error) return { ok: false, error: error.message };

  return { ok: true, status: data as SubmitNewsletterStatus };
}

export type ConfirmNewsletterStatus = 'confirmado' | 'ya_confirmado' | 'invalido';

export async function confirmarNewsletter(token: string): Promise<ConfirmNewsletterStatus> {
  const { data, error } = await supabase.rpc('confirmar_newsletter_subscriber', { p_token: token });
  if (error) return 'invalido';
  return data as ConfirmNewsletterStatus;
}

export type BajaNewsletterStatus = 'baja' | 'invalido';

export async function bajaNewsletter(token: string): Promise<BajaNewsletterStatus> {
  const { data, error } = await supabase.rpc('baja_newsletter_subscriber', { p_token: token });
  if (error) return 'invalido';
  return data as BajaNewsletterStatus;
}
