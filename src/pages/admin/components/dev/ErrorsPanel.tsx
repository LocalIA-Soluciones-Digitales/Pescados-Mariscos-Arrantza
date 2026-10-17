import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useErrorLogs } from '@/hooks/useErrorLogs';
import { DAY_MS, browserOf, dayKey, groupErrors, inRange, type DateRange, type ErrorGroup } from '@/lib/devAnalytics';
import { CHART, Card, Empty, Kpi, Segmented, Sparkline, fmtAgo, fmtInt, fmtShortDate } from './ui';
import { ERROR_SOURCE_LABELS } from './labels';

const SOURCE_COLORS: Record<string, string> = {
  window_error: '#b42318',
  unhandled_rejection: '#b54708',
  react_boundary: '#4f6678',
  api: '#948777',
};

function copyText(text: string) {
  void navigator.clipboard?.writeText(text);
}

function groupAsMarkdown(g: ErrorGroup): string {
  return [
    `### ${g.message}`,
    `- Origen: ${ERROR_SOURCE_LABELS[g.source] ?? g.source}`,
    `- Ocurrencias: ${g.count} (primera ${new Date(g.first).toLocaleString('es-ES')}, última ${new Date(g.last).toLocaleString('es-ES')})`,
    `- URLs: ${g.urls.map((u) => `${u.url} (${u.count})`).join(', ')}`,
    `- Navegadores: ${g.browsers.map((b) => `${b.name} (${b.count})`).join(', ')}`,
    `- URL completa: ${g.sample.url ?? '—'}`,
    `- User-Agent: ${g.sample.user_agent ?? '—'}`,
    '',
    '```',
    g.sample.stack ?? '(sin stack)',
    '```',
  ].join('\n');
}

function GroupRow({ g, isNew, onDelete }: { g: ErrorGroup; isNew: boolean; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="border-b border-background-200/50 last:border-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left px-4 md:px-5 py-3 hover:bg-background-100/60 grid grid-cols-[1fr_auto] md:grid-cols-[1fr_7rem_4rem_6rem] gap-3 items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-background-50" style={{ backgroundColor: SOURCE_COLORS[g.source] ?? CHART.axis }}>{ERROR_SOURCE_LABELS[g.source] ?? g.source}</span>
            {isNew && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">nuevo</span>}
            <span className="text-[11px] text-foreground-400 truncate font-mono">{g.urls[0]?.url}</span>
          </div>
          <p className={`text-sm text-foreground-950 ${open ? 'break-words' : 'truncate'}`}>{g.message}</p>
        </div>
        <div className="hidden md:block w-28" title="Ocurrencias en los últimos 14 días">
          <Sparkline values={g.daily} color={SOURCE_COLORS[g.source] ?? CHART.ink} height={24} />
        </div>
        <span className="text-sm font-semibold text-foreground-950 tabular-nums text-right">{fmtInt(g.count)}</span>
        <span className="hidden md:block text-[11px] text-foreground-400 text-right">{fmtAgo(g.last)}</span>
      </button>
      {open && (
        <div className="px-4 md:px-5 pb-4 space-y-3 animate-fadeIn">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
            <div>
              <p className="uppercase tracking-wide text-foreground-400 mb-1">Ventana</p>
              <p className="text-foreground-700">Primera: {new Date(g.first).toLocaleString('es-ES')}</p>
              <p className="text-foreground-700">Última: {new Date(g.last).toLocaleString('es-ES')}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-foreground-400 mb-1">Rutas</p>
              {g.urls.map((u) => <p key={u.url} className="text-foreground-700 font-mono truncate">{u.url} <span className="text-foreground-400">×{u.count}</span></p>)}
            </div>
            <div>
              <p className="uppercase tracking-wide text-foreground-400 mb-1">Navegadores</p>
              {g.browsers.map((b) => <p key={b.name} className="text-foreground-700">{b.name} <span className="text-foreground-400">×{b.count}</span></p>)}
            </div>
          </div>
          {g.sample.stack && <pre className="max-h-72 overflow-auto rounded-lg bg-primary-500 text-background-100 p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-all font-mono">{g.sample.stack}</pre>}
          {g.sample.url && <p className="text-[11px] text-foreground-400 font-mono break-all">{g.sample.url}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { copyText(groupAsMarkdown(g)); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600">
              <i className={copied ? 'ri-check-line mr-1' : 'ri-file-copy-line mr-1'} />{copied ? 'Copiado' : 'Copiar para el issue'}
            </button>
            <button type="button" onClick={() => { if (confirm(`¿Borrar las ${g.count} ocurrencias de este error?`)) onDelete(); }} className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100">
              <i className="ri-check-double-line mr-1" />Marcar resuelto (borrar)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ErrorsPanel({ range }: { range: DateRange }) {
  const { errors, loading, clearAll, removeIds, refetch } = useErrorLogs();
  const [source, setSource] = useState<string>('all');
  const [q, setQ] = useState('');

  const inR = useMemo(() => inRange(errors, range), [errors, range]);
  const filtered = useMemo(
    () => inR.filter((e) => (source === 'all' || e.source === source) && (!q || `${e.message} ${e.url ?? ''} ${e.stack ?? ''}`.toLowerCase().includes(q.toLowerCase()))),
    [inR, source, q],
  );
  const groups = useMemo(() => groupErrors(filtered), [filtered]);
  // "Nuevo" = el grupo no tenía ninguna ocurrencia antes del rango.
  const allGroupsFirst = useMemo(() => new Map(groupErrors(errors).map((g) => [g.fingerprint, g.first])), [errors]);

  const daily = useMemo(() => {
    const days: Record<string, string | number>[] = [];
    const idx = new Map<string, Record<string, string | number>>();
    for (let t = range.from.getTime(); t < range.to.getTime(); t += DAY_MS) {
      const row: Record<string, string | number> = { date: dayKey(new Date(t)), window_error: 0, unhandled_rejection: 0, react_boundary: 0, api: 0 };
      days.push(row);
      idx.set(row.date as string, row);
    }
    for (const e of filtered) {
      const row = idx.get(dayKey(e.created_at));
      if (row) row[e.source] = Number(row[e.source] ?? 0) + 1;
    }
    return days;
  }, [filtered, range]);

  const browsers = useMemo(() => new Set(filtered.map((e) => browserOf(e.user_agent))).size, [filtered]);
  const newGroups = groups.filter((g) => (allGroupsFirst.get(g.fingerprint) ?? g.first) >= range.from.toISOString()).length;
  const last24 = filtered.filter((e) => Date.now() - new Date(e.created_at).getTime() < DAY_MS).length;

  if (loading) return <p className="text-sm text-foreground-400">Cargando…</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Ocurrencias" value={fmtInt(filtered.length)} spark={daily.map((d) => Number(d.window_error) + Number(d.unhandled_rejection) + Number(d.react_boundary) + Number(d.api))} />
        <Kpi label="Errores distintos" value={fmtInt(groups.length)} hint="Agrupados por mensaje normalizado (sin números, ids ni URLs)" />
        <Kpi label="Nuevos en el rango" value={fmtInt(newGroups)} hint="Grupos sin ocurrencias anteriores al rango" />
        <Kpi label="Últimas 24 h" value={fmtInt(last24)} hint={`${browsers} navegador${browsers === 1 ? '' : 'es'} distinto${browsers === 1 ? '' : 's'} afectado${browsers === 1 ? '' : 's'}`} />
      </div>

      <Card title="Errores por día" subtitle="Apilado por origen">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={daily} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={{ stroke: CHART.grid }} minTickGap={28} />
            <YAxis tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip labelFormatter={(l) => fmtShortDate(String(l))} cursor={{ fill: CHART.grid, opacity: 0.5 }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            {Object.keys(SOURCE_COLORS).map((s) => (
              <Bar key={s} dataKey={s} stackId="e" name={ERROR_SOURCE_LABELS[s]} fill={SOURCE_COLORS[s]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card
        title="Agrupados"
        subtitle="Ordenados por última aparición · pulsa para ver stack, rutas y navegadores"
        pad={false}
        actions={
          <>
            <button type="button" onClick={() => refetch()} className="w-8 h-8 rounded-full flex items-center justify-center text-foreground-500 hover:text-foreground-950 hover:bg-background-100" title="Recargar"><i className="ri-refresh-line" /></button>
            {errors.length > 0 && (
              <button type="button" onClick={() => { if (confirm('¿Borrar TODO el registro de errores?')) clearAll(); }} className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100">Vaciar todo</button>
            )}
          </>
        }
      >
        <div className="px-4 md:px-5 pb-3 flex flex-wrap items-center gap-2">
          <Segmented value={source} onChange={setSource} size="xs" options={[{ value: 'all', label: 'Todos' }, ...Object.keys(ERROR_SOURCE_LABELS).map((s) => ({ value: s, label: ERROR_SOURCE_LABELS[s] }))]} />
          <div className="relative flex-1 min-w-[12rem]">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en mensaje, URL o stack…" className="w-full pl-8 pr-3 py-1.5 bg-background-100 border border-background-200/70 rounded-full text-xs focus:outline-none focus:border-foreground-300/60" />
          </div>
        </div>
        <div className="border-t border-background-200/70">
          {groups.length === 0 ? (
            <Empty icon="ri-shield-check-line" title={errors.length === 0 ? 'Sin errores registrados' : 'Nada con estos filtros'} body={errors.length === 0 ? 'El frontend no ha reportado ningún error. Buena señal.' : 'Prueba con otro rango, origen o búsqueda.'} />
          ) : (
            groups.map((g) => <GroupRow key={g.fingerprint} g={g} isNew={(allGroupsFirst.get(g.fingerprint) ?? g.first) >= range.from.toISOString()} onDelete={() => removeIds(g.ids)} />)
          )}
        </div>
      </Card>
      <p className="text-[11px] text-foreground-400">Se cargan los {fmtInt(errors.length)} registros más recientes (máx. 1.000).</p>
    </div>
  );
}
