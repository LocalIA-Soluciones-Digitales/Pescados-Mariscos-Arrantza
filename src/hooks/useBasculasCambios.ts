import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ORIGENES, type Origen } from '@/types/origen';

// Registro de cambios de las dos básculas para el panel de desarrollo.
// bascula-precios-diario lee cada báscula cada hora: la 1 alimenta los
// precios de la web y la 2 solo se vigila. Cada diferencia con la lectura
// anterior queda en bascula_catalogo_cambios. Aquí se junta con el estado de
// la última lectura de cada una y con lo que difiere entre ambas (deberían
// coincidir).

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

  const fetchDatos = useCallback(async () => {
    setLoading(true);
    const [resCambios, resEstados, resFotos] = await Promise.all([
      supabase
        .from('bascula_catalogo_cambios')
        .select('id, origen, codigo, tipo, antes, despues, created_at')
        .order('created_at', { ascending: false })
        .limit(300),
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

  return { cambios, estados, diferencias, loading, nuevos, visto, marcarVisto, refetch: fetchDatos };
}
