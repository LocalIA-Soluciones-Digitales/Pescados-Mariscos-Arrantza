// Recibe los eventos de Stripe (checkout.session.completed) y marca el
// pedido correspondiente como pagado. La URL de esta función se registra en
// el Dashboard de Stripe → Developers → Webhooks, apuntando a
// https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook
//
// Secretos requeridos (supabase secrets set ...):
//   STRIPE_WEBHOOK_SECRET — "Signing secret" (whsec_...) del endpoint en Stripe

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

// Tolerancia recomendada por Stripe frente a reenvíos/replay del webhook.
const TIMESTAMP_TOLERANCE_SECONDS = 300;

function safeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = new Map(header.split(',').map((kv) => {
    const [k, v] = kv.split('=');
    return [k, v] as [string, string];
  }));
  const timestamp = parts.get('t');
  const v1 = parts.get('v1');
  if (!timestamp || !v1) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > TIMESTAMP_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expectedHex = Array.from(new Uint8Array(signatureBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return safeEqual(expectedHex, v1);
}

interface StripeCheckoutSession {
  id: string;
  payment_intent: string | null;
  payment_status: string;
  metadata?: { pedido_id?: string };
}

async function patchPedido(pedidoId: string, body: Record<string, unknown>, extraFilter = '') {
  await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}${extraFilter}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok');
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!STRIPE_WEBHOOK_SECRET) {
    return new Response('Webhook no configurado', { status: 503 });
  }

  const signatureHeader = req.headers.get('stripe-signature') ?? '';
  const rawBody = await req.text();

  const valid = signatureHeader && (await verifyStripeSignature(rawBody, signatureHeader, STRIPE_WEBHOOK_SECRET));
  if (!valid) {
    return new Response('Firma inválida', { status: 401 });
  }

  const event = JSON.parse(rawBody) as { type: string; data: { object: StripeCheckoutSession } };

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const pedidoId = session.metadata?.pedido_id;
    const pagado = session.payment_status === 'paid';

    if (pedidoId) {
      await patchPedido(pedidoId, {
        estado_pago: pagado ? 'pagado' : 'fallido',
        stripe_payment_intent_id: session.payment_intent,
      });

      // Solo confirma automáticamente si el pescadero no ha tocado ya el
      // estado del pedido (evita pisar un cambio manual desde el panel).
      if (pagado) {
        await patchPedido(pedidoId, { estado: 'confirmado' }, '&estado=eq.nuevo');
      }
    }
  }

  return new Response('ok', { status: 200 });
});
