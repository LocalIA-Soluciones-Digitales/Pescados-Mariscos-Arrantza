// Edge Function invocada por el trigger public.notificar_stock_bajo()
// (ver supabase/schema.sql) cuando el stock de un producto cae por
// debajo de su mínimo. Envía el aviso por correo con Resend.
//
// Secretos requeridos (supabase secrets set ...):
//   RESEND_API_KEY     — API key de la cuenta de Resend
//   ALERT_EMAIL_TO     — destinatario(s), separados por coma
//   STOCK_ALERT_SECRET — mismo valor guardado en public.settings ('stock_alert_secret')
//   ALERT_EMAIL_FROM   — opcional, remitente verificado en Resend

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const secret = req.headers.get('x-webhook-secret');
  if (!secret || secret !== Deno.env.get('STOCK_ALERT_SECRET')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { nombre, stock_kg, stock_minimo } = await req.json();

  const to = (Deno.env.get('ALERT_EMAIL_TO') ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  if (to.length === 0) {
    return new Response('ALERT_EMAIL_TO no configurado', { status: 500 });
  }

  const from = Deno.env.get('ALERT_EMAIL_FROM') ?? 'Arrantza Stock <onboarding@resend.dev>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: `Stock bajo: ${nombre}`,
      html: `<p><strong>${nombre}</strong> tiene <strong>${stock_kg} kg</strong> en stock, por debajo del mínimo definido (${stock_minimo} kg).</p><p>Repón cuanto antes.</p>`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return new Response(detail, { status: 502 });
  }

  return new Response('ok', { status: 200 });
});
