import { useMemo, useState } from 'react';
import type { Pedido } from '@/types/pedido';
import type { Reserva } from '@/types/reserva';
import type { Producto } from '@/types/producto';
import type { PromoOtorgada } from '@/types/promo';
import { normalizePhone, telHref, whatsappHref } from '@/lib/phone';
import SearchInput from '@/components/base/SearchInput';
import { usePromoReglas } from '@/hooks/usePromoReglas';
import PromoReglasPanel from './PromoReglasPanel';

interface HistorialEntrada {
  tipo: 'pedido' | 'reserva';
  fecha: string;
  estado: string;
  importe: number | null;
  kg: number;
}

interface ClienteAgregado {
  key: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  totalPedidos: number;
  totalReservas: number;
  totalGastado: number;
  ultimaFecha: string;
  productosFavoritos: { nombre: string; veces: number }[];
  historial: HistorialEntrada[];
}

function initials(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Agrupa por teléfono normalizado (más fiable que el nombre, que un mismo
// cliente puede escribir de formas distintas cada vez); si no hay teléfono,
// se agrupa por nombre en minúsculas como último recurso.
function buildClientes(pedidos: Pedido[], reservas: Reserva[]): ClienteAgregado[] {
  const map = new Map<string, ClienteAgregado>();
  const productoCounts = new Map<string, Map<string, number>>();

  const touch = (key: string, nombre: string, telefono: string | null, email: string | null, fecha: string) => {
    let c = map.get(key);
    if (!c) {
      c = {
        key,
        nombre,
        telefono,
        email,
        totalPedidos: 0,
        totalReservas: 0,
        totalGastado: 0,
        ultimaFecha: fecha,
        productosFavoritos: [],
        historial: [],
      };
      map.set(key, c);
    }
    if (fecha > c.ultimaFecha) c.ultimaFecha = fecha;
    if (!c.telefono && telefono) c.telefono = telefono;
    if (!c.email && email) c.email = email;
    return c;
  };

  const contarProductos = (key: string, items: { nombre: string }[]) => {
    const counts = productoCounts.get(key) ?? new Map<string, number>();
    items.forEach((item) => counts.set(item.nombre, (counts.get(item.nombre) ?? 0) + 1));
    productoCounts.set(key, counts);
  };

  pedidos
    .filter((p) => p.estado !== 'cancelado')
    .forEach((p) => {
      const tel = normalizePhone(p.cliente_telefono);
      const key = tel || p.cliente_nombre?.trim().toLowerCase() || p.id;
      const c = touch(key, p.cliente_nombre || 'Sin nombre', tel, p.cliente_email, p.created_at);
      c.totalPedidos += 1;
      if (p.importe_estimado) c.totalGastado += p.importe_estimado;
      c.historial.push({ tipo: 'pedido', fecha: p.created_at, estado: p.estado, importe: p.importe_estimado, kg: p.peso_total });
      contarProductos(key, p.items);
    });

  reservas
    .filter((r) => r.estado !== 'cancelada')
    .forEach((r) => {
      const tel = normalizePhone(r.cliente_telefono);
      const key = tel || r.cliente_nombre?.trim().toLowerCase() || r.id;
      const c = touch(key, r.cliente_nombre || 'Sin nombre', tel, r.cliente_email, r.created_at);
      c.totalReservas += 1;
      if (r.importe_estimado) c.totalGastado += r.importe_estimado;
      c.historial.push({ tipo: 'reserva', fecha: r.created_at, estado: r.estado, importe: r.importe_estimado, kg: r.peso_total });
      contarProductos(key, r.items);
    });

  map.forEach((c, key) => {
    const counts = productoCounts.get(key);
    if (counts) {
      c.productosFavoritos = Array.from(counts.entries())
        .map(([nombre, veces]) => ({ nombre, veces }))
        .sort((a, b) => b.veces - a.veces)
        .slice(0, 3);
    }
    c.historial.sort((a, b) => b.fecha.localeCompare(a.fecha));
  });

  return Array.from(map.values());
}

export default function ClientesPanel({
  pedidos,
  reservas,
  productos,
  promoOtorgadas,
  patchOtorgada,
  loading,
}: {
  pedidos: Pedido[];
  reservas: Reserva[];
  productos: Producto[];
  promoOtorgadas: PromoOtorgada[];
  patchOtorgada: (id: string, patch: Partial<PromoOtorgada>) => Promise<boolean>;
  loading: boolean;
}) {
  const [search, setSearch] = useState('');
  const [orden, setOrden] = useState<'recientes' | 'frecuentes'>('recientes');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showReglas, setShowReglas] = useState(false);
  const { reglas, crearRegla, patchRegla, eliminarRegla } = usePromoReglas();

  const clientes = useMemo(() => buildClientes(pedidos, reservas), [pedidos, reservas]);
  const promoPendientesPorCliente = useMemo(() => {
    const map = new Map<string, PromoOtorgada[]>();
    promoOtorgadas
      .filter((o) => o.estado !== 'canjeada')
      .forEach((o) => map.set(o.cliente_key, [...(map.get(o.cliente_key) ?? []), o]));
    return map;
  }, [promoOtorgadas]);
  const totalPendientes = useMemo(() => promoOtorgadas.filter((o) => o.estado !== 'canjeada').length, [promoOtorgadas]);

  const visibles = useMemo(() => {
    let result = clientes;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((c) => c.nombre.toLowerCase().includes(q) || c.telefono?.includes(q));
    }
    return [...result].sort((a, b) =>
      orden === 'recientes'
        ? b.ultimaFecha.localeCompare(a.ultimaFecha)
        : b.totalPedidos + b.totalReservas - (a.totalPedidos + a.totalReservas),
    );
  }, [clientes, search, orden]);

  const sugerencias = useMemo(() => clientes.map((c) => c.nombre).filter(Boolean), [clientes]);

  if (loading) {
    return (
      <div className="px-4 md:px-8 py-6">
        <p className="text-sm text-foreground-400">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 pb-28">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          suggestions={sugerencias}
          placeholder="Buscar por nombre o teléfono…"
          className="flex-1 min-w-[200px] sm:max-w-[280px] md:max-w-md"
        />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOrden('recientes')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              orden === 'recientes' ? 'bg-primary-500 text-background-50' : 'bg-background-50 text-foreground-500 hover:bg-background-200/70'
            }`}
          >
            Recientes
          </button>
          <button
            type="button"
            onClick={() => setOrden('frecuentes')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              orden === 'frecuentes' ? 'bg-primary-500 text-background-50' : 'bg-background-50 text-foreground-500 hover:bg-background-200/70'
            }`}
          >
            Más frecuentes
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowReglas(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-background-50 text-foreground-600 hover:bg-background-200/70 whitespace-nowrap"
        >
          <i className="ri-gift-line"></i>
          Reglas de promociones
          {totalPendientes > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold bg-red-500 text-background-50">
              {totalPendientes}
            </span>
          )}
        </button>
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-foreground-400">Todavía no hay clientes con pedidos o reservas.</p>
      ) : (
        <div className="space-y-2">
          {visibles.map((c) => {
            const habitual = c.totalPedidos + c.totalReservas >= 3;
            const expanded = expandedKey === c.key;
            const promosPendientes = promoPendientesPorCliente.get(c.key) ?? [];
            return (
              <div key={c.key} className="bg-background-50 border border-background-200/70 rounded-xl shadow-card hover:shadow-card-hover transition-shadow duration-200 p-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center text-sm font-heading font-semibold flex-shrink-0">
                    {initials(c.nombre)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground-950 truncate">{c.nombre}</p>
                          {habitual && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 border border-amber-200 text-amber-700">
                              <i className="ri-star-fill text-amber-500"></i>
                              Habitual
                            </span>
                          )}
                          {promosPendientes.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 border border-amber-300 text-amber-800">
                              <i className="ri-gift-line"></i>
                              Promo pendiente
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-foreground-400 mt-0.5">
                          {c.totalPedidos} pedido{c.totalPedidos === 1 ? '' : 's'} · {c.totalReservas} reserva
                          {c.totalReservas === 1 ? '' : 's'} · Última vez: {new Date(c.ultimaFecha).toLocaleDateString('es-ES')}
                        </p>
                        {c.productosFavoritos.length > 0 && (
                          <p className="text-xs text-foreground-500 mt-1 truncate">
                            Suele pedir: {c.productosFavoritos.map((p) => p.nombre).join(', ')}
                          </p>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-foreground-950 flex-shrink-0 tabular-nums">
                        {c.totalGastado > 0 ? `${c.totalGastado.toFixed(2)} €` : '—'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap mt-2.5 pt-2.5 border-t border-background-200/60">
                      {c.telefono && (
                        <>
                          <a
                            href={telHref(c.telefono)}
                            className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-background-100 text-foreground-600 hover:bg-background-200/70"
                          >
                            Llamar
                          </a>
                          <a
                            href={whatsappHref(c.telefono)}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          >
                            WhatsApp
                          </a>
                        </>
                      )}
                      {promosPendientes
                        .filter((o) => !o.whatsapp_enviado_at && o.cliente_telefono)
                        .map((o) => (
                          <a
                            key={o.id}
                            href={whatsappHref(o.cliente_telefono as string, o.mensaje)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => patchOtorgada(o.id, { whatsapp_enviado_at: new Date().toISOString() })}
                            className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 hover:bg-amber-100"
                          >
                            <i className="ri-gift-line"></i> Enviar promo
                          </a>
                        ))}
                      <button
                        type="button"
                        onClick={() => setExpandedKey(expanded ? null : c.key)}
                        className="ml-auto text-xs text-foreground-500 hover:text-foreground-950"
                      >
                        Historial ({c.historial.length}) {expanded ? '▲' : '▼'}
                      </button>
                    </div>

                    {expanded && (
                      <div className="bg-background-100 rounded-lg p-2.5 mt-2 space-y-1">
                        {c.historial.map((h, idx) => (
                          <p key={idx} className="text-xs text-foreground-600">
                            {new Date(h.fecha).toLocaleDateString('es-ES')} — {h.tipo === 'pedido' ? 'Pedido' : 'Reserva'} · {h.kg} kg ·{' '}
                            {h.estado}
                            {h.importe != null ? ` · ${h.importe.toFixed(2)} €` : ''}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showReglas && (
        <PromoReglasPanel
          reglas={reglas}
          otorgadas={promoOtorgadas}
          productos={productos}
          onClose={() => setShowReglas(false)}
          onCrearRegla={(input) => crearRegla(input).then(Boolean)}
          onPatchRegla={patchRegla}
          onEliminarRegla={eliminarRegla}
          onPatchOtorgada={patchOtorgada}
        />
      )}
    </div>
  );
}
