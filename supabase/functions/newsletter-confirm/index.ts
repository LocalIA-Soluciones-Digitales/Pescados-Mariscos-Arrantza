// Edge Function invocada por el trigger public.notificar_newsletter_confirmacion()
// (ver supabase/schema.sql) cada vez que alguien se suscribe al newsletter o
// se reenvía su token. Envía el correo de confirmación (double opt-in) con
// Resend, con enlaces de confirmación y de baja.
//
// Secretos requeridos (supabase secrets set ...):
//   RESEND_API_KEY            — API key de la cuenta de Resend (ya configurada, compartida con pedido-estado)
//   NEWSLETTER_EMAIL_FROM     — opcional, remitente verificado en Resend
//   NEWSLETTER_CONFIRM_SECRET — mismo valor guardado en public.settings ('newsletter_confirm_secret')
//   SITE_URL                  — opcional, origen público de la web (por defecto https://arrantza.es)

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://arrantza.es';

const corsHeaders = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Headers': 'content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface NewsletterPayload {
  email: string;
  idioma: 'es' | 'eu';
  confirm_token: string;
  baja_token: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildEmail(payload: NewsletterPayload): { subject: string; html: string } {
  const confirmUrl = `${SITE_URL}/newsletter/confirmar?token=${encodeURIComponent(payload.confirm_token)}`;
  const bajaUrl = `${SITE_URL}/newsletter/baja?token=${encodeURIComponent(payload.baja_token)}`;

  const textos =
    payload.idioma === 'eu'
      ? {
          subject: 'Berretsi zure harpidetza — Pescados y Mariscos Arrantza',
          saludo: 'Kaixo,',
          cuerpo: 'Astero sartzen den onenaren berri jaso nahi izan duzu. Berrespen bat baino ez zaigu falta harpidetza aktibatzeko.',
          boton: 'Berretsi harpidetza →',
          ignora: 'Ez baduzu zuk eskatu, ez ikusi egin mezu honi: ez da ezer aktibatuko.',
          baja: 'Harpidetuta egon nahi ez baduzu jada, hemen',
        }
      : {
          subject: 'Confirma tu suscripción — Pescados y Mariscos Arrantza',
          saludo: 'Hola,',
          cuerpo: 'Has pedido recibir la selección de la semana. Solo falta confirmarlo para activar tu suscripción.',
          boton: 'Confirmar suscripción →',
          ignora: 'Si no has sido tú, puedes ignorar este correo: no se activará nada.',
          baja: 'Si ya no quieres estar suscrito, puedes darte de baja',
        };

  return {
    subject: textos.subject,
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
        <h1 style="margin:0 0 12px;font-size:22px;color:#16233a;">${escapeHtml(textos.saludo)}</h1>
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#44403c;line-height:1.6;margin:0 0 22px;">
          ${escapeHtml(textos.cuerpo)}
        </p>
        <div style="text-align:center;margin-bottom:22px;">
          <a href="${confirmUrl}" style="display:inline-block;background:#16233a;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:8px;">
            ${escapeHtml(textos.boton)}
          </a>
        </div>
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b6459;line-height:1.5;margin:0;">
          ${escapeHtml(textos.ignora)}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 8px 0;text-align:center;">
        <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#a19a8c;">
          ${escapeHtml(textos.baja)} <a href="${bajaUrl}" style="color:#a19a8c;">aquí</a>.
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

  const secret = req.headers.get('x-webhook-secret');
  if (!secret || secret !== Deno.env.get('NEWSLETTER_CONFIRM_SECRET')) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  const payload = (await req.json()) as NewsletterPayload;

  if (!payload.email || !payload.confirm_token || !payload.baja_token) {
    return new Response('Payload incompleto', { status: 400, headers: corsHeaders });
  }

  const from = Deno.env.get('NEWSLETTER_EMAIL_FROM') ?? 'Pescados y Mariscos Arrantza <onboarding@resend.dev>';
  const { subject, html } = buildEmail(payload);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [payload.email],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return new Response(detail, { status: 502, headers: corsHeaders });
  }

  return new Response('ok', { status: 200, headers: corsHeaders });
});
