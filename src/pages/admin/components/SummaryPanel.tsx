import { useMemo } from 'react';
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useVisits } from '@/hooks/useVisits';
import { buildCategoryBreakdown, buildSeries, buildSourceBreakdown } from '@/lib/reportAnalytics';
import type { SourceCategory } from '@/lib/visitLog';

const SOURCE_SENTENCES: Record<SourceCategory, string> = {
  direct: 'Escriben tu web directamente o la tienen guardada',
  google_organic: 'Te encuentran buscando en Google',
  google_ads: 'Llegan a través de tus anuncios de Google Ads',
  social: 'Llegan desde redes sociales',
  referral: 'Llegan desde otras páginas web que enlazan la tuya',
  other: 'Otros orígenes',
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

export default function SummaryPanel() {
  const { visits, loading } = useVisits();

  const monthlySeries = useMemo(() => buildSeries(visits, 'month'), [visits]);
  const sourceBreakdown = useMemo(() => buildSourceBreakdown(visits), [visits]);
  const categoryBreakdown = useMemo(() => buildCategoryBreakdown(visits), [visits]);

  const totalVisits = useMemo(() => visits.filter((v) => v.event_type === 'pageview').length, [visits]);
  const totalConversions = useMemo(
    () => visits.filter((v) => v.event_type === 'tel_click' || v.event_type === 'whatsapp_click').length,
    [visits],
  );

  const firstDate = visits[0]?.created_at;
  const topSources = sourceBreakdown.slice(0, 3);
  const topCategories = categoryBreakdown.slice(0, 3);

  if (loading) {
    return (
      <div className="px-4 md:px-8 py-6">
        <p className="text-sm text-foreground-400">Cargando…</p>
      </div>
    );
  }

  if (visits.length === 0) {
    return (
      <div className="px-4 md:px-8 py-6">
        <p className="text-sm text-foreground-400">Todavía no hay datos suficientes para un resumen.</p>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 pb-28 space-y-8 print:px-0">
      <div className="flex items-start justify-between print:hidden">
        <div>
          <h2 className="text-lg font-heading font-semibold text-foreground-950">Resumen de la web</h2>
          <p className="text-xs text-foreground-400">
            Desde {new Date(firstDate).toLocaleDateString('es-ES')} hasta hoy · generado el {new Date().toLocaleDateString('es-ES')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="px-4 py-2 rounded-full text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600 flex-shrink-0"
        >
          Imprimir / Guardar PDF
        </button>
      </div>

      {/* Solo visible al imprimir: encabezado del informe */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-heading font-semibold">Pescados y Mariscos Arrantza — Resumen de la web</h1>
        <p className="text-sm text-foreground-500">
          Desde {new Date(firstDate).toLocaleDateString('es-ES')} hasta hoy · generado el {new Date().toLocaleDateString('es-ES')}
        </p>
      </div>

      {/* Números grandes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-background-50 border border-background-200/70 rounded-lg p-5 text-center">
          <p className="text-3xl font-semibold text-foreground-950">{totalVisits}</p>
          <p className="text-sm text-foreground-500 mt-1">Visitas totales</p>
        </div>
        <div className="bg-background-50 border border-background-200/70 rounded-lg p-5 text-center">
          <p className="text-3xl font-semibold text-foreground-950">{totalConversions}</p>
          <p className="text-sm text-foreground-500 mt-1">Llamadas + pedidos por WhatsApp</p>
        </div>
        <div className="bg-background-50 border border-background-200/70 rounded-lg p-5 text-center">
          <p className="text-3xl font-semibold text-foreground-950">{totalVisits > 0 ? ((totalConversions / totalVisits) * 100).toFixed(1) : '0'}%</p>
          <p className="text-sm text-foreground-500 mt-1">De las visitas acaban en llamada o pedido</p>
        </div>
      </div>

      {/* Evolución mensual */}
      <div className="bg-background-50 border border-background-200/70 rounded-lg p-4">
        <p className="text-sm font-medium text-foreground-950 mb-4">Visitas mes a mes</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={monthlySeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 85)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Area type="monotone" dataKey="pageviews" name="Visitas" stroke="oklch(0.28 0.035 238)" fill="oklch(0.28 0.035 238)" fillOpacity={0.15} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Lo que más buscan */}
      {topCategories.length > 0 && (
        <div className="bg-background-50 border border-background-200/70 rounded-lg p-4">
          <p className="text-sm font-medium text-foreground-950 mb-3">Lo que más buscan tus clientes en el catálogo</p>
          <ol className="space-y-1.5 list-decimal list-inside">
            {topCategories.map((c) => (
              <li key={c.category} className="text-sm text-foreground-600">
                {CATEGORY_LABELS[c.category] ?? c.category}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* De dónde llegan */}
      <div className="bg-background-50 border border-background-200/70 rounded-lg p-4">
        <p className="text-sm font-medium text-foreground-950 mb-3">De dónde llegan tus visitas</p>
        <ul className="space-y-1.5">
          {topSources.map((s) => (
            <li key={s.source_category} className="text-sm text-foreground-600">
              {SOURCE_SENTENCES[s.source_category]} — <span className="font-medium">{s.pageviews} visitas</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
