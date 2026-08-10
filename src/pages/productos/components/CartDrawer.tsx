import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { CartItem, CartCustomerInfo, OrderHistoryEntry } from '@/hooks/useCart';
import type { Producto } from '@/types/producto';
import { pickLang } from '@/types/producto';
import RollingNumber from '@/components/base/RollingNumber';
import { useTurnstile } from '@/hooks/useTurnstile';
import TurnstileWidget from '@/components/feature/TurnstileWidget';
import { isTurnstileEnabled } from '@/config/turnstile';
import { logConversion } from '@/lib/visitLog';
import { logPedido } from '@/lib/pedidosLog';
import { getDeviceId } from '@/lib/deviceId';

/* ------------------------------------------------------------------ */
/*  Badge style — same muted palette as catalogue                     */
/* ------------------------------------------------------------------ */
const badgeStyleMap: Record<Producto['estado'], { dot: string; bg: string; text: string }> = {
  available: { dot: 'bg-emerald-500', bg: 'bg-emerald-100/80', text: 'text-emerald-700' },
  new:      { dot: 'bg-sky-500',      bg: 'bg-sky-100/80',      text: 'text-sky-700' },
  premium:  { dot: 'bg-amber-500',    bg: 'bg-amber-100/80',    text: 'text-amber-700' },
  seasonal: { dot: 'bg-orange-500',    bg: 'bg-orange-100/80',   text: 'text-orange-700' },
};

function getBadgeLabelKey(badge: Producto['estado']): string {
  const map: Record<string, string> = {
    available: 'cart.badge_available',
    seasonal: 'cart.badge_seasonal',
    premium:  'cart.badge_premium',
    new:      'cart.badge_new',
  };
  return map[badge] || 'cart.badge_available';
}

/* ------------------------------------------------------------------ */
/*  Price helpers                                                      */
/* ------------------------------------------------------------------ */
function extractPricePerKg(priceStr: string): number {
  const match = priceStr.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function formatPrice(amount: number): string {
  return `${amount.toFixed(2)} €`;
}

/* ------------------------------------------------------------------ */
/*  Format kg display                                                  */
/* ------------------------------------------------------------------ */
function formatKg(kg: number): string {
  if (kg === 1) return '1 kg';
  if (kg % 1 === 0) return `${kg} kg`;
  return `${kg} kg`;
}

/* ------------------------------------------------------------------ */
/*  WhatsApp message builder (shared by preview + send)               */
/* ------------------------------------------------------------------ */
function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function generateWhatsAppMessage(params: {
  customer: CartCustomerInfo;
  items: CartItem[];
  totalProducts: number;
  totalWeight: number;
  subTotalAmount: number;
  deliveryCost: number;
  getProductName: (productId: string) => string;
  getPreparationLabel: (prep: string) => string;
  productMap: Map<string, Producto>;
}): string {
  const { customer, items, totalProducts, totalWeight, subTotalAmount, deliveryCost, getProductName, getPreparationLabel, productMap } = params;
  const sep = '━━━━━━━━━━━━━━━━━━━━━━';
  const isHomeDelivery = customer.deliveryMethod === 'home';

  const lines: string[] = [];

  // ══════════════════ HEADER ══════════════════
  lines.push('🦞 NUEVO PEDIDO');
  lines.push('');
  lines.push(sep);

  // ══════════════════ CUSTOMER INFO ══════════════════
  lines.push('');
  lines.push('👤 Cliente');
  lines.push(customer.name);
  lines.push('');
  lines.push('📞 Teléfono');
  lines.push(customer.phone);

  if (customer.email && customer.email.trim()) {
    lines.push('');
    lines.push('📧 Correo electrónico');
    lines.push(customer.email.trim());
  }

  if (customer.business && customer.business.trim()) {
    lines.push('');
    lines.push('🏢 Negocio');
    lines.push(customer.business.trim());
  }

  // ══════════════════ DELIVERY INFO ══════════════════
  lines.push('');
  lines.push(sep);
  lines.push('');

  if (isHomeDelivery) {
    lines.push('🚚 Envío a Domicilio');
    lines.push('');
    lines.push('📅 Fecha');
    lines.push(formatDisplayDate(customer.preferredDate));
    lines.push('');
    lines.push('🕒 Hora');
    lines.push(customer.preferredTime);
    lines.push('');
    lines.push('📍 Dirección de Entrega');
    lines.push(customer.address);
    lines.push(`${customer.city} ${customer.postalCode}`);
    if (customer.deliveryInstructions && customer.deliveryInstructions.trim()) {
      lines.push('');
      lines.push('📌 Instrucciones de Entrega');
      lines.push(customer.deliveryInstructions.trim());
    }
  } else {
    lines.push('🏪 Recogida en Tienda');
    lines.push('');
    lines.push('📅 Fecha');
    lines.push(formatDisplayDate(customer.preferredDate));
    lines.push('');
    lines.push('🕒 Hora');
    lines.push(customer.preferredTime);
    lines.push('');
    lines.push('📍 Dirección de Recogida');
    lines.push('Pescados y Mariscos Arrantza');
    lines.push('Calle Jesús Aramburu, 1');
    lines.push('48950 Erandio, Bizkaia');
  }

  // ══════════════════ ORDER DETAILS ══════════════════
  lines.push('');
  lines.push(sep);

  for (const item of items) {
    const name = getProductName(item.productId);
    const product = productMap.get(item.productId);
    const pricePerKg = product ? extractPricePerKg(product.precio) : 0;
    const subtotal = pricePerKg * item.kg;
    const prepLabel = getPreparationLabel(item.preparation || 'whole');

    lines.push('');
    lines.push(`🐟 ${name}`);
    lines.push('');
    lines.push(`⚖ Peso: ${formatKg(item.kg)}`);
    lines.push(`🔪 Preparación: ${prepLabel}`);
    lines.push(`💶 Precio: ${pricePerKg} €/Kg`);
    lines.push('');
    lines.push(`Subtotal: ${formatPrice(subtotal)}`);

    // ── Per-item product instructions (only if entered) ──
    if (item.note && item.note.trim()) {
      lines.push('');
      lines.push(`📝 Instrucciones: ${item.note.trim()}`);
    }

    lines.push('');
    lines.push(sep);
  }

  // ══════════════════ ORDER SUMMARY ══════════════════
  const finalTotal = subTotalAmount + deliveryCost;

  lines.push('');
  lines.push('📦 RESUMEN DEL PEDIDO');
  lines.push('');
  lines.push(`Productos: ${totalProducts}`);
  lines.push('');
  lines.push(`Peso Estimado: ${formatKg(totalWeight)}`);
  lines.push('');
  lines.push(`Subtotal: ${formatPrice(subTotalAmount)}`);

  if (isHomeDelivery) {
    lines.push('');
    lines.push(`Coste de Envío: ${formatPrice(deliveryCost)}`);
  }

  lines.push('');
  lines.push(sep);
  lines.push('');
  lines.push('💶 TOTAL');
  lines.push('');
  lines.push(formatPrice(finalTotal));
  lines.push('');
  lines.push(sep);

  // ══════════════════ CUSTOMER NOTES ══════════════════
  if (customer.notes && customer.notes.trim()) {
    lines.push('');
    lines.push('📝 Observaciones del Cliente');
    lines.push('');
    lines.push(customer.notes.trim());
    lines.push('');
    lines.push(sep);
  }

  // ══════════════════ THANK YOU ══════════════════
  lines.push('');
  lines.push('¡Gracias por tu pedido!');
  lines.push('');
  lines.push('Pescados y Mariscos Arrantza');
  lines.push('');
  lines.push('Designed & Developed by LocalIA');

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Preparation options                                               */
/* ------------------------------------------------------------------ */
const PREPARATIONS = [
  { key: 'whole',           labelKey: 'cart.prep_whole' },
  { key: 'cleaned',         labelKey: 'cart.prep_cleaned' },
  { key: 'filleted',        labelKey: 'cart.prep_filleted' },
  { key: 'steaks',          labelKey: 'cart.prep_steaks' },
  { key: 'butterflied',     labelKey: 'cart.prep_butterflied' },
  { key: 'oven_ready',      labelKey: 'cart.prep_oven_ready' },
  { key: 'vacuum_packed',   labelKey: 'cart.prep_vacuum_packed' },
  { key: 'other',           labelKey: 'cart.prep_other' },
] as const;

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30', '20:00',
] as const;

const DELIVERY_COST = 3.50;

/* ------------------------------------------------------------------ */
/*  Cart line item                                                     */
/* ------------------------------------------------------------------ */
function CartLineItem({
  cartItem,
  product,
  onIncrease,
  onDecrease,
  onRemove,
  onPreparationChange,
  onNoteChange,
  onSetKg,
  justAddedId,
}: {
  cartItem: CartItem;
  product: Producto;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
  onPreparationChange: (preparation: string) => void;
  onNoteChange: (note: string) => void;
  onSetKg: (kg: number) => void;
  justAddedId: string | null;
}) {
  const { t, i18n } = useTranslation();
  const badgeStyle = badgeStyleMap[product.estado];
  const pricePerKg = extractPricePerKg(product.precio);
  const subtotal = pricePerKg * cartItem.kg;

  // ── Green flash when this item is newly added ──
  useEffect(() => {
    if (justAddedId === cartItem.productId) {
      setRowFlashing(true);
      setWeightPopping(true);
      const t = setTimeout(() => {
        setRowFlashing(false);
        setWeightPopping(false);
      }, 750);
      return () => clearTimeout(t);
    }
  }, [justAddedId, cartItem.productId]);
  const [editWeightValue, setEditWeightValue] = useState('');
  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [minShaking, setMinShaking] = useState(false);
  const [plusBouncing, setPlusBouncing] = useState(false);
  const [rowFlashing, setRowFlashing] = useState(false);
  const [weightPopping, setWeightPopping] = useState(false);
  const prevKgRef = useRef(cartItem.kg);

  // ── Weight pop on any kg change (from +/-, direct edit, or new item) ──
  useEffect(() => {
    if (cartItem.kg !== prevKgRef.current) {
      prevKgRef.current = cartItem.kg;
      if (!weightPopping) {
        setWeightPopping(true);
        const t = setTimeout(() => setWeightPopping(false), 350);
        return () => clearTimeout(t);
      }
    }
  }, [cartItem.kg, weightPopping]);

  const [weightHintDismissed, setWeightHintDismissed] = useState(() => {
    try { return localStorage.getItem('arrantza_weight_hint_dismissed') === 'true'; }
    catch { return false; }
  });
  const [weightHintVisible, setWeightHintVisible] = useState(false);

  useEffect(() => {
    if (!weightHintDismissed) {
      const timer = setTimeout(() => setWeightHintVisible(true), 400);
      return () => clearTimeout(timer);
    }
  }, [weightHintDismissed]);

  const handleDismissWeightHint = () => {
    setWeightHintVisible(false);
    setTimeout(() => {
      setWeightHintDismissed(true);
      try { localStorage.setItem('arrantza_weight_hint_dismissed', 'true'); } catch { /* noop */ }
    }, 400);
  };

  const handleStartEditWeight = () => {
    setIsEditingWeight(true);
    setEditWeightValue(String(cartItem.kg));
  };

  const handleConfirmEditWeight = () => {
    const parsed = parseFloat(editWeightValue);
    if (!isNaN(parsed) && parsed >= 0.5) {
      const rounded = Math.max(0.5, Math.round(parsed * 100) / 100);
      onSetKg(rounded);
      if (!weightHintDismissed) {
        handleDismissWeightHint();
      }
    }
    setIsEditingWeight(false);
  };

  const handleWeightKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirmEditWeight();
    } else if (e.key === 'Escape') {
      setIsEditingWeight(false);
    }
  };

  return (
    <div className={`flex gap-3 py-4 border-b border-background-200/60 last:border-b-0 rounded-lg transition-shadow duration-200 ${rowFlashing ? 'animate-row-flash' : ''}`}>
      {/* Thumbnail */}
      <div className="w-16 h-16 rounded-md overflow-hidden bg-background-100 flex-shrink-0">
        <img
          src={product.imagen_url ?? ''}
          alt={pickLang(product, 'nombre', i18n.language)}
          className="w-full h-full object-cover object-top"
        />
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h4 className="text-sm font-semibold text-foreground-950 truncate">
            {pickLang(product, 'nombre', i18n.language)}
          </h4>
          <button
            type="button"
            onClick={onRemove}
            className="w-6 h-6 flex items-center justify-center rounded-full text-foreground-400 hover:text-red-500 hover:bg-red-50 cursor-pointer whitespace-nowrap flex-shrink-0 transition-all duration-200"
            aria-label={t('cart.remove')}
          >
            <i className="ri-close-line text-sm"></i>
          </button>
        </div>

        {/* Origin + badge */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[11px] text-foreground-400 inline-flex items-center gap-0.5">
            <i className="ri-map-pin-line text-[9px]"></i>
            {pickLang(product, 'origen', i18n.language)}
          </span>
          {!product.disponible ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-foreground-200/90 text-foreground-700 text-[10px] font-medium whitespace-nowrap">
              <span className="w-1 h-1 rounded-full bg-foreground-500"></span>
              {t('products.badge_agotado')}
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${badgeStyle.bg} ${badgeStyle.text} text-[10px] font-medium whitespace-nowrap`}>
              <span className={`w-1 h-1 rounded-full ${badgeStyle.dot}`}></span>
              {t(getBadgeLabelKey(product.estado))}
            </span>
          )}
        </div>

        {/* Quantity selector */}
        <div className="mb-2">
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-foreground-400 mr-1.5">
              {t('cart.quantity_label')}
            </span>
            <div className="flex items-center bg-background-100 rounded-full p-0.5">
              <div className={`relative group rounded-full ${minShaking ? 'animate-min-ring' : ''}`}>
                <button
                  type="button"
                  onClick={() => {
                    if (cartItem.kg <= 0.5) {
                      setMinShaking(true);
                      setTimeout(() => setMinShaking(false), 500);
                      return;
                    }
                    onDecrease();
                  }}
                  disabled={cartItem.kg <= 0.5}
                  className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                    cartItem.kg <= 0.5
                      ? `text-foreground-300 cursor-not-allowed ${minShaking ? 'animate-min-shake' : ''}`
                      : 'text-foreground-600 hover:bg-background-200/70 hover:text-foreground-950 cursor-pointer'
                  }`}
                  aria-label="Reducir cantidad"
                >
                  −
                </button>
                {cartItem.kg <= 0.5 && (
                  <span className="absolute -top-[26px] left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[10px] font-medium text-background-50 bg-foreground-800 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                    0.5 kg mín
                    <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground-800"></span>
                  </span>
                )}
              </div>
              {isEditingWeight ? (
                <input
                  type="number"
                  value={editWeightValue}
                  onChange={(e) => setEditWeightValue(e.target.value)}
                  onBlur={handleConfirmEditWeight}
                  onKeyDown={handleWeightKeyDown}
                  className="w-[56px] text-center text-sm font-semibold text-foreground-950 bg-transparent border-0 outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none tabular-nums"
                  step="0.1"
                  min="0.5"
                  autoFocus
                  inputMode="decimal"
                  aria-label="Editar peso en kg"
                />
              ) : (
                <span
                  onClick={handleStartEditWeight}
                  className={`min-w-[48px] text-center text-sm font-semibold text-foreground-950 tabular-nums cursor-pointer hover:text-primary-600 transition-colors duration-200 select-none inline-block ${weightPopping ? 'animate-weight-pop' : ''}`}
                  title={t('cart.weight_hint_short')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleStartEditWeight(); } }}
                  aria-label="Haz clic para editar el peso"
                >
                  {formatKg(cartItem.kg)}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setPlusBouncing(true);
                  setTimeout(() => setPlusBouncing(false), 400);
                  onIncrease();
                }}
                className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium text-foreground-600 hover:bg-background-200/70 hover:text-foreground-950 cursor-pointer whitespace-nowrap transition-all duration-200 ${plusBouncing ? 'animate-plus-bounce' : ''}`}
                aria-label="Aumentar cantidad"
              >
                +
              </button>
            </div>
            <span className="text-xs text-foreground-400 ml-2 tabular-nums whitespace-nowrap">
              {pricePerKg} {t('cart.price_label')}
            </span>
          </div>
          {!weightHintDismissed && (
            <p
              className={`text-[10px] text-foreground-400 mt-1 pl-[72px] transition-all duration-400 ease-out ${
                weightHintVisible ? 'opacity-100 max-h-8 translate-y-0' : 'opacity-0 max-h-0 translate-y-1 overflow-hidden'
              }`}
              aria-live="polite"
            >
              💡 {t('cart.weight_hint')}
            </p>
          )}
        </div>

        {/* Preparation selector */}
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[10px] uppercase tracking-wider text-foreground-400 mr-1.5">
            {t('cart.preparation_label')}
          </span>
          <div className="relative">
            <select
              value={cartItem.preparation || 'whole'}
              onChange={(e) => onPreparationChange(e.target.value)}
              className="appearance-none bg-background-100 border border-background-200/70 rounded-full pl-3.5 pr-8 py-1.5 text-xs font-medium text-foreground-950 cursor-pointer focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40 transition-all duration-200"
            >
              {PREPARATIONS.map((p) => (
                <option key={p.key} value={p.key}>
                  {t(p.labelKey)}
                </option>
              ))}
            </select>
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 flex items-center justify-center text-foreground-400 pointer-events-none">
              <i className="ri-arrow-down-s-line text-xs"></i>
            </span>
          </div>
          {/* Saved indicator — tiny checkmark when preparation differs from default */}
          <span
            className={`w-4 h-4 flex items-center justify-center rounded-full bg-emerald-100/80 text-emerald-600 transition-all duration-300 ${
              (cartItem.preparation || 'whole') !== 'whole'
                ? 'opacity-100 scale-100'
                : 'opacity-0 scale-75'
            }`}
          >
            <i className="ri-check-line text-[11px]"></i>
          </span>
        </div>

        {/* Per-item note */}
        <div className="flex items-center gap-1 mb-2">
          <div className="relative flex items-center gap-1 mr-1.5 flex-shrink-0">
            <span className="text-[10px] uppercase tracking-wider text-foreground-400">
              {t('cart.item_note_label')}
            </span>
            <span className="group relative w-3.5 h-3.5 flex items-center justify-center text-foreground-300 hover:text-foreground-500 cursor-help transition-colors duration-200">
              <i className="ri-information-line text-[11px]"></i>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-[220px] px-3 py-2 bg-foreground-800 text-background-50 rounded-lg text-[10px] leading-relaxed font-normal normal-case tracking-normal opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-20 whitespace-normal">
                {t('cart.item_note_tooltip')}
                <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground-800"></span>
              </span>
            </span>
          </div>
          <div className="relative flex-1">
            <input
              type="text"
              value={cartItem.note || ''}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder={t('cart.item_note_placeholder')}
              maxLength={60}
              className="w-full bg-background-100 border border-background-200/70 rounded-full pl-3.5 pr-3 py-1.5 text-xs text-foreground-950 placeholder:text-foreground-300 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40 transition-all duration-200"
            />
            {cartItem.note && cartItem.note.trim().length > 0 && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 flex items-center justify-center text-emerald-500 pointer-events-none">
                <i className="ri-check-line text-[10px]"></i>
              </span>
            )}
          </div>
        </div>

        {/* Estimated subtotal */}
        <div className="flex items-center justify-end">
          <span className="text-xs text-foreground-400 mr-2">{t('cart.estimated_subtotal')}</span>
          <span className="text-sm font-semibold text-foreground-950 whitespace-nowrap overflow-hidden">
            <RollingNumber value={formatPrice(subtotal)} />
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CartDrawer — full right-side sliding panel                        */
/* ------------------------------------------------------------------ */
interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  productos: Producto[];
  items: CartItem[];
  customer: CartCustomerInfo;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onRemove: (productId: string) => void;
  onClearCart: () => void;
  onCustomerChange: <K extends keyof CartCustomerInfo>(field: K, value: CartCustomerInfo[K]) => void;
  onPreparationChange: (productId: string, preparation: string) => void;
  onNoteChange: (productId: string, note: string) => void;
  onSetKg: (productId: string, kg: number) => void;
  totalProducts: number;
  totalWeight: number;
  justAddedId: string | null;
  orderHistory: OrderHistoryEntry[];
  onSaveLastOrder: () => void;
  onLoadOrder: (orderId: string) => void;
}

export default function CartDrawer({
  open,
  onClose,
  productos,
  items,
  customer,
  onIncrease,
  onDecrease,
  onRemove,
  onClearCart,
  onCustomerChange,
  onPreparationChange,
  onNoteChange,
  onSetKg,
  totalProducts,
  totalWeight,
  justAddedId,
  orderHistory,
  onSaveLastOrder,
  onLoadOrder,
}: CartDrawerProps) {
  const { t, i18n } = useTranslation();
  const productMap = useMemo(() => new Map(productos.map(p => [p.id, p])), [productos]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const hasLastOrder = orderHistory.length > 0;

  // ── Turnstile verification (currently always passes) ──
  const turnstile = useTurnstile();

  const deliveryCost = customer.deliveryMethod === 'home' ? DELIVERY_COST : 0;

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      setAnimating(true);
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = 'var(--scrollbar-width, 0px)';
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`);
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [open]);

  const handleClose = useCallback(() => {
    setAnimating(false);
    setOrderConfirmed(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  const handleClearConfirm = useCallback(() => {
    onClearCart();
    setShowClearConfirm(false);
  }, [onClearCart]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) handleClose();
    },
    [handleClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    },
    [handleClose],
  );

  const validateOrder = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    // Delivery method (always required)
    if (!customer.deliveryMethod || (customer.deliveryMethod !== 'home' && customer.deliveryMethod !== 'pickup')) {
      errors.deliveryMethod = t('cart.validation_delivery_required');
    }

    // Preferred date (always required)
    if (!customer.preferredDate) {
      errors.preferredDate = t('cart.validation_date_required');
    }

    // Preferred time (always required)
    if (!customer.preferredTime) {
      errors.preferredTime = t('cart.validation_time_required');
    }

    // Customer name (always required)
    if (!customer.name.trim()) {
      errors.name = t('cart.validation_name_required');
    }

    // Phone (always required)
    const digitsOnly = customer.phone.replace(/\D/g, '');
    if (!customer.phone.trim()) {
      errors.phone = t('cart.validation_phone_required');
    } else if (digitsOnly.length < 9) {
      errors.phone = t('cart.validation_phone_invalid');
    }

    // If home delivery, validate address fields
    if (customer.deliveryMethod === 'home') {
      if (!customer.address.trim()) {
        errors.address = t('cart.validation_address_required');
      }
      if (!customer.city.trim()) {
        errors.city = t('cart.validation_city_required');
      }
      if (!customer.postalCode.trim()) {
        errors.postalCode = t('cart.validation_postal_code_required');
      }
    }

    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) {
      const firstErrorField = Object.keys(errors)[0];
      const el = document.getElementById(`checkout-field-${firstErrorField}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = el.querySelector('input, textarea, select');
        if (input) {
          setTimeout(() => (input as HTMLElement).focus(), 400);
        }
      }
      return false;
    }

    return true;
  }, [customer, t]);

  /**
   * Order confirmation pipeline:
   *
   *   1. Cart validation       ← validateOrder()
   *   2. Checkout validation   ← (same, combined)
   *   3. Turnstile verification ← isTurnstileEnabled() ? turnstile.verified : true
   *   4. WhatsApp message gen  ← generateWhatsAppMessage()
   *   5. Order confirmation    ← window.open(whatsappUrl)
   *
   * Today, step 3 always passes because Turnstile is disabled.
   * When Turnstile is enabled, the button will be gated on
   * `turnstile.verified` in addition to the existing checks.
   */
  const handleSendOrder = () => {
    if (!validateOrder()) return;

    // ── Turnstile gate (always passes when disabled) ──
    if (isTurnstileEnabled() && !turnstile.verified) {
      // Verification required but not yet completed
      return;
    }

    const subTotalAmount = items.reduce((sum, item) => {
      const product = productMap.get(item.productId);
      if (!product) return sum;
      return sum + extractPricePerKg(product.precio) * item.kg;
    }, 0);

    const message = generateWhatsAppMessage({
      customer,
      items,
      totalProducts,
      totalWeight,
      subTotalAmount,
      deliveryCost,
      getProductName: (productId) => {
        const product = productMap.get(productId);
        return product ? pickLang(product, 'nombre', i18n.language) : productId;
      },
      getPreparationLabel: (prep) => t(`cart.prep_${prep}` as any),
      productMap,
    });

    const encoded = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/34608240759?text=${encoded}`;

    // ── Save as last order for Buy Again ──
    onSaveLastOrder();

    logConversion('whatsapp_click');

    // Persiste el detalle del pedido (antes solo se registraba el clic).
    void logPedido({
      items: items.map((item) => {
        const product = productMap.get(item.productId);
        return {
          productoId: item.productId,
          nombre: product ? pickLang(product, 'nombre', i18n.language) : item.productId,
          kg: item.kg,
          preparacion: item.preparation,
          nota: item.note,
          precioKg: product ? extractPricePerKg(product.precio) : 0,
        };
      }),
      totalProductos: totalProducts,
      pesoTotal: totalWeight,
      importeEstimado: subTotalAmount + deliveryCost,
      metodoEntrega: customer.deliveryMethod,
      clienteNombre: customer.name,
      clienteNegocio: customer.business,
      clienteTelefono: customer.phone,
      clienteEmail: customer.email,
      clienteDireccion: customer.address,
      clienteCiudad: customer.city,
      clienteCp: customer.postalCode,
      fechaPreferida: customer.preferredDate,
      horaPreferida: customer.preferredTime,
      notas: customer.notes,
      deviceId: getDeviceId(),
    });

    window.open(whatsappUrl, '_blank');

    // ── Reset the drawer to a clean state and show the thank-you popup ──
    onClearCart();
    setValidationErrors({});
    setOrderConfirmed(true);
  };

  if (!open) return null;

  // Compute estimated total (incl. delivery)
  const subTotalAmount = items.reduce((sum, item) => {
    const product = productMap.get(item.productId);
    if (!product) return sum;
    return sum + extractPricePerKg(product.precio) * item.kg;
  }, 0);
  const estimatedTotal = subTotalAmount + deliveryCost;

  const ticketDate = new Date().toLocaleString(i18n.language === 'eu' ? 'eu-ES' : 'es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const isEmpty = items.length === 0;

  const viewOrder = orderHistory.find(o => o.id === viewOrderId) ?? null;
  const viewOrderWeight = viewOrder ? viewOrder.items.reduce((sum, i) => sum + i.kg, 0) : 0;
  const viewOrderDate = viewOrder
    ? new Date(viewOrder.date).toLocaleString(i18n.language === 'eu' ? 'eu-ES' : 'es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
  const viewOrderSubtotal = viewOrder
    ? viewOrder.items.reduce((sum, item) => {
        const product = productMap.get(item.productId);
        if (!product) return sum;
        return sum + extractPricePerKg(product.precio) * item.kg;
      }, 0)
    : 0;
  const viewOrderDeliveryCost = viewOrder && viewOrder.deliveryMethod === 'home' ? DELIVERY_COST : 0;
  const viewOrderTotal = viewOrderSubtotal + viewOrderDeliveryCost;

  const orderHistorySection = hasLastOrder && (
    <>
      {/* ── Buy Again button ── */}
      <button
        type="button"
        onClick={() => setPendingOrderId(orderHistory[0].id)}
        className="w-full mb-2 mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-medium bg-background-100 text-foreground-600 border border-background-200/70 hover:bg-background-200/70 hover:text-foreground-950 cursor-pointer whitespace-nowrap transition-all duration-200 active:scale-[0.98]"
      >
        <span className="w-4 h-4 flex items-center justify-center">
          <i className="ri-refresh-line text-sm"></i>
        </span>
        {t('cart.buy_again')}
      </button>

      {/* ── Order history (Pedidos anteriores) ── */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setShowOrderHistory(v => !v)}
          className="w-full flex items-center justify-between px-1 py-1.5 text-xs font-medium text-foreground-400 hover:text-foreground-700 cursor-pointer whitespace-nowrap transition-colors duration-200"
          aria-expanded={showOrderHistory}
        >
          <span className="inline-flex items-center gap-1.5">
            <i className="ri-history-line text-sm"></i>
            {t('cart.order_history_title')}
          </span>
          <i className={`ri-arrow-down-s-line text-sm transition-transform duration-200 ${showOrderHistory ? 'rotate-180' : ''}`}></i>
        </button>
        <div
          className={`overflow-hidden transition-all duration-300 ease-out ${
            showOrderHistory ? 'max-h-[600px] opacity-100 mt-1' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="space-y-2 pb-1">
            {orderHistory.map(order => {
              const names = order.items.map(i => {
                const product = productMap.get(i.productId);
                return product ? pickLang(product, 'nombre', i18n.language) : i.productId;
              });
              const summary = names.length > 1
                ? t('cart.order_history_summary_more', { first: names[0], count: names.length - 1 })
                : names[0];
              const orderDate = new Date(order.date).toLocaleDateString(i18n.language === 'eu' ? 'eu-ES' : 'es-ES', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              });
              return (
                <div
                  key={order.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setViewOrderId(order.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setViewOrderId(order.id);
                    }
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-background-100/60 border border-background-200/50 hover:bg-background-200/50 hover:border-background-300/60 cursor-pointer transition-all duration-200 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground-800 truncate">{summary}</p>
                    <p className="text-[10px] text-foreground-400 tabular-nums">{orderDate}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingOrderId(order.id);
                    }}
                    className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium bg-background-200/70 text-foreground-700 hover:bg-background-300/60 hover:text-foreground-950 cursor-pointer whitespace-nowrap transition-all duration-200"
                  >
                    {t('cart.order_history_reorder')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={t('cart.title')}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-foreground-950/30 transition-opacity duration-300 ${
          animating ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleBackdropClick}
      />

      {/* Panel */}
      <div
        className={`relative w-full max-w-[420px] bg-background-50 h-full shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          animating ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-background-200/60 flex-shrink-0">
          <h2 className="text-lg font-heading font-semibold text-foreground-950">
            {t('cart.title')}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="w-9 h-9 flex items-center justify-center rounded-full text-foreground-400 hover:text-foreground-950 hover:bg-background-100 cursor-pointer whitespace-nowrap transition-all duration-200"
            aria-label={t('cart.close_label')}
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {/* Clear confirmation overlay */}
        {showClearConfirm ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <span className="w-14 h-14 flex items-center justify-center rounded-full bg-red-50 text-red-500 mb-5">
              <i className="ri-delete-bin-line text-2xl"></i>
            </span>
            <h3 className="text-lg font-heading font-semibold text-foreground-950 mb-2">
              {t('cart.clear_confirm_title')}
            </h3>
            <p className="text-sm text-foreground-500 mb-8 max-w-[280px] leading-relaxed">
              {t('cart.clear_confirm_text')}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-5 py-2.5 rounded-full text-sm font-medium text-foreground-600 bg-background-100 hover:bg-background-200/70 cursor-pointer whitespace-nowrap transition-all duration-200"
              >
                {t('cart.clear_confirm_cancel')}
              </button>
              <button
                type="button"
                onClick={handleClearConfirm}
                className="px-5 py-2.5 rounded-full text-sm font-medium text-background-50 bg-red-500 hover:bg-red-600 cursor-pointer whitespace-nowrap transition-all duration-200"
              >
                {t('cart.clear_confirm_yes')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {isEmpty ? (
                /* Empty state */
                <div className="flex flex-col h-full">
                  {hasLastOrder && (
                    <div className="px-5 pt-2">
                      {orderHistorySection}
                    </div>
                  )}
                  <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
                    <span className="w-16 h-16 flex items-center justify-center rounded-full bg-background-100 text-foreground-400 mb-5">
                      <i className="ri-shopping-cart-line text-2xl"></i>
                    </span>
                    <p className="text-base font-heading font-semibold text-foreground-600 mb-1.5">
                      {t('products.cart_empty')}
                    </p>
                    <p className="text-sm text-foreground-400 max-w-[240px] leading-relaxed mb-6">
                      {t('products.cart_empty_hint')}
                    </p>
                    <Link
                      to="/productos"
                      onClick={handleClose}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap transition-all duration-300 active:scale-[0.98]"
                    >
                      <i className="ri-arrow-left-line"></i>
                      {t('products.continue_shopping')}
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="px-5">
                  {hasLastOrder && orderHistorySection}

                  {/* Product list */}
                  <div className="py-1">
                    {items.map(item => {
                      const product = productMap.get(item.productId);
                      if (!product) return null;
                      return (
                        <CartLineItem
                          key={item.productId}
                          cartItem={item}
                          product={product}
                          onIncrease={() => onIncrease(item.productId)}
                          onDecrease={() => onDecrease(item.productId)}
                          onRemove={() => onRemove(item.productId)}
                          onPreparationChange={(prep) => onPreparationChange(item.productId, prep)}
                          onNoteChange={(note) => onNoteChange(item.productId, note)}
                          onSetKg={(kg) => onSetKg(item.productId, kg)}
                          justAddedId={justAddedId}
                        />
                      );
                    })}
                  </div>

                  {/* Order summary — ticket style */}
                  <div className="mt-4 mb-5 rounded-lg bg-background-100/50 border border-background-200/50 overflow-hidden">
                    {/* Ticket header */}
                    <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-dashed border-background-300/80">
                      <span className="w-7 h-7 flex items-center justify-center rounded-full bg-primary-100 text-primary-600 flex-shrink-0">
                        <i className="ri-file-list-3-line text-sm"></i>
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-950">
                          {t('cart.summary_title')}
                        </h3>
                        <p className="text-[10px] text-foreground-400 tabular-nums">
                          {ticketDate}
                        </p>
                      </div>
                    </div>

                    {/* Itemized lines */}
                    <div className="px-4 py-3 border-b border-dashed border-background-300/80 space-y-2.5">
                      {items.map(item => {
                        const product = productMap.get(item.productId);
                        if (!product) return null;
                        const pricePerKg = extractPricePerKg(product.precio);
                        const itemSubtotal = pricePerKg * item.kg;
                        return (
                          <div key={item.productId} className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground-800 truncate">
                                {pickLang(product, 'nombre', i18n.language)}
                              </p>
                              <p className="text-[10px] text-foreground-400 tabular-nums">
                                {formatKg(item.kg)} × {pricePerKg} {t('cart.price_label')}
                              </p>
                            </div>
                            <span className="text-xs font-semibold text-foreground-950 tabular-nums whitespace-nowrap flex-shrink-0">
                              {formatPrice(itemSubtotal)}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Totals block */}
                    <div className="px-4 py-3 space-y-2 border-b border-dashed border-background-300/80">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-foreground-500">
                          {t('cart.summary_products')}
                        </span>
                        <span className="text-sm font-semibold text-foreground-950 tabular-nums transition-all duration-300">
                          {totalProducts}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-foreground-500">
                          {t('cart.summary_estimated_weight')}
                        </span>
                        <span className="text-sm font-semibold text-foreground-950 tabular-nums transition-all duration-300">
                          {formatKg(totalWeight)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-foreground-500">
                          {t('cart.summary_subtotal')}
                        </span>
                        <span className="text-sm font-semibold text-foreground-950 tabular-nums transition-all duration-300">
                          {formatPrice(subTotalAmount)}
                        </span>
                      </div>
                      {customer.deliveryMethod === 'home' && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-foreground-500">
                            {t('cart.summary_delivery_cost')}
                          </span>
                          <span className="text-sm font-semibold text-foreground-950 tabular-nums transition-all duration-300">
                            {formatPrice(deliveryCost)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Total */}
                    <div className="flex items-center justify-between px-4 py-3 bg-background-200/30">
                      <span className="text-sm font-semibold text-foreground-950">
                        {t('cart.summary_estimated_total')}
                      </span>
                      <span className="text-base font-semibold text-foreground-950 whitespace-nowrap overflow-hidden">
                        <RollingNumber value={formatPrice(estimatedTotal)} />
                      </span>
                    </div>
                  </div>

                  {/* === DELIVERY METHOD === */}
                  <div id="checkout-field-deliveryMethod" className="mb-6">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-foreground-400 mb-3">
                      {t('checkout.delivery_method')}
                    </h3>
                    <div className={`grid grid-cols-2 gap-3 p-0.5 rounded-xl transition-all duration-300 ${validationErrors.deliveryMethod ? 'ring-2 ring-red-400/60' : ''}`}>
                      {/* Home Delivery Card */}
                      <button
                        type="button"
                        onClick={() => { onCustomerChange('deliveryMethod', 'home'); if (validationErrors.deliveryMethod) setValidationErrors(prev => { const next = { ...prev }; delete next.deliveryMethod; return next; }); }}
                        className={`relative flex flex-col items-center text-center p-4 rounded-xl border-2 cursor-pointer h-full transition-all duration-300 ${
                          customer.deliveryMethod === 'home'
                            ? 'border-primary-500 bg-primary-50/50'
                            : 'border-background-200/70 bg-background-50 hover:border-background-300/80 hover:bg-background-100/50'
                        }`}
                      >
                        {customer.deliveryMethod === 'home' && (
                          <span className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full bg-primary-500 text-background-50 animate-[scaleIn_0.3s_ease-out]">
                            <i className="ri-check-line text-[11px]"></i>
                          </span>
                        )}
                        <span className={`w-10 h-10 flex items-center justify-center rounded-full mb-3 text-xl transition-all duration-300 ${
                          customer.deliveryMethod === 'home'
                            ? 'bg-primary-100 text-primary-600'
                            : 'bg-background-100 text-foreground-400'
                        }`}>
                          <i className="ri-truck-line"></i>
                        </span>
                        <span className="text-sm font-semibold text-foreground-950 mb-2 whitespace-nowrap">
                          {t('checkout.delivery_home')}
                        </span>
                        <span className="text-[11px] text-foreground-400 leading-relaxed whitespace-normal max-w-[160px]">
                          {t('checkout.delivery_home_desc')}
                        </span>
                      </button>

                      {/* Store Pickup Card */}
                      <button
                        type="button"
                        onClick={() => { onCustomerChange('deliveryMethod', 'pickup'); setValidationErrors(prev => { const next = { ...prev }; delete next.deliveryMethod; delete next.address; delete next.city; delete next.postalCode; return next; }); }}
                        className={`relative flex flex-col items-center text-center p-4 rounded-xl border-2 cursor-pointer h-full transition-all duration-300 ${
                          customer.deliveryMethod === 'pickup'
                            ? 'border-primary-500 bg-primary-50/50'
                            : 'border-background-200/70 bg-background-50 hover:border-background-300/80 hover:bg-background-100/50'
                        }`}
                      >
                        {customer.deliveryMethod === 'pickup' && (
                          <span className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full bg-primary-500 text-background-50 animate-[scaleIn_0.3s_ease-out]">
                            <i className="ri-check-line text-[11px]"></i>
                          </span>
                        )}
                        <span className={`w-10 h-10 flex items-center justify-center rounded-full mb-3 text-xl transition-all duration-300 ${
                          customer.deliveryMethod === 'pickup'
                            ? 'bg-primary-100 text-primary-600'
                            : 'bg-background-100 text-foreground-400'
                        }`}>
                          <i className="ri-store-2-line"></i>
                        </span>
                        <span className="text-sm font-semibold text-foreground-950 mb-2 whitespace-nowrap">
                          {t('checkout.delivery_pickup')}
                        </span>
                        <span className="text-[11px] text-foreground-400 leading-relaxed whitespace-normal max-w-[160px]">
                          {t('checkout.delivery_pickup_desc')}
                        </span>
                      </button>
                    </div>
                    {validationErrors.deliveryMethod && (
                      <p className="text-xs text-red-500 mt-2 ml-0.5 flex items-center gap-1.5 animate-fadeIn">
                        <span className="w-3.5 h-3.5 flex items-center justify-center">
                          <i className="ri-error-warning-line text-xs"></i>
                        </span>
                        {validationErrors.deliveryMethod}
                      </p>
                    )}
                  </div>

                  {/* === HOME DELIVERY FIELDS (animated) === */}
                  <div
                    className={`transition-all duration-500 ease-out overflow-hidden ${
                      customer.deliveryMethod === 'home'
                        ? 'max-h-[600px] opacity-100 mb-5'
                        : 'max-h-0 opacity-0 mb-0'
                    }`}
                  >
                    <div className="space-y-3">
                      <div id="checkout-field-address">
                        <label className="block text-[10px] uppercase tracking-wider text-foreground-400 mb-1.5">
                          {t('checkout.address_label')}
                        </label>
                        <textarea
                          placeholder={t('checkout.address_placeholder')}
                          value={customer.address}
                          onChange={e => { onCustomerChange('address', e.target.value); if (validationErrors.address) setValidationErrors(prev => { const next = { ...prev }; delete next.address; return next; }); }}
                          rows={2}
                          className={`w-full px-3.5 py-2.5 bg-background-100 border rounded-lg text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:ring-1 transition-all duration-200 resize-none ${validationErrors.address ? 'border-red-400 focus:border-red-500 focus:ring-red-200/40' : 'border-background-200/70 focus:border-primary-300/60 focus:ring-primary-200/40'}`}
                        />
                        {validationErrors.address && (
                          <p className="text-[11px] text-red-500 mt-1 ml-0.5 flex items-center gap-1 animate-fadeIn">
                            <span className="w-3 h-3 flex items-center justify-center"><i className="ri-error-warning-line text-[10px]"></i></span>
                            {validationErrors.address}
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div id="checkout-field-city">
                          <label className="block text-[10px] uppercase tracking-wider text-foreground-400 mb-1.5">
                            {t('checkout.city_label')}
                          </label>
                          <input
                            type="text"
                            value={customer.city}
                            onChange={e => { onCustomerChange('city', e.target.value); if (validationErrors.city) setValidationErrors(prev => { const next = { ...prev }; delete next.city; return next; }); }}
                            className={`w-full px-3.5 py-2.5 bg-background-100 border rounded-lg text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:ring-1 transition-all duration-200 ${validationErrors.city ? 'border-red-400 focus:border-red-500 focus:ring-red-200/40' : 'border-background-200/70 focus:border-primary-300/60 focus:ring-primary-200/40'}`}
                          />
                          {validationErrors.city && (
                            <p className="text-[11px] text-red-500 mt-1 ml-0.5 flex items-center gap-1 animate-fadeIn">
                              <span className="w-3 h-3 flex items-center justify-center"><i className="ri-error-warning-line text-[10px]"></i></span>
                              {validationErrors.city}
                            </p>
                          )}
                        </div>
                        <div id="checkout-field-postalCode">
                          <label className="block text-[10px] uppercase tracking-wider text-foreground-400 mb-1.5">
                            {t('checkout.postal_code_label')}
                          </label>
                          <input
                            type="text"
                            value={customer.postalCode}
                            onChange={e => { onCustomerChange('postalCode', e.target.value); if (validationErrors.postalCode) setValidationErrors(prev => { const next = { ...prev }; delete next.postalCode; return next; }); }}
                            className={`w-full px-3.5 py-2.5 bg-background-100 border rounded-lg text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:ring-1 transition-all duration-200 ${validationErrors.postalCode ? 'border-red-400 focus:border-red-500 focus:ring-red-200/40' : 'border-background-200/70 focus:border-primary-300/60 focus:ring-primary-200/40'}`}
                          />
                          {validationErrors.postalCode && (
                            <p className="text-[11px] text-red-500 mt-1 ml-0.5 flex items-center gap-1 animate-fadeIn">
                              <span className="w-3 h-3 flex items-center justify-center"><i className="ri-error-warning-line text-[10px]"></i></span>
                              {validationErrors.postalCode}
                            </p>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-foreground-400 mb-1.5">
                          {t('checkout.delivery_instructions_label')}
                          <span className="text-foreground-300 ml-1 font-normal normal-case tracking-normal">— {t('common.optional')}</span>
                        </label>
                        <input
                          type="text"
                          placeholder={t('checkout.delivery_instructions_placeholder')}
                          value={customer.deliveryInstructions}
                          onChange={e => onCustomerChange('deliveryInstructions', e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-background-100 border border-background-200/70 rounded-lg text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300/60 focus:ring-1 focus:ring-primary-200/40 transition-all duration-200"
                        />
                      </div>
                    </div>
                  </div>

                  {/* === STORE PICKUP INFO CARD (animated) === */}
                  <div
                    className={`transition-all duration-500 ease-out overflow-hidden ${
                      customer.deliveryMethod === 'pickup'
                        ? 'max-h-[500px] opacity-100 mb-5'
                        : 'max-h-0 opacity-0 mb-0'
                    }`}
                  >
                    <div className="p-5 rounded-xl bg-background-100/70 border border-background-200/60">
                      <h4 className="text-xs font-semibold text-foreground-950 mb-4 flex items-center gap-2">
                        <span className="w-6 h-6 flex items-center justify-center rounded-full bg-primary-100 text-primary-600">
                          <i className="ri-information-line text-sm"></i>
                        </span>
                        {t('checkout.pickup_info_title')}
                      </h4>

                      <div className="flex items-start gap-3 mb-4">
                        <span className="w-8 h-8 flex items-center justify-center rounded-full bg-accent-100 text-accent-600 flex-shrink-0 mt-0.5">
                          <i className="ri-map-pin-line text-base"></i>
                        </span>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wider text-foreground-400 mb-2">
                            {t('checkout.pickup_address_title')}
                          </p>
                          <p className="text-sm font-semibold text-foreground-950">
                            {t('checkout.pickup_address_line1')}
                          </p>
                          <p className="text-sm text-foreground-600">{t('checkout.pickup_address_line2')}</p>
                          <p className="text-sm text-foreground-600">{t('checkout.pickup_address_line3')}</p>
                          <p className="text-sm text-foreground-600">{t('checkout.pickup_address_line4')}</p>
                        </div>
                      </div>

                      <p className="text-[11px] text-foreground-500 mb-4 flex items-center gap-1.5">
                        <span className="w-4 h-4 flex items-center justify-center text-foreground-400">
                          <i className="ri-time-line text-xs"></i>
                        </span>
                        {t('checkout.pickup_hours')}
                      </p>

                      <a
                        href="https://maps.app.goo.gl/hqSHLmm6UsavZVzM6"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-medium bg-background-200/70 text-foreground-700 hover:bg-background-300/60 hover:text-foreground-950 cursor-pointer whitespace-nowrap transition-all duration-200"
                      >
                        <span className="w-4 h-4 flex items-center justify-center">
                          <i className="ri-map-pin-2-line text-sm"></i>
                        </span>
                        {t('checkout.open_in_maps')}
                        <span className="w-3.5 h-3.5 flex items-center justify-center">
                          <i className="ri-arrow-right-up-line text-[11px]"></i>
                        </span>
                      </a>
                    </div>
                  </div>

                  {/* === PREFERRED DATE === */}
                  <div id="checkout-field-preferredDate" className="mb-5">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-foreground-400 mb-3">
                      {t('checkout.preferred_date')}
                    </h3>
                    <input
                      type="date"
                      value={customer.preferredDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={e => { onCustomerChange('preferredDate', e.target.value); if (validationErrors.preferredDate) setValidationErrors(prev => { const next = { ...prev }; delete next.preferredDate; return next; }); }}
                      className={`w-full px-3.5 py-2.5 bg-background-100 border rounded-lg text-sm text-foreground-950 focus:outline-none focus:ring-1 transition-all duration-200 cursor-pointer ${validationErrors.preferredDate ? 'border-red-400 focus:border-red-500 focus:ring-red-200/40' : 'border-background-200/70 focus:border-primary-300/60 focus:ring-primary-200/40'}`}
                    />
                    {validationErrors.preferredDate && (
                      <p className="text-[11px] text-red-500 mt-1.5 ml-0.5 flex items-center gap-1 animate-fadeIn">
                        <span className="w-3 h-3 flex items-center justify-center"><i className="ri-error-warning-line text-[10px]"></i></span>
                        {validationErrors.preferredDate}
                      </p>
                    )}
                  </div>

                  {/* === PREFERRED TIME === */}
                  <div id="checkout-field-preferredTime" className="mb-5">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-foreground-400 mb-3">
                      {t('checkout.preferred_time')}
                    </h3>
                    <div className="relative">
                      <select
                        value={customer.preferredTime}
                        onChange={e => { onCustomerChange('preferredTime', e.target.value); if (validationErrors.preferredTime) setValidationErrors(prev => { const next = { ...prev }; delete next.preferredTime; return next; }); }}
                        className={`w-full appearance-none bg-background-100 border rounded-lg pl-3.5 pr-10 py-2.5 text-sm text-foreground-950 cursor-pointer focus:outline-none focus:ring-1 transition-all duration-200 ${validationErrors.preferredTime ? 'border-red-400 focus:border-red-500 focus:ring-red-200/40' : 'border-background-200/70 focus:border-primary-300/60 focus:ring-primary-200/40'}`}
                      >
                        <option value="">{t('checkout.preferred_time_placeholder')}</option>
                        {TIME_SLOTS.map(slot => (
                          <option key={slot} value={slot}>{slot}</option>
                        ))}
                      </select>
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-foreground-400 pointer-events-none">
                        <i className="ri-arrow-down-s-line text-sm"></i>
                      </span>
                    </div>
                    {validationErrors.preferredTime && (
                      <p className="text-[11px] text-red-500 mt-1.5 ml-0.5 flex items-center gap-1 animate-fadeIn">
                        <span className="w-3 h-3 flex items-center justify-center"><i className="ri-error-warning-line text-[10px]"></i></span>
                        {validationErrors.preferredTime}
                      </p>
                    )}
                  </div>

                  {/* === CUSTOMER INFO === */}
                  <div className="mb-5">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-foreground-400 mb-3">
                      {t('checkout.customer_section')}
                    </h3>
                    <div className="space-y-3">
                      <div id="checkout-field-name">
                        <input
                          type="text"
                          placeholder={t('cart.customer_name_placeholder')}
                          value={customer.name}
                          onChange={e => {
                            onCustomerChange('name', e.target.value);
                            if (validationErrors.name) setValidationErrors(prev => { const next = { ...prev }; delete next.name; return next; });
                          }}
                          className={`w-full px-3.5 py-2.5 bg-background-100 border rounded-lg text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:ring-1 transition-all duration-200 ${
                            validationErrors.name
                              ? 'border-red-400 focus:border-red-500 focus:ring-red-200/40'
                              : 'border-background-200/70 focus:border-primary-300/60 focus:ring-primary-200/40'
                          }`}
                        />
                        {validationErrors.name && (
                          <p className="text-[11px] text-red-500 mt-1 ml-0.5 flex items-center gap-1 animate-fadeIn">
                            <span className="w-3 h-3 flex items-center justify-center"><i className="ri-error-warning-line text-[10px]"></i></span>
                            {validationErrors.name}
                          </p>
                        )}
                      </div>
                      <div id="checkout-field-phone">
                        <input
                          type="text"
                          placeholder={t('cart.customer_phone_placeholder')}
                          value={customer.phone}
                          onChange={e => {
                            onCustomerChange('phone', e.target.value);
                            if (validationErrors.phone) setValidationErrors(prev => { const next = { ...prev }; delete next.phone; return next; });
                          }}
                          className={`w-full px-3.5 py-2.5 bg-background-100 border rounded-lg text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:ring-1 transition-all duration-200 ${
                            validationErrors.phone
                              ? 'border-red-400 focus:border-red-500 focus:ring-red-200/40'
                              : 'border-background-200/70 focus:border-primary-300/60 focus:ring-primary-200/40'
                          }`}
                        />
                        {validationErrors.phone && (
                          <p className="text-[11px] text-red-500 mt-1 ml-0.5 flex items-center gap-1 animate-fadeIn">
                            <span className="w-3 h-3 flex items-center justify-center"><i className="ri-error-warning-line text-[10px]"></i></span>
                            {validationErrors.phone}
                          </p>
                        )}
                      </div>
                      <p className="text-[10px] text-foreground-400 mt-1">
                        {t('cart.customer_phone_hint')}
                      </p>
                      <input
                        type="email"
                        placeholder={t('checkout.customer_email_placeholder')}
                        value={customer.email}
                        onChange={e => onCustomerChange('email', e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-background-100 border border-background-200/70 rounded-lg text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300/60 focus:ring-1 focus:ring-primary-200/40 transition-all duration-200"
                      />
                      <input
                        type="text"
                        placeholder={t('cart.customer_business_placeholder')}
                        value={customer.business}
                        onChange={e => onCustomerChange('business', e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-background-100 border border-background-200/70 rounded-lg text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300/60 focus:ring-1 focus:ring-primary-200/40 transition-all duration-200"
                      />
                    </div>
                  </div>

                  {/* === ORDER NOTES === */}
                  <div className="mb-5">
                    <div className="flex items-center gap-1 mb-1.5">
                      <h3 className="text-xs font-medium text-foreground-400">
                        {t('cart.notes_title')}
                      </h3>
                      <span className="group relative w-3.5 h-3.5 flex items-center justify-center text-foreground-300 hover:text-foreground-500 cursor-help transition-colors duration-200">
                        <i className="ri-information-line text-[11px]"></i>
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-[220px] px-3 py-2 bg-foreground-800 text-background-50 rounded-lg text-[10px] leading-relaxed font-normal normal-case tracking-normal opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-20 whitespace-normal">
                          {t('cart.notes_tooltip')}
                          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground-800"></span>
                        </span>
                      </span>
                    </div>
                    <p className="text-[10px] text-foreground-400/70 leading-relaxed mb-2.5">
                      {t('cart.notes_helper')}
                    </p>
                    <textarea
                      placeholder={t('cart.notes_placeholder')}
                      value={customer.notes}
                      onChange={e => onCustomerChange('notes', e.target.value)}
                      rows={2}
                      maxLength={500}
                      className="w-full px-3.5 py-2.5 bg-background-100 border border-background-200/70 rounded-lg text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300/60 focus:ring-1 focus:ring-primary-200/40 transition-all duration-200 resize-none"
                    />
                    <p className="text-[10px] text-foreground-400 mt-1.5 text-right">
                      {customer.notes.length}/500
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-background-200/60 flex-shrink-0 space-y-3">
              {Object.keys(validationErrors).length > 0 && (
                <p className="text-xs text-red-500 text-center leading-relaxed flex items-center justify-center gap-1.5">
                  <span className="w-3.5 h-3.5 flex items-center justify-center">
                    <i className="ri-error-warning-line text-xs"></i>
                  </span>
                  {t('cart.validation_general')}
                </p>
              )}

              {!isEmpty && (
                <p className="text-[10px] text-foreground-400 text-center leading-relaxed px-2">
                  {t('cart.estimated_note')}
                </p>
              )}

              {/* ── Cloudflare Turnstile placeholder (hidden when disabled) ── */}
              <TurnstileWidget onTokenReceived={turnstile.onTokenReceived} />

              <button
                type="button"
                disabled={isEmpty || (isTurnstileEnabled() && !turnstile.verified)}
                onClick={handleSendOrder}
                className={`w-full py-3 rounded-full text-sm font-semibold cursor-pointer whitespace-nowrap transition-all duration-300 ${
                  isEmpty || (isTurnstileEnabled() && !turnstile.verified)
                    ? 'bg-background-200/70 text-foreground-400 cursor-not-allowed'
                    : 'bg-primary-500 text-background-50 hover:bg-primary-600 active:scale-[0.98]'
                }`}
              >
                {isEmpty ? (
                  t('cart.confirm_order')
                ) : (
                  <span className="inline-flex items-center gap-1 overflow-hidden">
                    <span>{t('cart.confirm_order')} · </span>
                    <RollingNumber value={formatPrice(estimatedTotal)} />
                  </span>
                )}
              </button>

              {!isEmpty && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (!validateOrder()) return;
                      setShowPreview(true);
                    }}
                    className="w-full py-3 rounded-full text-sm font-semibold cursor-pointer whitespace-nowrap transition-all duration-300 bg-background-100 text-foreground-700 border border-background-200/70 hover:bg-background-200/60 hover:text-foreground-950 active:scale-[0.98]"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="w-4 h-4 flex items-center justify-center">
                        <i className="ri-eye-line text-sm"></i>
                      </span>
                      {t('cart.preview_button')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(true)}
                    className="w-full py-2 text-xs text-foreground-400 hover:text-red-500 cursor-pointer whitespace-nowrap transition-colors duration-200"
                  >
                    {t('cart.clear')}
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* === LOAD ORDER CONFIRMATION DIALOG === */}
        {pendingOrderId !== null && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background-50/95 backdrop-blur-sm px-6 text-center"
            role="dialog"
            aria-modal="true"
            aria-label={t('cart.buy_again_dialog_title')}
          >
            <span className="w-14 h-14 flex items-center justify-center rounded-full bg-background-100 text-foreground-500 mb-5">
              <i className="ri-refresh-line text-2xl"></i>
            </span>
            <h3 className="text-lg font-heading font-semibold text-foreground-950 mb-2">
              {t('cart.buy_again_dialog_title')}
            </h3>
            <p className="text-sm text-foreground-500 mb-8 max-w-[260px] leading-relaxed">
              {t('cart.buy_again_dialog_text')}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingOrderId(null)}
                className="px-5 py-2.5 rounded-full text-sm font-medium text-foreground-600 bg-background-100 hover:bg-background-200/70 cursor-pointer whitespace-nowrap transition-all duration-200"
              >
                {t('cart.buy_again_cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onLoadOrder(pendingOrderId);
                  setPendingOrderId(null);
                }}
                className="px-5 py-2.5 rounded-full text-sm font-medium text-background-50 bg-primary-500 hover:bg-primary-600 cursor-pointer whitespace-nowrap transition-all duration-200 active:scale-[0.98]"
              >
                {t('cart.buy_again_load')}
              </button>
            </div>
          </div>
        )}

        {/* === ORDER HISTORY DETAIL MODAL === */}
        {viewOrder && (
          <div
            className="absolute inset-0 z-20 flex flex-col bg-background-50"
            role="dialog"
            aria-modal="true"
            aria-label={t('cart.order_history_detail_title')}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-background-200/60 flex-shrink-0">
              <h2 className="text-lg font-heading font-semibold text-foreground-950">
                {t('cart.order_history_detail_title')}
              </h2>
              <button
                type="button"
                onClick={() => setViewOrderId(null)}
                className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full text-foreground-400 hover:text-foreground-950 hover:bg-background-100 cursor-pointer whitespace-nowrap transition-all duration-200"
                aria-label={t('common.close')}
              >
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>

            {/* Modal body - itemized ticket */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              <div className="rounded-lg bg-background-100/50 border border-background-200/50 overflow-hidden">
                {/* Ticket header */}
                <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-dashed border-background-300/80">
                  <span className="w-7 h-7 flex items-center justify-center rounded-full bg-primary-100 text-primary-600 flex-shrink-0">
                    <i className="ri-file-list-3-line text-sm"></i>
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-950">
                      {t('cart.summary_title')}
                    </h3>
                    <p className="text-[10px] text-foreground-400 tabular-nums">{viewOrderDate}</p>
                  </div>
                </div>

                {/* Itemized lines */}
                <div className="px-4 py-3 border-b border-dashed border-background-300/80 space-y-2.5">
                  {viewOrder.items.map((item, idx) => {
                    const product = productMap.get(item.productId);
                    const prepLabel = PREPARATIONS.find(p => p.key === item.preparation)?.labelKey;
                    const pricePerKg = product ? extractPricePerKg(product.precio) : null;
                    const itemSubtotal = pricePerKg !== null ? pricePerKg * item.kg : null;
                    return (
                      <div key={`${item.productId}-${idx}`} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground-800 truncate">
                            {product ? pickLang(product, 'nombre', i18n.language) : item.productId}
                          </p>
                          <p className="text-[10px] text-foreground-400 tabular-nums">
                            {formatKg(item.kg)}
                            {pricePerKg !== null && ` × ${pricePerKg} ${t('cart.price_label')}`}
                            {prepLabel && ` · ${t(prepLabel as any)}`}
                          </p>
                          {item.note && (
                            <p className="text-[10px] text-foreground-400 italic mt-0.5 truncate">{item.note}</p>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-foreground-950 tabular-nums whitespace-nowrap flex-shrink-0">
                          {itemSubtotal !== null ? formatPrice(itemSubtotal) : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Totals block */}
                <div className="px-4 py-3 space-y-2 border-b border-dashed border-background-300/80">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground-500">
                      {t('checkout.delivery_method')}
                    </span>
                    <span className="text-sm font-semibold text-foreground-950 inline-flex items-center gap-1.5">
                      <i className={viewOrder.deliveryMethod === 'home' ? 'ri-truck-line' : 'ri-store-2-line'}></i>
                      {viewOrder.deliveryMethod === 'home' ? t('checkout.delivery_home') : t('checkout.delivery_pickup')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground-500">
                      {t('cart.summary_products')}
                    </span>
                    <span className="text-sm font-semibold text-foreground-950 tabular-nums">
                      {viewOrder.items.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground-500">
                      {t('cart.order_history_detail_weight')}
                    </span>
                    <span className="text-sm font-semibold text-foreground-950 tabular-nums">
                      {formatKg(viewOrderWeight)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground-500">
                      {t('cart.summary_subtotal')}
                    </span>
                    <span className="text-sm font-semibold text-foreground-950 tabular-nums">
                      {formatPrice(viewOrderSubtotal)}
                    </span>
                  </div>
                  {viewOrder.deliveryMethod === 'home' && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground-500">
                        {t('cart.summary_delivery_cost')}
                      </span>
                      <span className="text-sm font-semibold text-foreground-950 tabular-nums">
                        {formatPrice(viewOrderDeliveryCost)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Total */}
                <div className="flex items-center justify-between px-4 py-3 bg-background-200/30">
                  <span className="text-sm font-semibold text-foreground-950">
                    {t('cart.summary_estimated_total')}
                  </span>
                  <span className="text-base font-semibold text-foreground-950 whitespace-nowrap">
                    {formatPrice(viewOrderTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-5 py-4 border-t border-background-200/60 flex-shrink-0 space-y-2">
              <button
                type="button"
                onClick={() => {
                  const orderId = viewOrder.id;
                  setViewOrderId(null);
                  setPendingOrderId(orderId);
                }}
                className="w-full py-3 rounded-full text-sm font-semibold bg-primary-500 text-background-50 hover:bg-primary-600 cursor-pointer whitespace-nowrap transition-all duration-300 active:scale-[0.98]"
              >
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-refresh-line text-sm"></i>
                  </span>
                  {t('cart.order_history_reorder')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setViewOrderId(null)}
                className="w-full py-2 text-xs text-foreground-400 hover:text-foreground-600 cursor-pointer whitespace-nowrap transition-colors duration-200"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        )}

        {/* === PREVIEW MODAL === */}
        {showPreview && (
          <div
            className="absolute inset-0 z-10 flex flex-col bg-background-50"
            role="dialog"
            aria-modal="true"
            aria-label={t('cart.preview_title')}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-background-200/60 flex-shrink-0">
              <h2 className="text-lg font-heading font-semibold text-foreground-950">
                {t('cart.preview_title')}
              </h2>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="w-9 h-9 flex items-center justify-center rounded-full text-foreground-400 hover:text-foreground-950 hover:bg-background-100 cursor-pointer whitespace-nowrap transition-all duration-200"
                aria-label={t('common.close')}
              >
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>

            {/* Modal body - message preview */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              <div className="mb-4 p-3 rounded-lg bg-primary-50/40 border border-primary-200/50">
                <p className="text-xs text-foreground-500 flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 flex items-center justify-center text-primary-500">
                    <i className="ri-eye-line text-xs"></i>
                  </span>
                  {t('cart.preview_hint')}
                </p>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm text-foreground-950 leading-relaxed bg-background-100 border border-background-200/60 rounded-lg p-4 select-all">
                {generateWhatsAppMessage({
                  customer,
                  items,
                  totalProducts,
                  totalWeight,
                  subTotalAmount,
                  deliveryCost,
                  getProductName: (productId) => {
                    const product = productMap.get(productId);
                    return product ? pickLang(product, 'nombre', i18n.language) : productId;
                  },
                  getPreparationLabel: (prep) => t(`cart.prep_${prep}` as any),
                  productMap,
                })}
              </pre>
            </div>

            {/* Modal footer */}
            <div className="px-5 py-4 border-t border-background-200/60 flex-shrink-0 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowPreview(false);
                  handleSendOrder();
                }}
                disabled={isEmpty}
                className={`w-full py-3 rounded-full text-sm font-semibold cursor-pointer whitespace-nowrap transition-all duration-300 ${
                  isEmpty
                    ? 'bg-background-200/70 text-foreground-400 cursor-not-allowed'
                    : 'bg-emerald-500 text-background-50 hover:bg-emerald-600 active:scale-[0.98]'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-whatsapp-line text-sm"></i>
                  </span>
                  {t('cart.preview_send')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="w-full py-2 text-xs text-foreground-400 hover:text-foreground-600 cursor-pointer whitespace-nowrap transition-colors duration-200"
              >
                {t('cart.preview_back')}
              </button>
            </div>
          </div>
        )}

        {/* === ORDER CONFIRMED POPUP === */}
        {orderConfirmed && (
          <div
            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background-50 px-6 text-center"
            role="dialog"
            aria-modal="true"
            aria-label={t('cart.confirmation_title')}
          >
            <span className="w-14 h-14 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-5 animate-[scaleIn_0.3s_ease-out]">
              <i className="ri-checkbox-circle-line text-3xl"></i>
            </span>
            <h3 className="text-lg font-heading font-semibold text-foreground-950 mb-2">
              {t('cart.confirmation_title')}
            </h3>
            <p className="text-sm text-foreground-500 mb-8 max-w-[280px] leading-relaxed">
              {t('cart.confirmation_text')}
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2.5 rounded-full text-sm font-medium text-background-50 bg-primary-500 hover:bg-primary-600 cursor-pointer whitespace-nowrap transition-all duration-200 active:scale-[0.98]"
            >
              {t('cart.confirmation_close')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}