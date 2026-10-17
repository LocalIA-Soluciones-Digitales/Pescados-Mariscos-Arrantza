import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import SummaryPanel from './SummaryPanel';
import ViewSwitcher from './ViewSwitcher';
import TrafficPanel from './dev/TrafficPanel';
import FunnelPanel from './dev/FunnelPanel';
import ErrorsPanel from './dev/ErrorsPanel';
import SystemPanel from './dev/SystemPanel';
import { Empty, Loading, RANGE_OPTIONS, Segmented, Toolbar, fmtAgo, fmtInt } from './dev/ui';
import { useVisits } from '@/hooks/useVisits';
import { usePedidos } from '@/hooks/usePedidos';
import { isPublicEvent, resolveRange, type RangeKey } from '@/lib/devAnalytics';

export type Tab = 'informes' | 'embudo' | 'errores' | 'sistema' | 'resumen';

// 'informes' mantiene su valor (antes era la única pestaña de tráfico) para
// que los enlaces ?tab=informes guardados sigan funcionando.
export const TABS: { value: Tab; label: string; icon: string }[] = [
  { value: 'informes', label: 'Tráfico', icon: 'ri-line-chart-line' },
  { value: 'embudo', label: 'Embudo', icon: 'ri-filter-3-line' },
  { value: 'errores', label: 'Errores', icon: 'ri-bug-line' },
  { value: 'sistema', label: 'Sistema', icon: 'ri-server-line' },
  { value: 'resumen', label: 'Resumen', icon: 'ri-file-text-line' },
];

const TITLES: Record<Tab, string> = {
  informes: 'Tráfico web',
  embudo: 'Embudo y productos',
  errores: 'Errores del frontend',
  sistema: 'Sistema e integraciones',
  resumen: 'Resumen imprimible',
};

const RANGE_KEY = 'dev_panel_range';

type ViewSwitch = { label: string; onClick: () => void };

export default function DeveloperDashboard({ onSignOut, viewSwitch }: { onSignOut: () => void; viewSwitch?: ViewSwitch }) {
  const [tab, setTab] = useState<Tab>(() => {
    const inicial = new URLSearchParams(window.location.search).get('tab');
    return TABS.some((t) => t.value === inicial) ? (inicial as Tab) : 'informes';
  });
  const [rangeKey, setRangeKey] = useState<RangeKey>(() => {
    try {
      const v = localStorage.getItem(RANGE_KEY);
      return RANGE_OPTIONS.some((o) => o.value === v) ? (v as RangeKey) : '28d';
    } catch {
      return '28d';
    }
  });

  // Los datos se cargan una vez aquí y se comparten entre pestañas, para no
  // volver a bajar hasta 50.000 eventos en cada cambio de pestaña.
  const { visits: allVisits, loading, refetch } = useVisits();
  const { pedidos } = usePedidos();
  const visits = useMemo(() => allVisits.filter(isPublicEvent), [allVisits]);
  const range = useMemo(() => resolveRange(rangeKey, visits[0]?.created_at), [rangeKey, visits]);

  const changeTab = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', t);
    window.history.replaceState(null, '', url);
  };
  const changeRange = (r: RangeKey) => {
    setRangeKey(r);
    try {
      localStorage.setItem(RANGE_KEY, r);
    } catch {
      /* sin almacenamiento: el rango no se recuerda */
    }
  };

  // Altura de la cabecera para que las barras de filtros fijas queden justo debajo.
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeaderHeight(el.getBoundingClientRect().height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const tabsNav = (
    <nav className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
      {TABS.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => changeTab(t.value)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
            tab === t.value ? 'bg-primary-500 text-background-50' : 'text-foreground-500 hover:text-foreground-950 hover:bg-background-100'
          }`}
        >
          <i className={`${t.icon} text-sm`} />
          {t.label}
        </button>
      ))}
    </nav>
  );

  const usesRange = tab === 'informes' || tab === 'embudo' || tab === 'errores';
  const usesVisits = tab === 'informes' || tab === 'embudo';
  const lastEvent = visits[visits.length - 1]?.created_at;

  return (
    <div className="min-h-screen bg-background-100" style={{ '--admin-header-height': `${headerHeight}px` } as CSSProperties}>
      <header ref={headerRef} className="sticky top-0 z-20 bg-background-50 border-b border-background-200/70 px-4 md:px-8 py-3 md:py-4 print:hidden">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-5 min-w-0">
            <div className="min-w-0">
              <h1 className="text-base font-heading font-semibold text-foreground-950 truncate">{TITLES[tab]}</h1>
              <p className="text-xs text-foreground-400 truncate">Pescados y Mariscos Arrantza · Panel de Desarrollo</p>
            </div>
            <div className="hidden md:block">{tabsNav}</div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden md:flex items-center gap-3">
              {viewSwitch && <ViewSwitcher current="Panel de desarrollo" viewSwitch={viewSwitch} />}
              <button type="button" onClick={onSignOut} className="text-xs font-medium text-foreground-500 hover:text-foreground-950 whitespace-nowrap">
                Cerrar sesión
              </button>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-full bg-background-100 border border-background-200/70 text-foreground-500 hover:text-foreground-950 hover:border-foreground-300/60 transition-colors flex-shrink-0"
            >
              <i className="ri-logout-box-r-line text-base"></i>
            </button>
          </div>
        </div>
        {viewSwitch && <div className="mt-3 md:hidden"><ViewSwitcher current="Panel de desarrollo" viewSwitch={viewSwitch} /></div>}
        <div className="md:hidden mt-3">{tabsNav}</div>
      </header>

      {tab === 'resumen' ? (
        <SummaryPanel />
      ) : (
        <main className="px-4 md:px-8 pb-28 max-w-[1600px] mx-auto">
          {usesRange && (
            <Toolbar>
              <Segmented value={rangeKey} onChange={changeRange} options={RANGE_OPTIONS} />
              <div className="flex items-center gap-3 text-[11px] text-foreground-400">
                <span className="tabular-nums hidden sm:inline">
                  {range.from.toLocaleDateString('es-ES')} – {new Date(range.to.getTime() - 1).toLocaleDateString('es-ES')}
                </span>
                {usesVisits && lastEvent && <span className="hidden md:inline">· {fmtInt(visits.length)} eventos · último {fmtAgo(lastEvent)}</span>}
                {usesVisits && (
                  <button type="button" onClick={() => refetch()} className="w-8 h-8 rounded-full flex items-center justify-center text-foreground-500 hover:text-foreground-950 hover:bg-background-50" title="Recargar datos">
                    <i className={`ri-refresh-line ${loading ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
            </Toolbar>
          )}
          <div className="pt-5">
            {tab === 'errores' ? (
              <ErrorsPanel range={range} />
            ) : tab === 'sistema' ? (
              <SystemPanel visits={allVisits} />
            ) : loading && visits.length === 0 ? (
              <Loading />
            ) : visits.length === 0 ? (
              <Empty title="Todavía no hay visitas registradas" body="Se registran solo cuando el visitante acepta las cookies de analítica." />
            ) : tab === 'embudo' ? (
              <FunnelPanel visits={visits} pedidos={pedidos} range={range} />
            ) : (
              <TrafficPanel visits={visits} range={range} />
            )}
          </div>
        </main>
      )}
    </div>
  );
}
