import { useMemo, type ReactNode } from 'react';
import type { Pedido } from '@/types/pedido';
import type { Reserva } from '@/types/reserva';
import type { Resena } from '@/types/resena';
import type { Producto } from '@/types/producto';
import { normalizePhone, telHref, whatsappHref } from '@/lib/phone';
import InfoHint from '@/components/base/InfoHint';

const INFO_ITEMS = [
  { icon: 'ri-dashboard-3-line', text: 'Resumen del día: pedidos nuevos, reservas pendientes, reseñas por moderar y productos bajo mínimo.' },
  { icon: 'ri-bar-chart-2-line', text: '"Para preparar" suma todo lo pendiente de entregar, para saber qué comprar en la lonja.' },
  { icon: 'ri-calendar-check-line', text: 'Abajo se ven los pedidos y reservas con recogida marcada para hoy, con acceso rápido a llamar o escribir por WhatsApp.' },
];

type Tab = 'hoy' | 'productos' | 'stock' | 'ventas' | 'reservas' | 'resenas' | 'clientes';

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

// Cabecera de sección con la misma pareja "kicker en versalitas + título en
// la tipografía editorial" que ya usa el resto del panel (StockPanel,
// ReservasPanel), en vez de un <h2> suelto sin jerarquía.
function SectionHeading({ kicker, title, action }: { kicker: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-foreground-400 mb-0.5">{kicker}</p>
        <h2 className="text-base font-heading font-semibold text-foreground-950 leading-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
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
  const active = !!urgent && value > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group text-left rounded-xl border p-4 shadow-card hover:shadow-card-hover transition-shadow duration-200 ${
        active ? 'bg-red-50/60 border-red-200 border-l-4 border-l-red-400' : 'bg-background-50 border-background-200/70'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-3xl font-heading font-semibold tabular-nums leading-none ${active ? 'text-red-700' : 'text-foreground-950'}`}>
            {value}
          </p>
          <p className="text-[11px] uppercase tracking-wide text-foreground-400 mt-2 leading-tight">{label}</p>
        </div>
        <span
          className={`w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 transition-colors ${
            active ? 'bg-red-100/80 text-red-500' : 'bg-background-100 text-foreground-400 group-hover:bg-background-200/70'
          }`}
        >
          <i className={`${icon} text-base`}></i>
        </span>
      </div>
    </button>
  );
}

function ContactoRapido({ telefono }: { telefono: string | null }) {
  const tel = normalizePhone(telefono);
  if (!tel) return null;
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <a
        href={telHref(tel)}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-background-100 text-foreground-600 hover:bg-background-200/70 transition-colors"
        aria-label="Llamar"
      >
        <i className="ri-phone-line text-sm"></i>
      </a>
      <a
        href={whatsappHref(tel)}
        target="_blank"
        rel="noreferrer"
        className="w-8 h-8 flex items-center justify-center rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
        aria-label="WhatsApp"
      >
        <i className="ri-whatsapp-line text-sm"></i>
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
  const maxPreparar = useMemo(() => paraPreparar.reduce((max, r) => Math.max(max, r.kg), 0), [paraPreparar]);

  if (loading) {
    return (
      <div className="px-4 md:px-8 py-6">
        <p className="text-sm text-foreground-400">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 pb-28">
      <div className="space-y-9">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Pedidos nuevos" value={pedidosNuevos.length} icon="ri-shopping-bag-3-line" urgent onClick={() => onNavigate('ventas')} />
        <StatTile label="Reservas pendientes" value={reservasPendientes.length} icon="ri-calendar-check-line" urgent onClick={() => onNavigate('reservas')} />
        <StatTile label="Reseñas por moderar" value={resenasPendientes.length} icon="ri-star-line" onClick={() => onNavigate('resenas')} />
        <StatTile label="Productos bajo mínimo" value={stockBajo.length} icon="ri-alert-line" urgent onClick={() => onNavigate('stock')} />
      </div>

      <section>
        <SectionHeading
          kicker="Compromiso vivo con clientes"
          title="Para preparar"
          action={
            <div className="flex items-center gap-2 flex-shrink-0">
              {paraPreparar.length > 0 && (
                <span className="text-xs text-foreground-400">{formatKg(totalPreparar)} en total</span>
              )}
              <InfoHint items={INFO_ITEMS} align="right" />
            </div>
          }
        />
        <p className="text-xs text-foreground-400 mb-3 max-w-2xl">
          Suma de todos los pedidos (nuevos y confirmados) y reservas (pendientes y confirmadas) que todavía no se han
          entregado.
        </p>
        {paraPreparar.length === 0 ? (
          <p className="text-sm text-foreground-400">No hay pedidos ni reservas activas ahora mismo.</p>
        ) : (
          <div className="space-y-1.5">
            {paraPreparar.map((row) => {
              const pct = maxPreparar > 0 ? Math.max((row.kg / maxPreparar) * 100, 6) : 0;
              return (
                <div key={row.nombre} className="relative overflow-hidden bg-background-50 border border-background-200/70 rounded-lg shadow-card">
                  <div className="absolute inset-y-0 left-0 bg-primary-50" style={{ width: `${pct}%` }} aria-hidden="true"></div>
                  <div className="relative flex items-center justify-between gap-3 px-3 py-2.5">
                    <p className="text-sm text-foreground-800 truncate">{row.nombre}</p>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-[11px] text-foreground-400 hidden sm:inline">
                        {row.pedidos > 0 && `${row.pedidos} pedido${row.pedidos === 1 ? '' : 's'}`}
                        {row.pedidos > 0 && row.reservas > 0 && ' · '}
                        {row.reservas > 0 && `${row.reservas} reserva${row.reservas === 1 ? '' : 's'}`}
                      </span>
                      <span className="text-sm font-semibold text-foreground-950 tabular-nums">{formatKg(row.kg)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-9">
        <section>
          <SectionHeading
            kicker="Recogidas de hoy"
            title="Pedidos"
            action={
              <button type="button" onClick={() => onNavigate('ventas')} className="text-xs text-foreground-500 hover:text-foreground-950 flex-shrink-0">
                Ver todos
              </button>
            }
          />
          {pedidosDeHoy.length === 0 ? (
            <p className="text-sm text-foreground-400">Ningún pedido con recogida marcada para hoy.</p>
          ) : (
            <div className="space-y-2">
              {pedidosDeHoy.map((p) => (
                <div key={p.id} className="bg-background-50 border border-background-200/70 rounded-xl shadow-card hover:shadow-card-hover transition-shadow duration-200 p-3 flex items-start justify-between gap-2">
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
          <SectionHeading
            kicker="Recogidas de hoy"
            title="Reservas"
            action={
              <button type="button" onClick={() => onNavigate('reservas')} className="text-xs text-foreground-500 hover:text-foreground-950 flex-shrink-0">
                Ver todas
              </button>
            }
          />
          {reservasDeHoy.length === 0 ? (
            <p className="text-sm text-foreground-400">Ninguna reserva marcada para recoger hoy.</p>
          ) : (
            <div className="space-y-2">
              {reservasDeHoy.map((r) => (
                <div key={r.id} className="bg-background-50 border border-background-200/70 rounded-xl shadow-card hover:shadow-card-hover transition-shadow duration-200 p-3 flex items-start justify-between gap-2">
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
    </div>
  );
}
