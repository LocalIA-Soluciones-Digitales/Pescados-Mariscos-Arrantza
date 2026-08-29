import { supabase, SITE_KEY } from './supabaseClient';
import type { CartItem, CartCustomerInfo } from '@/hooks/useCart';

interface CrearSesionPagoResult {
  url: string;
}

// Pide a la Edge Function crear-sesion-pago-stripe que registre el pedido
// (como en logPedido) y devuelva la URL de Stripe Checkout a la que redirigir
// al cliente. A diferencia de logPedido, aquí un fallo sí debe interrumpir el
// flujo: sin sesión de pago no hay nada que cobrar.
export async function crearSesionPagoStripe(
  items: CartItem[],
  customer: CartCustomerInfo,
  deviceId: string,
  metodoPago: 'card' | 'bizum' = 'card',
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<CrearSesionPagoResult>('crear-sesion-pago-stripe', {
    body: {
      siteKey: SITE_KEY,
      items: items.map((i) => ({
        productId: i.productId,
        kg: i.kg,
        preparation: i.preparation,
        note: i.note,
      })),
      customer,
      deviceId,
      metodoPago,
    },
  });

  if (error || !data?.url) {
    throw new Error(metodoPago === 'bizum' ? 'No se pudo iniciar el pago con Bizum' : 'No se pudo iniciar el pago con tarjeta');
  }

  return data.url;
}
