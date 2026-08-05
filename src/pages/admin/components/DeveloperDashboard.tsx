import { useState } from 'react';
import ErrorLogsPanel from './ErrorLogsPanel';
import ReportsPanel from './ReportsPanel';
import SummaryPanel from './SummaryPanel';

type Tab = 'informes' | 'resumen' | 'errores';

const TABS: { value: Tab; label: string }[] = [
  { value: 'informes', label: 'Informes' },
  { value: 'resumen', label: 'Resumen' },
  { value: 'errores', label: 'Errores' },
];

const TITLES: Record<Tab, string> = {
  informes: 'Informes de visitas',
  resumen: 'Resumen',
  errores: 'Registro de errores',
};

export default function DeveloperDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('informes');

  return (
    <div className="min-h-screen bg-background-100">
      <header className="sticky top-0 z-10 bg-background-50 border-b border-background-200/70 px-4 md:px-8 py-4 flex items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-base font-heading font-semibold text-foreground-950">{TITLES[tab]}</h1>
            <p className="text-xs text-foreground-400">Pescados y Mariscos Arrantza · Panel de Desarrollo</p>
          </div>
          <div className="flex items-center gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  tab === t.value ? 'bg-primary-500 text-background-50' : 'bg-background-100 text-foreground-500 hover:bg-background-200/70'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={onSignOut} className="text-xs font-medium text-foreground-500 hover:text-foreground-950 flex-shrink-0">
          Cerrar sesión
        </button>
      </header>

      {tab === 'errores' ? <ErrorLogsPanel /> : tab === 'resumen' ? <SummaryPanel /> : <ReportsPanel />}
    </div>
  );
}
