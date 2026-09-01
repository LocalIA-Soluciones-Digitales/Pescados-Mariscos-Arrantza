import { useMemo, useState } from 'react';
import { useBasculaVentasDiarias, fetchBasculaVentasDelDia } from '@/hooks/useBasculaVentas';
import type { BasculaVenta, BasculaVentaDiariaPorTienda } from '@/types/basculaVenta';
import { ORIGEN_LABELS, type Origen } from '@/types/origen';
import InfoHint from '@/components/base/InfoHint';

const INFO_ITEMS = [
  {
    icon: 'ri-scales-3-line',
    text: 'Ventas cobradas en el mostrador de ambas pescaderías, sincronizadas automáticamente desde sus básculas (Factura Simplificada y Factura).',
  },
  { icon: 'ri-file-list-3-line', text: 'No incluye los Albaranes, que se facturan a fin de mes junto con la Factura correspondiente.' },
  { icon: 'ri-store-2-line', text: 'El total del día suma las dos tiendas; debajo se ve el desglose de ingresos por cada una.' },
  { icon: 'ri-cursor-line', text: 'Pincha un día para ver el detalle de cada venta.' },
];

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

function DiaRow({ fecha, numTickets, totalPeso, totalImporte, porTienda }: { fecha: string; numTickets: number; totalPeso: number | null; totalImporte: number; porTienda: BasculaVentaDiariaPorTienda[] }) {
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
    (lineas ?? []).forEach((l) => {
      const grupo = map.get(l.origen) ?? [];
      grupo.push(l);
      map.set(l.origen, grupo);
    });
    return map;
  }, [lineas]);

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl shadow-card overflow-hidden">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-background-100/60 transition-colors text-left">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground-950">{formatFechaLarga(fecha)}</p>
          <p className="text-xs text-foreground-400 mt-0.5">
            {numTickets} ticket{numTickets === 1 ? '' : 's'}
            {totalPeso ? ` · ${totalPeso.toFixed(2)} kg vendidos a peso` : ''}
          </p>
          {porTienda.length > 0 && (
            <p className="text-[11px] text-foreground-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {porTienda.map((t) => (
                <span key={t.origen}>
                  {ORIGEN_LABELS[t.origen]}: <span className="font-medium text-foreground-600">{formatPrecio(t.total_importe)}</span>
                </span>
              ))}
            </p>
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
          ) : !lineas || lineas.length === 0 ? (
            <p className="text-xs text-foreground-400">Sin líneas de venta guardadas para este día.</p>
          ) : (
            Array.from(lineasPorOrigen.entries()).map(([origen, lineasOrigen]) => (
              <div key={origen}>
                <p className="text-[10px] uppercase tracking-wide text-foreground-400 mb-1.5">{ORIGEN_LABELS[origen]}</p>
                <div className="space-y-1.5">
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

  const porTiendaPorFecha = useMemo(() => {
    const map = new Map<string, BasculaVentaDiariaPorTienda[]>();
    porTienda.forEach((t) => {
      const grupo = map.get(t.fecha) ?? [];
      grupo.push(t);
      map.set(t.fecha, grupo);
    });
    return map;
  }, [porTienda]);

  return (
    <div className="px-4 md:px-8 py-6 pb-28">
      <div className="flex justify-end mb-4">
        <InfoHint items={INFO_ITEMS} align="right" />
      </div>

      {loading ? (
        <p className="text-sm text-foreground-400">Cargando…</p>
      ) : dias.length === 0 ? (
        <p className="text-sm text-foreground-400">Todavía no hay ventas de la báscula registradas.</p>
      ) : (
        <div className="space-y-2">
          {dias.map((d) => (
            <DiaRow
              key={d.fecha}
              fecha={d.fecha}
              numTickets={d.num_tickets}
              totalPeso={d.total_peso_kg}
              totalImporte={d.total_importe}
              porTienda={porTiendaPorFecha.get(d.fecha) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
