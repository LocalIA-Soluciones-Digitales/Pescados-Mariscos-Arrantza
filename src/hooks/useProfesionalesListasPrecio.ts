import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getMiClienteId } from '@/lib/clienteContext';
import { useRealtimeTable } from './useRealtimeTable';
import type { ProfesionalListaPrecio, ProfesionalPrecio } from '@/types/profesional';

export function useProfesionalesListasPrecio() {
  const [listas, setListas] = useState<ProfesionalListaPrecio[]>([]);
  const [precios, setPrecios] = useState<ProfesionalPrecio[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTodo = useCallback(async () => {
    setLoading(true);
    const [listasRes, preciosRes] = await Promise.all([
      supabase.from('profesionales_listas_precio').select('*').order('nombre', { ascending: true }),
      supabase.from('profesionales_precios').select('*'),
    ]);
    setListas(listasRes.data ?? []);
    setPrecios(preciosRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTodo();
  }, [fetchTodo]);

  useRealtimeTable('profesionales_listas_precio', fetchTodo);
  useRealtimeTable('profesionales_precios', fetchTodo);

  const crearLista = useCallback(async (nombre: string) => {
    const clienteId = await getMiClienteId();
    const { data, error } = await supabase
      .from('profesionales_listas_precio')
      .insert({ cliente_id: clienteId, nombre: nombre.trim() })
      .select()
      .single();
    if (error || !data) return null;
    setListas((prev) => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
    return data as ProfesionalListaPrecio;
  }, []);

  const renombrarLista = useCallback(async (id: string, nombre: string) => {
    const { error } = await supabase.from('profesionales_listas_precio').update({ nombre: nombre.trim() }).eq('id', id);
    if (error) return false;
    setListas((prev) => prev.map((l) => (l.id === id ? { ...l, nombre: nombre.trim() } : l)));
    return true;
  }, []);

  const eliminarLista = useCallback(async (id: string) => {
    const { error } = await supabase.from('profesionales_listas_precio').delete().eq('id', id);
    if (error) return false;
    setListas((prev) => prev.filter((l) => l.id !== id));
    return true;
  }, []);

  // precio vacío/null = quitar el override y volver al precio público normal.
  const guardarPrecio = useCallback(async (listaId: string, productoId: string, precio: string) => {
    const limpio = precio.trim();
    if (!limpio) {
      const { error } = await supabase
        .from('profesionales_precios')
        .delete()
        .eq('lista_id', listaId)
        .eq('producto_id', productoId);
      if (error) return false;
      setPrecios((prev) => prev.filter((p) => !(p.lista_id === listaId && p.producto_id === productoId)));
      return true;
    }

    const { data, error } = await supabase
      .from('profesionales_precios')
      .upsert({ lista_id: listaId, producto_id: productoId, precio: limpio }, { onConflict: 'lista_id,producto_id' })
      .select()
      .single();
    if (error || !data) return false;
    setPrecios((prev) => [...prev.filter((p) => !(p.lista_id === listaId && p.producto_id === productoId)), data]);
    return true;
  }, []);

  return { listas, precios, loading, refetch: fetchTodo, crearLista, renombrarLista, eliminarLista, guardarPrecio };
}
