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

const TIPO_LABELS: Record<TipoMovimiento, string> = {
  entrada: 'Entrada',
  baja: 'Baja',
  venta_bascula: 'Venta',
  anulacion_bascula: 'Anulación',
  pedido_web: 'Pedido web',
  ajuste: 'Ajuste',
};

const DIAS = 14;

const kgTexto = (kg: number) => `${kg > 0 ? '+' : ''}${kg.toLocaleString('es-ES', { maximumFractionDigits: 3 })} kg`;
const stockTexto = (kg: number) => `${kg.toLocaleString('es-ES', { maximumFractionDigits: 3 })} kg`;
const origenTexto = (origen: string | null) => (origen ? (ORIGEN_LABELS[origen as Origen] ?? origen) : null);

// Historial de stock_movimientos de un producto (últimos 14 días),
// agrupado por día con el stock al empezar y al acabar, para poder cuadrar
// el stock con las ventas de cada pescadería. El historial empieza el
// 01-10-2026: antes no se guardaba.
export default function StockHistorial({ productoId }: { productoId: string }) {
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        const ventasPorOrigen = new Map<string, number>();
        lista
          .filter((m) => m.tipo === 'venta_bascula' || m.tipo === 'anulacion_bascula')
          .forEach((m) => {
            const clave = m.origen ?? '';
            ventasPorOrigen.set(clave, (ventasPorOrigen.get(clave) ?? 0) + m.kg);
          });
        return {
          dia,
          inicio: lista[0].stock_antes,
          fin: lista[lista.length - 1].stock_despues,
          entradas: suma((m) => m.tipo === 'entrada'),
          bajas: suma((m) => m.tipo === 'baja'),
          pedidosWeb: suma((m) => m.tipo === 'pedido_web'),
          ajustes: suma((m) => m.tipo === 'ajuste'),
          ventasPorOrigen: Array.from(ventasPorOrigen.entries()),
          movimientos: [...lista].reverse(),
        };
      });
  }, [movimientos]);

  if (error) return <p className="text-xs text-red-600 mt-2">No se pudo cargar el historial: {error}</p>;
  if (!movimientos) return <p className="text-xs text-foreground-400 mt-2">Cargando historial…</p>;
  if (dias.length === 0)
    return <p className="text-xs text-foreground-400 mt-2">Sin movimientos en los últimos {DIAS} días (el historial se guarda desde el 01-10-2026).</p>;

  return (
    <div className="mt-3 space-y-3 border-t border-background-200/70 pt-3">
      {dias.map((d) => (
        <details key={d.dia} className="group rounded-lg bg-background-100/70 px-3 py-2" open={d === dias[0]}>
          <summary className="cursor-pointer list-none flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="font-semibold text-foreground-800 w-24">
              {new Date(`${d.dia}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit' })}
            </span>
            <span className="text-foreground-500">
              Empezó <b className="text-foreground-900">{stockTexto(d.inicio)}</b>
            </span>
            {d.entradas !== 0 && <span className="text-emerald-700">Entradas {kgTexto(d.entradas)}</span>}
            {d.ventasPorOrigen.map(([origen, kg]) => (
              <span key={origen} className="text-foreground-600">
                Ventas {origenTexto(origen) ?? 'báscula'} {kgTexto(kg)}
              </span>
            ))}
            {d.pedidosWeb !== 0 && <span className="text-foreground-600">Web {kgTexto(d.pedidosWeb)}</span>}
            {d.bajas !== 0 && <span className="text-red-700">Bajas {kgTexto(d.bajas)}</span>}
            {d.ajustes !== 0 && <span className="text-amber-700">Ajustes {kgTexto(d.ajustes)}</span>}
            <span className="text-foreground-500">
              Acabó <b className="text-foreground-900">{stockTexto(d.fin)}</b>
            </span>
          </summary>
          <table className="w-full mt-2 text-xs tabular-nums">
            <tbody>
              {d.movimientos.map((m) => (
                <tr key={m.id} className="border-t border-background-200/50">
                  <td className="py-1 pr-2 text-foreground-400 w-12">
                    {new Date(m.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-1 pr-2 text-foreground-700">
                    {TIPO_LABELS[m.tipo]}
                    {m.origen && <span className="text-foreground-400"> · {origenTexto(m.origen)}</span>}
                    {m.referencia && <span className="text-foreground-400"> · {m.referencia}</span>}
                  </td>
                  <td className={`py-1 pr-2 text-right ${m.kg < 0 ? 'text-red-700' : m.kg > 0 ? 'text-emerald-700' : 'text-foreground-400'}`}>
                    {kgTexto(m.kg)}
                  </td>
                  <td className="py-1 text-right text-foreground-500 w-20">{stockTexto(m.stock_despues)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  );
}
