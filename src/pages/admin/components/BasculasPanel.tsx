import { useState } from 'react';
import BasculaCatalogoPanel from './BasculaCatalogoPanel';
import BasculasCambiosPanel from './BasculasCambiosPanel';
import type { useBasculasCambios } from '@/hooks/useBasculasCambios';
import { ORIGENES, ORIGEN_COLORS, type Origen } from '@/types/origen';

// Pestaña Básculas del panel de gestión: el catálogo de la báscula que manda
// en la web y el registro de cambios / diferencias entre las dos básculas.
// A la derecha, de qué báscula lee la web (David la cambia a la 2 cuando solo
// abre esa pescadería, p. ej. si la encargada está de vacaciones).
// ?tab=basculas (avisos push de la báscula) abre directamente la segunda vista.

export type VistaBasculas = 'web' | 'cambios';

type Datos = ReturnType<typeof useBasculasCambios>;

const NUMERO: Record<Origen, string> = { pescaderia_1: '1', pescaderia_2: '2' };

function SelectorBasculaWeb({ datos }: { datos: Datos }) {
  const { origenWeb, cambiandoWeb, cambiarOrigenWeb } = datos;
  const [pendiente, setPendiente] = useState<Origen | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);

  const confirmar = async () => {
    if (!pendiente) return;
    const destino = pendiente;
    setPendiente(null);
    setMensaje(null);
    const aviso = await cambiarOrigenWeb(destino);
    setMensaje(
      aviso
        ? { texto: aviso, error: !aviso.startsWith('Cambiado') }
        : { texto: `La web ya lee de la báscula ${NUMERO[destino]}.`, error: false },
    );
  };

  return (
    <div className="flex flex-col items-start sm:items-end gap-2">
      <div className="flex items-center gap-2.5">
        <span
          className="text-xs text-foreground-500 whitespace-nowrap"
          title="La tienda online, hostelería y Navidad copian los artículos y precios de esta báscula cada 5 minutos."
        >
          Precios de la web desde
        </span>
        <div role="radiogroup" aria-label="Báscula de la que lee la web" className="inline-flex p-0.5 rounded-full bg-background-50 border border-background-200/70">
          {ORIGENES.map((o) => {
            const activa = o === origenWeb;
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={activa}
                disabled={cambiandoWeb}
                onClick={() => {
                  if (activa) return;
                  setMensaje(null);
                  setPendiente(o);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  activa
                    ? 'bg-background-100 text-foreground-950 shadow-sm ring-1 ring-background-200 cursor-default'
                    : 'text-foreground-500 hover:text-foreground-950'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${activa ? ORIGEN_COLORS[o].dot : 'bg-foreground-300'}`}></span>
                Báscula {NUMERO[o]}
                {activa && cambiandoWeb && <i className="ri-loader-4-line animate-spin text-foreground-400"></i>}
              </button>
            );
          })}
        </div>
      </div>

      {pendiente && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-background-200 bg-background-50 px-3 py-2 text-xs text-foreground-600 shadow-sm">
          <span>
            La web pasará a tener los artículos y precios de la <strong className="text-foreground-950">báscula {NUMERO[pendiente]}</strong>.
          </span>
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPendiente(null)}
              className="px-2.5 py-1 rounded-full text-foreground-500 hover:text-foreground-950"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmar}
              className="px-3 py-1 rounded-full bg-foreground-950 text-background-50 font-medium hover:bg-foreground-800"
            >
              Cambiar
            </button>
          </span>
        </div>
      )}

      {mensaje && !cambiandoWeb && !pendiente && (
        <p className={`text-xs flex items-center gap-1.5 ${mensaje.error ? 'text-red-700' : 'text-emerald-700'}`}>
          <i className={mensaje.error ? 'ri-error-warning-line' : 'ri-check-line'}></i>
          {mensaje.texto}
        </p>
      )}
    </div>
  );
}

export default function BasculasPanel({ datos, vistaInicial }: { datos: Datos; vistaInicial: VistaBasculas }) {
  const [vista, setVista] = useState<VistaBasculas>(vistaInicial);
  const vistas: { value: VistaBasculas; label: string; icono: string }[] = [
    { value: 'web', label: `Báscula ${NUMERO[datos.origenWeb]} y web`, icono: 'ri-global-line' },
    { value: 'cambios', label: 'Cambios y diferencias', icono: 'ri-git-compare-line' },
  ];

  return (
    <>
      <div className="px-4 md:px-8 pt-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="inline-flex max-w-full overflow-x-auto scrollbar-hide p-0.5 rounded-full bg-background-50 border border-background-200/70 self-start">
          {vistas.map((v) => (
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
        <SelectorBasculaWeb datos={datos} />
      </div>
      {vista === 'web' ? <BasculaCatalogoPanel key={datos.origenWeb} origen={datos.origenWeb} /> : <BasculasCambiosPanel datos={datos} />}
    </>
  );
}
