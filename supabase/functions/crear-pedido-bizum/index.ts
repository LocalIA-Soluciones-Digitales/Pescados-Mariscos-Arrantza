// Registra un pedido para pagar por Bizum (igual que crear-sesion-pago-stripe,
// pero sin pasarela: el cliente paga a mano al número del negocio) y avisa a
// David por WhatsApp automáticamente vía CallMeBot (https://www.callmebot.com/),
// para no depender de que el propio cliente pulse "enviar" en su WhatsApp.
//
// CallMeBot es un servicio gratuito de terceros, no oficial de WhatsApp/Meta:
// funciona bien para este volumen de avisos, pero puede tener límites de uso o
// dejar de estar disponible sin previo aviso. Por eso esta función nunca hace
// fallar el pedido si el aviso falla — solo informa `whatsappSent: false` para
// que el frontend abra el wa.me de siempre como respaldo.
//
// Secretos requeridos (supabase secrets set ...):
//   CALLMEBOT_APIKEY — clave obtenida una vez, añadiendo el contacto de
//                       CallMeBot en el WhatsApp de David y siguiendo las
//                       instrucciones de activación en callmebot.com.
//                       Si no está configurada, se omite el aviso automático
//                       sin error (mismo patrón que Turnstile: no-op seguro).
//   CALLMEBOT_PHONE   — opcional, número de David sin '+' (por defecto el de
//                       siempre, 34619609888).
// SUPABASE_URL y SUPABASE_ANON_KEY los inyecta la plataforma automáticamente.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const CALLMEBOT_APIKEY = Deno.env.get('CALLMEBOT_APIKEY') ?? '';
const CALLMEBOT_PHONE = Deno.env.get('CALLMEBOT_PHONE') ?? '34619609888';
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://arrantza.es';

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

// Misma extracción "primer entero del precio" que usa el frontend
// (CartDrawer.extractPricePerKg), para que el importe mostrado al cliente
// coincida con el que se guarda y se anuncia por WhatsApp.
function extractPricePerKg(priceStr: string): number {
  const match = priceStr.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function formatPrice(n: number): string {
  return `${n.toFixed(2)} €`;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function enviarAvisoWhatsApp(mensaje: string): Promise<boolean> {
  if (!CALLMEBOT_APIKEY) return false;
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${CALLMEBOT_PHONE}&text=${encodeURIComponent(mensaje)}&apikey=${CALLMEBOT_APIKEY}`;
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
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

  const lineasPedido: { nombre: string; kg: number; subtotal: number }[] = [];
  for (const item of items) {
    const producto = productMap.get(item.productId);
    if (!producto || !item.kg || item.kg <= 0) continue;
    const pricePerKg = extractPricePerKg(producto.precio);
    const subtotal = pricePerKg * item.kg;
    if (subtotal <= 0) continue;
    lineasPedido.push({ nombre: producto.nombre_es, kg: item.kg, subtotal });
  }
  if (lineasPedido.length === 0) {
    return jsonResponse({ error: 'El carrito no tiene productos válidos' }, 400);
  }

  const deliveryCost = customer.deliveryMethod === 'home' ? DELIVERY_COST_EUR : 0;
  const subTotalAmount = lineasPedido.reduce((sum, l) => sum + l.subtotal, 0);
  const importeEstimado = subTotalAmount + deliveryCost;

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
      p_metodo_pago: 'bizum',
    }),
  });
  if (!crearPedidoRes.ok) {
    const detail = await crearPedidoRes.text();
    return jsonResponse({ error: 'No se pudo registrar el pedido', detail }, 502);
  }

  const isHomeDelivery = customer.deliveryMethod === 'home';
  const itemsTexto = lineasPedido.map((l) => `🐟 ${l.kg} kg — ${l.nombre} (${formatPrice(l.subtotal)})`).join('\n');
  const mensaje = [
    '📲 NUEVO PEDIDO — Pago por Bizum pendiente',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `👤 ${customer.name || 'Sin nombre'}${customer.business ? ` · ${customer.business}` : ''}`,
    `📞 ${customer.phone || '—'}`,
    isHomeDelivery ? `🚚 A domicilio: ${customer.address}, ${customer.city} ${customer.postalCode}` : '🏪 Recogida en tienda',
    `📅 ${customer.preferredDate || '—'} · ${customer.preferredTime || '—'}`,
    '━━━━━━━━━━━━━━━━━━━━━━',
    itemsTexto,
    '━━━━━━━━━━━━━━━━━━━━━━',
    `💶 Total a recibir por Bizum: ${formatPrice(importeEstimado)}`,
    customer.notes ? `📝 ${customer.notes}` : '',
  ].filter(Boolean).join('\n');

  const whatsappSent = await enviarAvisoWhatsApp(mensaje);

  return jsonResponse({ whatsappSent, importeEstimado });
});
