// Edge Function invocada por el trigger public.notificar_promo_otorgada()
// (ver supabase/schema.sql) cuando se concede una promoción a un cliente
// con email. Envía un correo con el mensaje ya renderizado (sin tokens
// pendientes de sustituir) usando Resend, igual que pedido-estado.
//
// Secretos requeridos (supabase secrets set ...):
//   RESEND_API_KEY        — API key de la cuenta de Resend (compartida con pedido-estado)
//   PROMO_EMAIL_FROM       — opcional, remitente verificado en Resend
//   PROMO_NOTIFY_SECRET    — mismo valor guardado en public.settings ('promo_notify_secret')
//   SUPABASE_URL            — inyectado automáticamente por Supabase
//   SUPABASE_SERVICE_ROLE_KEY — inyectado automáticamente por Supabase
//   ALLOWED_ORIGIN          — opcional, origen permitido para llamadas desde el navegador

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://pescaderiaarrantza.com';

// Comparación en tiempo constante: evita filtrar por temporización cuántos
// caracteres iniciales del secreto coinciden (timing side-channel).
function safeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PromoPayload {
  otorgada_id: string;
  cliente_nombre: string | null;
  cliente_email: string | null;
  mensaje: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildEmail(promo: PromoPayload): { subject: string; html: string } {
  const saludo = promo.cliente_nombre?.trim() ? `Hola ${escapeHtml(promo.cliente_nombre.trim())},` : 'Hola,';
  const mensajeHtml = escapeHtml(promo.mensaje).replace(/\n/g, '<br>');

  return {
    subject: '¡Tienes un regalo esperándote! — Pescados y Mariscos Arrantza',
    html: `
<div style="background:#f7f5f2;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;border-collapse:collapse;">
    <tr>
      <td style="background:#16233a;border-radius:10px 10px 0 0;padding:18px 24px;">
        <span style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">
          🐟 Pescados y Mariscos Arrantza
        </span>
      </td>
    </tr>
    <tr>
      <td style="background:#ffffff;border:1px solid #e7e3dc;border-top:none;border-radius:0 0 10px 10px;padding:28px 24px;">
        <span style="display:inline-block;background:#fef3c7;color:#b45309;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;padding:4px 10px;border-radius:999px;">
          🎁 Promoción desbloqueada
        </span>
        <h1 style="margin:14px 0 12px;font-size:22px;color:#16233a;">${saludo}</h1>
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#44403c;line-height:1.6;margin:0 0 4px;">
          ${mensajeHtml}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 8px 0;text-align:center;">
        <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#a19a8c;">
          Gracias por confiar en Pescados y Mariscos Arrantza.
        </span>
      </td>
    </tr>
  </table>
</div>`.trim(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const secret = req.headers.get('x-webhook-secret') ?? '';
  const expected = Deno.env.get('PROMO_NOTIFY_SECRET') ?? '';
  if (!secret || !expected || !safeEqual(secret, expected)) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  const promo = (await req.json()) as PromoPayload;

  if (!promo.cliente_email) {
    return new Response('Promoción sin email, no se envía correo', { status: 200, headers: corsHeaders });
  }

  const from = Deno.env.get('PROMO_EMAIL_FROM') ?? 'Pescados y Mariscos Arrantza <onboarding@resend.dev>';
  const { subject, html } = buildEmail(promo);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [promo.cliente_email],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return new Response(detail, { status: 502, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (supabaseUrl && serviceRoleKey && promo.otorgada_id) {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    await supabase
      .from('promo_otorgadas')
      .update({ email_enviado_at: new Date().toISOString() })
      .eq('id', promo.otorgada_id);
  }

  return new Response('ok', { status: 200, headers: corsHeaders });
});
