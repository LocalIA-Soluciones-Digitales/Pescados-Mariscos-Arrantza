import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getMiClienteId } from '@/lib/clienteContext';
import { useRealtimeTable } from './useRealtimeTable';
import type { Compra, CompraAlias, CompraLinea } from '@/types/compra';
import type { MarcasAlbaran } from '@/lib/comprasMarcas';
import { normalizarCompra } from '@/lib/comprasOcr';

const BUCKET = 'compras';
const MAX_ROWS = 300;
// Todo menos ocr_marcas (unos KB por albarán), que solo se pide al abrir uno.
const COLUMNAS =
  'id, cliente_id, estado, tipo, origen, albaranes, nota, fecha, proveedor, numero, total, lineas, foto_path, ocr_texto, caja_movimiento_id, confirmada_at, created_at, updated_at';

export interface NuevaCompraInput {
  tipo?: Compra['tipo'];
  origen?: Compra['origen'];
  albaranes?: string[];
  nota?: string | null;
  fecha: string;
  proveedor: string | null;
  numero: string | null;
  total: number | null;
  lineas: CompraLinea[];
  ocr_texto: string;
  ocr_marcas: MarcasAlbaran | null;
  foto: Blob;
}

export type DatosCompra = Pick<Compra, 'fecha' | 'proveedor' | 'numero' | 'total' | 'lineas'>;

export function useCompras() {
  const [compras, setCompras] = useState<Compra[]>([]);
  const [alias, setAlias] = useState<CompraAlias[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCompras = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [{ data }, { data: dataAlias }] = await Promise.all([
      supabase.from('compras').select(COLUMNAS).order('created_at', { ascending: false }).limit(MAX_ROWS),
      supabase.from('compras_alias').select('proveedor_norm, texto_norm, producto_id'),
    ]);
    setCompras((data as Compra[] | null) ?? []);
    setAlias((dataAlias as CompraAlias[] | null) ?? []);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    fetchCompras();
  }, [fetchCompras]);

  const fetchSilent = useCallback(() => fetchCompras(true), [fetchCompras]);
  useRealtimeTable('compras', fetchSilent);

  // Sube la foto y guarda lo leído como pendiente: desde aquí ya no se
  // pierde aunque David cierre el móvil sin revisarla.
  const crearCompra = useCallback(async (input: NuevaCompraInput): Promise<Compra> => {
    const cliente_id = await getMiClienteId();
    const id = crypto.randomUUID();
    const foto_path = `${cliente_id}/${input.fecha.slice(0, 4)}/${id}.jpg`;
    const { error: errFoto } = await supabase.storage.from(BUCKET).upload(foto_path, input.foto, { contentType: 'image/jpeg' });
    if (errFoto) throw new Error(`No se pudo subir la foto: ${errFoto.message}`);
    const { foto: _foto, ...datos } = input;
    const { data, error } = await supabase
      .from('compras')
      .insert({ ...datos, id, cliente_id, foto_path })
      .select(COLUMNAS)
      .single();
    if (error) {
      await supabase.storage.from(BUCKET).remove([foto_path]);
      throw new Error(`No se pudo guardar el albarán: ${error.message}`);
    }
    setCompras((prev) => [data as Compra, ...prev]);
    return data as Compra;
  }, []);

  const guardarCompra = useCallback(async (id: string, datos: DatosCompra) => {
    const { error } = await supabase.from('compras').update(datos).eq('id', id);
    if (error) throw new Error(error.message);
    setCompras((prev) => prev.map((c) => (c.id === id ? { ...c, ...datos } : c)));
  }, []);

  // Crea el gasto en Contabilidad y suma los kg al stock (confirmar_compra).
  const confirmarCompra = useCallback(
    async (id: string, datos: DatosCompra) => {
      const { error } = await supabase.rpc('confirmar_compra', { p_id: id, p_datos: datos });
      if (error) throw new Error(error.message);
      await fetchCompras(true);
    },
    [fetchCompras],
  );

  const anularCompra = useCallback(
    async (id: string) => {
      const { error } = await supabase.rpc('anular_compra', { p_id: id });
      if (error) throw new Error(error.message);
      await fetchCompras(true);
    },
    [fetchCompras],
  );

  // Solo pendientes o anuladas: una confirmada se anula primero para que
  // el gasto y el stock vuelvan atrás.
  const borrarCompra = useCallback(async (compra: Compra) => {
    const { error } = await supabase.from('compras').delete().eq('id', compra.id);
    if (error) throw new Error(error.message);
    if (compra.foto_path) await supabase.storage.from(BUCKET).remove([compra.foto_path]);
    setCompras((prev) => prev.filter((c) => c.id !== compra.id));
  }, []);

  // Cambia lo leído de una compra pendiente por otra lectura del mismo
  // documento (el PDF del correo, más fiable que la foto): imagen, líneas,
  // datos y recuadros. La imagen anterior se borra.
  const reemplazarLectura = useCallback(async (compra: Compra, input: NuevaCompraInput): Promise<Compra> => {
    const foto_path = `${compra.cliente_id}/${input.fecha.slice(0, 4)}/${compra.id}-${Date.now()}.jpg`;
    const { error: errFoto } = await supabase.storage.from(BUCKET).upload(foto_path, input.foto, { contentType: 'image/jpeg' });
    if (errFoto) throw new Error(`No se pudo subir la imagen: ${errFoto.message}`);
    const { foto: _foto, ...datos } = input;
    const { data, error } = await supabase
      .from('compras')
      .update({ ...datos, foto_path })
      .eq('id', compra.id)
      .eq('estado', 'pendiente')
      .select(COLUMNAS)
      .maybeSingle();
    if (error || !data) {
      await supabase.storage.from(BUCKET).remove([foto_path]);
      throw new Error(`No se pudo cambiar la lectura: ${error?.message ?? 'ya no está pendiente'}`);
    }
    if (compra.foto_path) await supabase.storage.from(BUCKET).remove([compra.foto_path]);
    setCompras((prev) => prev.map((c) => (c.id === compra.id ? (data as Compra) : c)));
    return data as Compra;
  }, []);

  const anotarCompra = useCallback(async (id: string, nota: string) => {
    const { error } = await supabase.from('compras').update({ nota }).eq('id', id);
    if (error) throw new Error(error.message);
    setCompras((prev) => prev.map((c) => (c.id === id ? { ...c, nota } : c)));
  }, []);

  // Líneas sin producto que David ha quitado al revisar: la memoria las
  // guarda sin producto y ya no salen en los albaranes de ese proveedor.
  const recordarQuitadas = useCallback(async (proveedor: string | null, textos: string[]) => {
    const p = normalizarCompra(proveedor);
    const filas = [...new Set(textos.map(normalizarCompra).filter(Boolean))].map((texto_norm) => ({ proveedor_norm: p, texto_norm, producto_id: null }));
    if (!p || !filas.length) return;
    const cliente_id = await getMiClienteId();
    const { error } = await supabase
      .from('compras_alias')
      .upsert(filas.map((f) => ({ ...f, cliente_id, updated_at: new Date().toISOString() })), { onConflict: 'cliente_id,proveedor_norm,texto_norm' });
    if (error) throw new Error(error.message);
    setAlias((prev) => [...prev.filter((a) => !(a.proveedor_norm === p && filas.some((f) => f.texto_norm === a.texto_norm))), ...filas]);
  }, []);

  const urlFoto = useCallback(async (path: string) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? null;
  }, []);

  const cargarMarcas = useCallback(async (id: string): Promise<MarcasAlbaran | null> => {
    const { data } = await supabase.from('compras').select('ocr_marcas').eq('id', id).maybeSingle();
    return (data?.ocr_marcas as MarcasAlbaran | null) ?? null;
  }, []);

  return {
    compras,
    alias,
    loading,
    crearCompra,
    guardarCompra,
    confirmarCompra,
    anularCompra,
    borrarCompra,
    reemplazarLectura,
    anotarCompra,
    recordarQuitadas,
    urlFoto,
    cargarMarcas,
  };
}
