import { useDeferredValue, useMemo, useState } from 'react';
import SearchInput from '@/components/base/SearchInput';
import { ORIGENES, ORIGEN_COLORS, type Origen } from '@/types/origen';
import type { ArticuloBascula, CambioBascula, EstadoLectura, useBasculasCambios } from '@/hooks/useBasculasCambios';

type Datos = ReturnType<typeof useBasculasCambios>;
type Tipo = CambioBascula['tipo'];
type Periodo = '24h' | '7d' | '30d' | 'todo';

const NOMBRE_BASCULA: Record<Origen, string> = { pescaderia_1: 'Báscula 1', pescaderia_2: 'Báscula 2' };
const CORTO_BASCULA: Record<Origen, string> = { pescaderia_1: 'B1', pescaderia_2: 'B2' };
const PAPEL_BASCULA: Record<Origen, string> = { pescaderia_1: 'Precios de la web', pescaderia_2: 'Solo vigilada' };

const TIPOS: { value: Tipo; label: string; icono: string; clase: string }[] = [
  { value: 'precio', label: 'Precio', icono: 'ri-price-tag-3-line', clase: 'bg-amber-50 text-amber-700 ring-amber-200' },
  { value: 'nuevo', label: 'Nuevo', icono: 'ri-add-circle-line', clase: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  { value: 'eliminado', label: 'Eliminado', icono: 'ri-delete-bin-line', clase: 'bg-red-50 text-red-600 ring-red-200' },
  { value: 'renombrado', label: 'Otro producto', icono: 'ri-swap-line', clase: 'bg-red-50 text-red-600 ring-red-200' },
  { value: 'familia', label: 'Familia', icono: 'ri-folder-transfer-line', clase: 'bg-sky-50 text-sky-700 ring-sky-200' },
  { value: 'unidades', label: 'Unidades', icono: 'ri-scales-3-line', clase: 'bg-sky-50 text-sky-700 ring-sky-200' },
];
const TIPO: Record<Tipo, (typeof TIPOS)[number]> = Object.fromEntries(TIPOS.map((t) => [t.value, t])) as Record<Tipo, (typeof TIPOS)[number]>;

const PERIODOS: { value: Periodo; label: string; horas: number | null }[] = [
  { value: '24h', label: '24 h', horas: 24 },
  { value: '7d', label: '7 días', horas: 24 * 7 },
  { value: '30d', label: '30 días', horas: 24 * 30 },
  { value: 'todo', label: 'Todo', horas: null },
];

const euros = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const unidad = (a: ArticuloBascula) => (a.unidades === 'un' ? 'ud' : a.unidades || 'kg');
const precio = (a: ArticuloBascula) => `${euros(a.precio)}/${unidad(a)}`;
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;

// "Kokotxa", "KOKOTXA" y "kokótxa" encuentran lo mismo.
const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const nombreDe = (c: CambioBascula) => (c.despues ?? c.antes)?.nombre ?? '';

function variacion(c: CambioBascula): { euros: number; pct: number | null } | null {
  if (c.tipo !== 'precio' || !c.antes || !c.despues) return null;
  const diff = c.despues.precio - c.antes.precio;
  return { euros: diff, pct: c.antes.precio > 0 ? (diff / c.antes.precio) * 100 : null };
}

function antesDespues(c: CambioBascula): [string, string] {
  const a = c.antes;
  const d = c.despues;
  switch (c.tipo) {
    case 'precio':
      return [precio(a!), precio(d!)];
    case 'renombrado':
      return [a!.nombre, d!.nombre];
    case 'nuevo':
      return ['—', `${precio(d!)} · f${d!.familia}`];
    case 'eliminado':
      return [`${precio(a!)} · f${a!.familia}`, '—'];
    case 'familia':
      return [`Familia ${a!.familia}`, `Familia ${d!.familia}`];
    case 'unidades':
      return [unidad(a!), unidad(d!)];
  }
}

function etiquetaDia(clave: string): string {
  const hoy = new Date();
  const ayer = new Date(hoy.getTime() - 86_400_000);
  if (clave === hoy.toLocaleDateString('sv-SE')) return 'Hoy';
  if (clave === ayer.toLocaleDateString('sv-SE')) return 'Ayer';
  return new Date(`${clave}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function exportarCsv(filas: CambioBascula[]) {
  const cabecera = ['fecha', 'bascula', 'codigo', 'producto', 'tipo', 'antes', 'despues', 'variacion_eur', 'variacion_pct'];
  const celda = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lineas = filas.map((c) => {
    const [antes, despues] = antesDespues(c);
    const v = variacion(c);
    return [fechaHora(c.created_at), NOMBRE_BASCULA[c.origen], c.codigo, nombreDe(c), TIPO[c.tipo].label, antes, despues, v ? v.euros.toFixed(2) : '', v?.pct != null ? v.pct.toFixed(1) : '']
      .map(celda)
      .join(';');
  });
  // BOM para que Excel abra bien las tildes; ";" como separador en español.
  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([bom, [cabecera.join(';'), ...lineas].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cambios-basculas-${new Date().toLocaleDateString('sv-SE')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ChipBascula({ origen, corto = false }: { origen: Origen; corto?: boolean }) {
  const c = ORIGEN_COLORS[origen];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></span>
      {corto ? CORTO_BASCULA[origen] : NOMBRE_BASCULA[origen]}
    </span>
  );
}

function ChipTipo({ tipo }: { tipo: Tipo }) {
  const t = TIPO[tipo];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ring-inset ${t.clase}`}>
      <i className={`${t.icono} text-xs`}></i>
      {t.label}
    </span>
  );
}

function Variacion({ c }: { c: CambioBascula }) {
  const v = variacion(c);
  if (!v) return <span className="text-foreground-300">—</span>;
  const sube = v.euros > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${sube ? 'text-red-600' : 'text-emerald-600'}`}>
      <i className={sube ? 'ri-arrow-up-line' : 'ri-arrow-down-line'}></i>
      {euros(Math.abs(v.euros))}
      {v.pct != null && <span className="text-[11px] opacity-80 ml-1">({pct(v.pct)})</span>}
    </span>
  );
}

function TarjetaEstado({ origen, estado }: { origen: Origen; estado?: EstadoLectura }) {
  const conectada = estado?.conectada !== false;
  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl px-4 py-3 flex items-center gap-3 min-w-0">
      <span
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
          !estado ? 'bg-background-100 text-foreground-400' : conectada ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
        }`}
      >
        <i className={!estado ? 'ri-time-line' : conectada ? 'ri-wifi-line' : 'ri-wifi-off-line'}></i>
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground-950">{NOMBRE_BASCULA[origen]}</p>
          <span className="text-[11px] text-foreground-400">{PAPEL_BASCULA[origen]}</span>
        </div>
        <p className="text-xs text-foreground-500 truncate">
          {!estado
            ? 'Sin leer todavía'
            : conectada
              ? `Leída ${estado.ultima_lectura ? fechaHora(estado.ultima_lectura) : '—'} · ${estado.articulos ?? 0} artículos`
              : `Sin conexión desde ${estado.ultimo_intento ? fechaHora(estado.ultimo_intento) : '—'}${estado.ultima_lectura ? ` · última buena ${fechaHora(estado.ultima_lectura)}` : ''}`}
        </p>
      </div>
    </div>
  );
}

function Kpi({ label, valor, detalle, tono = 'neutro' }: { label: string; valor: string | number; detalle?: string; tono?: 'neutro' | 'sube' | 'baja' | 'aviso' }) {
  const color = { neutro: 'text-foreground-950', sube: 'text-red-600', baja: 'text-emerald-600', aviso: 'text-amber-700' }[tono];
  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl px-4 py-3 min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-foreground-400">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{valor}</p>
      {detalle && <p className="text-[11px] text-foreground-400 truncate">{detalle}</p>}
    </div>
  );
}

const chipFiltro = (activo: boolean) =>
  `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
    activo ? 'bg-foreground-950 text-background-50' : 'bg-background-50 border border-background-200/70 text-foreground-500 hover:text-foreground-950'
  }`;

export default function BasculasCambiosPanel({ datos }: { datos: Datos }) {
  const { cambios, estados, diferencias, loading, nuevos, visto, marcarVisto, leyendo, lectura, actualizar } = datos;

  const [busqueda, setBusqueda] = useState('');
  const [bascula, setBascula] = useState<Origen | 'todas'>('todas');
  const [periodo, setPeriodo] = useState<Periodo>('30d');
  const [tipos, setTipos] = useState<Set<Tipo>>(new Set());
  const [soloSinVer, setSoloSinVer] = useState(false);
  const [verDiferencias, setVerDiferencias] = useState(false);
  const busquedaDiferida = useDeferredValue(busqueda);

  const sugerencias = useMemo(() => [...new Set(cambios.map(nombreDe).filter(Boolean))], [cambios]);

  // Todos los filtros menos el de tipo: sirve para contar cuántos hay de
  // cada tipo en los chips y para los indicadores.
  const base = useMemo(() => {
    const horas = PERIODOS.find((p) => p.value === periodo)?.horas ?? null;
    const desde = horas ? new Date(Date.now() - horas * 3_600_000).toISOString() : '';
    const q = normalizar(busquedaDiferida.trim());
    return cambios.filter(
      (c) =>
        (bascula === 'todas' || c.origen === bascula) &&
        (!desde || c.created_at >= desde) &&
        (!soloSinVer || c.created_at > visto) &&
        (!q || c.codigo.startsWith(q) || normalizar(nombreDe(c)).includes(q) || normalizar(c.antes?.nombre ?? '').includes(q)),
    );
  }, [cambios, bascula, periodo, soloSinVer, visto, busquedaDiferida]);

  const filtrados = useMemo(() => (tipos.size === 0 ? base : base.filter((c) => tipos.has(c.tipo))), [base, tipos]);

  const conteoTipos = useMemo(() => {
    const r = {} as Record<Tipo, number>;
    for (const c of base) r[c.tipo] = (r[c.tipo] ?? 0) + 1;
    return r;
  }, [base]);

  const kpis = useMemo(() => {
    const vars = filtrados.map(variacion).filter((v): v is { euros: number; pct: number | null } => !!v);
    const subidas = vars.filter((v) => v.euros > 0);
    const bajadas = vars.filter((v) => v.euros < 0);
    const media = (xs: { pct: number | null }[]) => {
      const p = xs.map((x) => x.pct).filter((x): x is number => x != null);
      return p.length ? p.reduce((s, x) => s + x, 0) / p.length : null;
    };
    const mSube = media(subidas);
    const mBaja = media(bajadas);
    return {
      total: filtrados.length,
      productos: new Set(filtrados.map((c) => `${c.origen}:${c.codigo}`)).size,
      subidas: subidas.length,
      mediaSubida: mSube,
      bajadas: bajadas.length,
      mediaBajada: mBaja,
      estructurales: filtrados.filter((c) => c.tipo !== 'precio').length,
    };
  }, [filtrados]);

  const porDia = useMemo(() => {
    const grupos = new Map<string, CambioBascula[]>();
    for (const c of filtrados) {
      const dia = new Date(c.created_at).toLocaleDateString('sv-SE');
      if (!grupos.has(dia)) grupos.set(dia, []);
      grupos.get(dia)!.push(c);
    }
    return [...grupos.entries()];
  }, [filtrados]);

  const hayFiltros = busqueda !== '' || bascula !== 'todas' || periodo !== '30d' || tipos.size > 0 || soloSinVer;
  const limpiarFiltros = () => {
    setBusqueda('');
    setBascula('todas');
    setPeriodo('30d');
    setTipos(new Set());
    setSoloSinVer(false);
  };
  const alternarTipo = (t: Tipo) =>
    setTipos((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  return (
    <div className="pb-28">
      <div className="px-4 md:px-8 pt-6 space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          {ORIGENES.map((o) => (
            <TarjetaEstado key={o} origen={o} estado={estados[o]} />
          ))}
          <button
            type="button"
            onClick={() => setVerDiferencias((v) => !v)}
            className={`rounded-xl px-4 py-3 flex items-center gap-3 text-left border transition-colors ${
              diferencias.length === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
            }`}
          >
            <i className={`text-lg ${diferencias.length === 0 ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'}`}></i>
            <span className="text-sm font-medium">
              {diferencias.length === 0 ? 'Las dos básculas coinciden' : `${diferencias.length} diferencia${diferencias.length === 1 ? '' : 's'} entre básculas`}
            </span>
            {diferencias.length > 0 && <i className={`ml-auto ${verDiferencias ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}`}></i>}
          </button>
        </div>

        {verDiferencias && diferencias.length > 0 && (
          <div className="bg-background-50 border border-background-200/70 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-background-100 text-[11px] uppercase tracking-wide text-foreground-400">
                  <tr>
                    <th className="text-left font-medium px-3 py-2 w-16">Código</th>
                    <th className="text-left font-medium px-3 py-2">Báscula 1</th>
                    <th className="text-left font-medium px-3 py-2">Báscula 2</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-background-200/70">
                  {diferencias.map((d) => (
                    <tr key={d.codigo}>
                      <td className="px-3 py-2 font-mono text-foreground-500">{d.codigo}</td>
                      <td className="px-3 py-2 text-foreground-950">{d.bascula1 ? `${d.bascula1.nombre} · ${precio(d.bascula1)} · f${d.bascula1.familia}` : '—'}</td>
                      <td className="px-3 py-2 text-foreground-950">{d.bascula2 ? `${d.bascula2.nombre} · ${precio(d.bascula2)} · f${d.bascula2.familia}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {nuevos > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-800">
              <i className="ri-notification-3-line mr-1.5"></i>
              {nuevos} cambio{nuevos === 1 ? '' : 's'} sin ver
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSoloSinVer(true)} className="px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200">
                Ver solo esos
              </button>
              <button
                type="button"
                onClick={() => {
                  marcarVisto();
                  setSoloSinVer(false);
                }}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-background-50 text-amber-800 hover:bg-amber-100"
              >
                Marcar como visto
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Cambios" valor={kpis.total} detalle={`${kpis.productos} artículo${kpis.productos === 1 ? '' : 's'} afectado${kpis.productos === 1 ? '' : 's'}`} />
          <Kpi label="Subidas de precio" valor={kpis.subidas} detalle={kpis.mediaSubida != null ? `Media ${pct(kpis.mediaSubida)}` : 'Sin subidas'} tono={kpis.subidas ? 'sube' : 'neutro'} />
          <Kpi label="Bajadas de precio" valor={kpis.bajadas} detalle={kpis.mediaBajada != null ? `Media ${pct(kpis.mediaBajada)}` : 'Sin bajadas'} tono={kpis.bajadas ? 'baja' : 'neutro'} />
          <Kpi label="Cambios de producto" valor={kpis.estructurales} detalle="Altas, bajas, familia, unidades" tono={kpis.estructurales ? 'aviso' : 'neutro'} />
        </div>
      </div>

      <div
        className="sticky z-10 mt-4 bg-background-100/95 backdrop-blur-sm border-y border-background-200/50 px-4 md:px-8 py-3 space-y-2"
        style={{ top: 'var(--admin-header-height, 0px)' }}
      >
        <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
          <SearchInput value={busqueda} onChange={setBusqueda} suggestions={sugerencias} placeholder="Buscar por producto o código…" className="w-full lg:w-[340px] flex-shrink-0" />
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
            <div className="inline-flex p-0.5 rounded-full bg-background-50 border border-background-200/70 flex-shrink-0">
              {(['todas', ...ORIGENES] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setBascula(o)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    bascula === o ? 'bg-foreground-950 text-background-50' : 'text-foreground-500 hover:text-foreground-950'
                  }`}
                >
                  {o === 'todas' ? 'Todas' : NOMBRE_BASCULA[o]}
                </button>
              ))}
            </div>
            <div className="inline-flex p-0.5 rounded-full bg-background-50 border border-background-200/70 flex-shrink-0">
              {PERIODOS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPeriodo(p.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    periodo === p.value ? 'bg-foreground-950 text-background-50' : 'text-foreground-500 hover:text-foreground-950'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 lg:ml-auto">
            {leyendo ? (
              <span className="text-xs text-foreground-400 whitespace-nowrap">Leyendo las básculas…</span>
            ) : (
              lectura && (
                <span className="text-xs text-foreground-500 whitespace-nowrap">
                  {lectura.map((l) => (
                    <span key={l.origen} title={l.mensaje} className={`ml-2 first:ml-0 ${l.ok ? '' : 'text-red-600'}`}>
                      {CORTO_BASCULA[l.origen]}: {l.ok ? (l.cambios === 0 ? 'sin cambios' : `${l.cambios} cambio${l.cambios === 1 ? '' : 's'}`) : 'sin conexión'}
                    </span>
                  ))}
                </span>
              )
            )}
            <button
              type="button"
              onClick={actualizar}
              disabled={leyendo}
              title="Leer ahora las dos básculas"
              aria-label="Leer ahora las dos básculas"
              className="w-8 h-8 rounded-full flex items-center justify-center bg-background-50 border border-background-200/70 text-foreground-500 hover:text-foreground-950 disabled:cursor-wait"
            >
              <i className={`ri-refresh-line ${leyendo || loading ? 'animate-spin' : ''}`}></i>
            </button>
            <button
              type="button"
              onClick={() => exportarCsv(filtrados)}
              disabled={filtrados.length === 0}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium bg-background-50 border border-background-200/70 text-foreground-500 hover:text-foreground-950 disabled:opacity-40"
            >
              <i className="ri-download-2-line"></i>
              CSV
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {TIPOS.map((t) => (
            <button key={t.value} type="button" onClick={() => alternarTipo(t.value)} className={chipFiltro(tipos.has(t.value))}>
              <i className={t.icono}></i>
              {t.label}
              <span className={`tabular-nums ${tipos.has(t.value) ? 'opacity-70' : 'text-foreground-400'}`}>{conteoTipos[t.value] ?? 0}</span>
            </button>
          ))}
          <span className="w-px h-5 bg-background-200 mx-1 flex-shrink-0"></span>
          <button type="button" onClick={() => setSoloSinVer((v) => !v)} className={chipFiltro(soloSinVer)}>
            <i className="ri-notification-3-line"></i>
            Sin ver
          </button>
          {hayFiltros && (
            <button type="button" onClick={limpiarFiltros} className="px-3 py-1.5 rounded-full text-xs font-medium text-primary-600 hover:text-primary-700 whitespace-nowrap">
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <div className="px-4 md:px-8 pt-4">
        <p className="text-xs text-foreground-400 mb-3">
          {filtrados.length} de {cambios.length} cambio{cambios.length === 1 ? '' : 's'} registrados
        </p>

        {loading && cambios.length === 0 ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-background-200/50 animate-pulse"></div>
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="bg-background-50 border border-dashed border-background-200 rounded-xl py-12 text-center">
            <i className="ri-inbox-line text-3xl text-foreground-300"></i>
            <p className="text-sm text-foreground-500 mt-2">{cambios.length === 0 ? 'Todavía no hay cambios registrados en las básculas.' : 'Ningún cambio con estos filtros.'}</p>
            {hayFiltros && (
              <button type="button" onClick={limpiarFiltros} className="mt-3 text-xs font-medium text-primary-600 hover:text-primary-700">
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {porDia.map(([dia, filas]) => (
              <section key={dia}>
                <h3 className="flex items-baseline gap-2 mb-2">
                  <span className="text-sm font-semibold text-foreground-950 first-letter:uppercase">{etiquetaDia(dia)}</span>
                  <span className="text-xs text-foreground-400">
                    {filas.length} cambio{filas.length === 1 ? '' : 's'}
                  </span>
                </h3>

                {/* Escritorio: tabla */}
                <div className="hidden md:block bg-background-50 border border-background-200/70 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-background-100 text-[11px] uppercase tracking-wide text-foreground-400">
                      <tr>
                        <th className="text-left font-medium px-3 py-2 w-16">Hora</th>
                        <th className="text-left font-medium px-3 py-2 w-16">Báscula</th>
                        <th className="text-left font-medium px-3 py-2 w-16">Código</th>
                        <th className="text-left font-medium px-3 py-2">Producto</th>
                        <th className="text-left font-medium px-3 py-2 w-32">Tipo</th>
                        <th className="text-left font-medium px-3 py-2">Antes</th>
                        <th className="text-left font-medium px-3 py-2">Después</th>
                        <th className="text-right font-medium px-3 py-2 w-40">Variación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-background-200/70">
                      {filas.map((c) => {
                        const [antes, despues] = antesDespues(c);
                        const sinVer = c.created_at > visto;
                        return (
                          <tr key={c.id} className={sinVer ? 'bg-amber-50/40' : 'hover:bg-background-100/60'}>
                            <td className="px-3 py-2 tabular-nums text-foreground-500">
                              <span className="inline-flex items-center gap-1.5">
                                {sinVer && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Sin ver"></span>}
                                {hora(c.created_at)}
                              </span>
                            </td>
                            <td className="px-3 py-2"><ChipBascula origen={c.origen} corto /></td>
                            <td className="px-3 py-2 font-mono text-foreground-500">{c.codigo}</td>
                            <td className="px-3 py-2 text-foreground-950 font-medium">{nombreDe(c)}</td>
                            <td className="px-3 py-2"><ChipTipo tipo={c.tipo} /></td>
                            <td className={`px-3 py-2 text-foreground-400 ${antes !== '—' ? 'line-through decoration-foreground-300/60' : ''}`}>{antes}</td>
                            <td className="px-3 py-2 text-foreground-950">{despues}</td>
                            <td className="px-3 py-2 text-right"><Variacion c={c} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Móvil: tarjetas */}
                <div className="md:hidden space-y-2">
                  {filas.map((c) => {
                    const [antes, despues] = antesDespues(c);
                    const sinVer = c.created_at > visto;
                    return (
                      <div key={c.id} className={`bg-background-50 border rounded-xl p-3 ${sinVer ? 'border-amber-300' : 'border-background-200/70'}`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <ChipBascula origen={c.origen} corto />
                          <ChipTipo tipo={c.tipo} />
                          <span className="ml-auto text-[11px] tabular-nums text-foreground-400">{hora(c.created_at)}</span>
                        </div>
                        <p className="text-sm font-medium text-foreground-950">
                          <span className="font-mono text-foreground-400 mr-1.5">{c.codigo}</span>
                          {nombreDe(c)}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-sm">
                          <span className={`text-foreground-400 ${antes !== '—' ? 'line-through decoration-foreground-300/60' : ''}`}>{antes}</span>
                          <i className="ri-arrow-right-line text-foreground-300"></i>
                          <span className="text-foreground-950">{despues}</span>
                          <span className="ml-auto"><Variacion c={c} /></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
