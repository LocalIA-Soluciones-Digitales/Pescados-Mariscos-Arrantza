import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getMiClienteId } from '@/lib/clienteContext';
import { useRealtimeTable } from './useRealtimeTable';
import type { GastoFijo } from '@/types/gastoFijo';
import type { CajaMovimiento } from '@/types/caja';

/** Día 1 del mes actual, «2026-11-01». */
export function primeroDeMes(): string {
  return `${new Date().toLocaleDateString('sv-SE').slice(0, 7)}-01`;
}

// La lista de gastos fijos y lo apuntado este mes en Contabilidad. Al abrir
// se lanza apuntar_gastos_fijos por si el cron del día 1 no corrió: no
// repite nada (cada gasto guarda el último mes apuntado).
export function useGastosFijos() {
  const [fijos, setFijos] = useState<GastoFijo[]>([]);
  const [apuntes, setApuntes] = useState<CajaMovimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mes = primeroDeMes();

  const fetchDatos = useCallback(async () => {
    const [f, a] = await Promise.all([
      supabase.from('gastos_fijos').select('*').order('orden').order('created_at'),
      supabase.from('caja_movimientos').select('*').not('gasto_fijo_id', 'is', null).eq('fecha', mes).order('created_at'),
    ]);
    setError(f.error?.message ?? a.error?.message ?? null);
    setFijos((f.data ?? []).map((g) => ({ ...g, importe: Number(g.importe) })));
    setApuntes((a.data ?? []).map((m) => ({ ...m, importe: Number(m.importe) })));
    setLoading(false);
  }, [mes]);

  useEffect(() => {
    supabase.rpc('apuntar_gastos_fijos').then(() => fetchDatos());
  }, [fetchDatos]);

  useRealtimeTable('gastos_fijos', fetchDatos);
  useRealtimeTable('caja_movimientos', fetchDatos);

  const crearFijo = useCallback(
    async (concepto: string, importe: number) => {
      let cliente_id: string;
      try {
        cliente_id = await getMiClienteId();
      } catch {
        return false;
      }
      const orden = Math.max(0, ...fijos.map((g) => g.orden)) + 1;
      const { error: e } = await supabase.from('gastos_fijos').insert({ cliente_id, concepto, importe, orden });
      if (e) return false;
      // Uno nuevo cuenta ya desde este mes.
      await supabase.rpc('apuntar_gastos_fijos');
      await fetchDatos();
      return true;
    },
    [fijos, fetchDatos],
  );

  const actualizarFijo = useCallback(async (id: string, patch: Partial<Pick<GastoFijo, 'concepto' | 'importe' | 'activo'>>) => {
    const { error: e } = await supabase.from('gastos_fijos').update(patch).eq('id', id);
    if (e) return false;
    setFijos((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    return true;
  }, []);

  const borrarFijo = useCallback(async (id: string) => {
    const { error: e } = await supabase.from('gastos_fijos').delete().eq('id', id);
    if (e) return false;
    setFijos((prev) => prev.filter((g) => g.id !== id));
    return true;
  }, []);

  // Apunte de este mes en Contabilidad (un caja_movimientos normal).
  const apuntarAMano = useCallback(
    async (g: GastoFijo) => {
      const { error: e } = await supabase.from('caja_movimientos').insert({
        cliente_id: g.cliente_id,
        fecha: mes,
        tipo: 'gasto_extra',
        concepto: g.concepto,
        importe: g.importe,
        origen: null,
        gasto_fijo_id: g.id,
      });
      if (e) return false;
      await fetchDatos();
      return true;
    },
    [mes, fetchDatos],
  );

  const cambiarApunte = useCallback(async (id: string, importe: number) => {
    const { error: e } = await supabase.from('caja_movimientos').update({ importe }).eq('id', id);
    if (e) return false;
    setApuntes((prev) => prev.map((m) => (m.id === id ? { ...m, importe } : m)));
    return true;
  }, []);

  const quitarApunte = useCallback(async (id: string) => {
    const { error: e } = await supabase.from('caja_movimientos').delete().eq('id', id);
    if (e) return false;
    setApuntes((prev) => prev.filter((m) => m.id !== id));
    return true;
  }, []);

  return { fijos, apuntes, mes, loading, error, crearFijo, actualizarFijo, borrarFijo, apuntarAMano, cambiarApunte, quitarApunte };
}
