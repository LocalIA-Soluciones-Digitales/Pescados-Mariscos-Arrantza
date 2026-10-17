import { useMemo, useState, type ReactNode } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { VisitEntry } from '@/lib/visitLog';
import {
  breakdownBy,
  buildDailySeries,
  buildHeatmap,
  buildKpis,
  buildPages,
  buildSessions,
  inRange,
  pctChange,
  previousRange,
  type DailyPoint,
  type DateRange,
  type DimRow,
  type PageRow,
} from '@/lib/devAnalytics';
import { buildComparison } from '@/lib/reportAnalytics';
import { useSetting } from '@/hooks/useSetting';
import { CHART, Card, DataTable, Delta, Kpi, Meter, Segmented, fmtDuration, fmtInt, fmtPct, fmtShortDate } from './ui';
import { DEVICE_LABELS, SOURCE_COLORS, SOURCE_LABELS, WEEKDAYS_SHORT, pageLabel } from './labels';
import type { DeviceType, SourceCategory } from '@/lib/visitLog';

type Metric = 'sessions' | 'pageviews' | 'conversions';
const METRIC_LABELS: Record<Metric, string> = { sessions: 'Sesiones', pageviews: 'Páginas vistas', conversions: 'Conversiones' };

function ChartTooltip({ active, payload, metric }: { active?: boolean; payload?: { payload: DailyPoint }[]; metric: Metric }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-background-200 bg-background-50 shadow-md px-3 py-2 text-xs space-y-0.5">
      <p className="font-semibold text-foreground-950">{new Date(`${p.date}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <p className="text-foreground-600 tabular-nums">Sesiones: <b>{p.sessions}</b></p>
      <p className="text-foreground-600 tabular-nums">Páginas vistas: <b>{p.pageviews}</b></p>
      <p className="text-foreground-600 tabular-nums">Conversiones: <b>{p.conversions}</b></p>
      {p.ads > 0 && <p className="text-foreground-600 tabular-nums">Desde Google Ads: <b>{p.ads}</b></p>}
      {metric === 'sessions' && p.baseline !== null && <p className="text-foreground-400 tabular-nums">Media 14 d previos: {p.baseline}</p>}
      {p.anomaly && <p className={`font-medium ${p.anomaly === 'high' ? 'text-emerald-700' : 'text-red-700'}`}>{p.anomaly === 'high' ? 'Pico anómalo (> +2σ)' : 'Caída anómala (< −2σ)'}</p>}
    </div>
  );
}

function Heatmap({ matrix }: { matrix: number[][] }) {
  const max = Math.max(1, ...matrix.flat());
  const total = matrix.flat().reduce((a, b) => a + b, 0);
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: '32px repeat(24, minmax(0, 1fr))' }}>
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="text-[9px] text-foreground-400 text-center tabular-nums">{h % 3 === 0 ? h : ''}</span>
            ))}
            {matrix.map((row, d) => (
              <div key={d} className="contents">
                <span className="text-[10px] text-foreground-400 self-center">{WEEKDAYS_SHORT[d]}</span>
                {row.map((v, h) => (
                  <span
                    key={h}
                    onMouseEnter={() => setHover({ d, h })}
                    onMouseLeave={() => setHover(null)}
                    className="h-5 md:h-6 rounded-[3px] ring-primary-500/50 hover:ring-1"
                    style={{ backgroundColor: v === 0 ? '#f3f2ee' : CHART.ink, opacity: v === 0 ? 1 : 0.12 + 0.88 * (v / max) }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-foreground-400 h-4 tabular-nums">
        {hover
          ? `${WEEKDAYS_SHORT[hover.d]} ${String(hover.h).padStart(2, '0')}:00–${String(hover.h + 1).padStart(2, '0')}:00 · ${matrix[hover.d][hover.h]} páginas vistas (${total ? ((matrix[hover.d][hover.h] / total) * 100).toFixed(1) : 0}%)`
          : 'Pasa el ratón por una celda para ver el detalle. Hora local del navegador.'}
      </p>
    </div>
  );
}

const dimColumns = (labelOf: (k: string) => ReactNode, maxSessions: number, showBar = true) => [
  { key: 'k', label: 'Segmento', render: (r: DimRow) => <span className="flex items-center gap-2 min-w-[8rem]">{labelOf(r.key)}</span> },
  ...(showBar ? [{ key: 'bar', label: '', render: (r: DimRow) => <div className="w-20 md:w-28"><Meter value={r.sessions} max={maxSessions} /></div> }] : []),
  { key: 's', label: 'Sesiones', align: 'right' as const, render: (r: DimRow) => fmtInt(r.sessions) },
  { key: 'b', label: 'Rebote', align: 'right' as const, render: (r: DimRow) => fmtPct(r.bounceRate) },
  { key: 'c', label: 'Conv.', align: 'right' as const, render: (r: DimRow) => (r.conversions ? `${r.conversions} · ${fmtPct(r.convRate, 1)}` : '—') },
];

export default function TrafficPanel({ visits, range }: { visits: VisitEntry[]; range: DateRange }) {
  const [metric, setMetric] = useState<Metric>('sessions');
  const { value: launchDateStr, save: saveLaunchDate } = useSetting<string>('google_ads_launch_date', '');
  const [editingAds, setEditingAds] = useState(false);
  const [draftDate, setDraftDate] = useState('');

  const cur = useMemo(() => inRange(visits, range), [visits, range]);
  const prevR = useMemo(() => previousRange(range), [range]);
  const prev = useMemo(() => inRange(visits, prevR), [visits, prevR]);
  const sessions = useMemo(() => buildSessions(cur), [cur]);
  const prevSessions = useMemo(() => buildSessions(prev), [prev]);
  const k = useMemo(() => buildKpis(cur, sessions), [cur, sessions]);
  const pk = useMemo(() => buildKpis(prev, prevSessions), [prev, prevSessions]);
  const daily = useMemo(() => buildDailySeries(cur, range), [cur, range]);
  const heat = useMemo(() => buildHeatmap(cur), [cur]);
  const sources = useMemo(() => breakdownBy(sessions, (s) => s.source), [sessions]);
  const devices = useMemo(() => breakdownBy(sessions, (s) => s.device ?? 'desconocido'), [sessions]);
  const referrers = useMemo(() => breakdownBy(sessions, (s) => s.referrerHost), [sessions]);
  const campaigns = useMemo(() => breakdownBy(sessions, (s) => s.utm), [sessions]);
  const pages = useMemo(() => buildPages(cur, sessions), [cur, sessions]);
  const comparison = useMemo(() => (launchDateStr ? buildComparison(visits, new Date(`${launchDateStr}T00:00:00`), 14) : null), [visits, launchDateStr]);

  const anomalies = daily.filter((d) => d.anomaly);
  const showPrev = range.days <= 90;
  const d = (a: number, b: number) => (showPrev ? pctChange(b, a) : undefined);
  const spark = (key: keyof DailyPoint) => daily.map((p) => Number(p[key]) || 0);

  const totalSessions = sources.reduce((a, b) => a + b.sessions, 0);

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Sesiones" value={fmtInt(k.sessions)} delta={d(k.sessions, pk.sessions)} spark={spark('sessions')} hint="Sesiones con al menos una página vista (sin /admin)" />
        <Kpi label="Páginas vistas" value={fmtInt(k.pageviews)} delta={d(k.pageviews, pk.pageviews)} spark={spark('pageviews')} />
        <Kpi label="Conversiones" value={fmtInt(k.conversions)} delta={d(k.conversions, pk.conversions)} spark={spark('conversions')} hint="Clics en teléfono + WhatsApp" />
        <Kpi label="Tasa de conversión" value={fmtPct(k.conversionRate, 1)} delta={d(k.conversionRate, pk.conversionRate)} hint="Sesiones con al menos una conversión / sesiones" />
        <Kpi label="Páginas / sesión" value={k.pagesPerSession.toFixed(2)} delta={d(k.pagesPerSession, pk.pagesPerSession)} />
        <Kpi label="Rebote" value={fmtPct(k.bounceRate)} delta={d(k.bounceRate, pk.bounceRate)} invert hint="Sesiones con un único evento" />
        <Kpi label="Duración mediana" value={fmtDuration(k.medianDurationSec)} delta={d(k.medianDurationSec, pk.medianDurationSec)} hint="Mediana entre el primer y el último evento, en sesiones de más de un evento" />
        <Kpi label="Visitantes nuevos" value={fmtPct(k.newPct)} delta={d(k.newPct, pk.newPct)} hint="Sesiones sin visita previa en ese navegador" />
      </div>
      {showPrev && <p className="text-[11px] text-foreground-400 -mt-2">Variaciones frente a los {range.days} días anteriores ({prevR.from.toLocaleDateString('es-ES')} – {new Date(prevR.to.getTime() - 1).toLocaleDateString('es-ES')}).</p>}

      {/* Serie temporal */}
      <Card
        title="Evolución diaria"
        subtitle={
          anomalies.length > 0
            ? `${anomalies.length} día${anomalies.length === 1 ? '' : 's'} fuera de lo normal (±2σ sobre la media de los 14 días previos)`
            : 'Línea discontinua: media de los 14 días previos. Los puntos marcan días anómalos (±2σ).'
        }
        actions={<Segmented<Metric> value={metric} onChange={setMetric} size="xs" options={(Object.keys(METRIC_LABELS) as Metric[]).map((m) => ({ value: m, label: METRIC_LABELS[m] }))} />}
      >
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="devArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.ink} stopOpacity={0.22} />
                <stop offset="100%" stopColor={CHART.ink} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="date" tickFormatter={fmtShortDate} tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={{ stroke: CHART.grid }} minTickGap={28} />
            <YAxis tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ stroke: CHART.inkSoft, strokeDasharray: '3 3' }} />
            {launchDateStr && <ReferenceLine x={launchDateStr} stroke={CHART.accent} strokeDasharray="4 4" label={{ value: 'Google Ads', fontSize: 10, fill: CHART.accent, position: 'insideTopRight' }} />}
            <Area type="monotone" dataKey={metric} stroke={CHART.ink} strokeWidth={2} fill="url(#devArea)" isAnimationActive={false} dot={false} activeDot={{ r: 4 }} />
            {metric === 'pageviews' && <Line type="monotone" dataKey="ads" stroke={CHART.accent} strokeWidth={1.5} dot={false} isAnimationActive={false} name="Google Ads" />}
            {metric === 'sessions' && <Line type="monotone" dataKey="baseline" stroke={CHART.warm} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls />}
            {metric === 'sessions' &&
              anomalies.map((a) => <ReferenceDot key={a.date} x={a.date} y={a.sessions} r={4} fill={a.anomaly === 'high' ? '#047857' : CHART.danger} stroke="#fff" strokeWidth={1.5} />)}
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* Origen y dispositivo */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card title="Canales de adquisición" subtitle="Atribución first-touch por sesión" pad={false} className="xl:col-span-2">
          <DataTable
            rows={sources}
            rowKey={(r) => r.key}
            columns={dimColumns(
              (key) => (
                <>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: SOURCE_COLORS[key as SourceCategory] }} />
                  <span className="text-foreground-950">{SOURCE_LABELS[key as SourceCategory] ?? key}</span>
                  <span className="text-foreground-400 tabular-nums">{totalSessions ? fmtPct(sources.find((s) => s.key === key)!.sessions / totalSessions) : ''}</span>
                </>
              ),
              sources[0]?.sessions ?? 1,
            )}
          />
        </Card>
        <Card title="Dispositivos" pad={false}>
          <DataTable rows={devices} rowKey={(r) => r.key} columns={dimColumns((key) => <span className="text-foreground-950">{DEVICE_LABELS[key as DeviceType] ?? 'Sin dato'}</span>, devices[0]?.sessions ?? 1, false)} />
        </Card>
      </div>

      {/* Heatmap */}
      <Card title="Cuándo entran" subtitle="Páginas vistas por día de la semana y hora">
        <Heatmap matrix={heat} />
      </Card>

      {/* Páginas */}
      <Card title="Páginas" subtitle="Entradas = sesiones que empiezan aquí · % salida = salidas / vistas" pad={false}>
        <DataTable
          rows={pages}
          rowKey={(r) => r.path}
          maxRows={15}
          columns={[
            { key: 'p', label: 'Página', render: (r: PageRow) => <span><span className="text-foreground-950">{pageLabel(r.path)}</span>{pageLabel(r.path) !== r.path && <span className="ml-2 font-mono text-[10px] text-foreground-400">{r.path}</span>}</span> },
            { key: 'v', label: 'Vistas', align: 'right', render: (r: PageRow) => fmtInt(r.views) },
            { key: 's', label: 'Sesiones', align: 'right', render: (r: PageRow) => fmtInt(r.sessions) },
            { key: 'e', label: 'Entradas', align: 'right', render: (r: PageRow) => fmtInt(r.entries) },
            { key: 'x', label: '% salida', align: 'right', render: (r: PageRow) => fmtPct(r.views ? r.exits / r.views : 0) },
          ]}
        />
      </Card>

      {/* Referrers y campañas */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card title="Sitios de referencia" subtitle="Dominio del document.referrer al entrar" pad={false}>
          <DataTable rows={referrers} rowKey={(r) => r.key} maxRows={10} empty="Nadie ha llegado desde otro sitio en este rango." columns={dimColumns((key) => <span className="font-mono text-[11px] text-foreground-950">{key}</span>, referrers[0]?.sessions ?? 1)} />
        </Card>
        <Card title="Campañas UTM" subtitle="source / medium / campaign" pad={false}>
          <DataTable rows={campaigns} rowKey={(r) => r.key} maxRows={10} empty="Sin parámetros utm_* en este rango." columns={dimColumns((key) => <span className="font-mono text-[11px] text-foreground-950">{key}</span>, campaigns[0]?.sessions ?? 1)} />
        </Card>
      </div>

      {/* Google Ads */}
      <Card
        title="Lanzamiento de Google Ads"
        subtitle={launchDateStr ? `Marcado el ${new Date(`${launchDateStr}T00:00:00`).toLocaleDateString('es-ES')} · comparación de 14 días antes y después` : 'Sin fecha. Márcala al activar campañas para medir el antes/después.'}
        actions={
          editingAds ? (
            <>
              <input type="date" value={draftDate || launchDateStr} onChange={(e) => setDraftDate(e.target.value)} className="px-3 py-1.5 bg-background-100 border border-background-200/70 rounded-full text-xs focus:outline-none focus:border-foreground-300/60" />
              <button type="button" onClick={() => { if (draftDate) saveLaunchDate(draftDate); setEditingAds(false); }} className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600">Guardar</button>
              <button type="button" onClick={() => setEditingAds(false)} className="px-3 py-1.5 rounded-full text-xs font-medium text-foreground-500 hover:text-foreground-950">Cancelar</button>
            </>
          ) : (
            <button type="button" onClick={() => setEditingAds(true)} className="px-3 py-1.5 rounded-full text-xs font-medium bg-background-100 border border-background-200/70 text-foreground-600 hover:text-foreground-950">
              {launchDateStr ? 'Cambiar fecha' : 'Marcar fecha'}
            </button>
          )
        }
      >
        {comparison ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Visitas / día', a: comparison.after.avgPageviewsPerDay.toFixed(1), b: comparison.before.avgPageviewsPerDay.toFixed(1), pct: comparison.pageviewsChangePct },
              { label: 'Conversiones / día', a: comparison.after.avgConversionsPerDay.toFixed(2), b: comparison.before.avgConversionsPerDay.toFixed(2), pct: comparison.conversionsChangePct },
              { label: 'Conversión por visita', a: fmtPct(comparison.after.conversionRate, 1), b: fmtPct(comparison.before.conversionRate, 1), pct: comparison.conversionRateChangePct },
            ].map((c) => (
              <div key={c.label}>
                <p className="text-[11px] uppercase tracking-wide text-foreground-400">{c.label}</p>
                <p className="mt-1 text-lg font-semibold text-foreground-950 tabular-nums">{c.a} <Delta pct={c.pct} /></p>
                <p className="text-[11px] text-foreground-400 tabular-nums">antes: {c.b}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-foreground-400">La comparación aparecerá aquí cuando marques la fecha.</p>
        )}
      </Card>
    </div>
  );
}
