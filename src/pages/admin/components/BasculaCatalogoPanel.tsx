import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import SearchInput from '@/components/base/SearchInput';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';

// Catálogo completo de la báscula 1 (la que manda los precios de la web), tal
// cual está en la báscula: por código y agrupado por familia. Sale de la
// última lectura de bascula-precios-diario (public.bascula_catalogo), que se
// hace cada 5 minutos; la lista se refresca sola en cuanto esa lectura trae
// algo distinto (realtime + sondeo de useRealtimeTable) y marca lo que acaba
// de cambiar. Solo lectura: los artículos se cambian en la báscula.

const ORIGEN = 'pescaderia_1';
const CLAVE_PLEGADAS = 'admin_bascula_plegadas';

// Familias de la tienda (fijas). Las demás toman el nombre de la tarifa de
// hostelería o de la campaña de reservas enlazada a esa familia.
const FAMILIAS_TIENDA: Record<string, string> = {
  '1': 'Pescado', '2': 'Pescado de carta', '3': 'Marisco', '4': 'Congelado', '5': 'Varios',
};

// Un color por familia (clases completas para que Tailwind las genere).
const COLOR_FAMILIA: Record<string, { barra: string; suave: string; texto: string }> = {
  '1': { barra: 'bg-sky-500', suave: 'bg-sky-50', texto: 'text-sky-700' },
  '2': { barra: 'bg-indigo-500', suave: 'bg-indigo-50', texto: 'text-indigo-700' },
  '3': { barra: 'bg-rose-500', suave: 'bg-rose-50', texto: 'text-rose-700' },
  '4': { barra: 'bg-cyan-500', suave: 'bg-cyan-50', texto: 'text-cyan-700' },
  '5': { barra: 'bg-stone-500', suave: 'bg-stone-100', texto: 'text-stone-700' },
  '6': { barra: 'bg-red-600', suave: 'bg-red-50', texto: 'text-red-700' },
  '7': { barra: 'bg-emerald-500', suave: 'bg-emerald-50', texto: 'text-emerald-700' },
  '8': { barra: 'bg-amber-500', suave: 'bg-amber-50', texto: 'text-amber-700' },
  '9': { barra: 'bg-violet-500', suave: 'bg-violet-50', texto: 'text-violet-700' },
};
const COLOR_OTRA = { barra: 'bg-foreground-400', suave: 'bg-background-100', texto: 'text-foreground-600' };

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

// Dónde sale cada artículo en la web: tienda online (familias 1-5), página de
// reservas (campaña enlazada, p. ej. Navidad) o portal de hostelería (tarifa
// enlazada, tras iniciar sesión).
type Destino = 'tienda' | 'reservas' | 'hosteleria';
const DESTINOS: Record<Destino, { label: string; corto: string; icono: string; clase: string }> = {
  tienda: { label: 'Tienda online', corto: 'Tienda', icono: 'ri-store-2-line', clase: 'bg-emerald-50 text-emerald-700' },
  reservas: { label: 'Reservas', corto: 'Reservas', icono: 'ri-calendar-event-line', clase: 'bg-red-50 text-red-700' },
  hosteleria: { label: 'Portal de hostelería', corto: 'Hostelería', icono: 'ri-restaurant-line', clase: 'bg-violet-50 text-violet-700' },
};
const ORDEN_DESTINOS: Destino[] = ['tienda', 'reservas', 'hosteleria'];

// Precio que ha cambiado mientras la pestaña estaba abierta.
interface CambioVisto {
  antes: number;
  hora: string;
}

const euros = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const porCodigo = (a: { codigo: string }, b: { codigo: string }) => Number(a.codigo) - Number(b.codigo) || a.codigo.localeCompare(b.codigo);
const horaCorta = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

function leerPlegadas(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLAVE_PLEGADAS) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function Stat({ valor, label, icono }: { valor: number; label: string; icono: string }) {
  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl px-3 py-2.5 flex items-center gap-3 min-w-0">
      <span className="w-8 h-8 rounded-full bg-background-100 text-foreground-500 flex items-center justify-center flex-shrink-0">
        <i className={icono}></i>
      </span>
      <div className="min-w-0">
        <p className="text-lg font-semibold tabular-nums text-foreground-950 leading-tight">{valor}</p>
        <p className="text-[11px] text-foreground-400 truncate">{label}</p>
      </div>
    </div>
  );
}

export default function BasculaCatalogoPanel() {
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [nombresFamilia, setNombresFamilia] = useState<Record<string, string>>({});
  const [destinos, setDestinos] = useState<Map<string, Set<Destino>>>(new Map());
  const [fotos, setFotos] = useState<Map<string, string>>(new Map());
  // Dados de alta en la báscula en los últimos 7 días.
  const [recientes, setRecientes] = useState<Set<string>>(new Set());
  const [cambiados, setCambiados] = useState<Map<string, CambioVisto>>(new Map());
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [loading, setLoading] = useState(true);
  // ?buscar=714 abre la lista ya filtrada por ese código.
  const [busqueda, setBusqueda] = useState(() => new URLSearchParams(window.location.search).get('buscar') ?? '');
  const [familia, setFamilia] = useState<string>('todas');
  const [plegadas, setPlegadas] = useState<Set<string>>(leerPlegadas);
  const busquedaDiferida = useDeferredValue(busqueda);
  const anteriorRef = useRef<Map<string, Articulo> | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_PLEGADAS, JSON.stringify([...plegadas]));
    } catch {
      // sin almacenamiento: se pliegan solo durante la sesión
    }
  }, [plegadas]);

  // Lo que cambia con cada lectura de la báscula.
  const cargarCatalogo = useCallback(async () => {
    const [cat, set, altas] = await Promise.all([
      supabase.from('bascula_catalogo').select('codigo, nombre, familia, precio, unidades').eq('origen', ORIGEN),
      supabase.from('settings').select('value').eq('key', `bascula_vigilancia_${ORIGEN}`).maybeSingle(),
      supabase.from('bascula_catalogo_cambios').select('codigo').eq('origen', ORIGEN).eq('tipo', 'nuevo')
        .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString()),
    ]);
    if (cat.error) return;
    const lista = ((cat.data ?? []) as Articulo[]).map((a) => ({ ...a, precio: Number(a.precio) })).sort(porCodigo);
    const anterior = anteriorRef.current;
    if (anterior) {
      const hora = horaCorta(new Date());
      const nuevos: [string, CambioVisto][] = [];
      for (const a of lista) {
        const prev = anterior.get(a.codigo);
        if (prev && Math.abs(prev.precio - a.precio) > 0.001) nuevos.push([a.codigo, { antes: prev.precio, hora }]);
      }
      if (nuevos.length > 0) setCambiados((m) => new Map([...m, ...nuevos]));
    }
    anteriorRef.current = new Map(lista.map((a) => [a.codigo, a]));
    setArticulos(lista);
    setLectura((set.data?.value as Lectura) ?? null);
    setRecientes(new Set((altas.data ?? []).map((c) => c.codigo as string)));
    setLoading(false);
  }, []);

  // Nombres de familia, fotos y dónde sale cada código en la web: cambia
  // poco, se lee al entrar.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [host, res, cod] = await Promise.all([
        supabase.from('hosteleria_listas_precio')
          .select('nombre, bascula_familia, hosteleria_articulos (codigo_bascula, activo, imagen_url)').eq('bascula_origen', ORIGEN),
        supabase.from('reservas_eventos')
          .select('nombre_es, activo, bascula_familia, reservas_articulos (codigo_bascula, activo, imagen_url)').eq('bascula_origen', ORIGEN),
        supabase.from('productos_codigos_bascula').select('codigo_bascula, productos (visible_web, imagen_url)').eq('origen', ORIGEN),
      ]);
      if (!vivo) return;
      type Fila = { codigo_bascula: string | null; activo: boolean; imagen_url: string | null };
      const nombres: Record<string, string> = { ...FAMILIAS_TIENDA };
      const donde = new Map<string, Set<Destino>>();
      const apuntar = (codigo: string, d: Destino) => donde.set(codigo, new Set([...(donde.get(codigo) ?? []), d]));
      const mapaFotos = new Map<string, string>();
      const foto = (codigo: string, url: string | null) => {
        if (url && !mapaFotos.has(codigo)) mapaFotos.set(codigo, url);
      };
      // Prioridad de la foto: tienda, hostelería, reservas.
      for (const c of cod.data ?? []) {
        const p = c.productos as unknown as { visible_web: boolean; imagen_url: string | null } | null;
        if (p?.visible_web) apuntar(c.codigo_bascula as string, 'tienda');
        foto(c.codigo_bascula as string, p?.imagen_url ?? null);
      }
      for (const h of host.data ?? []) {
        if (h.bascula_familia) nombres[h.bascula_familia] = h.nombre;
        for (const a of (h.hosteleria_articulos ?? []) as Fila[]) {
          if (!a.codigo_bascula) continue;
          if (a.activo) apuntar(a.codigo_bascula, 'hosteleria');
          foto(a.codigo_bascula, a.imagen_url);
        }
      }
      for (const r of res.data ?? []) {
        if (r.bascula_familia) nombres[r.bascula_familia] = r.nombre_es;
        for (const a of (r.reservas_articulos ?? []) as Fila[]) {
          if (!a.codigo_bascula) continue;
          if (a.activo && r.activo) apuntar(a.codigo_bascula, 'reservas');
          foto(a.codigo_bascula, a.imagen_url);
        }
      }
      setNombresFamilia(nombres);
      setDestinos(donde);
      setFotos(mapaFotos);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    cargarCatalogo();
  }, [cargarCatalogo]);
  useRealtimeTable('bascula_catalogo', cargarCatalogo);

  const familias = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const a of articulos) conteo.set(a.familia, (conteo.get(a.familia) ?? 0) + 1);
    return [...conteo.entries()].sort(([a], [b]) => Number(a) - Number(b) || a.localeCompare(b));
  }, [articulos]);

  const nombreFamilia = (f: string) => (f ? nombresFamilia[f] ?? 'Sin nombre' : 'Sin familia');

  const q = normalizar(busquedaDiferida.trim());
  const grupos = useMemo(() => {
    const filtrados = articulos.filter(
      (a) => (familia === 'todas' || a.familia === familia) && (!q || a.codigo.startsWith(q) || normalizar(a.nombre).includes(q)),
    );
    return familias
      .map(([f]) => ({ familia: f, items: filtrados.filter((a) => a.familia === f) }))
      .filter((g) => g.items.length > 0);
  }, [articulos, familias, familia, q]);

  const total = grupos.reduce((s, g) => s + g.items.length, 0);
  const sugerencias = useMemo(() => articulos.map((a) => a.nombre), [articulos]);
  const cuenta = (items: Articulo[], d: Destino) => items.filter((a) => destinos.get(a.codigo)?.has(d)).length;
  const sinWeb = useMemo(() => articulos.filter((a) => !destinos.get(a.codigo)?.size).length, [articulos, destinos]);
  // Buscando, se ven todos los resultados aunque su familia esté plegada.
  const plegada = (f: string) => !q && plegadas.has(f);
  const todasPlegadas = grupos.length > 0 && grupos.every((g) => plegadas.has(g.familia));

  const alternar = (f: string) =>
    setPlegadas((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  const plegarTodas = () => setPlegadas(todasPlegadas ? new Set() : new Set(familias.map(([f]) => f)));

  return (
    <div className="pb-28">
      <div
        className="sticky z-10 bg-background-100/95 backdrop-blur-sm border-b border-background-200/50 px-4 md:px-8 py-3"
        style={{ top: 'var(--admin-header-height, 0px)' }}
      >
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <SearchInput
            value={busqueda}
            onChange={setBusqueda}
            suggestions={sugerencias}
            placeholder="Buscar por código o nombre…"
            className="w-full sm:w-[280px] md:w-[360px] flex-shrink-0"
          />
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <select
                value={familia}
                onChange={(e) => setFamilia(e.target.value)}
                aria-label="Familia"
                className="w-full sm:w-auto appearance-none bg-background-50 border border-background-200/70 rounded-full pl-4 pr-9 py-2 text-xs font-medium text-foreground-700 cursor-pointer hover:border-foreground-300/60 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40"
              >
                <option value="todas">Todas las familias ({articulos.length})</option>
                {familias.map(([f, n]) => (
                  <option key={f} value={f}>
                    {f ? `${f} · ` : ''}{nombreFamilia(f)} ({n})
                  </option>
                ))}
              </select>
              <i className="ri-arrow-down-s-line absolute right-3 top-1/2 -translate-y-1/2 text-foreground-400 pointer-events-none"></i>
            </div>
            <button
              type="button"
              onClick={plegarTodas}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium bg-background-50 border border-background-200/70 text-foreground-500 hover:text-foreground-950 whitespace-nowrap"
            >
              <i className={todasPlegadas ? 'ri-expand-up-down-line' : 'ri-contract-up-down-line'}></i>
              {todasPlegadas ? 'Desplegar todas' : 'Plegar todas'}
            </button>
          </div>
          <span className="sm:ml-auto inline-flex items-center gap-1.5 text-[11px] text-foreground-400 whitespace-nowrap">
            {lectura?.conectada === false ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                Báscula sin conexión
                {lectura.ultima_lectura && ` · última lectura ${horaCorta(new Date(lectura.ultima_lectura))}`}
              </>
            ) : (
              <>
                <span className="relative flex w-2 h-2">
                  <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60"></span>
                  <span className="relative w-2 h-2 rounded-full bg-emerald-500"></span>
                </span>
                En directo{lectura?.ultima_lectura && ` · leída a las ${horaCorta(new Date(lectura.ultima_lectura))}`}
              </>
            )}
          </span>
        </div>
      </div>

      <div className="px-4 md:px-8 pt-4">
        {!loading && articulos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-5">
            <Stat valor={articulos.length} label="En la báscula" icono="ri-scales-3-line" />
            {ORDEN_DESTINOS.map((d) => (
              <Stat key={d} valor={cuenta(articulos, d)} label={`En ${DESTINOS[d].label.toLowerCase()}`} icono={DESTINOS[d].icono} />
            ))}
            <Stat valor={sinWeb} label="Solo en la báscula" icono="ri-eye-off-line" />
          </div>
        )}

        {q && !loading && (
          <p className="text-xs text-foreground-400 mb-3">
            {total} de {articulos.length} artículos
          </p>
        )}

        {loading ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-background-200/50 animate-pulse"></div>
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
          <div className="space-y-3">
            {grupos.map((g) => {
              const color = COLOR_FAMILIA[g.familia] ?? COLOR_OTRA;
              const cerrada = plegada(g.familia);
              const resumen = ORDEN_DESTINOS.map((d) => [d, cuenta(g.items, d)] as const).filter(([, n]) => n > 0);
              return (
                <section key={g.familia} className="bg-background-50 border border-background-200/70 rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => alternar(g.familia)}
                    aria-expanded={!cerrada}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-background-100/60 transition-colors focus:outline-none focus-visible:bg-background-100"
                  >
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-semibold flex-shrink-0 ${color.suave} ${color.texto}`}>
                      {g.familia || '–'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground-950 truncate">{nombreFamilia(g.familia)}</span>
                      <span className="block text-[11px] text-foreground-400">
                        {g.items.length} artículo{g.items.length === 1 ? '' : 's'}
                        {resumen.map(([d, n]) => ` · ${n === g.items.length ? 'todos' : n} en ${DESTINOS[d].label.toLowerCase()}`).join('')}
                        {resumen.length === 0 && ' · no salen en la web'}
                      </span>
                    </span>
                    <i className={`ri-arrow-down-s-line text-lg text-foreground-400 transition-transform duration-200 ${cerrada ? '-rotate-90' : ''}`}></i>
                  </button>

                  {!cerrada && (
                    <div className="grid gap-2 p-2 pt-0 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                      {g.items.map((a) => {
                        const foto = fotos.get(a.codigo);
                        const cambio = cambiados.get(a.codigo);
                        return (
                          <div
                            key={a.codigo}
                            className={`relative flex items-center gap-3 rounded-xl border p-2 pl-3 overflow-hidden ${
                              cambio ? 'border-amber-300 bg-amber-50/50' : 'border-background-200/70 bg-background-50'
                            }`}
                          >
                            <span className={`absolute left-0 top-0 bottom-0 w-1 ${color.barra}`}></span>
                            <div className="w-14 h-14 rounded-lg bg-background-100 overflow-hidden flex-shrink-0">
                              {foto ? (
                                <img src={foto} alt="" loading="lazy" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-foreground-300">
                                  <i className="ri-image-line text-xl"></i>
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-[11px] font-semibold text-foreground-500 bg-background-100 rounded px-1.5 py-0.5 tabular-nums">{a.codigo}</span>
                                {ORDEN_DESTINOS.filter((d) => destinos.get(a.codigo)?.has(d)).map((d) => (
                                  <span key={d} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${DESTINOS[d].clase}`}>
                                    <i className={DESTINOS[d].icono}></i>
                                    {DESTINOS[d].corto}
                                  </span>
                                ))}
                                {!destinos.get(a.codigo)?.size && (
                                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-background-100 text-foreground-400">Solo báscula</span>
                                )}
                                {recientes.has(a.codigo) && (
                                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800">Nuevo</span>
                                )}
                              </div>
                              <p className="mt-0.5 text-sm font-medium text-foreground-950 leading-snug break-words">{a.nombre}</p>
                              {cambio && (
                                <p className="text-[11px] text-amber-800">
                                  Antes <span className="line-through">{euros(cambio.antes)}</span> · {cambio.hora}
                                </p>
                              )}
                            </div>
                            <div className="flex-shrink-0 text-right self-center pr-1">
                              <p className="text-base font-semibold tabular-nums text-foreground-950 leading-tight">{euros(a.precio)}</p>
                              <p className="text-[11px] text-foreground-400">/{a.unidades === 'un' ? 'ud' : 'kg'}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
