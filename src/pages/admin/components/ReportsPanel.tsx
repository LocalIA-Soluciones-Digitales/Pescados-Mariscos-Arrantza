import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useVisits } from '@/hooks/useVisits';
import { useSetting } from '@/hooks/useSetting';
import { useProductos } from '@/hooks/useProductos';
import { usePedidos } from '@/hooks/usePedidos';
import {
  buildCategoryBreakdown,
  buildComparison,
  buildDeviceBreakdown,
  buildOverviewStats,
  buildProductBreakdown,
  buildSeries,
  buildSourceBreakdown,
  buildTopPages,
  buildWeekdayBreakdown,
  type Granularity,
} from '@/lib/reportAnalytics';
import { buildPedidosStats, buildProductoPedidoBreakdown } from '@/lib/pedidosAnalytics';
import type { DeviceType, SourceCategory } from '@/lib/visitLog';
import { pickLang } from '@/types/producto';

const WEEKDAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const PAGE_LABELS: Record<string, string> = {
  '/': 'Inicio',
  '/productos': 'Catálogo',
  '/profesionales': 'Profesionales',
  '/admin': 'Panel de administración',
  '/admin/restablecer-password': 'Restablecer contraseña',
  '/aviso-legal': 'Aviso legal',
  '/cookies': 'Política de cookies',
};

const DEVICE_LABELS: Record<DeviceType, string> = {
  mobile: 'Móvil',
  tablet: 'Tablet',
  desktop: 'Escritorio',
};

const COMPARISON_WINDOW_DAYS = 14;

const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: 'Día',
  week: 'Semana',
  month: 'Mes',
};

const SOURCE_LABELS: Record<SourceCategory, string> = {
  google_ads: 'Google Ads',
  google_organic: 'Google (orgánico)',
  social: 'Redes sociales',
  referral: 'Enlaces externos',
  direct: 'Directo',
  other: 'Otros',
};

const SOURCE_COLORS: Record<SourceCategory, string> = {
  google_ads: 'oklch(0.48 0.035 175)',
  google_organic: 'oklch(0.50 0.040 242)',
  social: 'oklch(0.63 0.028 70)',
  referral: 'oklch(0.65 0.035 244)',
  direct: 'oklch(0.55 0.010 230)',
  other: 'oklch(0.73 0.014 78)',
};

const CATEGORY_LABELS: Record<string, string> = {
  pescado: 'Pescado',
  especial: 'Especial',
  raciones: 'Raciones',
  marisco: 'Marisco',
  azul: 'Pescado Azul',
  blanco: 'Pescado Blanco',
  cefalopodos: 'Cefalópodos',
  bivalvos: 'Bivalvos / Moluscos',
  crustaceos_grandes: 'Crustáceos Grandes',
  gambas_langostinos: 'Gambas y Langostinos',
};

function formatPct(pct: number | null): string {
  if (pct === null) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}

function pctColor(pct: number | null): string {
  if (pct === null || pct === 0) return 'text-foreground-400';
  return pct > 0 ? 'text-emerald-600' : 'text-red-600';
}

export default function ReportsPanel() {
  const { visits, loading } = useVisits();
  const { productos } = useProductos();
  const { pedidos } = usePedidos();
  const { value: launchDateStr, save: saveLaunchDate } = useSetting<string>('google_ads_launch_date', '');
  const [draftDate, setDraftDate] = useState('');
  const [granularity, setGranularity] = useState<Granularity>('week');

  const productBreakdown = useMemo(() => buildProductBreakdown(visits).slice(0, 8), [visits]);
  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    productos.forEach((p) => map.set(p.id, pickLang(p, 'nombre', 'es')));
    return map;
  }, [productos]);
  const pedidosStats = useMemo(() => buildPedidosStats(pedidos), [pedidos]);
  const productoPedidoBreakdown = useMemo(() => buildProductoPedidoBreakdown(pedidos, 8), [pedidos]);

  const series = useMemo(() => buildSeries(visits, granularity), [visits, granularity]);
  const overview = useMemo(() => buildOverviewStats(visits), [visits]);
  const topPages = useMemo(() => buildTopPages(visits), [visits]);
  const deviceBreakdown = useMemo(() => buildDeviceBreakdown(visits), [visits]);
  const weekdayBreakdown = useMemo(
    () => buildWeekdayBreakdown(visits).map((w) => ({ ...w, label: WEEKDAY_LABELS[w.weekday] })),
    [visits],
  );
  const sourceBreakdown = useMemo(() => buildSourceBreakdown(visits), [visits]);
  const categoryBreakdown = useMemo(() => buildCategoryBreakdown(visits), [visits]);
  const totalPageviews = useMemo(() => sourceBreakdown.reduce((sum, s) => sum + s.pageviews, 0), [sourceBreakdown]);
  const totalCategoryViews = useMemo(() => categoryBreakdown.reduce((sum, c) => sum + c.views, 0), [categoryBreakdown]);
  const totalDeviceViews = useMemo(() => deviceBreakdown.reduce((sum, d) => sum + d.views, 0), [deviceBreakdown]);

  const comparison = useMemo(
    () => (launchDateStr ? buildComparison(visits, new Date(`${launchDateStr}T00:00:00`), COMPARISON_WINDOW_DAYS) : null),
    [visits, launchDateStr],
  );

  return (
    <div className="px-4 md:px-8 py-6 pb-28 space-y-8">
      {/* Fecha de lanzamiento de Google Ads */}
      <div className="bg-background-50 border border-background-200/70 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground-950">Fecha de lanzamiento de Google Ads</p>
          <p className="text-xs text-foreground-400">
            {launchDateStr
              ? `Marcada el ${new Date(`${launchDateStr}T00:00:00`).toLocaleDateString('es-ES')}. La comparativa de abajo usa ${COMPARISON_WINDOW_DAYS} días antes y después.`
              : 'Márcala en cuanto actives las campañas para poder comparar el tráfico automáticamente.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={draftDate || launchDateStr}
            onChange={(e) => setDraftDate(e.target.value)}
            className="px-3 py-2 bg-background-100 border border-background-200/70 rounded-full text-sm focus:outline-none focus:border-foreground-300/60"
          />
          <button
            type="button"
            onClick={() => draftDate && saveLaunchDate(draftDate)}
            className="px-4 py-2 rounded-full text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600"
          >
            Guardar
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-foreground-400">Cargando…</p>
      ) : visits.length === 0 ? (
        <p className="text-sm text-foreground-400">Todavía no hay visitas registradas.</p>
      ) : (
        <>
          {/* Visión general */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="bg-background-50 border border-background-200/70 rounded-lg p-4 text-center">
              <p className="text-xl font-semibold text-foreground-950">{overview.uniqueVisitors}</p>
              <p className="text-xs text-foreground-400 mt-1">Visitantes únicos</p>
            </div>
            <div className="bg-background-50 border border-background-200/70 rounded-lg p-4 text-center">
              <p className="text-xl font-semibold text-foreground-950">{overview.totalPageviews}</p>
              <p className="text-xs text-foreground-400 mt-1">Páginas vistas</p>
            </div>
            <div className="bg-background-50 border border-background-200/70 rounded-lg p-4 text-center">
              <p className="text-xl font-semibold text-foreground-950">{overview.avgPagesPerSession.toFixed(1)}</p>
              <p className="text-xs text-foreground-400 mt-1">Páginas / sesión</p>
            </div>
            <div className="bg-background-50 border border-background-200/70 rounded-lg p-4 text-center">
              <p className="text-xl font-semibold text-foreground-950">{(overview.bounceRate * 100).toFixed(0)}%</p>
              <p className="text-xs text-foreground-400 mt-1">Tasa de rebote</p>
            </div>
            <div className="bg-background-50 border border-background-200/70 rounded-lg p-4 text-center">
              <p className="text-xl font-semibold text-foreground-950">{overview.newVisitorPct.toFixed(0)}%</p>
              <p className="text-xs text-foreground-400 mt-1">Visitantes nuevos</p>
            </div>
          </div>

          {/* Comparativa automática antes/después */}
          {comparison && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-background-50 border border-background-200/70 rounded-lg p-4">
                <p className="text-xs text-foreground-400 mb-1">Visitas / día</p>
                <p className="text-lg font-semibold text-foreground-950">{comparison.after.avgPageviewsPerDay.toFixed(1)}</p>
                <p className={`text-xs font-medium ${pctColor(comparison.pageviewsChangePct)}`}>
                  {formatPct(comparison.pageviewsChangePct)} vs. antes ({comparison.before.avgPageviewsPerDay.toFixed(1)}/día)
                </p>
              </div>
              <div className="bg-background-50 border border-background-200/70 rounded-lg p-4">
                <p className="text-xs text-foreground-400 mb-1">Conversiones / día</p>
                <p className="text-lg font-semibold text-foreground-950">{comparison.after.avgConversionsPerDay.toFixed(1)}</p>
                <p className={`text-xs font-medium ${pctColor(comparison.conversionsChangePct)}`}>
                  {formatPct(comparison.conversionsChangePct)} vs. antes ({comparison.before.avgConversionsPerDay.toFixed(1)}/día)
                </p>
              </div>
              <div className="bg-background-50 border border-background-200/70 rounded-lg p-4">
                <p className="text-xs text-foreground-400 mb-1">Tasa de conversión</p>
                <p className="text-lg font-semibold text-foreground-950">{(comparison.after.conversionRate * 100).toFixed(1)}%</p>
                <p className={`text-xs font-medium ${pctColor(comparison.conversionRateChangePct)}`}>
                  {formatPct(comparison.conversionRateChangePct)} vs. antes ({(comparison.before.conversionRate * 100).toFixed(1)}%)
                </p>
              </div>
            </div>
          )}

          {/* Visitas por periodo */}
          <div className="bg-background-50 border border-background-200/70 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-foreground-950">Visitas (total vs. Google Ads) — todo el histórico</p>
              <div className="flex items-center gap-1">
                {(Object.keys(GRANULARITY_LABELS) as Granularity[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGranularity(g)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      granularity === g ? 'bg-primary-500 text-background-50' : 'bg-background-100 text-foreground-500 hover:bg-background-200/70'
                    }`}
                  >
                    {GRANULARITY_LABELS[g]}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 85)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                {launchDateStr && <ReferenceLine x={launchDateStr} stroke="oklch(0.48 0.035 175)" strokeDasharray="4 4" label={{ value: 'Google Ads', fontSize: 10, fill: 'oklch(0.48 0.035 175)' }} />}
                <Area type="monotone" dataKey="pageviews" name="Visitas totales" stroke="oklch(0.28 0.035 238)" fill="oklch(0.28 0.035 238)" fillOpacity={0.12} strokeWidth={2} />
                <Area type="monotone" dataKey="google_ads_pageviews" name="Desde Google Ads" stroke="oklch(0.48 0.035 175)" fill="oklch(0.48 0.035 175)" fillOpacity={0.25} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Conversiones por periodo */}
          <div className="bg-background-50 border border-background-200/70 rounded-lg p-4">
            <p className="text-sm font-medium text-foreground-950 mb-4">Conversiones (llamadas + WhatsApp)</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 85)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                {launchDateStr && <ReferenceLine x={launchDateStr} stroke="oklch(0.48 0.035 175)" strokeDasharray="4 4" />}
                <Bar dataKey="conversions" name="Conversiones" fill="oklch(0.63 0.028 70)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Páginas más vistas, dispositivo y día de la semana */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-background-50 border border-background-200/70 rounded-lg p-4">
              <p className="text-sm font-medium text-foreground-950 mb-4">Páginas más vistas</p>
              <div className="space-y-2">
                {topPages.map((p) => (
                  <div key={p.path} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-foreground-600 truncate">{PAGE_LABELS[p.path] ?? p.path}</span>
                    <span className="text-xs text-foreground-400 flex-shrink-0">{p.views}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-background-50 border border-background-200/70 rounded-lg p-4">
              <p className="text-sm font-medium text-foreground-950 mb-4">Dispositivo</p>
              <div className="space-y-2">
                {deviceBreakdown.map((d) => {
                  const pct = totalDeviceViews > 0 ? (d.views / totalDeviceViews) * 100 : 0;
                  return (
                    <div key={d.device_type} className="flex items-center gap-3">
                      <span className="text-xs text-foreground-600 w-20 flex-shrink-0">{DEVICE_LABELS[d.device_type]}</span>
                      <div className="flex-1 h-2 bg-background-200/60 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-primary-400" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-foreground-400 w-10 flex-shrink-0 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-background-50 border border-background-200/70 rounded-lg p-4">
              <p className="text-sm font-medium text-foreground-950 mb-4">Visitas por día de la semana</p>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={weekdayBreakdown}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(0, 3)} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
                  <Tooltip />
                  <Bar dataKey="views" name="Visitas" fill="oklch(0.28 0.035 238)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Desglose por origen */}
          <div className="bg-background-50 border border-background-200/70 rounded-lg p-4">
            <p className="text-sm font-medium text-foreground-950 mb-4">De dónde vienen las visitas</p>
            <div className="space-y-2">
              {sourceBreakdown.map((s) => {
                const pct = totalPageviews > 0 ? (s.pageviews / totalPageviews) * 100 : 0;
                return (
                  <div key={s.source_category} className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: SOURCE_COLORS[s.source_category] }} />
                    <span className="text-xs text-foreground-600 w-36 flex-shrink-0">{SOURCE_LABELS[s.source_category]}</span>
                    <div className="flex-1 h-2 bg-background-200/60 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: SOURCE_COLORS[s.source_category] }} />
                    </div>
                    <span className="text-xs text-foreground-400 w-28 flex-shrink-0 text-right">
                      {s.pageviews} visitas · {s.conversions} conv.
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Demanda real: ticket medio y qué se pide de verdad */}
          {pedidosStats.totalPedidos > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-background-50 border border-background-200/70 rounded-lg p-4 text-center">
                  <p className="text-xl font-semibold text-foreground-950">{pedidosStats.totalPedidos}</p>
                  <p className="text-xs text-foreground-400 mt-1">Pedidos registrados</p>
                </div>
                <div className="bg-background-50 border border-background-200/70 rounded-lg p-4 text-center">
                  <p className="text-xl font-semibold text-foreground-950">{pedidosStats.ticketMedio.toFixed(2)} €</p>
                  <p className="text-xs text-foreground-400 mt-1">Ticket medio</p>
                </div>
                <div className="bg-background-50 border border-background-200/70 rounded-lg p-4 text-center">
                  <p className="text-xl font-semibold text-foreground-950">{pedidosStats.pesoMedioKg.toFixed(1)} kg</p>
                  <p className="text-xs text-foreground-400 mt-1">Peso medio por pedido</p>
                </div>
              </div>

              <div className="bg-background-50 border border-background-200/70 rounded-lg p-4">
                <p className="text-sm font-medium text-foreground-950 mb-4">Lo que más se pide (no solo se mira)</p>
                <div className="space-y-2">
                  {productoPedidoBreakdown.map((p) => {
                    const max = productoPedidoBreakdown[0]?.vecesPedido || 1;
                    const pct = (p.vecesPedido / max) * 100;
                    return (
                      <div key={p.nombre} className="flex items-center gap-3">
                        <span className="text-xs text-foreground-600 w-40 flex-shrink-0 truncate">{p.nombre}</span>
                        <div className="flex-1 h-2 bg-background-200/60 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-foreground-400 w-28 flex-shrink-0 text-right">
                          {p.vecesPedido} pedido{p.vecesPedido === 1 ? '' : 's'} · {p.kgTotal.toFixed(1)} kg
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Se mira vs. se pide — detecta productos que llaman la atención pero no se venden, o al revés */}
          {productBreakdown.length > 0 && (
            <div className="bg-background-50 border border-background-200/70 rounded-lg p-4">
              <p className="text-sm font-medium text-foreground-950 mb-1">Productos: se miran vs. se añaden al pedido</p>
              <p className="text-xs text-foreground-400 mb-4">Si un producto tiene muchas vistas pero pocos añadidos, algo no convence (precio, foto, descripción).</p>
              <div className="space-y-2">
                {productBreakdown.map((p) => {
                  const max = productBreakdown[0]?.views || 1;
                  const viewsPct = (p.views / max) * 100;
                  const addsPct = (p.addsToCart / max) * 100;
                  const nombre = productNameById.get(p.productId) ?? p.productId;
                  return (
                    <div key={p.productId} className="py-1.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-foreground-600 truncate">{nombre}</span>
                        <span className="text-xs text-foreground-400 flex-shrink-0">{p.views} vistas · {p.addsToCart} añadidos</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="flex-1 h-1.5 bg-background-200/60 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-secondary-400" style={{ width: `${viewsPct}%` }} />
                        </div>
                        <div className="flex-1 h-1.5 bg-background-200/60 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-accent-500" style={{ width: `${addsPct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Categorías más buscadas */}
          {categoryBreakdown.length > 0 && (
            <div className="bg-background-50 border border-background-200/70 rounded-lg p-4">
              <p className="text-sm font-medium text-foreground-950 mb-4">Qué buscan más en el catálogo</p>
              <div className="space-y-2">
                {categoryBreakdown.map((c) => {
                  const pct = totalCategoryViews > 0 ? (c.views / totalCategoryViews) * 100 : 0;
                  return (
                    <div key={c.category} className="flex items-center gap-3">
                      <span className="text-xs text-foreground-600 w-36 flex-shrink-0">{CATEGORY_LABELS[c.category] ?? c.category}</span>
                      <div className="flex-1 h-2 bg-background-200/60 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-accent-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-foreground-400 w-20 flex-shrink-0 text-right">{c.views} clics</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
