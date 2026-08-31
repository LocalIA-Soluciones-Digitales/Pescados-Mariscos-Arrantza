// Edge Function invocada por el trigger public.notificar_stock_bajo()
// (ver supabase/schema.sql) cuando el stock de un producto cae por
// debajo de su mínimo. Envía el aviso por correo con Resend.
//
// Secretos requeridos (supabase secrets set ...):
//   RESEND_API_KEY     — API key de la cuenta de Resend
//   ALERT_EMAIL_TO     — destinatario(s), separados por coma
//   STOCK_ALERT_SECRET — mismo valor guardado en public.settings ('stock_alert_secret')
//   ALERT_EMAIL_FROM   — opcional, remitente verificado en Resend
//   ALLOWED_ORIGIN      — opcional, origen permitido para llamadas desde el navegador
//                         (por defecto https://pescaderiaarrantza.com); el trigger de Postgres
//                         que la invoca normalmente no envía Origin.

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const secret = req.headers.get('x-webhook-secret') ?? '';
  const expected = Deno.env.get('STOCK_ALERT_SECRET') ?? '';
  if (!secret || !expected || !safeEqual(secret, expected)) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  const { nombre, stock_kg, stock_minimo } = await req.json();

  const to = (Deno.env.get('ALERT_EMAIL_TO') ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  if (to.length === 0) {
    return new Response('ALERT_EMAIL_TO no configurado', { status: 500, headers: corsHeaders });
  }

  const from = Deno.env.get('ALERT_EMAIL_FROM') ?? 'Arrantza Stock <onboarding@resend.dev>';

  const html = `
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
        <span style="display:inline-block;background:#fee2e2;color:#dc2626;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;padding:4px 10px;border-radius:999px;">
          ⚠️ Stock bajo
        </span>
        <h1 style="margin:14px 0 20px;font-size:24px;color:#16233a;">${nombre}</h1>

        <table role="presentation" width="100%" style="border-collapse:collapse;margin-bottom:22px;">
          <tr>
            <td width="50%" style="background:#fef2f2;border-radius:8px;padding:14px 16px;text-align:center;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#991b1b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Stock actual</div>
              <div style="font-size:26px;font-weight:bold;color:#dc2626;">${stock_kg} kg</div>
            </td>
            <td width="12"></td>
            <td width="50%" style="background:#f5f3f0;border-radius:8px;padding:14px 16px;text-align:center;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#6b6459;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Aviso mínimo</div>
              <div style="font-size:26px;font-weight:bold;color:#16233a;">${stock_minimo} kg</div>
            </td>
          </tr>
        </table>

        <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#44403c;line-height:1.5;margin:0 0 22px;">
          Repón este producto cuanto antes para no quedarte sin género.
        </p>

        <a href="https://pescaderiaarrantza.com/admin" style="display:inline-block;background:#16233a;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:8px;">
          Ver panel de stock →
        </a>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 8px 0;text-align:center;">
        <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#a19a8c;">
          Aviso automático — se genera solo la primera vez que el stock baja del mínimo.
        </span>
      </td>
    </tr>
  </table>
</div>`.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: `⚠️ Stock bajo: ${nombre} (${stock_kg} kg)`,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return new Response(detail, { status: 502, headers: corsHeaders });
  }

  return new Response('ok', { status: 200, headers: corsHeaders });
});
