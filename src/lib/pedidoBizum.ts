import { supabase, SITE_KEY } from './supabaseClient';
import type { CartItem, CartCustomerInfo } from '@/hooks/useCart';

interface CrearPedidoBizumResult {
  whatsappSent: boolean;
  importeEstimado: number;
}

// Registra el pedido como en logPedido, pero además intenta avisar a David
// por WhatsApp automáticamente (vía CallMeBot) para que el cliente no tenga
// que abrir su propio WhatsApp y pulsar enviar. whatsappSent indica si ese
// aviso automático funcionó — si no, el llamante debe abrir el wa.me manual
// como respaldo.
export async function crearPedidoBizum(
  items: CartItem[],
  customer: CartCustomerInfo,
  deviceId: string,
): Promise<CrearPedidoBizumResult> {
  const { data, error } = await supabase.functions.invoke<CrearPedidoBizumResult>('crear-pedido-bizum', {
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
    },
  });

  if (error || !data) {
    throw new Error('No se pudo registrar el pedido por Bizum');
  }

  return data;
}
