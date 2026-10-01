import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ORIGENES, type Origen } from '@/types/origen';

// Registro de cambios de las dos básculas para el panel de desarrollo.
// bascula-precios-diario lee la báscula 1 cada 5 minutos y la 2 cada hora: la 1 alimenta los
// precios de la web y la 2 solo se vigila. Cada diferencia con la lectura
// anterior queda en bascula_catalogo_cambios. Aquí se junta con el estado de
// la última lectura de cada una y con lo que difiere entre ambas (deberían
// coincidir).
//
// «Actualizar» no se queda en releer la base de datos: pide a
// bascula-precios-diario una lectura de las dos básculas en ese momento
// (la misma que hace el cron, con registro de cambios y aviso push). Y al
// volver a la pestaña se recargan los datos, para no ver una lista vieja
// cuando ya ha llegado el aviso de un cambio.

const CLAVE_VISTO = 'arrantza_basculas_cambios_visto';

export interface ArticuloBascula {
  codigo: string;
  nombre: string;
  familia: string;
  precio: number;
  unidades: string;
}

export interface CambioBascula {
  id: string;
  origen: Origen;
  codigo: string;
  tipo: 'nuevo' | 'eliminado' | 'renombrado' | 'precio' | 'familia' | 'unidades';
  antes: ArticuloBascula | null;
  despues: ArticuloBascula | null;
  created_at: string;
}

export interface EstadoLectura {
  ultimo_intento?: string;
  ultima_lectura?: string;
  conectada?: boolean;
  mensaje?: string;
  articulos?: number;
}

export interface LecturaManual {
  origen: Origen;
  ok: boolean;
  cambios: number;
  mensaje?: string;
}

export interface DiferenciaBasculas {
  codigo: string;
  bascula1: ArticuloBascula | null;
  bascula2: ArticuloBascula | null;
}

function leerVisto(): string {
  try {
    return localStorage.getItem(CLAVE_VISTO) ?? '';
  } catch {
    return '';
  }
}

function mismoArticulo(a: ArticuloBascula, b: ArticuloBascula): boolean {
  return a.nombre === b.nombre && a.familia === b.familia && Math.abs(a.precio - b.precio) < 0.001 && a.unidades === b.unidades;
}

export function useBasculasCambios() {
  const [cambios, setCambios] = useState<CambioBascula[]>([]);
  const [estados, setEstados] = useState<Partial<Record<Origen, EstadoLectura>>>({});
  const [diferencias, setDiferencias] = useState<DiferenciaBasculas[]>([]);
  const [loading, setLoading] = useState(true);
  const [visto, setVisto] = useState(leerVisto);
  const [leyendo, setLeyendo] = useState(false);
  const [lectura, setLectura] = useState<LecturaManual[] | null>(null);

  const fetchDatos = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    const [resCambios, resEstados, resFotos] = await Promise.all([
      supabase
        .from('bascula_catalogo_cambios')
        .select('id, origen, codigo, tipo, antes, despues, created_at')
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase.from('settings').select('key, value').in('key', ORIGENES.map((o) => `bascula_vigilancia_${o}`)),
      supabase.from('bascula_catalogo').select('origen, codigo, nombre, familia, precio, unidades').in('origen', ORIGENES),
    ]);
    setCambios((resCambios.data ?? []) as CambioBascula[]);
    setEstados(
      Object.fromEntries((resEstados.data ?? []).map((r) => [String(r.key).replace('bascula_vigilancia_', ''), r.value as EstadoLectura])),
    );

    const fotos: Record<Origen, Map<string, ArticuloBascula>> = { pescaderia_1: new Map(), pescaderia_2: new Map() };
    for (const f of resFotos.data ?? []) {
      fotos[f.origen as Origen]?.set(f.codigo, { ...f, precio: Number(f.precio) });
    }
    const difs: DiferenciaBasculas[] = [];
    // Sin foto de alguna de las dos no hay con qué comparar.
    if (fotos.pescaderia_1.size > 0 && fotos.pescaderia_2.size > 0) {
      for (const codigo of new Set([...fotos.pescaderia_1.keys(), ...fotos.pescaderia_2.keys()])) {
        const b1 = fotos.pescaderia_1.get(codigo) ?? null;
        const b2 = fotos.pescaderia_2.get(codigo) ?? null;
        if (!b1 || !b2 || !mismoArticulo(b1, b2)) difs.push({ codigo, bascula1: b1, bascula2: b2 });
      }
    }
    setDiferencias(difs.sort((a, b) => Number(a.codigo) - Number(b.codigo) || a.codigo.localeCompare(b.codigo)));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDatos();
  }, [fetchDatos]);

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') fetchDatos(true);
    };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
    };
  }, [fetchDatos]);

  // La báscula 1 en modo normal (precios de la web) y la 2 solo vigilada,
  // igual que los dos crons.
  const actualizar = useCallback(async () => {
    setLeyendo(true);
    setLectura(null);
    const resultados = await Promise.all(
      ORIGENES.map(async (origen): Promise<LecturaManual> => {
        const { data, error } = await supabase.functions.invoke('bascula-precios-diario', {
          body: { origen, vigilar: origen !== 'pescaderia_1' },
        });
        if (error) return { origen, ok: false, cambios: 0, mensaje: error.message };
        if (data?.omitido) return { origen, ok: false, cambios: 0, mensaje: data.mensaje ?? data.omitido };
        return { origen, ok: true, cambios: Array.isArray(data?.cambios) ? data.cambios.length : 0 };
      }),
    );
    setLectura(resultados);
    await fetchDatos(true);
    setLeyendo(false);
  }, [fetchDatos]);

  const nuevos = useMemo(() => cambios.filter((c) => c.created_at > visto).length, [cambios, visto]);

  const marcarVisto = useCallback(() => {
    const ahora = cambios[0]?.created_at ?? new Date().toISOString();
    try {
      localStorage.setItem(CLAVE_VISTO, ahora);
    } catch {
      // Sin almacenamiento el aviso vuelve a salir en la próxima visita.
    }
    setVisto(ahora);
  }, [cambios]);

  return { cambios, estados, diferencias, loading, nuevos, visto, marcarVisto, leyendo, lectura, actualizar };
}
