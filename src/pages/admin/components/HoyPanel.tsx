import { useMemo } from 'react';
import type { Pedido } from '@/types/pedido';
import type { Reserva } from '@/types/reserva';
import type { Resena } from '@/types/resena';
import type { Producto } from '@/types/producto';
import { normalizePhone, telHref, whatsappHref } from '@/lib/phone';

type Tab = 'hoy' | 'productos' | 'stock' | 'pedidos' | 'reservas' | 'resenas' | 'clientes';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatKg(n: number): string {
  return `${Math.round(n * 100) / 100} kg`;
}

interface PrepararRow {
  nombre: string;
  kg: number;
  pedidos: number;
  reservas: number;
}

function StatTile({
  label,
  value,
  icon,
  urgent,
  onClick,
}: {
  label: string;
  value: number;
  icon: string;
  urgent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border p-4 transition-colors ${
        urgent && value > 0
          ? 'bg-red-50/60 border-red-200 hover:bg-red-50'
          : 'bg-background-50 border-background-200/70 hover:bg-background-100'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-2xl font-semibold tabular-nums ${urgent && value > 0 ? 'text-red-700' : 'text-foreground-950'}`}>
          {value}
        </span>
        <i className={`${icon} text-lg ${urgent && value > 0 ? 'text-red-400' : 'text-foreground-300'}`}></i>
      </div>
      <p className="text-xs text-foreground-500 mt-1">{label}</p>
    </button>
  );
}

function ContactoRapido({ telefono }: { telefono: string | null }) {
  const tel = normalizePhone(telefono);
  if (!tel) return null;
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <a href={telHref(tel)} className="w-7 h-7 flex items-center justify-center rounded-full bg-background-100 text-foreground-600 hover:bg-background-200/70" aria-label="Llamar">
        <i className="ri-phone-line text-xs"></i>
      </a>
      <a href={whatsappHref(tel)} target="_blank" rel="noreferrer" className="w-7 h-7 flex items-center justify-center rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100" aria-label="WhatsApp">
        <i className="ri-whatsapp-line text-xs"></i>
      </a>
    </div>
  );
}

export default function HoyPanel({
  pedidos,
  reservas,
  resenas,
  productos,
  loading,
  onNavigate,
}: {
  pedidos: Pedido[];
  reservas: Reserva[];
  resenas: Resena[];
  productos: Producto[];
  loading: boolean;
  onNavigate: (tab: Tab) => void;
}) {
  const hoy = todayISO();

  const pedidosNuevos = useMemo(() => pedidos.filter((p) => p.estado === 'nuevo'), [pedidos]);
  const pedidosActivos = useMemo(() => pedidos.filter((p) => p.estado === 'nuevo' || p.estado === 'confirmado'), [pedidos]);
  const reservasPendientes = useMemo(() => reservas.filter((r) => r.estado === 'pendiente'), [reservas]);
  const reservasActivas = useMemo(() => reservas.filter((r) => r.estado === 'pendiente' || r.estado === 'confirmada'), [reservas]);
  const resenasPendientes = useMemo(() => resenas.filter((r) => r.estado === 'pendiente'), [resenas]);
  const stockBajo = useMemo(() => productos.filter((p) => p.stock_kg <= p.stock_minimo), [productos]);

  const pedidosDeHoy = useMemo(
    () => pedidosActivos.filter((p) => p.fecha_preferida === hoy).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [pedidosActivos, hoy],
  );
  const reservasDeHoy = useMemo(
    () => reservasActivas.filter((r) => r.fecha_deseada === hoy).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [reservasActivas, hoy],
  );

  const paraPreparar = useMemo(() => {
    const map = new Map<string, PrepararRow>();
    pedidosActivos.forEach((p) => {
      p.items.forEach((item) => {
        const row = map.get(item.nombre) ?? { nombre: item.nombre, kg: 0, pedidos: 0, reservas: 0 };
        row.kg += item.kg;
        row.pedidos += 1;
        map.set(item.nombre, row);
      });
    });
    reservasActivas.forEach((r) => {
      r.items.forEach((item) => {
        const row = map.get(item.nombre) ?? { nombre: item.nombre, kg: 0, pedidos: 0, reservas: 0 };
        row.kg += item.kg;
        row.reservas += 1;
        map.set(item.nombre, row);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.kg - a.kg);
  }, [pedidosActivos, reservasActivas]);

  const totalPreparar = useMemo(() => paraPreparar.reduce((sum, r) => sum + r.kg, 0), [paraPreparar]);

  if (loading) {
    return (
      <div className="px-4 md:px-8 py-6">
        <p className="text-sm text-foreground-400">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 pb-28 space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Pedidos nuevos" value={pedidosNuevos.length} icon="ri-shopping-bag-3-line" urgent onClick={() => onNavigate('pedidos')} />
        <StatTile label="Reservas pendientes" value={reservasPendientes.length} icon="ri-calendar-check-line" urgent onClick={() => onNavigate('reservas')} />
        <StatTile label="Reseñas por moderar" value={resenasPendientes.length} icon="ri-star-line" onClick={() => onNavigate('resenas')} />
        <StatTile label="Productos bajo mínimo" value={stockBajo.length} icon="ri-alert-line" urgent onClick={() => onNavigate('stock')} />
      </div>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-heading font-semibold text-foreground-950">Para preparar</h2>
          <span className="text-xs text-foreground-400">
            {paraPreparar.length > 0 ? `${formatKg(totalPreparar)} entre pedidos y reservas activas` : ''}
          </span>
        </div>
        <p className="text-xs text-foreground-400 mb-3">
          Suma de todos los pedidos (nuevos y confirmados) y reservas (pendientes y confirmadas) que todavía no se han
          entregado. Es lo que hay comprometido con clientes ahora mismo.
        </p>
        {paraPreparar.length === 0 ? (
          <p className="text-sm text-foreground-400">No hay pedidos ni reservas activas ahora mismo.</p>
        ) : (
          <div className="space-y-1.5">
            {paraPreparar.map((row) => (
              <div key={row.nombre} className="flex items-center justify-between gap-3 bg-background-50 border border-background-200/70 rounded-lg px-3 py-2">
                <p className="text-sm text-foreground-800 truncate">{row.nombre}</p>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-[11px] text-foreground-400">
                    {row.pedidos > 0 && `${row.pedidos} pedido${row.pedidos === 1 ? '' : 's'}`}
                    {row.pedidos > 0 && row.reservas > 0 && ' · '}
                    {row.reservas > 0 && `${row.reservas} reserva${row.reservas === 1 ? '' : 's'}`}
                  </span>
                  <span className="text-sm font-semibold text-foreground-950 tabular-nums">{formatKg(row.kg)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-heading font-semibold text-foreground-950">Pedidos para hoy</h2>
            <button type="button" onClick={() => onNavigate('pedidos')} className="text-xs text-foreground-500 hover:text-foreground-950">
              Ver todos
            </button>
          </div>
          {pedidosDeHoy.length === 0 ? (
            <p className="text-sm text-foreground-400">Ningún pedido con recogida marcada para hoy.</p>
          ) : (
            <div className="space-y-2">
              {pedidosDeHoy.map((p) => (
                <div key={p.id} className="bg-background-50 border border-background-200/70 rounded-lg p-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground-950 truncate">{p.cliente_nombre || 'Sin nombre'}</p>
                    <p className="text-xs text-foreground-400 mt-0.5">
                      {p.total_productos} producto{p.total_productos === 1 ? '' : 's'} · {p.peso_total} kg
                      {p.hora_preferida ? ` · ${p.hora_preferida}` : ''}
                    </p>
                  </div>
                  <ContactoRapido telefono={p.cliente_telefono} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-heading font-semibold text-foreground-950">Reservas para hoy</h2>
            <button type="button" onClick={() => onNavigate('reservas')} className="text-xs text-foreground-500 hover:text-foreground-950">
              Ver todas
            </button>
          </div>
          {reservasDeHoy.length === 0 ? (
            <p className="text-sm text-foreground-400">Ninguna reserva marcada para recoger hoy.</p>
          ) : (
            <div className="space-y-2">
              {reservasDeHoy.map((r) => (
                <div key={r.id} className="bg-background-50 border border-background-200/70 rounded-lg p-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground-950 truncate">{r.cliente_nombre}</p>
                    <p className="text-xs text-foreground-400 mt-0.5">
                      {r.total_productos} producto{r.total_productos === 1 ? '' : 's'} · {r.peso_total} kg
                    </p>
                  </div>
                  <ContactoRapido telefono={r.cliente_telefono} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
