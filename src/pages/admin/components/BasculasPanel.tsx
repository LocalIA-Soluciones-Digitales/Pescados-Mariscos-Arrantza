import { useState } from 'react';
import BasculaCatalogoPanel from './BasculaCatalogoPanel';
import BasculasCambiosPanel from './BasculasCambiosPanel';
import type { useBasculasCambios } from '@/hooks/useBasculasCambios';
import { ORIGENES, ORIGEN_COLORS, ORIGEN_LABELS, type Origen } from '@/types/origen';

// Pestaña Básculas del panel de gestión: arriba, de qué báscula lee la web
// (David la cambia a la 2 cuando solo abre esa pescadería, p. ej. si la
// encargada está de vacaciones); debajo, el catálogo de esa báscula frente a
// la web y el registro de cambios / diferencias entre las dos básculas.
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
        : { texto: `Listo: la web ya tiene los artículos y precios de la báscula ${NUMERO[destino]}.`, error: false },
    );
  };

  return (
    <section className="bg-background-50 border border-background-200/70 rounded-2xl p-4 md:p-5">
      <div className="flex items-start gap-3 mb-4">
        <span className="w-10 h-10 rounded-full bg-foreground-950 text-background-50 flex items-center justify-center flex-shrink-0">
          <i className="ri-global-line text-lg"></i>
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground-950">¿De qué báscula lee la web?</h2>
          <p className="text-xs text-foreground-500 mt-0.5">
            La tienda online, hostelería y Navidad copian los artículos y precios de la báscula marcada (cada 5 minutos).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ORIGENES.map((o) => {
          const activa = o === origenWeb;
          const color = ORIGEN_COLORS[o];
          return (
            <button
              key={o}
              type="button"
              disabled={activa || cambiandoWeb}
              onClick={() => {
                setMensaje(null);
                setPendiente(o);
              }}
              aria-pressed={activa}
              className={`relative flex items-center gap-4 text-left rounded-xl px-4 py-4 transition-all ${
                activa
                  ? `${color.bg} ring-2 ${o === 'pescaderia_1' ? 'ring-sky-500' : 'ring-amber-500'} cursor-default`
                  : 'bg-background-100/60 ring-1 ring-background-200 hover:ring-foreground-300 hover:bg-background-100 disabled:opacity-60'
              }`}
            >
              <span
                className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold flex-shrink-0 ${
                  activa ? `${color.dot} text-white` : 'bg-background-200 text-foreground-500'
                }`}
              >
                {NUMERO[o]}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-lg font-semibold leading-tight ${activa ? color.text : 'text-foreground-700'}`}>
                  Báscula {NUMERO[o]}
                </span>
                <span className="block text-xs text-foreground-500">{ORIGEN_LABELS[o]}</span>
                <span
                  className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    activa ? 'bg-emerald-600 text-white' : 'bg-background-50 text-foreground-600 ring-1 ring-background-200'
                  }`}
                >
                  <i className={activa ? 'ri-checkbox-circle-fill' : 'ri-arrow-left-right-line'}></i>
                  {activa ? 'La web lee de esta' : 'Usar esta para la web'}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {pendiente && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">¿Pasar la web a la báscula {NUMERO[pendiente]}?</p>
          <p className="text-xs text-amber-800 mt-1">
            La web tendrá los mismos artículos y precios que la báscula {NUMERO[pendiente]}: lo que solo esté en la otra
            se ocultará de la web y lo nuevo de esta aparecerá.
            {pendiente === 'pescaderia_2' && ' Cuando vuelva a abrir la pescadería 1, vuelve a poner la báscula 1.'}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={confirmar}
              className="px-4 py-2 rounded-full bg-foreground-950 text-background-50 text-sm font-medium hover:bg-foreground-800"
            >
              Sí, cambiar a la báscula {NUMERO[pendiente]}
            </button>
            <button
              type="button"
              onClick={() => setPendiente(null)}
              className="px-4 py-2 rounded-full text-sm font-medium text-foreground-600 hover:text-foreground-950"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {cambiandoWeb && (
        <p className="mt-4 text-sm text-foreground-600 flex items-center gap-2">
          <i className="ri-loader-4-line animate-spin"></i>
          Cambiando y leyendo la báscula…
        </p>
      )}
      {mensaje && !cambiandoWeb && (
        <p className={`mt-4 text-sm flex items-start gap-2 ${mensaje.error ? 'text-red-700' : 'text-emerald-700'}`}>
          <i className={`mt-0.5 ${mensaje.error ? 'ri-error-warning-line' : 'ri-checkbox-circle-line'}`}></i>
          {mensaje.texto}
        </p>
      )}
    </section>
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
      <div className="px-4 md:px-8 pt-4">
        <SelectorBasculaWeb datos={datos} />
      </div>
      <div className="px-4 md:px-8 pt-4">
        <div className="inline-flex max-w-full overflow-x-auto scrollbar-hide p-0.5 rounded-full bg-background-50 border border-background-200/70">
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
      </div>
      {vista === 'web' ? <BasculaCatalogoPanel key={datos.origenWeb} origen={datos.origenWeb} /> : <BasculasCambiosPanel datos={datos} />}
    </>
  );
}
