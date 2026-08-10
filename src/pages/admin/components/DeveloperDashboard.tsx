import { useState } from 'react';
import ErrorLogsPanel from './ErrorLogsPanel';
import ReportsPanel from './ReportsPanel';
import SummaryPanel from './SummaryPanel';
import NewsletterPanel from './NewsletterPanel';
import ViewSwitcher from './ViewSwitcher';

type Tab = 'informes' | 'resumen' | 'errores' | 'newsletter';

const TABS: { value: Tab; label: string }[] = [
  { value: 'informes', label: 'Informes' },
  { value: 'resumen', label: 'Resumen' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'errores', label: 'Errores' },
];

const TITLES: Record<Tab, string> = {
  informes: 'Informes de visitas',
  resumen: 'Resumen',
  newsletter: 'Suscriptores del newsletter',
  errores: 'Registro de errores',
};

type ViewSwitch = { label: string; onClick: () => void };

export default function DeveloperDashboard({ onSignOut, viewSwitch }: { onSignOut: () => void; viewSwitch?: ViewSwitch }) {
  const [tab, setTab] = useState<Tab>('informes');

  const tabsNav = (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
      {TABS.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => setTab(t.value)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
            tab === t.value ? 'bg-primary-500 text-background-50' : 'bg-background-100 text-foreground-500 hover:bg-background-200/70'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background-100">
      <header className="sticky top-0 z-10 bg-background-50 border-b border-background-200/70 px-4 md:px-8 py-3 md:py-4 print:hidden">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex-shrink-0">
              <h1 className="text-base font-heading font-semibold text-foreground-950">{TITLES[tab]}</h1>
              <p className="text-xs text-foreground-400">Pescados y Mariscos Arrantza · Panel de Desarrollo</p>
            </div>
            <div className="hidden md:block">{tabsNav}</div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {viewSwitch && <ViewSwitcher current="Panel de desarrollo" viewSwitch={viewSwitch} />}
            <button type="button" onClick={onSignOut} className="text-xs font-medium text-foreground-500 hover:text-foreground-950 whitespace-nowrap">
              Cerrar sesión
            </button>
          </div>
        </div>
        <div className="md:hidden mt-3">{tabsNav}</div>
      </header>

      {tab === 'errores' ? (
        <ErrorLogsPanel />
      ) : tab === 'resumen' ? (
        <SummaryPanel />
      ) : tab === 'newsletter' ? (
        <NewsletterPanel />
      ) : (
        <ReportsPanel />
      )}
    </div>
  );
}
