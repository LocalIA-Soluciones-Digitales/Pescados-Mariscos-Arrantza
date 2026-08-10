import { supabase } from './supabaseClient';
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
    await supabase.from('pedidos').insert({
      items: input.items,
      total_productos: input.totalProductos,
      peso_total: input.pesoTotal,
      importe_estimado: input.importeEstimado,
      metodo_entrega: input.metodoEntrega,
      cliente_nombre: input.clienteNombre || null,
      cliente_negocio: input.clienteNegocio || null,
      cliente_telefono: input.clienteTelefono || null,
      cliente_email: input.clienteEmail || null,
      cliente_direccion: input.clienteDireccion || null,
      cliente_ciudad: input.clienteCiudad || null,
      cliente_cp: input.clienteCp || null,
      fecha_preferida: input.fechaPreferida || null,
      hora_preferida: input.horaPreferida || null,
      notas: input.notas || null,
      device_id: input.deviceId,
    });
  } catch {
    // El registro de pedidos nunca debe bloquear el envío por WhatsApp.
  }
}
