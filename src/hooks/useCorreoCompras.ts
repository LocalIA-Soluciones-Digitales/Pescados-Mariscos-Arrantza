// Facturas y albaranes que llegan por email (compras_correo, ver la Edge
// Function compras-correo). Con el panel abierto, cada documento nuevo se
// lee aquí con el mismo lector que las fotos y, si no estaba ya guardado
// (comprasCoincidencias.ts), se crea la compra «por revisar» con la marca
// Email. Si ya estaba, se apunta como «repetido» y no se guarda otra vez;
// si lo que estaba era la foto sin confirmar del mismo documento, se queda
// con la lectura del PDF, y si la foto ya estaba confirmada (o es un albarán
// que cubre la factura), al menos pasa a enseñar la imagen del PDF.
// Lo hace el primer panel que lo coge (estado 'leyendo'); si ese panel se
// cierra a medias, otro lo retoma pasados 10 minutos.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeTable } from './useRealtimeTable';
import type { useCompras } from './useCompras';
import type { Compra, CompraCorreo, CompraLinea } from '@/types/compra';
import type { Producto } from '@/types/producto';
import { leerAlbaran, unificarProveedor } from '@/lib/comprasOcr';
import { juntarHojas, leerArchivo } from '@/lib/comprasBandeja';
import { calcularMarcas } from '@/lib/comprasMarcas';
import { lineasDeCompra, notaQuitadas } from '@/lib/comprasProductos';
import { buscarCoincidencia, confirmarCoincidencia, describirCoincidencia, describirNoCoincide, mismasLineas } from '@/lib/comprasCoincidencias';

const COLUMNAS =
  'id, nombre, tipo_mime, remitente, remitente_original, asunto, recibido, archivo_path, estado, compra_id, nota, tomado_at, created_at';
const MAX_ROWS = 60;
const RETOMAR_MS = 10 * 60_000;

type ComprasDatos = ReturnType<typeof useCompras>;

function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
const formatEUR = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

const pendiente = (c: CompraCorreo) =>
  c.estado === 'nuevo' || (c.estado === 'leyendo' && (!c.tomado_at || Date.now() - Date.parse(c.tomado_at) > RETOMAR_MS));

export function useCorreoCompras(datos: ComprasDatos, productos: Producto[]) {
  const [correo, setCorreo] = useState<CompraCorreo[]>([]);
  const [leyendo, setLeyendo] = useState<string | null>(null);
  const ocupado = useRef(false);
  // Lo último de compras y productos, sin reiniciar el proceso en cada render.
  const ref = useRef({ datos, productos });
  ref.current = { datos, productos };

  const fetchCorreo = useCallback(async () => {
    const { data } = await supabase.from('compras_correo').select(COLUMNAS).order('created_at', { ascending: false }).limit(MAX_ROWS);
    setCorreo((data as CompraCorreo[] | null) ?? []);
    return (data as CompraCorreo[] | null) ?? [];
  }, []);

  useEffect(() => {
    fetchCorreo();
  }, [fetchCorreo]);
  useRealtimeTable('compras_correo', fetchCorreo);

  const anotar = useCallback(async (id: string, cambios: Partial<CompraCorreo>) => {
    await supabase.from('compras_correo').update(cambios).eq('id', id);
    setCorreo((p) => p.map((c) => (c.id === id ? { ...c, ...cambios } : c)));
  }, []);

  // Lee un documento y lo guarda (o lo marca repetido). `vistas` son las
  // compras conocidas, más las creadas en esta misma vuelta.
  const procesar = useCallback(
    async (item: CompraCorreo, vistas: Compra[], forzar = false): Promise<Compra | null> => {
      const { datos: d, productos: prods } = ref.current;
      const { data: blob, error: errBajada } = await supabase.storage.from('compras').download(item.archivo_path);
      if (errBajada || !blob) throw new Error(`No se pudo bajar el archivo: ${errBajada?.message ?? 'vacío'}`);
      const hoja = await leerArchivo(new File([blob], item.nombre, { type: item.tipo_mime }), () => {});
      if (hoja.fallo && !hoja.cajas.length) throw new Error(`No se pudo leer: ${hoja.fallo}`);
      const junto = await juntarHojas([hoja]);
      const a = leerAlbaran(junto.cajas);
      const conocidos = vistas.map((c) => c.proveedor).filter((p): p is string => !!p);
      const proveedor = unificarProveedor(a.proveedor, conocidos);
      const fecha = a.fecha ?? new Date(item.recibido ?? item.created_at).toLocaleDateString('sv-SE');
      const doc = { tipo: a.tipo, proveedor, numero: a.numero, fecha, total: a.total, albaranes: a.albaranes };
      const leidas = lineasDeCompra(a.lineas, proveedor, d.alias, prods);
      let lineas: CompraLinea[] = leidas.lineas;
      const hallada = forzar ? null : buscarCoincidencia(doc, vistas);
      // Solo es repetido si además trae los mismos productos, precios y
      // total; si no, es otra compra y se guarda (con una nota).
      const dudosa = hallada && hallada.tipo !== 'parcial' && hallada.tipo !== 'posible' && !confirmarCoincidencia(hallada, { total: a.total, lineas });
      const coincide = dudosa ? null : hallada;
      const explicacion = dudosa
        ? describirNoCoincide(hallada, { total: a.total, lineas }, formatFecha)
        : coincide
          ? describirCoincidencia(coincide, formatFecha)
          : null;
      const ocr_marcas = junto.cajas.length ? calcularMarcas(junto.cajas, a, junto.ancho, junto.alto) : null;

      // El mismo documento ya entró por foto: el PDF se lee sin fallos, así
      // que manda el PDF. Pendiente → se cambia su lectura por la del PDF;
      // confirmada → no se toca (gasto y stock ya apuntados), solo se avisa
      // si el PDF trae otras líneas.
      const foto =
        hallada?.tipo === 'mismo' ? hallada.con.find((c) => c.origen === 'foto' && (c.estado === 'pendiente' || !dudosa)) : undefined;
      if (foto?.estado === 'pendiente') {
        const nueva = await d.reemplazarLectura(foto, {
          tipo: a.tipo,
          origen: 'email',
          albaranes: a.albaranes,
          nota: ['Lectura cambiada por la del PDF que llegó por correo (más fiable que la foto).', notaQuitadas(leidas.quitadas)].filter(Boolean).join(' '),
          fecha,
          proveedor,
          numero: a.numero,
          total: a.total,
          lineas,
          ocr_texto: a.texto.join('\n'),
          ocr_marcas,
          foto: junto.jpeg,
        });
        await anotar(item.id, { estado: 'metido', compra_id: nueva.id, nota: 'Ya estaba por foto: se ha cambiado su lectura por la del PDF.' });
        return null;
      }
      // Una foto ya guardada de este documento (el mismo, o los albaranes que
      // cubre esta factura): pasa a enseñar la imagen del PDF, sin tocar
      // líneas, gasto ni stock. Si lo leído cuadra, no hay nada que revisar.
      const fotos =
        coincide?.tipo === 'mismo' || coincide?.tipo === 'cubierta' ? coincide.con.filter((c) => c.origen === 'foto') : [];
      for (const c of fotos) {
        await d.cambiarImagen(c, {
          foto: junto.jpeg,
          ocr_texto: a.texto.join('\n'),
          ocr_marcas: coincide!.con.length === 1 ? ocr_marcas : null,
        });
      }
      if (fotos.length && fotos.length === coincide!.con.length && mismasLineas(coincide!.con.flatMap((c) => c.lineas), lineas)) {
        await anotar(item.id, {
          estado: 'descartado',
          compra_id: coincide!.con[0].id,
          nota: `${explicacion} Ya estaba por foto: se le ha puesto la imagen del PDF.`,
        });
        return null;
      }

      if (foto?.estado === 'confirmada' && !mismasLineas(foto.lineas, lineas)) {
        const delPdf = lineas
          .filter((l) => l.importe)
          .map((l) => `${l.texto || 'sin nombre'} ${l.kg ?? '?'} kg · ${formatEUR(l.importe ?? 0)}`)
          .join('; ');
        await d.anotarCompra(
          foto.id,
          `El PDF del correo trae otras líneas: ${delPdf}. Si esta lectura está mal, anúlala y en «Correo» pulsa «Guardar igualmente» en ese PDF.`,
        );
      }

      if (coincide && coincide.tipo !== 'parcial' && coincide.tipo !== 'posible') {
        await anotar(item.id, { estado: 'repetido', compra_id: coincide.con[0].id, nota: explicacion });
        return null;
      }

      let total = a.total;
      let nota = [explicacion, notaQuitadas(leidas.quitadas)].filter(Boolean).join(' ') || null;
      if (coincide?.tipo === 'parcial') {
        // Fuera las líneas que ya entraron con los albaranes guardados (mismo
        // importe, una por una): quedan las de los albaranes que faltan.
        const ya = coincide.con.flatMap((c) => c.lineas.map((l) => l.importe)).filter((n): n is number => n != null);
        lineas = lineas.filter((l) => {
          const i = l.importe == null ? -1 : ya.findIndex((n) => Math.abs(n - l.importe!) < 0.01);
          if (i < 0) return true;
          ya.splice(i, 1);
          return false;
        });
        total = coincide.resto;
        nota = [`${explicacion} Factura de ${formatEUR(a.total ?? 0)}; aquí cuenta ${formatEUR(coincide.resto)}.`, notaQuitadas(leidas.quitadas)]
          .filter(Boolean)
          .join(' ');
      }

      return d.crearCompra({
        tipo: a.tipo,
        origen: 'email',
        albaranes: a.albaranes,
        nota,
        fecha,
        proveedor,
        numero: a.numero,
        total,
        lineas,
        ocr_texto: a.texto.join('\n'),
        ocr_marcas,
        foto: junto.jpeg,
      });
    },
    [anotar],
  );

  const procesarPendientes = useCallback(async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    try {
      const vistas = [...ref.current.datos.compras];
      // Del más antiguo al más nuevo: si llegan el albarán y su factura,
      // entra primero el que llegó antes.
      for (const item of [...(await fetchCorreo())].reverse().filter(pendiente)) {
        const limite = new Date(Date.now() - RETOMAR_MS).toISOString();
        const { data: tomado } = await supabase
          .from('compras_correo')
          .update({ estado: 'leyendo', tomado_at: new Date().toISOString() })
          .eq('id', item.id)
          .or(`estado.eq.nuevo,and(estado.eq.leyendo,tomado_at.lt.${limite}),and(estado.eq.leyendo,tomado_at.is.null)`)
          .select('id');
        if (!tomado?.length) continue; // lo ha cogido otro panel
        setLeyendo(item.nombre);
        try {
          const compra = await procesar(item, vistas);
          if (compra) {
            vistas.unshift(compra);
            await anotar(item.id, { estado: 'metido', compra_id: compra.id, nota: compra.nota });
          }
        } catch (e) {
          await anotar(item.id, { estado: 'error', nota: e instanceof Error ? e.message : String(e) });
        }
      }
    } finally {
      ocupado.current = false;
      setLeyendo(null);
    }
  }, [fetchCorreo, procesar, anotar]);

  // En cuanto hay algo nuevo y ya están cargadas las compras y los productos.
  const hayPendientes = correo.some(pendiente);
  const listo = !datos.loading && productos.length > 0;
  useEffect(() => {
    if (hayPendientes && listo) procesarPendientes();
  }, [hayPendientes, listo, procesarPendientes]);

  const reintentar = useCallback(
    async (id: string) => {
      await anotar(id, { estado: 'nuevo', nota: null, compra_id: null });
      procesarPendientes();
    },
    [anotar, procesarPendientes],
  );

  // Un repetido que en realidad no lo era: se guarda igualmente.
  const guardarIgualmente = useCallback(
    async (item: CompraCorreo) => {
      setLeyendo(item.nombre);
      try {
        const compra = await procesar(item, ref.current.datos.compras, true);
        if (compra) await anotar(item.id, { estado: 'metido', compra_id: compra.id, nota: 'Guardado a mano aunque parecía repetido.' });
      } catch (e) {
        await anotar(item.id, { estado: 'error', nota: e instanceof Error ? e.message : String(e) });
      } finally {
        setLeyendo(null);
      }
    },
    [procesar, anotar],
  );

  // Un repetido que sí era el mismo: deja de pedir atención (queda con lo guardado).
  const descartar = useCallback(async (id: string) => {
    const { error } = await supabase.from('compras_correo').update({ estado: 'descartado' }).eq('id', id);
    if (error) throw new Error(error.message);
    setCorreo((p) => p.map((c) => (c.id === id ? { ...c, estado: 'descartado' } : c)));
  }, []);

  const urlArchivo = useCallback(async (path: string) => {
    const { data } = await supabase.storage.from('compras').createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? null;
  }, []);

  return { correo, leyendo, reintentar, guardarIgualmente, descartar, urlArchivo };
}

export type CorreoCompras = ReturnType<typeof useCorreoCompras>;
