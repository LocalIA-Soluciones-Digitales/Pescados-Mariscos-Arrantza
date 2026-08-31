import { useState } from 'react';
import { useBasculaVentasDiarias, fetchBasculaVentasDelDia } from '@/hooks/useBasculaVentas';
import type { BasculaVenta } from '@/types/basculaVenta';
import InfoHint from '@/components/base/InfoHint';

const INFO_ITEMS = [
  { icon: 'ri-scales-3-line', text: 'Ventas cobradas en el mostrador, sincronizadas solas desde la báscula (Factura Simplificada y Factura).' },
  { icon: 'ri-file-list-3-line', text: 'No incluye los Albaranes — se facturan a fin de mes junto con su Factura.' },
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

function DiaRow({ fecha, numTickets, totalPeso, totalImporte }: { fecha: string; numTickets: number; totalPeso: number | null; totalImporte: number }) {
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

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl shadow-card overflow-hidden">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-background-100/60 transition-colors text-left">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground-950">{formatFechaLarga(fecha)}</p>
          <p className="text-xs text-foreground-400 mt-0.5">
            {numTickets} ticket{numTickets === 1 ? '' : 's'}
            {totalPeso ? ` · ${totalPeso.toFixed(2)} kg vendidos a peso` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm font-semibold text-foreground-950 tabular-nums">{formatPrecio(totalImporte)}</span>
          <i className={`ri-arrow-down-s-line text-foreground-400 transition-transform ${abierto ? 'rotate-180' : ''}`}></i>
        </div>
      </button>

      {abierto && (
        <div className="border-t border-background-200/70 px-4 py-3">
          {cargando ? (
            <p className="text-xs text-foreground-400">Cargando…</p>
          ) : !lineas || lineas.length === 0 ? (
            <p className="text-xs text-foreground-400">Sin líneas de venta guardadas para este día.</p>
          ) : (
            <div className="space-y-1.5">
              {lineas.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 text-xs">
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
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function VentasTiendaPanel() {
  const { dias, loading } = useBasculaVentasDiarias();

  return (
    <div className="px-4 md:px-8 py-6 pb-28">
      <div className="flex items-center justify-end mb-4">
        <InfoHint items={INFO_ITEMS} align="right" />
      </div>

      {loading ? (
        <p className="text-sm text-foreground-400">Cargando…</p>
      ) : dias.length === 0 ? (
        <p className="text-sm text-foreground-400">Todavía no hay ventas de la báscula registradas.</p>
      ) : (
        <div className="space-y-2">
          {dias.map((d) => (
            <DiaRow key={d.fecha} fecha={d.fecha} numTickets={d.num_tickets} totalPeso={d.total_peso_kg} totalImporte={d.total_importe} />
          ))}
        </div>
      )}
    </div>
  );
}
