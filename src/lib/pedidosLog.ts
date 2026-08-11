import { supabase, SITE_KEY } from './supabaseClient';
import type { PedidoItem, PedidoMetodoEntrega } from '@/types/pedido';

export interface NewPedidoInput {
  items: PedidoItem[];
  totalProductos: number;
  pesoTotal: number;
  importeEstimado: number | null;
  metodoEntrega: PedidoMetodoEntrega;
  clienteNombre: string;
  clienteNegocio: string;
  clienteTelefono: string;
  clienteEmail: string;
  clienteDireccion: string;
  clienteCiudad: string;
  clienteCp: string;
  fechaPreferida: string;
  horaPreferida: string;
  notas: string;
  deviceId: string;
}

// Persiste el detalle del pedido antes de abrir WhatsApp. Nunca debe
// interrumpir el envío del pedido si falla — el mensaje de WhatsApp sigue
// siendo la vía real de contacto con el cliente.
export async function logPedido(input: NewPedidoInput): Promise<void> {
  try {
    await supabase.rpc('crear_pedido', {
      p_site_key: SITE_KEY,
      p_items: input.items,
      p_total_productos: input.totalProductos,
      p_peso_total: input.pesoTotal,
      p_importe_estimado: input.importeEstimado,
      p_metodo_entrega: input.metodoEntrega,
      p_cliente_nombre: input.clienteNombre || null,
      p_cliente_negocio: input.clienteNegocio || null,
      p_cliente_telefono: input.clienteTelefono || null,
      p_cliente_email: input.clienteEmail || null,
      p_cliente_direccion: input.clienteDireccion || null,
      p_cliente_ciudad: input.clienteCiudad || null,
      p_cliente_cp: input.clienteCp || null,
      p_fecha_preferida: input.fechaPreferida || null,
      p_hora_preferida: input.horaPreferida || null,
      p_notas: input.notas || null,
      p_device_id: input.deviceId,
    });
  } catch {
    // El registro de pedidos nunca debe bloquear el envío por WhatsApp.
  }
}
