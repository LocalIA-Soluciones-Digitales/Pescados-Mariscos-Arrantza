import { useState } from 'react';
import PedidosPanel from './PedidosPanel';
import VentasTiendaPanel from './VentasTiendaPanel';

type SubTab = 'online' | 'tienda';

const SUBTABS: { value: SubTab; label: string }[] = [
  { value: 'online', label: 'Online' },
  { value: 'tienda', label: 'Tienda' },
];

export default function VentasPanel() {
  const [subTab, setSubTab] = useState<SubTab>('online');

  return (
    <div>
      <div className="sticky z-10 bg-background-100/95 backdrop-blur-sm border-b border-background-200/50 px-4 md:px-8 py-3" style={{ top: 'var(--admin-header-height, 0px)' }}>
        <div className="flex items-center gap-1.5">
          {SUBTABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setSubTab(t.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                subTab === t.value ? 'bg-primary-500 text-background-50' : 'bg-background-50 text-foreground-500 hover:bg-background-200/70'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'online' ? <PedidosPanel /> : <VentasTiendaPanel />}
    </div>
  );
}
