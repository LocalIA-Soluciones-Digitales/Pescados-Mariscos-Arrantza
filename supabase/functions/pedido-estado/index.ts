// Edge Function invocada por el trigger public.notificar_pedido_estado()
// (ver supabase/schema.sql) cuando un pedido pasa a "confirmado" o a
// "completado". Envía al cliente un correo de confirmación o de
// agradecimiento, según el caso, con Resend.
//
// Secretos requeridos (supabase secrets set ...):
//   RESEND_API_KEY      — API key de la cuenta de Resend
//   PEDIDO_EMAIL_FROM    — opcional, remitente verificado en Resend
//   PEDIDO_ESTADO_SECRET — mismo valor guardado en public.settings ('pedido_estado_secret')
//   ALLOWED_ORIGIN       — opcional, origen permitido para llamadas desde el navegador
//                          (por defecto https://arrantza.es); el trigger de Postgres
//                          que la invoca normalmente no envía Origin.

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://arrantza.es';

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

interface PedidoItem {
  nombre: string;
  kg: number;
}

interface PedidoPayload {
  estado: 'confirmado' | 'completado';
  cliente_nombre: string | null;
  cliente_email: string | null;
  metodo_entrega: 'home' | 'pickup';
  items: PedidoItem[];
  importe_estimado: number | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildEmail(pedido: PedidoPayload): { subject: string; html: string } {
  const nombre = pedido.cliente_nombre?.trim() || 'Hola';
  const saludo = pedido.cliente_nombre?.trim() ? `Hola ${escapeHtml(nombre)},` : 'Hola,';
  const entrega = pedido.metodo_entrega === 'home' ? 'a domicilio' : 'en tienda';
  const resumenItems = pedido.items
    .map((item) => `<li style="margin-bottom:4px;">${item.kg} kg — ${escapeHtml(item.nombre)}</li>`)
    .join('');
  const importe = pedido.importe_estimado != null ? `${pedido.importe_estimado.toFixed(2)} €` : null;

  if (pedido.estado === 'confirmado') {
    return {
      subject: 'Tu pedido está confirmado — Pescados y Mariscos Arrantza',
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
        <span style="display:inline-block;background:#dcfce7;color:#15803d;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;padding:4px 10px;border-radius:999px;">
          ✅ Pedido confirmado
        </span>
        <h1 style="margin:14px 0 12px;font-size:22px;color:#16233a;">${saludo}</h1>
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#44403c;line-height:1.6;margin:0 0 18px;">
          Hemos confirmado tu pedido y ya lo estamos preparando con cuidado. Te avisaremos en cuanto esté listo${pedido.metodo_entrega === 'home' ? ' para el reparto' : ' para recoger'}.
        </p>
        <div style="background:#f5f3f0;border-radius:8px;padding:14px 16px;margin-bottom:18px;">
          <ul style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#44403c;margin:0;padding-left:18px;">
            ${resumenItems}
          </ul>
          ${importe ? `<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#16233a;font-weight:bold;margin:10px 0 0;">Total estimado: ${importe}</p>` : ''}
        </div>
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b6459;line-height:1.5;margin:0;">
          Entrega ${entrega}. Si tienes cualquier duda, puedes responder a este correo o contactarnos por teléfono.
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

  return {
    subject: '¡Gracias por tu pedido! — Pescados y Mariscos Arrantza',
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
        <span style="display:inline-block;background:#dbeafe;color:#1d4ed8;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;padding:4px 10px;border-radius:999px;">
          🎉 Pedido completado
        </span>
        <h1 style="margin:14px 0 12px;font-size:22px;color:#16233a;">${saludo}</h1>
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#44403c;line-height:1.6;margin:0 0 18px;">
          Tu pedido ya está completado. Muchas gracias por confiar en nosotros: esperamos que disfrutes del género tanto como nosotros disfrutamos preparándolo.
        </p>
        <div style="background:#f5f3f0;border-radius:8px;padding:14px 16px;margin-bottom:18px;">
          <ul style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#44403c;margin:0;padding-left:18px;">
            ${resumenItems}
          </ul>
          ${importe ? `<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#16233a;font-weight:bold;margin:10px 0 0;">Total: ${importe}</p>` : ''}
        </div>
        <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b6459;line-height:1.5;margin:0 0 18px;">
          Si te ha gustado, nos encantaría leer tu opinión.
        </p>
        <a href="https://arrantza.es/#testimonials" style="display:inline-block;background:#16233a;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:8px;">
          Dejar una reseña →
        </a>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 8px 0;text-align:center;">
        <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#a19a8c;">
          Esperamos verte pronto de nuevo.
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
  const expected = Deno.env.get('PEDIDO_ESTADO_SECRET') ?? '';
  if (!secret || !expected || !safeEqual(secret, expected)) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  const pedido = (await req.json()) as PedidoPayload;

  if (pedido.estado !== 'confirmado' && pedido.estado !== 'completado') {
    return new Response('Estado no soportado', { status: 400, headers: corsHeaders });
  }

  if (!pedido.cliente_email) {
    return new Response('Pedido sin email, no se envía correo', { status: 200, headers: corsHeaders });
  }

  const from = Deno.env.get('PEDIDO_EMAIL_FROM') ?? 'Pescados y Mariscos Arrantza <onboarding@resend.dev>';
  const { subject, html } = buildEmail(pedido);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [pedido.cliente_email],
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
