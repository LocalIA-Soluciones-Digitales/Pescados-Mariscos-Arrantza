import { useState } from 'react';
import BasculaCatalogoPanel from './BasculaCatalogoPanel';
import BasculasCambiosPanel from './BasculasCambiosPanel';
import type { useBasculasCambios } from '@/hooks/useBasculasCambios';

// Pestaña Básculas del panel de gestión: el catálogo de la báscula 1 frente
// a la web y el registro de cambios / diferencias entre las dos básculas.
// ?tab=basculas (avisos push de la báscula) abre directamente la segunda.

export type VistaBasculas = 'web' | 'cambios';

const VISTAS: { value: VistaBasculas; label: string; icono: string }[] = [
  { value: 'web', label: 'Báscula 1 y web', icono: 'ri-global-line' },
  { value: 'cambios', label: 'Cambios y diferencias', icono: 'ri-git-compare-line' },
];

export default function BasculasPanel({ datos, vistaInicial }: { datos: ReturnType<typeof useBasculasCambios>; vistaInicial: VistaBasculas }) {
  const [vista, setVista] = useState<VistaBasculas>(vistaInicial);

  return (
    <>
      <div className="px-4 md:px-8 pt-4">
        <div className="inline-flex max-w-full overflow-x-auto scrollbar-hide p-0.5 rounded-full bg-background-50 border border-background-200/70">
          {VISTAS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setVista(v.value)}
              aria-pressed={vista === v.value}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                vista === v.value ? 'bg-foreground-950 text-background-50' : 'text-foreground-500 hover:text-foreground-950'
              }`}
            >
              <i className={v.icono}></i>
              {v.label}
              {v.value === 'cambios' && datos.nuevos > 0 && (
                <span className="inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-semibold leading-none">
                  {datos.nuevos}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      {vista === 'web' ? <BasculaCatalogoPanel /> : <BasculasCambiosPanel datos={datos} />}
    </>
  );
}
