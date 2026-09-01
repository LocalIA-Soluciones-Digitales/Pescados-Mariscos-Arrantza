import { useMemo, useState } from 'react';
import { useBasculaVentasDiarias, fetchBasculaVentasDelDia } from '@/hooks/useBasculaVentas';
import type { BasculaVenta, BasculaVentaDiariaPorTienda } from '@/types/basculaVenta';
import { ORIGENES, ORIGEN_COLORS, ORIGEN_LABELS, type Origen } from '@/types/origen';
import OrigenBadge from '@/components/base/OrigenBadge';

type Filtro = 'todas' | Origen;

function formatFechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const texto = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatPrecio(n: number): string {
  return `${n.toFixed(2)} €`;
}

function LineaVenta({ l }: { l: BasculaVenta }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <div className="min-w-0 flex items-center gap-2">
        <span className="text-foreground-400 tabular-nums flex-shrink-0">{l.hora?.slice(0, 5) ?? '—'}</span>
        <span className="text-foreground-800 truncate">{l.designacion}</span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-foreground-400 tabular-nums">
          {l.cantidad} {l.unidad}
        </span>
        <span className="text-foreground-950 font-medium tabular-nums w-16 text-right">{formatPrecio(l.importe)}</span>
      </div>
    </div>
  );
}

function StatTile({ label, valor, icon, color }: { label: string; valor: string; icon: string; color?: { bg: string; text: string } }) {
  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl p-3 shadow-card">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full text-[11px] ${color ? `${color.bg} ${color.text}` : 'bg-primary-50 text-primary-600'}`}>
          <i className={icon}></i>
        </span>
        <p className="text-[11px] text-foreground-400 truncate">{label}</p>
      </div>
      <p className="text-lg font-semibold text-foreground-950 tabular-nums">{valor}</p>
    </div>
  );
}

function DiaRow({
  fecha,
  numTickets,
  totalPeso,
  totalImporte,
  porTienda,
  filtro,
}: {
  fecha: string;
  numTickets: number;
  totalPeso: number | null;
  totalImporte: number;
  porTienda: BasculaVentaDiariaPorTienda[];
  filtro: Filtro;
}) {
  const [abierto, setAbierto] = useState(false);
  const [lineas, setLineas] = useState<BasculaVenta[] | null>(null);
  const [cargando, setCargando] = useState(false);

  const toggle = async () => {
    const nuevoEstado = !abierto;
    setAbierto(nuevoEstado);
    if (nuevoEstado && lineas === null) {
      setCargando(true);
      const data = await fetchBasculaVentasDelDia(fecha);
      setLineas(data);
      setCargando(false);
    }
  };

  const lineasPorOrigen = useMemo(() => {
    const map = new Map<Origen, BasculaVenta[]>();
    (lineas ?? [])
      .filter((l) => filtro === 'todas' || l.origen === filtro)
      .forEach((l) => {
        const grupo = map.get(l.origen) ?? [];
        grupo.push(l);
        map.set(l.origen, grupo);
      });
    return map;
  }, [lineas, filtro]);

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl shadow-card overflow-hidden">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-background-100/60 transition-colors text-left">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground-950">{formatFechaLarga(fecha)}</p>
          <p className="text-xs text-foreground-400 mt-0.5">
            {numTickets} ticket{numTickets === 1 ? '' : 's'}
            {totalPeso ? ` · ${totalPeso.toFixed(2)} kg vendidos a peso` : ''}
          </p>
          {filtro === 'todas' && porTienda.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {porTienda.map((t) => (
                <span key={t.origen} className="inline-flex items-center gap-1 text-[11px]">
                  <OrigenBadge origen={t.origen} />
                  <span className="font-medium text-foreground-600">{formatPrecio(t.total_importe)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm font-semibold text-foreground-950 tabular-nums">{formatPrecio(totalImporte)}</span>
          <i className={`ri-arrow-down-s-line text-foreground-400 transition-transform ${abierto ? 'rotate-180' : ''}`}></i>
        </div>
      </button>

      {abierto && (
        <div className="border-t border-background-200/70 px-4 py-3 space-y-4">
          {cargando ? (
            <p className="text-xs text-foreground-400">Cargando…</p>
          ) : lineasPorOrigen.size === 0 ? (
            <p className="text-xs text-foreground-400">Sin líneas de venta guardadas para este día.</p>
          ) : (
            Array.from(lineasPorOrigen.entries()).map(([origen, lineasOrigen]) => (
              <div key={origen}>
                {filtro === 'todas' && <OrigenBadge origen={origen} className="mb-1.5" />}
                <div className="space-y-1.5 mt-1.5">
                  {lineasOrigen.map((l) => (
                    <LineaVenta key={l.id} l={l} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function VentasTiendaPanel() {
  const { dias, porTienda, loading } = useBasculaVentasDiarias();
  const [filtro, setFiltro] = useState<Filtro>('todas');

  const porTiendaPorFecha = useMemo(() => {
    const map = new Map<string, BasculaVentaDiariaPorTienda[]>();
    porTienda.forEach((t) => {
      const grupo = map.get(t.fecha) ?? [];
      grupo.push(t);
      map.set(t.fecha, grupo);
    });
    return map;
  }, [porTienda]);

  // "Todas": los días combinados tal cual vienen de la vista. Con un
  // origen concreto: se reconstruye la lista a partir del desglose por
  // tienda, mostrando solo los días en los que esa tienda vendió algo.
  const diasVisibles = useMemo(() => {
    if (filtro === 'todas') return dias.map((d) => ({ fecha: d.fecha, numTickets: d.num_tickets, totalPeso: d.total_peso_kg, totalImporte: d.total_importe }));
    return porTienda
      .filter((t) => t.origen === filtro)
      .map((t) => ({ fecha: t.fecha, numTickets: t.num_tickets, totalPeso: t.total_peso_kg, totalImporte: t.total_importe }));
  }, [filtro, dias, porTienda]);

  const totales = useMemo(() => {
    const base = { importe: 0, peso: 0, tickets: 0 };
    return diasVisibles.reduce(
      (acc, d) => ({
        importe: acc.importe + d.totalImporte,
        peso: acc.peso + (d.totalPeso ?? 0),
        tickets: acc.tickets + d.numTickets,
      }),
      base,
    );
  }, [diasVisibles]);

  return (
    <div className="px-4 md:px-8 py-6 pb-28">
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <button
          type="button"
          onClick={() => setFiltro('todas')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
            filtro === 'todas' ? 'bg-primary-500 text-background-50' : 'bg-background-50 text-foreground-500 hover:bg-background-200/70 border border-background-200/70'
          }`}
        >
          Todas las tiendas
        </button>
        {ORIGENES.map((origen) => {
          const c = ORIGEN_COLORS[origen];
          const activo = filtro === origen;
          return (
            <button
              key={origen}
              type="button"
              onClick={() => setFiltro(origen)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                activo ? `${c.bg} ${c.text} border-transparent ring-1 ${c.ring}` : 'bg-background-50 text-foreground-500 hover:bg-background-200/70 border-background-200/70'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></span>
              {ORIGEN_LABELS[origen]}
            </button>
          );
        })}
      </div>

      {!loading && diasVisibles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          <StatTile label="Facturado" valor={formatPrecio(totales.importe)} icon="ri-money-euro-circle-line" />
          <StatTile label="Kg a peso" valor={`${totales.peso.toFixed(2)} kg`} icon="ri-scales-3-line" />
          <StatTile label="Tickets" valor={String(totales.tickets)} icon="ri-receipt-line" />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-foreground-400">Cargando…</p>
      ) : diasVisibles.length === 0 ? (
        <p className="text-sm text-foreground-400">Todavía no hay ventas registradas{filtro !== 'todas' ? ` en ${ORIGEN_LABELS[filtro]}` : ''}.</p>
      ) : (
        <div className="space-y-2">
          {diasVisibles.map((d) => (
            <DiaRow
              key={d.fecha}
              fecha={d.fecha}
              numTickets={d.numTickets}
              totalPeso={d.totalPeso}
              totalImporte={d.totalImporte}
              porTienda={porTiendaPorFecha.get(d.fecha) ?? []}
              filtro={filtro}
            />
          ))}
        </div>
      )}
    </div>
  );
}
