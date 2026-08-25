import { supabase, SITE_KEY } from './supabaseClient';

export interface NewSolicitudStockInput {
  productoId: string;
  clienteNombre: string;
  clienteTelefono: string;
  cantidadKg: number | null;
  notas: string;
  deviceId: string;
}

// Persiste la solicitud de reposición. Nunca debe interrumpir el flujo del
// cliente si falla — el mismo criterio que logReserva/logPedido.
export async function logSolicitudStock(input: NewSolicitudStockInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('crear_solicitud_stock', {
      p_site_key: SITE_KEY,
      p_producto_id: input.productoId,
      p_cliente_nombre: input.clienteNombre || null,
      p_cliente_telefono: input.clienteTelefono || null,
      p_cantidad_kg: input.cantidadKg,
      p_notas: input.notas || null,
      p_device_id: input.deviceId,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido' };
  }
}
