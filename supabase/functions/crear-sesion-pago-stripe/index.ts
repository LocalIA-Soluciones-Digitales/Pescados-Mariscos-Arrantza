// Crea un pedido "pendiente de pago" y una Stripe Checkout Session para
// cobrar tarjeta (y, si el dominio está verificado en el Dashboard de
// Stripe, Apple Pay / Google Pay automáticamente) desde el carrito de la
// web. Llamada por el frontend vía supabase.functions.invoke — no requiere
// sesión de usuario, igual que crear_pedido.
//
// Secretos requeridos (supabase secrets set ...):
//   STRIPE_SECRET_KEY   — clave secreta de la cuenta de Stripe (sk_live_/sk_test_)
//   ALLOWED_ORIGIN       — opcional, origen del site (por defecto https://arrantza.es)
//
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los inyecta
// la plataforma automáticamente en toda Edge Function, no hace falta fijarlos.

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://arrantza.es';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CartItemInput {
  productId: string;
  kg: number;
  preparation?: string;
  note?: string;
}

interface CustomerInput {
  name: string;
  business: string;
  phone: string;
  email: string;
  notes: string;
  deliveryMethod: 'home' | 'pickup';
  address: string;
  city: string;
  postalCode: string;
  deliveryInstructions: string;
  preferredDate: string;
  preferredTime: string;
}

interface RequestBody {
  siteKey: string;
  items: CartItemInput[];
  customer: CustomerInput;
  deviceId: string;
}

interface Producto {
  id: string;
  nombre_es: string;
  precio: string;
}

const DELIVERY_COST_EUR = 3.5;

// Misma extracción "primer entero de la cadena de precio" que usa el
// frontend (CartDrawer.extractPricePerKg) sobre textos tipo "Desde 15€/kg".
// Debe coincidir exactamente para que el total cobrado en Stripe sea el
// mismo que el que el cliente vio en el carrito.
function extractPricePerKg(priceStr: string): number {
  const match = priceStr.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (!STRIPE_SECRET_KEY) {
    return jsonResponse({ error: 'Pago con tarjeta no configurado' }, 503);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400);
  }

  const { siteKey, items, customer, deviceId } = body;
  if (!siteKey || !Array.isArray(items) || items.length === 0 || !customer) {
    return jsonResponse({ error: 'Pedido incompleto' }, 400);
  }

  // Precios autoritativos: nunca confiar en importes calculados en el
  // navegador para lo que realmente se le cobra a la tarjeta.
  const productosRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_productos_publico`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_site_key: siteKey }),
  });
  if (!productosRes.ok) {
    return jsonResponse({ error: 'No se pudo validar el catálogo' }, 502);
  }
  const productos = (await productosRes.json()) as Producto[];
  const productMap = new Map(productos.map((p) => [p.id, p]));

  const lineItems: { nombre: string; kg: number; amountCents: number }[] = [];
  for (const item of items) {
    const producto = productMap.get(item.productId);
    if (!producto || !item.kg || item.kg <= 0) continue;
    const pricePerKg = extractPricePerKg(producto.precio);
    const amountCents = Math.round(pricePerKg * item.kg * 100);
    if (amountCents <= 0) continue;
    lineItems.push({ nombre: producto.nombre_es, kg: item.kg, amountCents });
  }
  if (lineItems.length === 0) {
    return jsonResponse({ error: 'El carrito no tiene productos válidos' }, 400);
  }

  const deliveryCents = customer.deliveryMethod === 'home' ? Math.round(DELIVERY_COST_EUR * 100) : 0;
  const totalCents = lineItems.reduce((sum, li) => sum + li.amountCents, 0) + deliveryCents;
  const importeEstimado = totalCents / 100;

  // 1) Registrar el pedido como "pendiente de pago" (misma tabla/función que
  //    el flujo por WhatsApp, para que aparezca igual en el panel de gestión).
  const crearPedidoRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/crear_pedido`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_site_key: siteKey,
      p_items: items.map((i) => ({
        productoId: i.productId,
        nombre: productMap.get(i.productId)?.nombre_es ?? i.productId,
        kg: i.kg,
        preparacion: i.preparation ?? 'whole',
        nota: i.note ?? '',
        precioKg: extractPricePerKg(productMap.get(i.productId)?.precio ?? '0'),
      })),
      p_total_productos: items.length,
      p_peso_total: items.reduce((sum, i) => sum + i.kg, 0),
      p_importe_estimado: importeEstimado,
      p_metodo_entrega: customer.deliveryMethod,
      p_cliente_nombre: customer.name || null,
      p_cliente_negocio: customer.business || null,
      p_cliente_telefono: customer.phone || null,
      p_cliente_email: customer.email || null,
      p_cliente_direccion: customer.address || null,
      p_cliente_ciudad: customer.city || null,
      p_cliente_cp: customer.postalCode || null,
      p_fecha_preferida: customer.preferredDate || null,
      p_hora_preferida: customer.preferredTime || null,
      p_notas: customer.notes || null,
      p_device_id: deviceId || null,
      p_metodo_pago: 'stripe',
    }),
  });
  if (!crearPedidoRes.ok) {
    const detail = await crearPedidoRes.text();
    return jsonResponse({ error: 'No se pudo registrar el pedido', detail }, 502);
  }
  const pedidoId = (await crearPedidoRes.json()) as string;

  // 2) Crear la Checkout Session de Stripe con esos importes.
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', `${ALLOWED_ORIGIN}/pedido/confirmado?session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${ALLOWED_ORIGIN}/productos?pago=cancelado`);
  params.set('metadata[pedido_id]', pedidoId);
  params.set('locale', 'es');
  if (customer.email) params.set('customer_email', customer.email);
  params.append('payment_method_types[0]', 'card');

  lineItems.forEach((li, idx) => {
    params.set(`line_items[${idx}][quantity]`, '1');
    params.set(`line_items[${idx}][price_data][currency]`, 'eur');
    params.set(`line_items[${idx}][price_data][unit_amount]`, String(li.amountCents));
    params.set(`line_items[${idx}][price_data][product_data][name]`, `${li.nombre} (${li.kg} kg)`);
  });
  if (deliveryCents > 0) {
    const idx = lineItems.length;
    params.set(`line_items[${idx}][quantity]`, '1');
    params.set(`line_items[${idx}][price_data][currency]`, 'eur');
    params.set(`line_items[${idx}][price_data][unit_amount]`, String(deliveryCents));
    params.set(`line_items[${idx}][price_data][product_data][name]`, 'Envío a domicilio');
  }

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!stripeRes.ok) {
    const detail = await stripeRes.text();
    return jsonResponse({ error: 'No se pudo crear la sesión de pago', detail }, 502);
  }
  const session = (await stripeRes.json()) as { id: string; url: string };

  // 3) Guardar el session id en el pedido (requiere service role: no hay
  //    policy de update para anon sobre pedidos, a propósito).
  await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ stripe_session_id: session.id }),
  });

  return jsonResponse({ url: session.url });
});
