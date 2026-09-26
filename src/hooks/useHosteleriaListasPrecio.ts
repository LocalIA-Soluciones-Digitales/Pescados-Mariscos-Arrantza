import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getMiClienteId } from '@/lib/clienteContext';
import { useRealtimeTable } from './useRealtimeTable';
import type { HosteleriaArticulo, HosteleriaListaPrecio } from '@/types/hosteleria';

type ArticuloCambios = Partial<Pick<HosteleriaArticulo, 'nombre' | 'precio' | 'unidad' | 'activo'>>;

// Tarifas de hostelería y sus artículos. Cada tarifa tiene su propia lista
// cerrada de artículos (importada de su familia de la báscula), que es lo
// único que ve el bar que la tiene asignada.
export function useHosteleriaListasPrecio() {
  const [listas, setListas] = useState<HosteleriaListaPrecio[]>([]);
  const [articulos, setArticulos] = useState<HosteleriaArticulo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTodo = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [listasRes, articulosRes] = await Promise.all([
      supabase.from('hosteleria_listas_precio').select('*').order('nombre', { ascending: true }),
      supabase.from('hosteleria_articulos').select('*').order('orden', { ascending: true }),
    ]);
    setListas(listasRes.data ?? []);
    setArticulos((articulosRes.data ?? []).map((a) => ({ ...a, precio: Number(a.precio) })));
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    fetchTodo();
  }, [fetchTodo]);

  const fetchTodoSilent = useCallback(() => fetchTodo(true), [fetchTodo]);
  useRealtimeTable('hosteleria_listas_precio', fetchTodoSilent);
  useRealtimeTable('hosteleria_articulos', fetchTodoSilent);

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

  const actualizarArticulo = useCallback(async (id: string, cambios: ArticuloCambios) => {
    const { error } = await supabase.from('hosteleria_articulos').update(cambios).eq('id', id);
    if (error) return false;
    setArticulos((prev) => prev.map((a) => (a.id === id ? { ...a, ...cambios } : a)));
    return true;
  }, []);

  const crearArticulo = useCallback(async (listaId: string, nombre: string, precio: number, unidad: 'kg' | 'un') => {
    const orden = articulos.filter((a) => a.lista_id === listaId).reduce((max, a) => Math.max(max, a.orden), 0) + 1;
    const { data, error } = await supabase
      .from('hosteleria_articulos')
      .insert({ lista_id: listaId, nombre: nombre.trim(), precio, unidad, orden })
      .select()
      .single();
    if (error || !data) return false;
    setArticulos((prev) => [...prev, { ...data, precio: Number(data.precio) }]);
    return true;
  }, [articulos]);

  const eliminarArticulo = useCallback(async (id: string) => {
    const { error } = await supabase.from('hosteleria_articulos').delete().eq('id', id);
    if (error) return false;
    setArticulos((prev) => prev.filter((a) => a.id !== id));
    return true;
  }, []);

  return {
    listas,
    articulos,
    loading,
    refetch: fetchTodo,
    crearLista,
    renombrarLista,
    eliminarLista,
    actualizarArticulo,
    crearArticulo,
    eliminarArticulo,
  };
}
