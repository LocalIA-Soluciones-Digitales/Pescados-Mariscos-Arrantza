import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/pages/home/components/Footer';
import { useReservasEventosPublico } from '@/hooks/useReservasEventosPublico';
import { useProductosPublicos } from '@/hooks/useProductosPublicos';
import { logReserva } from '@/lib/reservasLog';
import { getDeviceId } from '@/lib/deviceId';
import { pickLang } from '@/types/producto';
import type { Producto, ProductoCategoria } from '@/types/producto';
import type { ReservaEvento, ReservaItem } from '@/types/reserva';

const CATEGORIA_ORDEN: { value: ProductoCategoria; labelKey: string }[] = [
  { value: 'pescado', labelKey: 'products.filter_fish' },
  { value: 'marisco', labelKey: 'products.filter_seafood' },
  { value: 'especial', labelKey: 'products.filter_special' },
  { value: 'raciones', labelKey: 'products.filter_portions' },
];

function formatFecha(iso: string, lang: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString(lang.startsWith('eu') ? 'eu-ES' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatKg(n: number): string {
  return `${Math.round(n * 100) / 100} kg`;
}

function eventoNombre(evento: ReservaEvento, lang: string): string {
  if (lang.startsWith('eu') && evento.nombre_eu && evento.nombre_eu.trim() !== '') return evento.nombre_eu;
  return evento.nombre_es;
}

function buildWhatsAppMessage(params: {
  evento: ReservaEvento;
  items: ReservaItem[];
  totalWeight: number;
  nombre: string;
  telefono: string;
  email: string;
  fechaDeseada: string;
  notas: string;
  lang: string;
}): string {
  const { evento, items, totalWeight, nombre, telefono, email, fechaDeseada, notas, lang } = params;
  const sep = '━━━━━━━━━━━━━━━━━━━━━━';
  const lines: string[] = [];

  lines.push('🎄 NUEVA RESERVA');
  lines.push(`Campaña: ${evento.nombre_es}`);
  lines.push('');
  lines.push(sep);
  lines.push('');
  lines.push('👤 Cliente');
  lines.push(nombre);
  if (telefono.trim()) {
    lines.push('');
    lines.push('📞 Teléfono');
    lines.push(telefono.trim());
  }
  if (email.trim()) {
    lines.push('');
    lines.push('📧 Correo electrónico');
    lines.push(email.trim());
  }
  lines.push('');
  lines.push('📅 Día de recogida deseado');
  lines.push(fechaDeseada ? formatFecha(fechaDeseada, lang) : '—');
  lines.push('');
  lines.push(sep);

  for (const item of items) {
    lines.push('');
    lines.push(`🐟 ${item.nombre}`);
    lines.push(`⚖ ${formatKg(item.kg)}`);
  }

  lines.push('');
  lines.push(sep);
  lines.push('');
  lines.push('📦 RESUMEN');
  lines.push(`Productos: ${items.length}`);
  lines.push(`Peso total estimado: ${formatKg(totalWeight)}`);

  if (notas.trim()) {
    lines.push('');
    lines.push('📝 Notas');
    lines.push(notas.trim());
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Tarjeta de producto con selector de cantidad                       */
/* ------------------------------------------------------------------ */
function ReservaProductCard({
  product,
  kg,
  onAdd,
  onIncrease,
  onDecrease,
  onRemove,
}: {
  product: Producto;
  kg: number;
  onAdd: () => void;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
}) {
  const { t, i18n } = useTranslation();
  const inCart = kg > 0;

  return (
    <div
      className={`group bg-background-50 rounded-lg border overflow-hidden transition-all duration-300 ${
        inCart ? 'border-primary-400 ring-1 ring-primary-400/40' : 'border-background-200/70 hover:border-background-300/80'
      }`}
    >
      <div className="relative aspect-[5/4] overflow-hidden bg-background-100">
        <img src={product.imagen_url ?? ''} alt={pickLang(product, 'nombre', i18n.language)} className="w-full h-full object-cover object-top" loading="lazy" />
      </div>
      <div className="px-3 pt-3 pb-3">
        <h3 className="text-[13px] md:text-sm font-heading font-semibold text-foreground-950 leading-tight mb-1">
          {pickLang(product, 'nombre', i18n.language)}
        </h3>
        <p className="text-[11px] text-foreground-400 mb-2.5">{product.precio}</p>

        {!inCart ? (
          <button
            type="button"
            onClick={onAdd}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-full font-medium cursor-pointer whitespace-nowrap transition-all duration-300 active:scale-95 bg-primary-500 text-background-50 hover:bg-primary-600 px-3 py-2 text-xs"
          >
            <i className="ri-add-line"></i>
            {t('reservas.add_button')}
          </button>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center bg-background-100 rounded-full p-0.5">
              <button type="button" onClick={onDecrease} className="w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium text-foreground-600 hover:bg-background-200/70 hover:text-foreground-950">
                −
              </button>
              <span className="min-w-[46px] text-center text-xs font-semibold text-foreground-950 tabular-nums">{formatKg(kg)}</span>
              <button type="button" onClick={onIncrease} className="w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium text-foreground-600 hover:bg-background-200/70 hover:text-foreground-950">
                +
              </button>
            </div>
            <button type="button" onClick={onRemove} className="w-7 h-7 flex items-center justify-center rounded-full text-foreground-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0">
              <i className="ri-close-line text-sm"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Página principal                                                   */
/* ------------------------------------------------------------------ */
export default function Reservas() {
  const { t, i18n } = useTranslation();
  const { eventos, loading: loadingEventos } = useReservasEventosPublico();
  const { productos, loading: loadingProductos } = useProductosPublicos();

  const [selectedEventoId, setSelectedEventoId] = useState<string | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [fechaDeseada, setFechaDeseada] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!selectedEventoId && eventos.length > 0) setSelectedEventoId(eventos[0].id);
  }, [eventos, selectedEventoId]);

  const evento = useMemo(() => eventos.find((e) => e.id === selectedEventoId) ?? eventos[0] ?? null, [eventos, selectedEventoId]);

  const productosPorCategoria = useMemo(() => {
    const map = new Map<ProductoCategoria, Producto[]>();
    productos.forEach((p) => {
      const grupo = map.get(p.categoria) ?? [];
      grupo.push(p);
      map.set(p.categoria, grupo);
    });
    return CATEGORIA_ORDEN.map((c) => ({
      ...c,
      productos: (map.get(c.value) ?? []).sort((a, b) => a.nombre_es.localeCompare(b.nombre_es, 'es')),
    })).filter((g) => g.productos.length > 0);
  }, [productos]);

  const productMap = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  const items: ReservaItem[] = useMemo(
    () =>
      Object.entries(cantidades)
        .filter(([, kg]) => kg > 0)
        .map(([productoId, kg]) => {
          const p = productMap.get(productoId);
          return { productoId, nombre: p ? pickLang(p, 'nombre', i18n.language) : '', kg, nota: '', precioKg: 0 };
        }),
    [cantidades, productMap, i18n.language],
  );

  const totalWeight = useMemo(() => items.reduce((sum, i) => sum + i.kg, 0), [items]);

  const setKg = (productId: string, kg: number) => {
    setCantidades((prev) => ({ ...prev, [productId]: Math.max(0, Math.round(kg * 100) / 100) }));
  };

  const handleSubmit = async () => {
    if (!evento) return;
    if (!nombre.trim()) {
      setError(t('reservas.error_name'));
      return;
    }
    if (items.length === 0) {
      setError(t('reservas.error_empty'));
      return;
    }
    if (!fechaDeseada) {
      setError(t('reservas.error_date'));
      return;
    }
    setError(null);
    setSending(true);

    const result = await logReserva({
      eventoId: evento.id,
      items,
      totalProductos: items.length,
      pesoTotal: totalWeight,
      importeEstimado: null,
      clienteNombre: nombre.trim(),
      clienteTelefono: telefono.trim(),
      clienteEmail: email.trim(),
      fechaDeseada,
      notas: notas.trim(),
      deviceId: getDeviceId(),
    });

    const message = buildWhatsAppMessage({ evento, items, totalWeight, nombre, telefono, email, fechaDeseada, notas, lang: i18n.language });
    // api.whatsapp.com en vez de wa.me: evita el hop de redirección del
    // acortador que en algunos dispositivos corrompe los emojis de textos
    // largos (ver CartDrawer.tsx).
    const whatsappUrl = `https://api.whatsapp.com/send?phone=34619609888&text=${encodeURIComponent(message)}`;

    setSending(false);
    if (!result.ok) {
      // No bloqueamos el envío: el mensaje de WhatsApp sigue siendo la vía real de contacto.
      window.open(whatsappUrl, '_blank');
      setSuccess(true);
      return;
    }

    window.open(whatsappUrl, '_blank');
    setSuccess(true);
  };

  const resetForm = () => {
    setCantidades({});
    setNombre('');
    setTelefono('');
    setEmail('');
    setFechaDeseada('');
    setNotas('');
    setError(null);
    setSuccess(false);
  };

  const loading = loadingEventos || loadingProductos;

  return (
    <>
      <Navbar />
      <main className="pt-16 md:pt-20 min-h-screen bg-background-50">
        {loading ? (
          <div className="container-wide px-4 md:px-6 lg:px-12 py-24 text-center text-sm text-foreground-400">Cargando…</div>
        ) : !evento ? (
          <div className="container-wide px-4 md:px-6 lg:px-12 py-24 max-w-lg mx-auto text-center">
            <span className="w-16 h-16 flex items-center justify-center mx-auto mb-5 rounded-full bg-background-100 text-foreground-400 text-2xl">
              <i className="ri-calendar-event-line"></i>
            </span>
            <h1 className="text-xl md:text-2xl font-heading font-semibold text-foreground-950 mb-2">{t('reservas.no_active_title')}</h1>
            <p className="text-sm text-foreground-500 leading-relaxed mb-6">{t('reservas.no_active_subtitle')}</p>
            <Link to="/productos" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary-500 text-background-50 text-sm font-medium hover:bg-primary-600">
              {t('reservas.no_active_cta')}
              <i className="ri-arrow-right-line"></i>
            </Link>
          </div>
        ) : success ? (
          <div className="container-wide px-4 md:px-6 lg:px-12 py-24 max-w-lg mx-auto text-center">
            <span className="w-16 h-16 flex items-center justify-center mx-auto mb-5 rounded-full bg-emerald-100 text-emerald-600 text-2xl">
              <i className="ri-check-line"></i>
            </span>
            <h1 className="text-xl md:text-2xl font-heading font-semibold text-foreground-950 mb-2">{t('reservas.success_title')}</h1>
            <p className="text-sm text-foreground-500 leading-relaxed mb-6">{t('reservas.success_subtitle')}</p>
            <button type="button" onClick={resetForm} className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-background-100 text-foreground-700 text-sm font-medium hover:bg-background-200/70">
              {t('reservas.success_new')}
            </button>
          </div>
        ) : (
          <>
            {/* Hero */}
            <section className="relative bg-gradient-to-br from-primary-950 via-foreground-950 to-foreground-900 overflow-hidden rounded-b-[2rem] md:rounded-b-[2.5rem]">
              <div className="absolute -top-24 -right-16 w-80 h-80 rounded-full bg-accent-400/15 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-28 -left-16 w-72 h-72 rounded-full bg-primary-300/10 blur-3xl pointer-events-none" />
              <div
                className="absolute inset-0 opacity-[0.05] pointer-events-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}
              />
              <div className="container-wide px-4 md:px-6 lg:px-12 relative z-10 py-14 md:py-20">
                <div className="max-w-2xl">
                  <span className="w-11 h-11 flex items-center justify-center rounded-full bg-background-50/10 ring-1 ring-background-50/15 text-accent-300 text-lg mb-4">
                    <i className="ri-calendar-event-line"></i>
                  </span>
                  <span className="section-label text-white/70">{t('reservas.hero_label')}</span>
                  <h1 className="text-2xl md:text-4xl font-heading font-semibold text-background-50 leading-[1.15] mb-4">
                    {t('reservas.hero_title', { evento: eventoNombre(evento, i18n.language) })}
                  </h1>
                  <p className="text-sm md:text-base text-white/80 leading-relaxed mb-6">{t('reservas.hero_subtitle')}</p>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 ring-1 ring-white/10 text-white text-xs md:text-sm font-medium">
                      <i className="ri-calendar-check-line"></i>
                      {t('reservas.delivery_label')}: {formatFecha(evento.fecha_entrega, i18n.language)}
                    </span>
                    {evento.fecha_limite && (
                      <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-400/15 ring-1 ring-accent-300/20 text-accent-300 text-xs md:text-sm font-medium">
                        <i className="ri-time-line"></i>
                        {t('reservas.deadline_label')}: {formatFecha(evento.fecha_limite, i18n.language)}
                      </span>
                    )}
                  </div>

                  {eventos.length > 1 && (
                    <div className="flex items-center gap-1.5 mt-6 flex-wrap">
                      <span className="text-[11px] uppercase tracking-wide text-white/50 mr-1">{t('reservas.event_switch_label')}</span>
                      {eventos.map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => setSelectedEventoId(ev.id)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            ev.id === evento.id ? 'bg-primary-500 text-background-50' : 'bg-white/10 text-white/80 hover:bg-white/20'
                          }`}
                        >
                          {eventoNombre(ev, i18n.language)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Selección de productos + resumen */}
            <section className="container-wide px-4 md:px-6 lg:px-12 py-10 md:py-14">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 lg:gap-10 items-start">
                <div>
                  <h2 className="text-lg md:text-xl font-heading font-semibold text-foreground-950 mb-5">
                    {t('reservas.select_products_title')}
                  </h2>
                  <div className="space-y-8">
                    {productosPorCategoria.map((grupo) => (
                      <div key={grupo.value}>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-500 mb-3 pb-2 border-b border-background-200/60">
                          {t(grupo.labelKey)}
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                          {grupo.productos.map((product) => (
                            <ReservaProductCard
                              key={product.id}
                              product={product}
                              kg={cantidades[product.id] ?? 0}
                              onAdd={() => setKg(product.id, 0.5)}
                              onIncrease={() => setKg(product.id, (cantidades[product.id] ?? 0) + 0.5)}
                              onDecrease={() => setKg(product.id, Math.max(0, (cantidades[product.id] ?? 0) - 0.5))}
                              onRemove={() => setKg(product.id, 0)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resumen + formulario */}
                <div className="lg:sticky lg:top-28 bg-background-50 border border-background-200/70 rounded-2xl p-5 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
                  <h3 className="text-sm font-heading font-semibold text-foreground-950 mb-3 flex items-center gap-2">
                    <i className="ri-shopping-basket-2-line text-primary-500"></i>
                    {t('reservas.summary_title')}
                  </h3>

                  {items.length === 0 ? (
                    <p className="text-xs text-foreground-400 mb-4">{t('reservas.summary_empty')}</p>
                  ) : (
                    <div className="space-y-1.5 mb-4 max-h-[180px] overflow-y-auto pr-1">
                      {items.map((item) => (
                        <div key={item.productoId} className="flex items-center justify-between text-xs">
                          <span className="text-foreground-700 truncate">{item.nombre}</span>
                          <span className="text-foreground-950 font-medium flex-shrink-0 ml-2 tabular-nums">{formatKg(item.kg)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-xs pt-2 mt-1 border-t border-background-200/60">
                        <span className="text-foreground-500">{t('reservas.total_weight')}</span>
                        <span className="text-foreground-950 font-semibold tabular-nums">{formatKg(totalWeight)}</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 pt-3 border-t border-background-200/60">
                    <p className="text-xs font-semibold text-foreground-700">{t('reservas.form_title')}</p>
                    <input
                      type="text"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder={t('reservas.form_name')}
                      className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
                    />
                    <input
                      type="tel"
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      placeholder={t('reservas.form_phone')}
                      className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
                    />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('reservas.form_email')}
                      className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
                    />
                    <div>
                      <label className="block text-[11px] text-foreground-500 mb-1">{t('reservas.form_date')}</label>
                      <input
                        type="date"
                        value={fechaDeseada}
                        min={evento.fecha_entrega}
                        max={evento.fecha_limite ?? undefined}
                        onChange={(e) => setFechaDeseada(e.target.value)}
                        className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
                      />
                    </div>
                    <textarea
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      placeholder={t('reservas.form_notes_placeholder')}
                      rows={2}
                      className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm resize-none focus:outline-none focus:border-foreground-300/60"
                    />

                    {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={sending}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
                    >
                      <i className="ri-whatsapp-line text-base"></i>
                      {sending ? t('reservas.submit_sending') : t('reservas.submit_button')}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
