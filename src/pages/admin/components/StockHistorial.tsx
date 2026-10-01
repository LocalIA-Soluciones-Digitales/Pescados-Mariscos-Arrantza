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

const DIAS = 14;

const num = (kg: number) => kg.toLocaleString('es-ES', { maximumFractionDigits: 3 });
const conSigno = (kg: number) => `${kg > 0 ? '+' : kg < 0 ? '−' : ''}${num(Math.abs(kg))}`;
const origenTexto = (origen: string | null) => (origen ? (ORIGEN_LABELS[origen as Origen] ?? origen) : null);
const colorKg = (kg: number) => (kg > 0 ? 'text-emerald-700' : kg < 0 ? 'text-red-700' : 'text-foreground-400');

const hoy = () => new Date().toLocaleDateString('sv-SE');
const ayer = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE');

function tituloDia(dia: string) {
  if (dia === hoy()) return 'Hoy';
  if (dia === ayer()) return 'Ayer';
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

// Historial de stock_movimientos de un producto (últimos 14 días),
// agrupado por día con el stock al empezar y al acabar, para poder cuadrar
// el stock con las ventas de cada pescadería. El historial empieza el
// 01-10-2026: antes no se guardaba.
export default function StockHistorial({ productoId }: { productoId: string }) {
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Días que el usuario ha abierto o cerrado a mano; el más reciente sale abierto.
  const [alternados, setAlternados] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelado = false;
    const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from('stock_movimientos')
      .select('id, tipo, kg, stock_antes, stock_despues, origen, referencia, created_at')
      .eq('producto_id', productoId)
      .gte('created_at', desde)
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
  }, [productoId]);

  const dias = useMemo(() => {
    if (!movimientos) return [];
    const porDia = new Map<string, Movimiento[]>();
    movimientos.forEach((m) => {
      const dia = new Date(m.created_at).toLocaleDateString('sv-SE'); // AAAA-MM-DD en hora local
      const lista = porDia.get(dia) ?? [];
      lista.push(m);
      porDia.set(dia, lista);
    });
    return Array.from(porDia.entries())
      .reverse()
      .map(([dia, lista]) => {
        const suma = (f: (m: Movimiento) => boolean) => lista.filter(f).reduce((n, m) => n + m.kg, 0);
        // Ventas por pescadería, ya netas de los tickets anulados.
        const ventas = new Map<string, number>();
        lista
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
        const inicio = lista[0].stock_antes;
        const fin = lista[lista.length - 1].stock_despues;
        return { dia, inicio, fin, neto: fin - inicio, desglose, movimientos: [...lista].reverse() };
      });
  }, [movimientos]);

  const alternar = (dia: string) =>
    setAlternados((prev) => {
      const next = new Set(prev);
      if (next.has(dia)) next.delete(dia);
      else next.add(dia);
      return next;
    });

  return (
    <div className="border-t border-background-200/70 bg-background-100/40 px-3.5 py-3 sm:px-4">
      {error ? (
        <p className="text-sm text-red-600">No se pudo cargar el historial: {error}</p>
      ) : !movimientos ? (
        <p className="text-sm text-foreground-400">Cargando historial…</p>
      ) : dias.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl bg-background-50 px-3 py-3 text-sm text-foreground-500">
          <i className="ri-information-line text-base text-foreground-400"></i>
          Sin movimientos en los últimos {DIAS} días. El historial se guarda desde el 1 de octubre.
        </div>
      ) : (
        <div className="space-y-2.5">
          {dias.map((d, i) => {
            const abierto = (i === 0) !== alternados.has(d.dia);
            return (
              <section key={d.dia} className="overflow-hidden rounded-xl border border-background-200/70 bg-background-100/70">
                <button
                  type="button"
                  onClick={() => alternar(d.dia)}
                  aria-expanded={abierto}
                  className="w-full px-3 pt-2.5 pb-3 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-foreground-900">{tituloDia(d.dia)}</h4>
                    <span className="flex items-center gap-1 text-[11px] text-foreground-400">
                      {d.movimientos.length} {d.movimientos.length === 1 ? 'movimiento' : 'movimientos'}
                      <i className={`ri-arrow-down-s-line text-base transition-transform ${abierto ? 'rotate-180' : ''}`}></i>
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <Cifra etiqueta="Empezó" valor={num(d.inicio)} />
                    <Cifra etiqueta="Cambio" valor={conSigno(d.neto)} clase={colorKg(d.neto)} />
                    <Cifra etiqueta="Acabó" valor={num(d.fin)} />
                  </div>
                  {d.desglose.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {d.desglose.map((x) => (
                        <span key={x.label} className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${x.clase}`}>
                          {x.label} {conSigno(x.kg)} kg
                        </span>
                      ))}
                    </div>
                  )}
                </button>

                {abierto && (
                  <ul className="divide-y divide-background-200/60 border-t border-background-200/70 bg-background-50">
                    {d.movimientos.map((m) => {
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
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
