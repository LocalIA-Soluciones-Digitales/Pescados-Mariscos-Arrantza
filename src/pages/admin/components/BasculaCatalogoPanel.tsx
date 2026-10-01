import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import SearchInput from '@/components/base/SearchInput';

// Catálogo completo de la báscula 1 (la que manda los precios de la web), tal
// cual está en la báscula: por código y agrupado por familia. Sale de la
// última lectura de bascula-precios-diario (public.bascula_catalogo), que se
// hace cada 5 minutos. Solo lectura: los artículos se cambian en la báscula.

const ORIGEN = 'pescaderia_1';

// Familias de la tienda (fijas). Las demás toman el nombre de la tarifa de
// hostelería o de la campaña de reservas enlazada a esa familia.
const FAMILIAS_TIENDA: Record<string, string> = {
  '1': 'Pescado', '2': 'Pescado de carta', '3': 'Marisco', '4': 'Congelado', '5': 'Varios',
};

interface Articulo {
  codigo: string;
  nombre: string;
  familia: string;
  precio: number;
  unidades: string;
}

interface Lectura {
  ultima_lectura?: string;
  conectada?: boolean;
}

const euros = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const porCodigo = (a: { codigo: string }, b: { codigo: string }) => Number(a.codigo) - Number(b.codigo) || a.codigo.localeCompare(b.codigo);

export default function BasculaCatalogoPanel() {
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [nombresFamilia, setNombresFamilia] = useState<Record<string, string>>({});
  const [enTienda, setEnTienda] = useState<Set<string>>(new Set());
  // Dados de alta en la báscula en los últimos 7 días.
  const [recientes, setRecientes] = useState<Set<string>>(new Set());
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [loading, setLoading] = useState(true);
  // ?buscar=714 abre la lista ya filtrada por ese código.
  const [busqueda, setBusqueda] = useState(() => new URLSearchParams(window.location.search).get('buscar') ?? '');
  const [familia, setFamilia] = useState<string>('todas');
  const busquedaDiferida = useDeferredValue(busqueda);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [cat, host, res, cod, set, altas] = await Promise.all([
        supabase.from('bascula_catalogo').select('codigo, nombre, familia, precio, unidades').eq('origen', ORIGEN),
        supabase.from('hosteleria_listas_precio').select('nombre, bascula_familia').eq('bascula_origen', ORIGEN),
        supabase.from('reservas_eventos').select('nombre_es, bascula_familia').eq('bascula_origen', ORIGEN),
        supabase.from('productos_codigos_bascula').select('codigo_bascula, productos (visible_web)').eq('origen', ORIGEN),
        supabase.from('settings').select('value').eq('key', `bascula_vigilancia_${ORIGEN}`).maybeSingle(),
        supabase.from('bascula_catalogo_cambios').select('codigo').eq('origen', ORIGEN).eq('tipo', 'nuevo')
          .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString()),
      ]);
      if (!vivo) return;
      setArticulos(((cat.data ?? []) as Articulo[]).map((a) => ({ ...a, precio: Number(a.precio) })).sort(porCodigo));
      const nombres: Record<string, string> = { ...FAMILIAS_TIENDA };
      for (const r of res.data ?? []) if (r.bascula_familia) nombres[r.bascula_familia] = r.nombre_es;
      for (const h of host.data ?? []) if (h.bascula_familia) nombres[h.bascula_familia] = h.nombre;
      setNombresFamilia(nombres);
      setEnTienda(new Set(
        (cod.data ?? [])
          .filter((c) => (c.productos as unknown as { visible_web: boolean } | null)?.visible_web)
          .map((c) => c.codigo_bascula as string),
      ));
      setLectura((set.data?.value as Lectura) ?? null);
      setRecientes(new Set((altas.data ?? []).map((c) => c.codigo as string)));
      setLoading(false);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const familias = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const a of articulos) conteo.set(a.familia, (conteo.get(a.familia) ?? 0) + 1);
    return [...conteo.entries()].sort(([a], [b]) => Number(a) - Number(b) || a.localeCompare(b));
  }, [articulos]);

  const nombreFamilia = (f: string) => (f ? `${f} · ${nombresFamilia[f] ?? 'Sin nombre'}` : 'Sin familia');

  const grupos = useMemo(() => {
    const q = normalizar(busquedaDiferida.trim());
    const filtrados = articulos.filter(
      (a) => (familia === 'todas' || a.familia === familia) && (!q || a.codigo.startsWith(q) || normalizar(a.nombre).includes(q)),
    );
    return familias
      .map(([f]) => ({ familia: f, items: filtrados.filter((a) => a.familia === f) }))
      .filter((g) => g.items.length > 0);
  }, [articulos, familias, familia, busquedaDiferida]);

  const total = grupos.reduce((s, g) => s + g.items.length, 0);
  const sugerencias = useMemo(() => articulos.map((a) => a.nombre), [articulos]);

  return (
    <div className="pb-28">
      <div
        className="sticky z-10 bg-background-100/95 backdrop-blur-sm border-b border-background-200/50 px-4 md:px-8 py-3 space-y-2"
        style={{ top: 'var(--admin-header-height, 0px)' }}
      >
        <SearchInput
          value={busqueda}
          onChange={setBusqueda}
          suggestions={sugerencias}
          placeholder="Buscar por código o nombre…"
          className="w-full sm:w-[280px] md:w-[420px]"
        />
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {[['todas', articulos.length] as const, ...familias].map(([f, n]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFamilia(f)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                familia === f ? 'bg-foreground-950 text-background-50' : 'bg-background-50 border border-background-200/70 text-foreground-500 hover:text-foreground-950'
              }`}
            >
              {f === 'todas' ? 'Todas' : nombreFamilia(f)}
              <span className={`tabular-nums ${familia === f ? 'opacity-70' : 'text-foreground-400'}`}>{n}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 md:px-8 pt-4">
        <p className="text-xs text-foreground-400 mb-3">
          Báscula 1 · {total === articulos.length ? `${articulos.length} artículos` : `${total} de ${articulos.length} artículos`}
          {lectura?.ultima_lectura &&
            ` · leída ${new Date(lectura.ultima_lectura).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`}
          {lectura?.conectada === false && <span className="text-amber-700"> · ahora sin conexión</span>}
        </p>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-background-200/50 animate-pulse"></div>
            ))}
          </div>
        ) : grupos.length === 0 ? (
          <div className="bg-background-50 border border-dashed border-background-200 rounded-xl py-12 text-center">
            <i className="ri-scales-3-line text-3xl text-foreground-300"></i>
            <p className="text-sm text-foreground-500 mt-2">
              {articulos.length === 0 ? 'Todavía no se ha leído la báscula.' : 'Ningún artículo con esta búsqueda.'}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {grupos.map((g) => (
              <section key={g.familia}>
                <h3 className="flex items-baseline gap-2 mb-2">
                  <span className="text-sm font-semibold text-foreground-950">Familia {nombreFamilia(g.familia)}</span>
                  <span className="text-xs text-foreground-400">{g.items.length}</span>
                </h3>
                <div className="bg-background-50 border border-background-200/70 rounded-xl divide-y divide-background-200/70">
                  {g.items.map((a) => (
                    <div key={a.codigo} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="w-10 flex-shrink-0 font-mono text-sm text-foreground-400 tabular-nums">{a.codigo}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground-950 break-words">{a.nombre}</p>
                        {(enTienda.has(a.codigo) || recientes.has(a.codigo)) && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {enTienda.has(a.codigo) && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700">En la web</span>
                            )}
                            {recientes.has(a.codigo) && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700">Nuevo</span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="flex-shrink-0 text-sm tabular-nums text-foreground-950 text-right">
                        {euros(a.precio)}
                        <span className="text-xs text-foreground-400">/{a.unidades === 'un' ? 'ud' : 'kg'}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
