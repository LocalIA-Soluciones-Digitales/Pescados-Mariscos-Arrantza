import { useState } from 'react';
import { useGastosFijos } from '@/hooks/useGastosFijos';
import type { GastoFijo } from '@/types/gastoFijo';

// Gastos de cada mes sin factura ni albarán (alquileres, limpieza, nómina en
// metálico…): arriba lo apuntado este mes en Contabilidad, que se puede
// corregir o quitar; en «Cambiar la lista», lo que se apunta solo cada día 1.

const inputCls =
  'w-full px-2.5 py-1.5 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60';

function formatEUR(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

const aTexto = (n: number) => String(n).replace('.', ',');
const aNum = (s: string): number | null => {
  const n = Number(s.trim().replace(/\s/g, '').replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(n) || n < 0 ? null : Math.round(n * 100) / 100;
};

function nombreMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long' });
}

// Importe que se guarda al salir del campo (o con Intro) si ha cambiado.
function CampoImporte({ valor, onGuardar, etiqueta }: { valor: number; onGuardar: (n: number) => Promise<boolean>; etiqueta: string }) {
  const [texto, setTexto] = useState(aTexto(valor));
  const [estado, setEstado] = useState<'ok' | 'guardando' | 'error'>('ok');
  const guardar = async () => {
    const n = aNum(texto);
    if (n == null) {
      setTexto(aTexto(valor));
      return;
    }
    if (n === valor) return;
    setEstado('guardando');
    setEstado((await onGuardar(n)) ? 'ok' : 'error');
  };
  return (
    <label className="relative w-28 flex-shrink-0">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        inputMode="decimal"
        aria-label={etiqueta}
        className={`${inputCls} pr-6 text-right tabular-nums ${estado === 'error' ? 'border-red-400' : ''} ${estado === 'guardando' ? 'opacity-60' : ''}`}
      />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-foreground-400 pointer-events-none">€</span>
    </label>
  );
}

function FilaLista({ g, datos }: { g: GastoFijo; datos: ReturnType<typeof useGastosFijos> }) {
  const [concepto, setConcepto] = useState(g.concepto);
  return (
    <li className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={g.activo}
        onChange={(e) => datos.actualizarFijo(g.id, { activo: e.target.checked })}
        title={g.activo ? 'Se apunta cada mes' : 'No se apunta (pausado)'}
        aria-label={`Apuntar cada mes ${g.concepto}`}
        className="w-4 h-4 accent-primary-500 flex-shrink-0"
      />
      <input
        value={concepto}
        onChange={(e) => setConcepto(e.target.value)}
        onBlur={() => {
          const c = concepto.trim();
          if (!c) setConcepto(g.concepto);
          else if (c !== g.concepto) datos.actualizarFijo(g.id, { concepto: c });
        }}
        aria-label="Concepto"
        className={`${inputCls} min-w-0 ${g.activo ? '' : 'text-foreground-400'}`}
      />
      <CampoImporte valor={g.importe} etiqueta={`Importe mensual de ${g.concepto}`} onGuardar={(importe) => datos.actualizarFijo(g.id, { importe })} />
      <button
        type="button"
        onClick={() => {
          if (window.confirm(`¿Quitar «${g.concepto}» de los gastos fijos? Lo ya apuntado en Contabilidad se queda.`)) datos.borrarFijo(g.id);
        }}
        aria-label={`Quitar ${g.concepto}`}
        title="Quitar de la lista"
        className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-foreground-400 hover:text-red-600 hover:bg-red-50"
      >
        <i className="ri-delete-bin-line"></i>
      </button>
    </li>
  );
}

function NuevoFijo({ onCrear }: { onCrear: (concepto: string, importe: number) => Promise<boolean> }) {
  const [concepto, setConcepto] = useState('');
  const [importe, setImporte] = useState('');
  const [guardando, setGuardando] = useState(false);
  const n = aNum(importe);
  const valido = concepto.trim() !== '' && n != null && n > 0;
  return (
    <form
      className="flex items-center gap-2 pl-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valido || guardando) return;
        setGuardando(true);
        if (await onCrear(concepto.trim(), n)) {
          setConcepto('');
          setImporte('');
        } else {
          window.alert('No se pudo añadir el gasto fijo.');
        }
        setGuardando(false);
      }}
    >
      <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Nuevo gasto fijo" aria-label="Concepto del nuevo gasto fijo" className={`${inputCls} min-w-0`} />
      <label className="relative w-28 flex-shrink-0">
        <input
          value={importe}
          onChange={(e) => setImporte(e.target.value)}
          placeholder="0,00"
          inputMode="decimal"
          aria-label="Importe mensual del nuevo gasto fijo"
          className={`${inputCls} pr-6 text-right tabular-nums`}
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-foreground-400 pointer-events-none">€</span>
      </label>
      <button
        type="submit"
        disabled={!valido || guardando}
        aria-label="Añadir gasto fijo"
        title="Añadir (cuenta ya desde este mes)"
        className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-40"
      >
        <i className="ri-add-line"></i>
      </button>
    </form>
  );
}

export default function GastosFijos() {
  const datos = useGastosFijos();
  const { fijos, apuntes, mes } = datos;
  const [editando, setEditando] = useState(false);
  const total = apuntes.reduce((t, m) => t + m.importe, 0);
  // Activos que este mes no están en Contabilidad (David quitó el apunte).
  const sinApuntar = fijos.filter((g) => g.activo && !apuntes.some((m) => m.gasto_fijo_id === g.id));

  if (datos.loading) return <div className="h-40 rounded-2xl bg-background-50 border border-background-200/70 animate-pulse" aria-busy="true" />;
  if (datos.error && fijos.length === 0) return null;

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-2xl shadow-card p-4 space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-foreground-950 mr-auto">Gastos fijos de {nombreMes(mes)}</h2>
        <span className="text-sm font-semibold tabular-nums text-foreground-950">{formatEUR(total)}</span>
      </div>
      <p className="text-[11px] text-foreground-500 -mt-2">
        Sin factura ni albarán: se apuntan solos el día 1 en Contabilidad. Corrige aquí el importe de este mes.
      </p>

      {apuntes.length > 0 && (
        <ul className="space-y-1.5">
          {apuntes.map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              <span className="flex-1 min-w-0 text-sm text-foreground-800 truncate" title={m.concepto ?? ''}>
                {m.concepto}
              </span>
              <CampoImporte key={m.importe} valor={m.importe} etiqueta={`Importe de ${m.concepto} este mes`} onGuardar={(n) => datos.cambiarApunte(m.id, n)} />
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`¿Quitar «${m.concepto}» de ${nombreMes(mes)}? Sale de Contabilidad este mes; el mes que viene se apunta otra vez.`))
                    datos.quitarApunte(m.id);
                }}
                aria-label={`Quitar ${m.concepto} este mes`}
                title="Quitar este mes"
                className="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-foreground-400 hover:text-red-600 hover:bg-red-50"
              >
                <i className="ri-close-line"></i>
              </button>
            </li>
          ))}
        </ul>
      )}

      {sinApuntar.length > 0 && (
        <ul className="space-y-1">
          {sinApuntar.map((g) => (
            <li key={g.id} className="flex items-center gap-2 text-xs text-foreground-400">
              <span className="flex-1 min-w-0 truncate line-through">{g.concepto}</span>
              <span className="tabular-nums">{formatEUR(g.importe)}</span>
              <button type="button" onClick={() => datos.apuntarAMano(g)} className="font-semibold text-primary-600 hover:text-primary-700">
                Apuntar
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setEditando((v) => !v)}
        aria-expanded={editando}
        className="inline-flex items-center gap-1 text-xs font-semibold text-foreground-600 hover:text-foreground-950"
      >
        <i className={editando ? 'ri-arrow-up-s-line' : 'ri-edit-line'}></i>
        {editando ? 'Cerrar' : 'Cambiar la lista'}
      </button>

      {editando && (
        <div className="space-y-2 pt-2 border-t border-background-200/70">
          <p className="text-[11px] text-foreground-500">
            Lo que se apunta cada mes. Un importe cambiado aquí vale desde el mes que viene; desmarca para pausarlo.
          </p>
          <ul className="space-y-1.5">
            {fijos.map((g) => (
              <FilaLista key={g.id} g={g} datos={datos} />
            ))}
          </ul>
          <NuevoFijo onCrear={datos.crearFijo} />
        </div>
      )}
    </div>
  );
}
