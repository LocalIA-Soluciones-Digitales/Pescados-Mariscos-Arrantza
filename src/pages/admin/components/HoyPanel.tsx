import { useMemo, type ReactNode } from 'react';
import type { Pedido } from '@/types/pedido';
import type { Reserva } from '@/types/reserva';
import type { Resena } from '@/types/resena';
import type { Producto } from '@/types/producto';
import { normalizePhone, telHref, whatsappHref } from '@/lib/phone';

type Tab = 'hoy' | 'productos' | 'stock' | 'ventas' | 'reservas' | 'resenas' | 'clientes';

function formatFecha(fechaISO: string | null, hoy: string): string | null {
  if (!fechaISO) return null;
  if (fechaISO === hoy) return 'Hoy';
  const [, mes, dia] = fechaISO.split('-');
  return `${dia}/${mes}`;
}

function formatKg(n: number): string {
  return `${Math.round(n * 100) / 100} kg`;
}

function getInitials(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '?';
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return `${palabras[0][0]}${palabras[1][0]}`.toUpperCase();
}

interface PrepararItem {
  nombre: string;
  kg: number;
  preparacion?: string;
  nota?: string;
}

interface PrepararEntry {
  id: string;
  tipo: 'pedido' | 'reserva';
  hora: string | null;
  cliente: string;
  telefono: string | null;
  metodoEntrega?: Pedido['metodo_entrega'];
  items: PrepararItem[];
  kgTotal: number;
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

function MethodBadge({ tipo, metodoEntrega }: { tipo: 'pedido' | 'reserva'; metodoEntrega?: Pedido['metodo_entrega'] }) {
  if (tipo === 'reserva') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 flex-shrink-0">
        <i className="ri-calendar-check-line text-[11px]"></i>
        Reserva
      </span>
    );
  }
  const isHome = metodoEntrega === 'home';
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
        isHome ? 'bg-blue-50 text-blue-700' : 'bg-background-100 text-foreground-500'
      }`}
    >
      <i className={`${isHome ? 'ri-truck-line' : 'ri-store-2-line'} text-[11px]`}></i>
      {isHome ? 'A domicilio' : 'Recogida'}
    </span>
  );
}

function ProductoTile({ nombre, kg, pct }: { nombre: string; kg: number; pct: number }) {
  return (
    <div className="relative overflow-hidden bg-background-100/60 border border-background-200/50 rounded-lg px-3 py-2">
      <div className="absolute inset-y-0 left-0 bg-primary-100/70" style={{ width: `${pct}%` }} aria-hidden="true"></div>
      <div className="relative flex items-center justify-between gap-2">
        <span className="text-xs text-foreground-700 truncate">{nombre}</span>
        <span className="text-xs font-semibold text-foreground-950 tabular-nums flex-shrink-0">{formatKg(kg)}</span>
      </div>
    </div>
  );
}

function EmptyState({ icon, message, variant = 'neutral' }: { icon: string; message: string; variant?: 'neutral' | 'success' }) {
  const success = variant === 'success';
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2.5 text-center py-9 px-4 rounded-xl border border-dashed ${
        success ? 'border-emerald-200 bg-emerald-50/40' : 'border-background-200 bg-background-50/50'
      }`}
    >
      <span
        className={`w-10 h-10 flex items-center justify-center rounded-full ${
          success ? 'bg-emerald-100 text-emerald-600' : 'bg-background-100 text-foreground-300'
        }`}
      >
        <i className={`${icon} text-lg`}></i>
      </span>
      <p className={`text-sm ${success ? 'text-emerald-700' : 'text-foreground-400'}`}>{message}</p>
    </div>
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
  const hoy = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const pedidosNuevos = useMemo(
    () => pedidos.filter((p) => p.estado === 'nuevo').sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [pedidos],
  );
  const pedidosActivos = useMemo(() => pedidos.filter((p) => p.estado === 'nuevo' || p.estado === 'confirmado'), [pedidos]);
  const reservasPendientes = useMemo(
    () => reservas.filter((r) => r.estado === 'pendiente').sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [reservas],
  );
  const reservasActivas = useMemo(() => reservas.filter((r) => r.estado === 'pendiente' || r.estado === 'confirmada'), [reservas]);
  const resenasPendientes = useMemo(() => resenas.filter((r) => r.estado === 'pendiente'), [resenas]);
  const stockBajo = useMemo(
    () => productos.filter((p) => p.stock_kg <= p.stock_minimo).sort((a, b) => (a.stock_kg - a.stock_minimo) - (b.stock_kg - b.stock_minimo)),
    [productos],
  );

  const prepararHoy = useMemo(() => {
    const entries: PrepararEntry[] = [];
    pedidosActivos.forEach((p) => {
      if (p.fecha_preferida !== hoy) return;
      entries.push({
        id: `pedido-${p.id}`,
        tipo: 'pedido',
        hora: p.hora_preferida,
        cliente: p.cliente_nombre || 'Sin nombre',
        telefono: p.cliente_telefono,
        metodoEntrega: p.metodo_entrega,
        items: p.items.map((item) => ({ nombre: item.nombre, kg: item.kg, preparacion: item.preparacion, nota: item.nota })),
        kgTotal: p.peso_total,
      });
    });
    reservasActivas.forEach((r) => {
      if (r.fecha_deseada !== hoy) return;
      entries.push({
        id: `reserva-${r.id}`,
        tipo: 'reserva',
        hora: null,
        cliente: r.cliente_nombre,
        telefono: r.cliente_telefono,
        items: r.items.map((item) => ({ nombre: item.nombre, kg: item.kg, nota: item.nota })),
        kgTotal: r.peso_total,
      });
    });
    return entries.sort((a, b) => {
      if (a.hora && b.hora) return a.hora.localeCompare(b.hora);
      if (a.hora) return -1;
      if (b.hora) return 1;
      return a.cliente.localeCompare(b.cliente);
    });
  }, [pedidosActivos, reservasActivas, hoy]);

  const prepararOtrosDias = useMemo(
    () => ({
      pedidos: pedidosActivos.filter((p) => p.fecha_preferida !== hoy).length,
      reservas: reservasActivas.filter((r) => r.fecha_deseada !== hoy).length,
    }),
    [pedidosActivos, reservasActivas, hoy],
  );

  const totalKgHoy = useMemo(() => prepararHoy.reduce((sum, e) => sum + e.kgTotal, 0), [prepararHoy]);

  const porProductoHoy = useMemo(() => {
    const map = new Map<string, number>();
    prepararHoy.forEach((e) => {
      e.items.forEach((item) => {
        map.set(item.nombre, (map.get(item.nombre) ?? 0) + item.kg);
      });
    });
    return Array.from(map.entries())
      .map(([nombre, kg]) => ({ nombre, kg }))
      .sort((a, b) => b.kg - a.kg);
  }, [prepararHoy]);

  const maxPorProductoHoy = useMemo(() => porProductoHoy.reduce((max, r) => Math.max(max, r.kg), 0), [porProductoHoy]);

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
          title="Para preparar hoy"
          action={
            prepararHoy.length > 0 ? <span className="text-xs text-foreground-400 flex-shrink-0">{formatKg(totalKgHoy)} en total</span> : undefined
          }
        />
        <p className="text-xs text-foreground-400 mb-3 max-w-2xl">
          Pedidos y reservas de hoy, en orden de hora, con el detalle de cada cliente — para saber qué preparar y
          cuándo lo recoge o se le entrega.
        </p>
        {prepararHoy.length === 0 ? (
          <EmptyState icon="ri-cup-line" message="No hay pedidos ni reservas para hoy." />
        ) : (
          <div>
            {prepararHoy.map((entry, idx) => (
              <div key={entry.id} className="flex gap-3">
                <div className="w-14 sm:w-16 flex-shrink-0 pt-3.5 text-right">
                  <span className={`text-xs font-semibold tabular-nums ${entry.hora ? 'text-foreground-700' : 'text-foreground-300'}`}>
                    {entry.hora || (entry.tipo === 'reserva' ? 'Reserva' : 'Sin hora')}
                  </span>
                </div>

                <div className="relative flex-shrink-0 w-4 flex justify-center">
                  {idx !== 0 && <span className="absolute top-0 h-4 w-px bg-background-200" aria-hidden="true"></span>}
                  {idx !== prepararHoy.length - 1 && <span className="absolute top-4 bottom-0 w-px bg-background-200" aria-hidden="true"></span>}
                  <span className="relative z-10 mt-[18px] w-2.5 h-2.5 rounded-full bg-primary-400 ring-4 ring-background-50 flex-shrink-0"></span>
                </div>

                <div className="flex-1 min-w-0 bg-background-50 border border-background-200/70 rounded-xl shadow-card hover:shadow-card-hover transition-shadow duration-200 px-3.5 py-3 mb-2.5">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {getInitials(entry.cliente)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground-950 truncate">{entry.cliente}</p>
                          <MethodBadge tipo={entry.tipo} metodoEntrega={entry.metodoEntrega} />
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-sm font-semibold text-foreground-950 tabular-nums">{formatKg(entry.kgTotal)}</span>
                          <ContactoRapido telefono={entry.telefono} />
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {entry.items.map((item, itemIdx) => (
                          <span key={itemIdx} className="inline-flex items-center gap-1 text-[11px] text-foreground-600 bg-background-100 rounded-md px-2 py-1">
                            <span className="font-semibold text-foreground-900 tabular-nums">{formatKg(item.kg)}</span>
                            {item.nombre}
                            {item.preparacion && item.preparacion !== 'whole' ? ` (${item.preparacion})` : ''}
                            {item.nota ? <span className="italic text-foreground-400"> — "{item.nota}"</span> : null}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {(prepararOtrosDias.pedidos > 0 || prepararOtrosDias.reservas > 0) && (
          <p className="flex items-center gap-1.5 text-xs text-foreground-400 mt-1">
            <i className="ri-time-line"></i>
            Además hay
            {prepararOtrosDias.pedidos > 0 && ` ${prepararOtrosDias.pedidos} pedido${prepararOtrosDias.pedidos === 1 ? '' : 's'}`}
            {prepararOtrosDias.pedidos > 0 && prepararOtrosDias.reservas > 0 && ' y'}
            {prepararOtrosDias.reservas > 0 && ` ${prepararOtrosDias.reservas} reserva${prepararOtrosDias.reservas === 1 ? '' : 's'}`}
            {' '}pendientes para otros días.
          </p>
        )}
        {porProductoHoy.length > 0 && (
          <div className="mt-5 pt-4 border-t border-background-200/70">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-foreground-400">
                <i className="ri-shopping-basket-2-line"></i>
                Total por producto hoy
              </p>
              <p className="text-[10px] text-foreground-300">para comprar en la lonja</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {porProductoHoy.map((row) => (
                <ProductoTile key={row.nombre} nombre={row.nombre} kg={row.kg} pct={maxPorProductoHoy > 0 ? Math.max((row.kg / maxPorProductoHoy) * 100, 8) : 0} />
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-9">
        <section>
          <SectionHeading
            kicker="Requieren tu atención"
            title="Pedidos nuevos"
            action={
              <button type="button" onClick={() => onNavigate('ventas')} className="text-xs text-foreground-500 hover:text-foreground-950 flex-shrink-0">
                Ver todos
              </button>
            }
          />
          {pedidosNuevos.length === 0 ? (
            <EmptyState icon="ri-shopping-bag-3-line" message="No hay pedidos nuevos por confirmar." />
          ) : (
            <div className="space-y-2">
              {pedidosNuevos.map((p) => {
                const fecha = formatFecha(p.fecha_preferida, hoy);
                return (
                  <div key={p.id} className="bg-background-50 border border-background-200/70 rounded-xl shadow-card hover:shadow-card-hover transition-shadow duration-200 p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground-950 truncate">{p.cliente_nombre || 'Sin nombre'}</p>
                      <p className="text-xs text-foreground-400 mt-0.5">
                        {p.total_productos} producto{p.total_productos === 1 ? '' : 's'} · {p.peso_total} kg
                        {fecha ? ` · ${fecha}${p.hora_preferida ? ` ${p.hora_preferida}` : ''}` : ''}
                      </p>
                    </div>
                    <ContactoRapido telefono={p.cliente_telefono} />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <SectionHeading
            kicker="Requieren tu atención"
            title="Reservas pendientes"
            action={
              <button type="button" onClick={() => onNavigate('reservas')} className="text-xs text-foreground-500 hover:text-foreground-950 flex-shrink-0">
                Ver todas
              </button>
            }
          />
          {reservasPendientes.length === 0 ? (
            <EmptyState icon="ri-calendar-check-line" message="No hay reservas pendientes de confirmar." />
          ) : (
            <div className="space-y-2">
              {reservasPendientes.map((r) => {
                const fecha = formatFecha(r.fecha_deseada, hoy);
                return (
                  <div key={r.id} className="bg-background-50 border border-background-200/70 rounded-xl shadow-card hover:shadow-card-hover transition-shadow duration-200 p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground-950 truncate">{r.cliente_nombre}</p>
                      <p className="text-xs text-foreground-400 mt-0.5">
                        {r.total_productos} producto{r.total_productos === 1 ? '' : 's'} · {r.peso_total} kg
                        {fecha ? ` · ${fecha}` : ''}
                      </p>
                    </div>
                    <ContactoRapido telefono={r.cliente_telefono} />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section>
        <SectionHeading
          kicker="Requieren tu atención"
          title="Stock bajo mínimo"
          action={
            <button type="button" onClick={() => onNavigate('stock')} className="text-xs text-foreground-500 hover:text-foreground-950 flex-shrink-0">
              Ver stock
            </button>
          }
        />
        {stockBajo.length === 0 ? (
          <EmptyState icon="ri-checkbox-circle-line" message="Todos los productos están por encima de su mínimo." variant="success" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {stockBajo.map((p) => (
              <div
                key={p.id}
                className="bg-red-50/60 border border-red-200 border-l-4 border-l-red-400 rounded-lg shadow-card px-3 py-2.5 flex items-center justify-between gap-3"
              >
                <p className="text-sm text-foreground-800 truncate">{p.nombre_es}</p>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-[11px] text-foreground-400">mínimo {p.stock_minimo} kg</span>
                  <span className="text-sm font-semibold text-red-700 tabular-nums">{p.stock_kg} kg</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
