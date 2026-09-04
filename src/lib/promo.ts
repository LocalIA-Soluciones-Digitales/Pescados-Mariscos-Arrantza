import type { Producto } from '@/types/producto';
import type { PromoTipoCondicion, PromoTipoRecompensa } from '@/types/promo';

export const NOMBRE_NEGOCIO = 'Pescados y Mariscos Arrantza';

interface CondicionInput {
  tipo_condicion: PromoTipoCondicion;
  umbral: number | null;
  importe_min_pedido: number | null;
}

export function promoCondicionTexto({ tipo_condicion, umbral, importe_min_pedido }: CondicionInput): string {
  if (tipo_condicion === 'gasto_total') {
    return `Gasta ${umbral ? umbral.toFixed(2) : '—'} € en total`;
  }
  return `Hace ${umbral || '—'} pedidos de ${importe_min_pedido ? importe_min_pedido.toFixed(2) : '—'} € o más`;
}

interface RecompensaInput {
  tipo_recompensa: PromoTipoRecompensa;
  producto_id: string | null;
  valor_recompensa: number | null;
}

export function promoRecompensaTexto({ tipo_recompensa, producto_id, valor_recompensa }: RecompensaInput, productos: Producto[]): string {
  if (tipo_recompensa === 'producto_gratis') {
    const producto = productos.find((p) => p.id === producto_id);
    return producto ? `${producto.nombre_es} gratis` : 'un producto gratis';
  }
  if (tipo_recompensa === 'descuento_eur') {
    return `${valor_recompensa ?? '—'} € de descuento`;
  }
  return `${valor_recompensa ?? '—'}% de descuento`;
}

// Mismo criterio de sustitución que evaluar_promo_regla_para_cliente() en
// supabase/schema.sql, para que la vista previa en el panel coincida
// exactamente con lo que recibirá el cliente.
export function promoRenderMensaje(plantilla: string, tokens: { cliente_nombre: string; recompensa: string; negocio: string }): string {
  return plantilla
    .split('{{cliente_nombre}}').join(tokens.cliente_nombre)
    .split('{{recompensa}}').join(tokens.recompensa)
    .split('{{negocio}}').join(tokens.negocio);
}
