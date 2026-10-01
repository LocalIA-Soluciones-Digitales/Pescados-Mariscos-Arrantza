import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ORIGEN_LABELS, type Origen } from '@/types/origen';

type TipoMovimiento = 'entrada' | 'baja' | 'venta_bascula' | 'anulacion_bascula' | 'pedido_web' | 'ajuste';

interface Movimiento {
  id: number;
  tipo: TipoMovimiento;
  kg: number;
  stock_antes: number;
  stock_despues: number;
  origen: string | null;
  referencia: string | null;
  created_at: string;
}

const TIPOS: Record<TipoMovimiento, { label: string; icono: string; color: string }> = {
  entrada: { label: 'Entrada', icono: 'ri-add-line', color: 'bg-emerald-100 text-emerald-700' },
  baja: { label: 'Baja / merma', icono: 'ri-delete-bin-6-line', color: 'bg-red-100 text-red-700' },
  venta_bascula: { label: 'Venta', icono: 'ri-scales-3-line', color: 'bg-sky-100 text-sky-700' },
  anulacion_bascula: { label: 'Ticket anulado', icono: 'ri-arrow-go-back-line', color: 'bg-amber-100 text-amber-700' },
  pedido_web: { label: 'Pedido web', icono: 'ri-shopping-bag-3-line', color: 'bg-violet-100 text-violet-700' },
  ajuste: { label: 'Ajuste', icono: 'ri-equalizer-line', color: 'bg-amber-100 text-amber-700' },
};

// El historial se guarda desde este día: antes no hay movimientos.
const PRIMER_DIA = '2026-10-01';

const num = (kg: number) => kg.toLocaleString('es-ES', { maximumFractionDigits: 3 });
const conSigno = (kg: number) => `${kg > 0 ? '+' : kg < 0 ? '−' : ''}${num(Math.abs(kg))}`;
const origenTexto = (origen: string | null) => (origen ? (ORIGEN_LABELS[origen as Origen] ?? origen) : null);
const colorKg = (kg: number) => (kg > 0 ? 'text-emerald-700' : kg < 0 ? 'text-red-700' : 'text-foreground-400');

// Fechas como AAAA-MM-DD en hora local.
const aDia = (d: Date) => d.toLocaleDateString('sv-SE');
const hoy = () => aDia(new Date());
const sumarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + n);
  return aDia(d);
};

function tituloDia(dia: string) {
  if (dia === hoy()) return 'Hoy';
  if (dia === sumarDias(hoy(), -1)) return 'Ayer';
  const t = new Date(`${dia}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function Cifra({ etiqueta, valor, clase = 'text-foreground-950' }: { etiqueta: string; valor: string; clase?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-background-50 px-2.5 py-2 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground-400">{etiqueta}</p>
      <p className={`mt-0.5 text-base font-semibold tabular-nums leading-tight ${clase}`}>
        {valor}
        <span className="ml-0.5 text-[11px] font-medium text-foreground-400">kg</span>
      </p>
    </div>
  );
}

// Historial de stock_movimientos de un producto, día a día (por defecto
// hoy), con el stock al empezar y al acabar, para poder cuadrar el stock con
// las ventas de cada pescadería. Se guarda desde el 01-10-2026.
export default function StockHistorial({ productoId }: { productoId: string }) {
  const [dia, setDia] = useState(hoy);
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setMovimientos(null);
    setError(null);
    // Límites del día en hora local, pasados a UTC para la consulta.
    const desde = new Date(`${dia}T00:00:00`).toISOString();
    const hasta = new Date(`${sumarDias(dia, 1)}T00:00:00`).toISOString();
    supabase
      .from('stock_movimientos')
      .select('id, tipo, kg, stock_antes, stock_despues, origen, referencia, created_at')
      .eq('producto_id', productoId)
      .gte('created_at', desde)
      .lt('created_at', hasta)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelado) return;
        if (err) setError(err.message);
        else
          setMovimientos(
            (data ?? []).map((m) => ({
              ...m,
              kg: Number(m.kg),
              stock_antes: Number(m.stock_antes),
              stock_despues: Number(m.stock_despues),
            })) as Movimiento[],
          );
      });
    return () => {
      cancelado = true;
    };
  }, [productoId, dia]);

  const resumen = useMemo(() => {
    if (!movimientos || movimientos.length === 0) return null;
    const suma = (f: (m: Movimiento) => boolean) => movimientos.filter(f).reduce((n, m) => n + m.kg, 0);
    // Ventas por pescadería, ya netas de los tickets anulados.
    const ventas = new Map<string, number>();
    movimientos
      .filter((m) => m.tipo === 'venta_bascula' || m.tipo === 'anulacion_bascula')
      .forEach((m) => ventas.set(m.origen ?? '', (ventas.get(m.origen ?? '') ?? 0) + m.kg));
    const desglose = [
      { label: 'Entradas', kg: suma((m) => m.tipo === 'entrada'), clase: 'bg-emerald-50 text-emerald-800' },
      ...Array.from(ventas.entries()).map(([origen, kg]) => ({
        label: `Ventas ${origenTexto(origen) ?? 'báscula'}`,
        kg,
        clase: 'bg-sky-50 text-sky-800',
      })),
      { label: 'Pedidos web', kg: suma((m) => m.tipo === 'pedido_web'), clase: 'bg-violet-50 text-violet-800' },
      { label: 'Bajas', kg: suma((m) => m.tipo === 'baja'), clase: 'bg-red-50 text-red-800' },
      { label: 'Ajustes', kg: suma((m) => m.tipo === 'ajuste'), clase: 'bg-amber-50 text-amber-800' },
    ].filter((d) => Math.abs(d.kg) > 0.0005);
    const inicio = movimientos[0].stock_antes;
    const fin = movimientos[movimientos.length - 1].stock_despues;
    return { inicio, fin, neto: fin - inicio, desglose, lista: [...movimientos].reverse() };
  }, [movimientos]);

  const esHoy = dia >= hoy();
  const esPrimero = dia <= PRIMER_DIA;
  const botonDia =
    'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-lg text-foreground-500 transition-colors hover:bg-background-200/70 disabled:pointer-events-none disabled:opacity-30';

  return (
    <div className="border-t border-background-200/70 bg-background-100/40 px-3.5 py-3 sm:px-4">
      <section className="overflow-hidden rounded-xl border border-background-200/70 bg-background-100/70">
        <div className="flex items-center gap-1 px-1.5 pt-1.5">
          <button type="button" onClick={() => setDia((d) => sumarDias(d, -1))} disabled={esPrimero} className={botonDia} aria-label="Día anterior">
            <i className="ri-arrow-left-s-line"></i>
          </button>
          {/* El título hace de botón del calendario: el input de fecha queda
              encima, invisible, para abrir el selector nativo del móvil. */}
          <label className="relative flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-1 hover:bg-background-200/50">
            <i className="ri-calendar-line text-sm text-foreground-400"></i>
            <span className="truncate text-sm font-semibold text-foreground-900">{tituloDia(dia)}</span>
            <input
              type="date"
              value={dia}
              min={PRIMER_DIA}
              max={hoy()}
              onChange={(e) => e.target.value && setDia(e.target.value)}
              onClick={(e) => {
                // En el ordenador el clic no abre el calendario por sí solo.
                try {
                  e.currentTarget.showPicker?.();
                } catch {
                  /* navegador sin showPicker: se queda el comportamiento nativo */
                }
              }}
              aria-label="Elegir día"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
          <button type="button" onClick={() => setDia((d) => sumarDias(d, 1))} disabled={esHoy} className={botonDia} aria-label="Día siguiente">
            <i className="ri-arrow-right-s-line"></i>
          </button>
          {!esHoy && (
            <button
              type="button"
              onClick={() => setDia(hoy())}
              className="flex-shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-foreground-600 hover:bg-background-200/70"
            >
              Hoy
            </button>
          )}
        </div>

        {error ? (
          <p className="px-3 py-3 text-sm text-red-600">No se pudo cargar el historial: {error}</p>
        ) : !movimientos ? (
          <p className="px-3 py-3 text-sm text-foreground-400">Cargando…</p>
        ) : !resumen ? (
          <div className="m-3 mt-2 flex items-center gap-2 rounded-lg bg-background-50 px-3 py-3 text-sm text-foreground-500">
            <i className="ri-information-line text-base text-foreground-400"></i>
            Sin movimientos este día.
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              aria-expanded={abierto}
              className="w-full px-3 pt-2 pb-3 text-left"
            >
              <div className="grid grid-cols-3 gap-1.5">
                <Cifra etiqueta="Empezó" valor={num(resumen.inicio)} />
                <Cifra etiqueta="Cambio" valor={conSigno(resumen.neto)} clase={colorKg(resumen.neto)} />
                <Cifra etiqueta="Acabó" valor={num(resumen.fin)} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {resumen.desglose.map((x) => (
                  <span key={x.label} className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${x.clase}`}>
                    {x.label} {conSigno(x.kg)} kg
                  </span>
                ))}
                <span className="ml-auto flex items-center gap-1 text-[11px] text-foreground-400">
                  {resumen.lista.length} {resumen.lista.length === 1 ? 'movimiento' : 'movimientos'}
                  <i className={`ri-arrow-down-s-line text-base transition-transform ${abierto ? 'rotate-180' : ''}`}></i>
                </span>
              </div>
            </button>

            {abierto && (
              <ul className="divide-y divide-background-200/60 border-t border-background-200/70 bg-background-50">
                {resumen.lista.map((m) => {
                  const tipo = TIPOS[m.tipo];
                  const hora = new Date(m.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                  const titulo = [tipo.label, origenTexto(m.origen)].filter(Boolean).join(' · ');
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-base ${tipo.color}`}>
                        <i className={tipo.icono}></i>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug text-foreground-900">{titulo}</p>
                        <p className="text-xs leading-snug text-foreground-400 break-words">{m.referencia ?? hora}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className={`text-sm font-semibold tabular-nums ${colorKg(m.kg)}`}>{conSigno(m.kg)} kg</p>
                        <p className="text-[11px] tabular-nums text-foreground-400">quedan {num(m.stock_despues)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
