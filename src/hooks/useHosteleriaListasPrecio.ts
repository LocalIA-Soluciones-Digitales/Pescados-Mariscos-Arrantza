import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getMiClienteId } from '@/lib/clienteContext';
import { useRealtimeTable } from './useRealtimeTable';
import type { HosteleriaListaPrecio, HosteleriaPrecio } from '@/types/hosteleria';

export function useHosteleriaListasPrecio() {
  const [listas, setListas] = useState<HosteleriaListaPrecio[]>([]);
  const [precios, setPrecios] = useState<HosteleriaPrecio[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTodo = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [listasRes, preciosRes] = await Promise.all([
      supabase.from('hosteleria_listas_precio').select('*').order('nombre', { ascending: true }),
      supabase.from('hosteleria_precios').select('*'),
    ]);
    setListas(listasRes.data ?? []);
    setPrecios(preciosRes.data ?? []);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    fetchTodo();
  }, [fetchTodo]);

  const fetchTodoSilent = useCallback(() => fetchTodo(true), [fetchTodo]);
  useRealtimeTable('hosteleria_listas_precio', fetchTodoSilent);
  useRealtimeTable('hosteleria_precios', fetchTodoSilent);

  const crearLista = useCallback(async (nombre: string) => {
    const clienteId = await getMiClienteId();
    const { data, error } = await supabase
      .from('hosteleria_listas_precio')
      .insert({ cliente_id: clienteId, nombre: nombre.trim() })
      .select()
      .single();
    if (error || !data) return null;
    setListas((prev) => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
    return data as HosteleriaListaPrecio;
  }, []);

  const renombrarLista = useCallback(async (id: string, nombre: string) => {
    const { error } = await supabase.from('hosteleria_listas_precio').update({ nombre: nombre.trim() }).eq('id', id);
    if (error) return false;
    setListas((prev) => prev.map((l) => (l.id === id ? { ...l, nombre: nombre.trim() } : l)));
    return true;
  }, []);

  const eliminarLista = useCallback(async (id: string) => {
    const { error } = await supabase.from('hosteleria_listas_precio').delete().eq('id', id);
    if (error) return false;
    setListas((prev) => prev.filter((l) => l.id !== id));
    return true;
  }, []);

  // precio vacío/null = quitar el override y volver al precio público normal.
  const guardarPrecio = useCallback(async (listaId: string, productoId: string, precio: string) => {
    const limpio = precio.trim();
    if (!limpio) {
      const { error } = await supabase
        .from('hosteleria_precios')
        .delete()
        .eq('lista_id', listaId)
        .eq('producto_id', productoId);
      if (error) return false;
      setPrecios((prev) => prev.filter((p) => !(p.lista_id === listaId && p.producto_id === productoId)));
      return true;
    }

    const { data, error } = await supabase
      .from('hosteleria_precios')
      .upsert({ lista_id: listaId, producto_id: productoId, precio: limpio }, { onConflict: 'lista_id,producto_id' })
      .select()
      .single();
    if (error || !data) return false;
    setPrecios((prev) => [...prev.filter((p) => !(p.lista_id === listaId && p.producto_id === productoId)), data]);
    return true;
  }, []);

  return { listas, precios, loading, refetch: fetchTodo, crearLista, renombrarLista, eliminarLista, guardarPrecio };
}
