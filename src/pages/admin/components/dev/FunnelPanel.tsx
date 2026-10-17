import { useMemo, useState } from 'react';
import type { VisitEntry } from '@/lib/visitLog';
import type { Pedido } from '@/types/pedido';
import { buildFunnel, buildProducts, buildSessions, countLabels, inRange, wilson, type DateRange, type ProductRow } from '@/lib/devAnalytics';
import { buildPedidosStats, buildProductoPedidoBreakdown } from '@/lib/pedidosAnalytics';
import { useProductos } from '@/hooks/useProductos';
import { pickLang } from '@/types/producto';
import { CHART, Card, DataTable, Kpi, Meter, Segmented, fmtInt, fmtPct } from './ui';
import { CATEGORY_LABELS } from './labels';

type ProductSort = 'views' | 'adds' | 'rate';

export default function FunnelPanel({ visits, pedidos, range }: { visits: VisitEntry[]; pedidos: Pedido[]; range: DateRange }) {
  const { productos } = useProductos();
  const [sort, setSort] = useState<ProductSort>('views');

  const cur = useMemo(() => inRange(visits, range), [visits, range]);
  const sessions = useMemo(() => buildSessions(cur), [cur]);
  const funnel = useMemo(() => buildFunnel(sessions), [sessions]);
  const products = useMemo(() => buildProducts(cur), [cur]);
  const categories = useMemo(() => countLabels(cur, 'category_view'), [cur]);
  const pedidosRango = useMemo(() => inRange(pedidos, range), [pedidos, range]);
  const pStats = useMemo(() => buildPedidosStats(pedidosRango), [pedidosRango]);
  const pedidoTop = useMemo(() => buildProductoPedidoBreakdown(pedidosRango, 10), [pedidosRango]);

  const nameById = useMemo(() => {
    const m = new Map<string, { nombre: string; visible: boolean }>();
    productos.forEach((p) => m.set(p.id, { nombre: pickLang(p, 'nombre', 'es'), visible: p.visible_web !== false }));
    return m;
  }, [productos]);

  // Tasa media de añadido (pooled) para señalar productos claramente por
  // debajo: el límite superior de su intervalo de Wilson queda bajo la media.
  const pooledRate = useMemo(() => {
    const v = products.reduce((a, p) => a + p.views, 0);
    const ad = products.reduce((a, p) => a + p.adds, 0);
    return v ? ad / v : 0;
  }, [products]);

  const sortedProducts = useMemo(() => {
    const arr = products.slice();
    if (sort === 'adds') arr.sort((a, b) => b.adds - a.adds);
    else if (sort === 'rate') arr.sort((a, b) => wilson(b.adds, b.views)[0] - wilson(a.adds, a.views)[0]);
    return arr;
  }, [products, sort]);

  const top = funnel[0]?.value || 0;
  const catTotal = categories.reduce((a, c) => a + c.count, 0);
  const orphanIds = products.filter((p) => !nameById.has(p.productId)).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Sesiones que ven producto" value={top ? fmtPct(funnel[2].value / top) : '—'} hint="Sesiones con product_view / sesiones" />
        <Kpi label="Sesiones que añaden" value={top ? fmtPct(funnel[3].value / top, 1) : '—'} hint="Sesiones con add_to_cart / sesiones" />
        <Kpi label="Pedidos web" value={fmtInt(pStats.totalPedidos)} hint="Pedidos no cancelados creados en el rango" />
        <Kpi label="Ticket medio" value={pStats.totalPedidos ? `${pStats.ticketMedio.toFixed(2)} €` : '—'} hint={`Peso medio ${pStats.pesoMedioKg.toFixed(1)} kg`} />
      </div>

      <Card title="Embudo de sesión" subtitle="Cada paso cuenta sesiones que lo alcanzan (no tienen por qué seguir el orden)">
        <div className="space-y-3">
          {funnel.map((s, i) => {
            const pct = top ? s.value / top : 0;
            const step = i > 0 && funnel[i - 1].value ? s.value / funnel[i - 1].value : null;
            return (
              <div key={s.label} className="grid grid-cols-[9rem_1fr_auto] md:grid-cols-[12rem_1fr_10rem] items-center gap-3">
                <span className="text-xs text-foreground-700 truncate">{s.label}</span>
                <div className="h-7 bg-background-100 rounded-md overflow-hidden">
                  <div className="h-full rounded-md flex items-center px-2 text-[11px] font-medium text-background-50 tabular-nums transition-[width] duration-500" style={{ width: `${Math.max(pct * 100, s.value ? 4 : 0)}%`, backgroundColor: i === funnel.length - 1 ? CHART.accent : CHART.ink, opacity: 1 - i * 0.12 }}>
                    {s.value > 0 && fmtInt(s.value)}
                  </div>
                </div>
                <span className="text-[11px] text-foreground-400 tabular-nums text-right">
                  {fmtPct(pct, 1)}
                  {step !== null && <span className="hidden md:inline"> · paso {fmtPct(step)}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title="Productos: interés vs. intención"
        subtitle={`Tasa = añadidos / vistas, con intervalo de confianza del 95 % (Wilson). Media global ${fmtPct(pooledRate, 1)}. Marcados: claramente por debajo.${orphanIds ? ` ${orphanIds} id sin producto en el catálogo.` : ''}`}
        actions={<Segmented<ProductSort> value={sort} onChange={setSort} size="xs" options={[{ value: 'views', label: 'Vistas' }, { value: 'adds', label: 'Añadidos' }, { value: 'rate', label: 'Tasa' }]} />}
        pad={false}
      >
        <DataTable
          rows={sortedProducts}
          rowKey={(r) => r.productId}
          maxRows={25}
          empty="Nadie ha abierto un producto en este rango."
          columns={[
            {
              key: 'n',
              label: 'Producto',
              render: (r: ProductRow) => {
                const p = nameById.get(r.productId);
                const [, hi] = wilson(r.adds, r.views);
                const low = r.views >= 10 && hi < pooledRate;
                return (
                  <span className="flex items-center gap-2 min-w-[10rem]">
                    {low && <i className="ri-error-warning-line text-amber-600" title="Se mira mucho pero se añade poco" />}
                    <span className={p ? 'text-foreground-950' : 'font-mono text-[10px] text-foreground-400'}>{p?.nombre ?? r.productId}</span>
                    {p && !p.visible && <span className="px-1.5 py-0.5 rounded text-[9px] bg-background-200/70 text-foreground-500">oculto</span>}
                  </span>
                );
              },
            },
            { key: 'v', label: 'Vistas', align: 'right', render: (r: ProductRow) => fmtInt(r.views) },
            { key: 's', label: 'Sesiones', align: 'right', render: (r: ProductRow) => fmtInt(r.viewSessions) },
            { key: 'a', label: 'Añadidos', align: 'right', render: (r: ProductRow) => fmtInt(r.adds) },
            {
              key: 'r',
              label: 'Tasa (IC 95 %)',
              align: 'right',
              render: (r: ProductRow) => {
                if (!r.views) return '—';
                const [lo, hi] = wilson(r.adds, r.views);
                return (
                  <span className="inline-flex items-center gap-2">
                    <span className="relative w-16 h-1.5 bg-background-200/60 rounded-full hidden md:inline-block">
                      <span className="absolute h-full rounded-full bg-primary-300/70" style={{ left: `${lo * 100}%`, width: `${Math.max((hi - lo) * 100, 2)}%` }} />
                      <span className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary-500" style={{ left: `calc(${Math.min(r.addRate, 1) * 100}% - 3px)` }} />
                    </span>
                    {fmtPct(r.addRate)} <span className="text-foreground-400">({fmtPct(lo)}–{fmtPct(hi)})</span>
                  </span>
                );
              },
            },
          ]}
        />
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card title="Categorías abiertas" subtitle="Eventos category_view" pad={false}>
          <DataTable
            rows={categories}
            rowKey={(r) => r.key}
            columns={[
              { key: 'c', label: 'Categoría', render: (r) => <span className="text-foreground-950">{CATEGORY_LABELS[r.key] ?? r.key}</span> },
              { key: 'b', label: '', render: (r) => <div className="w-24 md:w-32"><Meter value={r.count} max={categories[0]?.count ?? 1} color={CHART.accent} /></div> },
              { key: 'n', label: 'Clics', align: 'right', render: (r) => fmtInt(r.count) },
              { key: 'p', label: '%', align: 'right', render: (r) => fmtPct(catTotal ? r.count / catTotal : 0) },
            ]}
          />
        </Card>
        <Card title="Lo que se pide de verdad" subtitle="Líneas de pedidos web en el rango" pad={false}>
          <DataTable
            rows={pedidoTop}
            rowKey={(r) => r.nombre}
            empty="Sin pedidos web en este rango."
            columns={[
              { key: 'n', label: 'Producto', render: (r) => <span className="text-foreground-950">{r.nombre}</span> },
              { key: 'b', label: '', render: (r) => <div className="w-24 md:w-32"><Meter value={r.vecesPedido} max={pedidoTop[0]?.vecesPedido ?? 1} color={CHART.warm} /></div> },
              { key: 'p', label: 'Pedidos', align: 'right', render: (r) => fmtInt(r.vecesPedido) },
              { key: 'k', label: 'Kg', align: 'right', render: (r) => r.kgTotal.toFixed(1) },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
