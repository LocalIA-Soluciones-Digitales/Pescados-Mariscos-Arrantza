import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeTable } from './useRealtimeTable';
import type { ProfesionalCliente } from '@/types/profesional';

export function useProfesionalesClientes() {
  const [clientes, setClientes] = useState<ProfesionalCliente[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClientes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('profesionales_clientes').select('*').order('nombre_negocio', { ascending: true });
    setClientes(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  useRealtimeTable('profesionales_clientes', fetchClientes);

  // El PIN se hashea siempre en el servidor (pgcrypto) — nunca se guarda ni
  // se mueve en texto plano por el cliente más allá de este RPC.
  const crear = useCallback(
    async (input: { listaPrecioId: string; nombreNegocio: string; codigoAcceso: string; pin: string; notas: string }) => {
      const { data, error } = await supabase.rpc('admin_crear_profesional', {
        p_lista_precio_id: input.listaPrecioId,
        p_nombre_negocio: input.nombreNegocio,
        p_codigo_acceso: input.codigoAcceso,
        p_pin: input.pin,
        p_notas: input.notas,
      });
      if (error || !data) return { ok: false as const, error: error?.message ?? 'No se pudo crear el cliente' };
      setClientes((prev) => [...prev, data].sort((a, b) => a.nombre_negocio.localeCompare(b.nombre_negocio, 'es')));
      return { ok: true as const, cliente: data as ProfesionalCliente };
    },
    [],
  );

  const actualizar = useCallback(
    async (id: string, patch: Partial<Pick<ProfesionalCliente, 'nombre_negocio' | 'lista_precio_id' | 'activo' | 'notas'>>) => {
      const { error } = await supabase.from('profesionales_clientes').update(patch).eq('id', id);
      if (error) return false;
      setClientes((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      return true;
    },
    [],
  );

  const cambiarPin = useCallback(async (id: string, pin: string) => {
    const { error } = await supabase.rpc('admin_set_profesional_pin', { p_profesional_id: id, p_pin: pin });
    return !error;
  }, []);

  const eliminar = useCallback(async (id: string) => {
    const { error } = await supabase.from('profesionales_clientes').delete().eq('id', id);
    if (error) return false;
    setClientes((prev) => prev.filter((c) => c.id !== id));
    return true;
  }, []);

  return { clientes, loading, refetch: fetchClientes, crear, actualizar, cambiarPin, eliminar };
}
