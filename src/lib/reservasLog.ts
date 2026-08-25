import { supabase, SITE_KEY } from './supabaseClient';
import type { ReservaItem } from '@/types/reserva';

export interface NewReservaInput {
  eventoId: string;
  items: ReservaItem[];
  totalProductos: number;
  pesoTotal: number;
  importeEstimado: number | null;
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail: string;
  notas: string;
  deviceId: string;
}

// Persiste la reserva antes de abrir WhatsApp. Nunca debe interrumpir el
// envío si falla — el mensaje de WhatsApp sigue siendo la vía real de
// contacto con el cliente (mismo criterio que logPedido).
export async function logReserva(input: NewReservaInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('crear_reserva', {
      p_site_key: SITE_KEY,
      p_evento_id: input.eventoId,
      p_items: input.items,
      p_total_productos: input.totalProductos,
      p_peso_total: input.pesoTotal,
      p_importe_estimado: input.importeEstimado,
      p_cliente_nombre: input.clienteNombre,
      p_cliente_telefono: input.clienteTelefono || null,
      p_cliente_email: input.clienteEmail || null,
      p_notas: input.notas || null,
      p_device_id: input.deviceId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}
