import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/pages/home/components/Footer';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { useCart } from '@/hooks/useCart';
import type { CartItem } from '@/hooks/useCart';
import CartDrawer from '@/pages/productos/components/CartDrawer';
import { temporada } from '@/mocks/productos';
import { useProductos } from '@/hooks/useProductos';
import { useCartSound } from '@/hooks/useCartSound';
import { useHorizontalWheelScroll } from '@/hooks/useHorizontalWheelScroll';
import { logAddToCart, logCategoryView, logConversion, logProductView } from '@/lib/visitLog';
import { pickLang, normalizeSearch } from '@/types/producto';
import type { Producto } from '@/types/producto';

/* ------------------------------------------------------------------ */
/*  Category types                                                    */
/* ------------------------------------------------------------------ */
type CategoryFilter =
  | 'todos'
  | 'pescado'
  | 'especial'
  | 'raciones'
  | 'marisco'
  | 'azul'
  | 'blanco'
  | 'cefalopodos'
  | 'bivalvos'
  | 'crustaceos_grandes'
  | 'gambas_langostinos';

const categories: { key: CategoryFilter; labelKey: string }[] = [
  { key: 'todos', labelKey: 'products.filter_all' },
  { key: 'pescado', labelKey: 'products.filter_fish' },
  { key: 'especial', labelKey: 'products.filter_special' },
  { key: 'raciones', labelKey: 'products.filter_portions' },
  { key: 'marisco', labelKey: 'products.filter_seafood' },
  { key: 'azul', labelKey: 'products.filter_blue_fish' },
  { key: 'blanco', labelKey: 'products.filter_white_fish' },
  { key: 'cefalopodos', labelKey: 'products.filter_cephalopods' },
  { key: 'bivalvos', labelKey: 'products.filter_shellfish' },
  { key: 'crustaceos_grandes', labelKey: 'products.filter_large_crustaceans' },
  { key: 'gambas_langostinos', labelKey: 'products.filter_prawns_shrimp' },
];

/* ------------------------------------------------------------------ */
/*  Product counts per filter — computed from live Supabase data      */
/* ------------------------------------------------------------------ */
function computeCategoryCounts(productos: Producto[]): Record<CategoryFilter, number> {
  const counts: Partial<Record<CategoryFilter, number>> = {};
  const mainCats = ['pescado', 'especial', 'raciones', 'marisco'] as CategoryFilter[];

  counts.todos = productos.length;

  mainCats.forEach((cat) => {
    counts[cat] = productos.filter((p) => p.categoria === cat).length;
  });

  const subCats: CategoryFilter[] = [
    'azul',
    'blanco',
    'cefalopodos',
    'bivalvos',
    'crustaceos_grandes',
    'gambas_langostinos',
  ];

  subCats.forEach((sub) => {
    counts[sub] = productos.filter((p) => p.subcategoria === sub).length;
  });

  return counts as Record<CategoryFilter, number>;
}

/* ------------------------------------------------------------------ */
/*  Badge style map — muted elegant colors per badge type             */
/* ------------------------------------------------------------------ */
const badgeStyleMap: Record<Producto['estado'], { dot: string; bg: string; text: string }> = {
  available: {
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-100/80',
    text: 'text-emerald-700',
  },
  new: {
    dot: 'bg-sky-500',
    bg: 'bg-sky-100/80',
    text: 'text-sky-700',
  },
  premium: {
    dot: 'bg-amber-500',
    bg: 'bg-amber-100/80',
    text: 'text-amber-700',
  },
  seasonal: {
    dot: 'bg-orange-500',
    bg: 'bg-orange-100/80',
    text: 'text-orange-700',
  },
};

function getBadgeLabel(badge: Producto['estado']) {
  const map: Record<string, string> = {
    available: 'products.badge_available',
    seasonal: 'products.badge_seasonal',
    premium: 'products.badge_premium',
    new: 'products.badge_new',
  };
  return map[badge] || 'products.badge_available';
}

function formatKg(kg: number): string {
  return `${kg} kg`;
}

/* ------------------------------------------------------------------ */
/*  Subcategory display config — icon + i18n label key               */
/* ------------------------------------------------------------------ */
const subcategoryDisplay: Record<string, { labelKey: string; icon: string }> = {
  azul:               { labelKey: 'products.filter_blue_fish',        icon: 'ri-water-flash-line' },
  semigraso:          { labelKey: 'products.subcat_semigraso',        icon: 'ri-drop-line' },
  filetes_lomos:      { labelKey: 'products.subcat_filetes_lomos',    icon: 'ri-knife-line' },
  merluza_bakalao:    { labelKey: 'products.subcat_merluza_bakalao',  icon: 'ri-anchor-line' },
  roca:               { labelKey: 'products.subcat_roca',             icon: 'ri-landscape-line' },
  blanco:             { labelKey: 'products.filter_white_fish',       icon: 'ri-contrast-2-line' },
  cefalopodos:        { labelKey: 'products.filter_cephalopods',      icon: 'ri-bubble-chart-line' },
  bivalvos:           { labelKey: 'products.filter_shellfish',        icon: 'ri-archive-2-line' },
  crustaceos_grandes: { labelKey: 'products.filter_large_crustaceans', icon: 'ri-bug-line' },
  gambas_langostinos: { labelKey: 'products.filter_prawns_shrimp',     icon: 'ri-restaurant-line' },
  raciones_porcion:   { labelKey: 'products.subcat_raciones_porcion',  icon: 'ri-scales-line' },
  raciones_entero:    { labelKey: 'products.subcat_raciones_entero',   icon: 'ri-restaurant-2-line' },
};

/* ------------------------------------------------------------------ */
/*  Toast notification — centered, auto-dismisses, drawer-priority    */
/* ------------------------------------------------------------------ */
function AddToCartToast({
  product,
  visible,
  onDismiss,
  drawerOpen,
}: {
  product: Producto | null;
  visible: boolean;
  onDismiss: () => void;
  drawerOpen: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [dismissing, setDismissing] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any pending dismiss when a new product arrives (visible goes false→true)
  useEffect(() => {
    if (visible && dismissing) {
      setDismissing(false);
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Also cancel dismiss when product changes (rapid additions while toast is already visible)
  useEffect(() => {
    if (product && dismissing) {
      setDismissing(false);
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    }
  }, [product]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss immediately when cart drawer opens — cart has priority
  useEffect(() => {
    if (drawerOpen && visible && !dismissing) {
      setDismissing(true);
      dismissTimerRef.current = setTimeout(() => {
        onDismiss();
        setDismissing(false);
        dismissTimerRef.current = null;
      }, 250);
    }
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [drawerOpen, visible, dismissing, onDismiss]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  if (!product) return null;

  return (
    <div
      className="fixed top-20 md:top-28 right-4 left-auto translate-x-0 md:left-1/2 md:right-auto md:-translate-x-1/2 z-40 pointer-events-none"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto flex items-center gap-3 bg-background-50 border border-background-200/70 rounded-lg px-4 py-3 shadow-[0_4px_24px_rgba(0,0,0,0.06)] min-w-[260px] max-w-[340px] transition-all duration-[250ms] ease-out ${
          visible && !dismissing
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-2'
        }`}
      >
        {/* Product thumbnail */}
        <div className="w-10 h-10 rounded-md overflow-hidden bg-background-100 flex-shrink-0">
          <img
            src={product.imagen_url ?? ''}
            alt={pickLang(product, 'nombre', i18n.language)}
            className="w-full h-full object-cover object-top"
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground-950 truncate">
            {pickLang(product, 'nombre', i18n.language)}
          </p>
          <p className="text-xs text-foreground-400">
            {t('products.toast_added')}
          </p>
        </div>

        {/* Check circle */}
        <span className="w-6 h-6 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600 flex-shrink-0">
          <i className="ri-check-line text-sm"></i>
        </span>

        {/* Dismiss button */}
        <button
          type="button"
          onClick={onDismiss}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-background-200/80 text-foreground-400 hover:text-foreground-600 hover:bg-background-300/80 cursor-pointer whitespace-nowrap transition-colors"
          aria-label={t('common.close')}
        >
          <i className="ri-close-line text-[10px]"></i>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Compact Hero — just label, title, subtitle                        */
/* ------------------------------------------------------------------ */
function CompactHero() {
  const { t } = useTranslation();

  return (
    <section className="relative pt-28 md:pt-32 pb-8 md:pb-10 bg-background-50 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-background-100/40 to-transparent pointer-events-none" />
      <div className="relative container-wide px-4 md:px-6 lg:px-12">
        <div className="max-w-2xl mx-auto text-center">
          <span className="section-label animate-fade-in">{t('products.catalog_label')}</span>
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-heading font-semibold text-foreground-950 leading-[1.15] mb-2 animate-fade-up-1 opacity-0">
            {t('products.catalog_title')}
          </h1>
          <p className="text-sm md:text-base text-foreground-400 leading-relaxed animate-fade-up-2 opacity-0">
            {t('products.catalog_subtitle')}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Sticky catalogue toolbar — search + filters + cart icon           */
/* ------------------------------------------------------------------ */
function StickyToolbar({
  searchQuery,
  onSearchChange,
  activeCategory,
  onCategoryChange,
  cartCount,
  cartBounceKey,
  cartAnimStyle,
  onCartClick,
  filterCounts,
}: {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  activeCategory: CategoryFilter;
  onCategoryChange: (c: CategoryFilter) => void;
  cartCount: number;
  cartBounceKey: number;
  cartAnimStyle: 'bounce' | 'shake' | 'lastItem';
  onCartClick: () => void;
  filterCounts: Record<CategoryFilter, number>;
}) {
  const { t } = useTranslation();
  const categoriesScroll = useHorizontalWheelScroll<HTMLDivElement>();

  const hasActiveFilter = activeCategory !== 'todos' || searchQuery.trim().length > 0;

  const handleClearAll = () => {
    onCategoryChange('todos');
    onSearchChange('');
  };

  return (
    <div className="sticky top-16 md:top-20 z-30 bg-background-50/95 backdrop-blur-md border-b border-background-200/60">
      <div className="container-wide px-4 md:px-6 lg:px-12">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 py-3 md:py-4">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[220px] max-w-[360px]">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-foreground-400">
              <i className="ri-search-line text-sm"></i>
            </span>
            <input
              type="text"
              placeholder={t('products.search_placeholder')}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-8 py-2 bg-background-100 border border-background-200/70 rounded-full text-base md:text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40 transition-all duration-300"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-foreground-400 hover:text-foreground-600 cursor-pointer whitespace-nowrap transition-colors"
              >
                <i className="ri-close-line text-xs"></i>
              </button>
            )}
          </div>

          {/* Category filters + clear-all */}
          <div ref={categoriesScroll.ref} onWheel={categoriesScroll.onWheel} className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
            {categories.map((cat) => {
              const isActive = activeCategory === cat.key;
              const count = filterCounts[cat.key];
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => onCategoryChange(cat.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap cursor-pointer flex-shrink-0 transition-all duration-300 ${
                    isActive
                      ? 'bg-primary-500 text-background-50'
                      : 'bg-background-100 text-foreground-500 hover:text-foreground-950 hover:bg-background-200/70'
                  }`}
                >
                  {t(cat.labelKey)}
                  <span
                    className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-none ${
                      isActive
                        ? 'bg-background-50/20 text-background-50'
                        : 'bg-background-200/60 text-foreground-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}

            {/* Clear-all chip — appears when any filter/search is active */}
            {hasActiveFilter && (
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs md:text-sm font-medium whitespace-nowrap cursor-pointer flex-shrink-0 bg-accent-100 text-accent-700 hover:bg-accent-200/70 transition-all duration-300 animate-fade-in"
              >
                <span className="w-3.5 h-3.5 flex items-center justify-center">
                  <i className="ri-close-line text-xs"></i>
                </span>
                {t('products.clear_filters')}
              </button>
            )}
          </div>

          {/* Cart icon */}
          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            <div className="relative flex items-center justify-center">
              {/* Pulsing glow ring — only when cart has items */}
              {cartCount > 0 && (
                <span
                  className="absolute rounded-full bg-primary-500/10 animate-cart-glow-pulse pointer-events-none"
                  style={{ width: '44px', height: '44px' }}
                  aria-hidden="true"
                />
              )}
              <button
                key={cartBounceKey}
                type="button"
                onClick={onCartClick}
                className={`group/cart relative w-9 h-9 flex items-center justify-center rounded-full cursor-pointer whitespace-nowrap transition-all duration-500 ${
                  cartCount > 0
                    ? 'bg-primary-100/70 text-primary-600 scale-110'
                    : 'bg-background-100 text-foreground-500 hover:bg-background-200/70 hover:text-foreground-950 hover:shadow-[0_0_0_4px_rgba(var(--primary-500),0.06)]'
                } ${
                  cartAnimStyle === 'lastItem' ? 'animate-cart-last-item' :
                  cartAnimStyle === 'bounce' ? 'animate-cart-bounce' : 'animate-cart-shake'
                }`}
                aria-label={t('products.cart_label')}
              >
                <i className={`ri-shopping-cart-line transition-all duration-500 group-hover/cart:scale-110 group-hover/cart:rotate-[-4deg] ${
                  cartCount > 0 ? 'text-xl' : 'text-lg'
                }`}></i>
                <span
                  key={cartCount}
                  className={`absolute -top-0.5 -right-0.5 min-w-[20px] h-5 flex items-center justify-center rounded-full text-background-50 text-[10px] font-semibold leading-none px-1 transition-all duration-300 group-hover/cart:scale-110 group-hover/cart:-translate-y-0.5 group-hover/cart:shadow-md animate-counter-pop ${
                    cartAnimStyle === 'lastItem'
                      ? 'bg-red-500'
                      : 'bg-primary-500'
                  }`}
                >
                  {cartCount}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Active filters summary row — removable tags below toolbar         */
/* ------------------------------------------------------------------ */
function ActiveFiltersRow({
  activeCategory,
  searchQuery,
  resultCount,
  onClearCategory,
  onClearSearch,
}: {
  activeCategory: CategoryFilter;
  searchQuery: string;
  resultCount: number;
  onClearCategory: () => void;
  onClearSearch: () => void;
}) {
  const { t } = useTranslation();

  const categoryLabel =
    activeCategory !== 'todos'
      ? categories.find((c) => c.key === activeCategory)?.labelKey
      : null;

  if (!categoryLabel && !searchQuery.trim()) return null;

  return (
    <div className="bg-background-50 border-b border-background-200/40">
      <div className="container-wide px-4 md:px-6 lg:px-12 py-2 md:py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] md:text-xs font-medium text-foreground-400 uppercase tracking-wider mr-1">
            {t('products.active_filters_label')}
          </span>

          {categoryLabel && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-100/70 text-primary-700 text-[11px] md:text-xs font-medium">
              <span className="w-3 h-3 flex items-center justify-center">
                <i className="ri-filter-3-line text-[10px]"></i>
              </span>
              {t(categoryLabel)}
              <button
                type="button"
                onClick={onClearCategory}
                className="w-4 h-4 flex items-center justify-center rounded-full bg-primary-200/50 text-primary-600 hover:bg-primary-300/60 cursor-pointer whitespace-nowrap transition-colors"
                aria-label={t('products.remove_filter')}
              >
                <i className="ri-close-line text-[10px]"></i>
              </button>
            </span>
          )}

          {searchQuery.trim() && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-100 text-secondary-700 text-[11px] md:text-xs font-medium">
              <span className="w-3 h-3 flex items-center justify-center">
                <i className="ri-search-line text-[10px]"></i>
              </span>
              {searchQuery.trim()}
              <button
                type="button"
                onClick={onClearSearch}
                className="w-4 h-4 flex items-center justify-center rounded-full bg-secondary-200/50 text-secondary-600 hover:bg-secondary-300/60 cursor-pointer whitespace-nowrap transition-colors"
                aria-label={t('products.remove_search')}
              >
                <i className="ri-close-line text-[10px]"></i>
              </button>
            </span>
          )}

          <span className="text-[11px] md:text-xs text-foreground-400 ml-auto">
            {resultCount}{' '}
            {resultCount === 1
              ? t('products.result_single')
              : t('products.result_plural')}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Product card — refined                                            */
/* ------------------------------------------------------------------ */
function ProductCard({
  product,
  index,
  isInCart,
  cartItem,
  isRemoving,
  onAddToCart,
  onRemoveFromCart,
  onIncrease,
  onDecrease,
  onSetKg,
}: {
  product: Producto;
  index: number;
  isInCart: boolean;
  cartItem: CartItem | undefined;
  isRemoving: boolean;
  onAddToCart: (p: Producto) => void;
  onRemoveFromCart: (productId: string) => void;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onSetKg: (productId: string, kg: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.05, rootMargin: '0px 0px -40px 0px' });
  const badgeStyle = badgeStyleMap[product.estado];
  const agotado = !product.disponible;

  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [editWeightValue, setEditWeightValue] = useState('');

  const handleStartEditWeight = () => {
    if (!cartItem) return;
    setEditWeightValue(String(cartItem.kg));
    setIsEditingWeight(true);
  };

  const handleConfirmEditWeight = () => {
    const parsed = parseFloat(editWeightValue);
    if (!isNaN(parsed) && parsed >= 0.5) {
      const rounded = Math.max(0.5, Math.round(parsed * 2) / 2);
      onSetKg(product.id, rounded);
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

  // Se registra una vez por aparición en pantalla (useScrollAnimation deja
  // de observar tras el primer isVisible=true, así que esto no se repite).
  useEffect(() => {
    if (isVisible) logProductView(product.id);
  }, [isVisible, product.id]);

  return (
    <div
      ref={ref}
      className={`group bg-background-50 rounded-lg border border-background-200/70 overflow-hidden transition-all duration-500 ease-out hover:-translate-y-1 hover:border-background-300/80 ${
        isRemoving ? 'animate-card-remove' : ''
      } ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      {/* Image */}
      <div className="relative aspect-[5/4] overflow-hidden bg-background-100">
        <img
          src={product.imagen_url ?? ''}
          alt={pickLang(product, 'nombre', i18n.language)}
          className={`w-full h-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.03] ${agotado ? 'opacity-40 grayscale' : ''}`}
          loading="lazy"
        />

        {/* Color-coded badge — "agotado" takes priority over the highlight badge */}
        <div className="absolute top-2 left-2 md:top-4 md:left-4">
          {agotado ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 md:px-2.5 md:py-1 rounded-full bg-foreground-200/90 text-foreground-700 text-[10px] md:text-[11px] font-medium whitespace-nowrap">
              <span className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-foreground-500"></span>
              {t('products.badge_agotado')}
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 md:px-2.5 md:py-1 rounded-full ${badgeStyle.bg} ${badgeStyle.text} text-[10px] md:text-[11px] font-medium whitespace-nowrap`}>
              <span className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full ${badgeStyle.dot}`}></span>
              {t(getBadgeLabel(product.estado))}
            </span>
          )}
        </div>
      </div>

      {/* Info — cleaner, less text */}
      <div className="px-3 pt-3 pb-3 md:px-5 md:pt-5 md:pb-5">
        <h3 className="text-[13px] md:text-base font-heading font-semibold text-foreground-950 leading-tight mb-1 md:mb-2">
          {pickLang(product, 'nombre', i18n.language)}
        </h3>

        <p className="text-[10px] md:text-xs text-foreground-400 mb-3 md:mb-4">
          <span className="w-3 h-3 md:w-3.5 md:h-3.5 inline-flex items-center justify-center mr-0.5 md:mr-1 align-middle">
            <i className="ri-map-pin-line text-[9px] md:text-[10px]"></i>
          </span>
          {pickLang(product, 'origen', i18n.language)}
        </p>

        <div className="flex items-center justify-between gap-1 md:gap-4">
          <span className="text-[11px] md:text-lg font-semibold text-foreground-950 leading-none">
            {product.precio}
          </span>
          {agotado ? (
            <span className="inline-flex items-center px-2.5 py-2 md:px-4 md:py-2 rounded-full bg-background-200/60 text-foreground-400 text-[11px] md:text-xs font-medium whitespace-nowrap cursor-not-allowed">
              {t('products.badge_agotado')}
            </span>
          ) : !isInCart ? (
            <button
              type="button"
              onClick={() => onAddToCart(product)}
              className="inline-flex items-center gap-[2px] md:gap-1.5 rounded-full font-medium cursor-pointer whitespace-nowrap transition-all duration-300 active:scale-95 animate-added-pop max-w-full overflow-hidden bg-primary-500 text-background-50 hover:bg-primary-600 px-2.5 py-2 md:px-4 md:py-2 text-[11px] md:text-xs"
            >
              <span>{t('products.add_short')}</span>
            </button>
          ) : null}
        </div>

        {/* Quantity stepper — editable by text or ±0.5kg steps, shown once in cart */}
        {!agotado && isInCart && cartItem && (
          <div className="flex items-center justify-between gap-2 mt-2 animate-added-pop">
            <div className="flex items-center bg-background-100 rounded-full p-0.5">
              <button
                type="button"
                onClick={() => {
                  if (cartItem.kg <= 0.5) return;
                  onDecrease(product.id);
                }}
                disabled={cartItem.kg <= 0.5}
                className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                  cartItem.kg <= 0.5
                    ? 'text-foreground-300 cursor-not-allowed'
                    : 'text-foreground-600 hover:bg-background-200/70 hover:text-foreground-950 cursor-pointer'
                }`}
                aria-label="Reducir cantidad"
              >
                −
              </button>
              {isEditingWeight ? (
                <input
                  type="number"
                  value={editWeightValue}
                  onChange={(e) => setEditWeightValue(e.target.value)}
                  onBlur={handleConfirmEditWeight}
                  onKeyDown={handleWeightKeyDown}
                  step="0.5"
                  min="0.5"
                  autoFocus
                  inputMode="decimal"
                  className="w-[42px] text-center text-[11px] md:text-xs font-semibold text-foreground-950 bg-transparent border-0 outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none tabular-nums"
                  aria-label="Editar peso en kg"
                />
              ) : (
                <span
                  onClick={handleStartEditWeight}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleStartEditWeight(); } }}
                  className="min-w-[38px] text-center text-[11px] md:text-xs font-semibold text-foreground-950 tabular-nums cursor-pointer hover:text-primary-600 transition-colors duration-200 select-none inline-block"
                  title="Haz clic para editar el peso"
                  aria-label="Haz clic para editar el peso"
                >
                  {formatKg(cartItem.kg)}
                </span>
              )}
              <button
                type="button"
                onClick={() => onIncrease(product.id)}
                className="w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium text-foreground-600 hover:bg-background-200/70 hover:text-foreground-950 cursor-pointer whitespace-nowrap transition-all duration-200"
                aria-label="Aumentar cantidad"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={() => onRemoveFromCart(product.id)}
              className="w-6 h-6 flex items-center justify-center rounded-full text-foreground-400 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-all duration-200 flex-shrink-0"
              aria-label={t('products.remove_label')}
            >
              <i className="ri-close-line text-xs"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Catalog grid — supports optional subcategory grouping            */
/* ------------------------------------------------------------------ */

/** Subcategory display order for grouping (fish subcategories first) */
const subcategoryOrder: string[] = [
  'azul',
  'semigraso',
  'blanco',
  'cefalopodos',
  'filetes_lomos',
  'merluza_bakalao',
  'roca',
  'bivalvos',
  'crustaceos_grandes',
  'gambas_langostinos',
  'raciones_porcion',
  'raciones_entero',
];

function CatalogGrid({
  products,
  isInCart,
  getItem,
  onAddToCart,
  onRemoveFromCart,
  onIncrease,
  onDecrease,
  onSetKg,
  removingProductId,
  groupBy,
}: {
  products: Producto[];
  isInCart: (id: string) => boolean;
  getItem: (id: string) => CartItem | undefined;
  onAddToCart: (p: Producto) => void;
  onRemoveFromCart: (productId: string) => void;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onSetKg: (productId: string, kg: number) => void;
  removingProductId: string | null;
  groupBy?: 'subcategory';
}) {
  const { t } = useTranslation();

  if (products.length === 0) {
    return (
      <div className="text-center py-20 md:py-28">
        <span className="w-16 h-16 flex items-center justify-center mx-auto mb-5 rounded-full bg-background-100 text-foreground-400 text-2xl">
          <i className="ri-search-line"></i>
        </span>
        <p className="text-lg font-heading font-semibold text-foreground-600 mb-2">
          {t('products.no_results')}
        </p>
        <p className="text-sm text-foreground-400">
          {t('products.no_results_subtitle')}
        </p>
      </div>
    );
  }

  /* ---- Flat mode — no grouping ---- */
  if (!groupBy) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-4 md:gap-6 lg:gap-8">
        {products.map((product, idx) => (
          <ProductCard key={product.id} product={product} index={idx} isInCart={isInCart(product.id)} cartItem={getItem(product.id)} isRemoving={removingProductId === product.id} onAddToCart={onAddToCart} onRemoveFromCart={onRemoveFromCart} onIncrease={onIncrease} onDecrease={onDecrease} onSetKg={onSetKg} />
        ))}
      </div>
    );
  }

  /* ---- Grouped mode ---- */
  const grouped: Record<string, Producto[]> = {};
  const ungrouped: Producto[] = [];

  products.forEach((p) => {
    if (p.subcategoria) {
      if (!grouped[p.subcategoria]) grouped[p.subcategoria] = [];
      grouped[p.subcategoria].push(p);
    } else {
      ungrouped.push(p);
    }
  });

  // Sort group keys by defined order, then unknowns at the end
  const sortedKeys = Object.keys(grouped).sort((a, b) => {
    const ai = subcategoryOrder.indexOf(a);
    const bi = subcategoryOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  let globalIdx = 0;

  return (
    <div className="space-y-8 md:space-y-12">
      {sortedKeys.map((subKey) => {
        const items = grouped[subKey];
        const display = subcategoryDisplay[subKey];
        if (!items || items.length === 0) return null;

        const groupCards = (
          <div key={subKey} className="space-y-4">
            {/* Section header */}
            <div className="flex items-center gap-4 pb-2 border-b border-background-200/60">
              {display && (
                <span className="w-8 h-8 flex items-center justify-center rounded-full bg-primary-100/70 text-primary-600 flex-shrink-0">
                  <i className={`${display.icon} text-sm md:text-base`}></i>
                </span>
              )}
              <h3 className="text-sm md:text-base font-heading font-semibold text-foreground-950">
                {display ? t(display.labelKey) : subKey}
              </h3>
              <span className="text-[11px] md:text-xs text-foreground-400 ml-1">
                {items.length}
              </span>
            </div>

            {/* Product grid for this group */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-4 md:gap-6 lg:gap-8">
              {items.map((product) => {
                const idx = globalIdx++;
                return (
                  <ProductCard key={product.id} product={product} index={idx} isInCart={isInCart(product.id)} cartItem={getItem(product.id)} isRemoving={removingProductId === product.id} onAddToCart={onAddToCart} onRemoveFromCart={onRemoveFromCart} onIncrease={onIncrease} onDecrease={onDecrease} onSetKg={onSetKg} />
                );
              })}
            </div>
          </div>
        );

        return groupCards;
      })}

      {/* Ungrouped products (no subcategory) — shown at the end */}
      {ungrouped.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-4 md:gap-6 lg:gap-8">
            {ungrouped.map((product) => {
              const idx = globalIdx++;
              return (
                <ProductCard key={product.id} product={product} index={idx} isInCart={isInCart(product.id)} cartItem={getItem(product.id)} isRemoving={removingProductId === product.id} onAddToCart={onAddToCart} onRemoveFromCart={onRemoveFromCart} onIncrease={onIncrease} onDecrease={onDecrease} onSetKg={onSetKg} />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Seasonal calendar (unchanged)                                     */
/* ------------------------------------------------------------------ */
function SeasonalSection() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.05, rootMargin: '0px 0px -60px 0px' });

  const now = new Date();
  const month = now.getMonth();
  const currentSeasonId = month >= 2 && month <= 4 ? 'primavera' : month >= 5 && month <= 7 ? 'verano' : month >= 8 && month <= 10 ? 'otono' : 'invierno';

  return (
    <section id="temporada" className="bg-background-100/50">
      <div ref={ref} className="container-wide section-padding">
        <div className={`text-center mb-12 md:mb-16 transition-all duration-800 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <span className="section-label">{t('products.seasonal.title')}</span>
          <h2 className="section-title max-w-2xl mx-auto">{t('products.seasonal.section_title')}</h2>
          <p className="section-subtitle mx-auto">{t('products.seasonal.section_subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-[1100px] mx-auto">
          {temporada.map((season, idx) => (
            <div
              key={season.id}
              className={`relative bg-background-50 rounded-lg border p-6 md:p-8 text-center transition-all duration-500 ease-out hover:-translate-y-1 ${
                season.id === currentSeasonId
                  ? 'border-accent-400/40 shadow-[0_0_0_1px_rgba(var(--accent-400),0.15)]'
                  : 'border-background-200/70 hover:border-background-300/80'
              } ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
              style={{ transitionDelay: `${idx * 100}ms` }}
            >
              {season.id === currentSeasonId && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 bg-accent-500 text-background-50 rounded-full text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-background-50 animate-pulse"></span>
                  Ahora
                </span>
              )}

              <span className={`w-12 h-12 flex items-center justify-center mx-auto mb-4 rounded-full text-2xl ${
                season.id === currentSeasonId ? 'bg-accent-100 text-accent-600' : 'bg-secondary-100 text-secondary-500'
              }`}>
                <i className={season.icon}></i>
              </span>

              <p className="text-xs font-medium uppercase tracking-widest text-foreground-400 mb-2">
                {season.months}
              </p>

              <h3 className="text-lg md:text-xl font-heading font-semibold text-foreground-950 mb-4">
                {t(season.seasonKey)}
              </h3>

              <p className="text-sm text-foreground-500 leading-relaxed">
                {t(season.descKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Special orders section (unchanged)                                */
/* ------------------------------------------------------------------ */
function SpecialOrdersSection() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.05, rootMargin: '0px 0px -60px 0px' });

  return (
    <section id="encargos" className="relative bg-foreground-950 overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      <div ref={ref} className="container-wide section-padding relative z-10">
        <div className={`max-w-2xl mx-auto text-center transition-all duration-800 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <span className="section-label text-white/70">{t('products.special.title')}</span>
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-heading font-semibold text-background-50 leading-[1.15] mb-4 md:mb-6">
            {t('products.special.section_title')}
          </h2>
          <p className="text-base md:text-lg text-white leading-relaxed mb-8 md:mb-10">
            {t('products.special.section_subtitle')}
          </p>
          <a
            href="tel:+34608240759"
            onClick={() => logConversion('tel_click')}
            className="inline-flex items-center gap-3 px-8 py-4 bg-accent-500 text-background-50 rounded-full text-sm md:text-base font-semibold cursor-pointer whitespace-nowrap transition-all duration-300 hover:bg-accent-600 hover:scale-[1.03] active:scale-95 group"
          >
            <i className="ri-phone-line text-lg"></i>
            {t('products.special.cta')}
            <i className="ri-arrow-right-line text-base transition-transform duration-300 group-hover:translate-x-1"></i>
          </a>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Restaurant supply section (unchanged)                             */
/* ------------------------------------------------------------------ */
function RestaurantSupplySection() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.05, rootMargin: '0px 0px -60px 0px' });

  const details = [
    { icon: 'ri-truck-line', key: 'products.restaurant.detail1' },
    { icon: 'ri-award-line', key: 'products.restaurant.detail2' },
    { icon: 'ri-chat-smile-2-line', key: 'products.restaurant.detail3' },
    { icon: 'ri-hand-heart-line', key: 'products.restaurant.detail4' },
  ];

  return (
    <section id="hosteleria" className="bg-background-50">
      <div ref={ref} className="container-wide section-padding">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 md:gap-16 lg:gap-20 items-center max-w-[1200px] mx-auto">
          <div className={`rounded-lg overflow-hidden border border-background-200/70 aspect-[4/3] transition-all duration-800 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <img
              src="https://readdy.ai/api/search-image?query=Professional%20chef%20in%20white%20uniform%20inspecting%20fresh%20whole%20fish%20at%20a%20traditional%20fish%20market%20counter%20early%20morning%2C%20natural%20daylight%20from%20window%2C%20editorial%20documentary%20photography%2C%20candid%20moment%2C%20shallow%20depth%20of%20field%2C%20warm%20tones%2C%20premium%20culinary%20aesthetic%2C%20fishmonger%20working%20in%20background%2C%20clean%20marble%20surface%20with%20ice&width=1200&height=900&seq=cat-restaurant-supply-01&orientation=landscape"
              alt={t('products.restaurant.section_title')}
              className="w-full h-full object-cover"
            />
          </div>

          <div className={`transition-all duration-800 ease-out delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="section-label">{t('restaurant.label')}</span>
            <h2 className="section-title">{t('products.restaurant.section_title')}</h2>
            <p className="section-subtitle mb-8 md:mb-10">{t('products.restaurant.section_subtitle')}</p>

            <div className="space-y-4 mb-8 md:mb-10">
              {details.map((detail) => (
                <div key={detail.key} className="flex items-start gap-4">
                  <span className="w-10 h-10 flex items-center justify-center rounded-full bg-primary-100/70 text-primary-600 flex-shrink-0 mt-0">
                    <i className={`${detail.icon} text-lg`}></i>
                  </span>
                  <p className="text-sm md:text-base text-foreground-600 leading-relaxed pt-2">
                    {t(detail.key)}
                  </p>
                </div>
              ))}
            </div>

            <a
              href="tel:+34608240759"
              onClick={() => logConversion('tel_click')}
              className="inline-flex items-center gap-3 px-6 py-4 bg-primary-500 text-background-50 rounded-full text-sm font-medium cursor-pointer whitespace-nowrap transition-all duration-300 hover:bg-primary-600 group"
            >
              {t('products.restaurant.cta_new')}
              <i className="ri-arrow-right-line text-base transition-transform duration-300 group-hover:translate-x-1"></i>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                         */
/* ------------------------------------------------------------------ */
export default function Productos() {
  const { t, i18n } = useTranslation();
  const { productos, loading: productosLoading } = useProductos();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('buscar') ?? '');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('todos');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Deep link from other pages (e.g. home carousel) — land directly on the product
  useEffect(() => {
    if (searchParams.has('buscar')) {
      setSearchParams((prev) => {
        prev.delete('buscar');
        return prev;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ref for smooth-scrolling to catalogue grid on filter change
  const catalogSectionRef = useRef<HTMLDivElement>(null);
  // Skip the scroll-on-mount guard when a deep link already prefilled the search,
  // so the user lands directly on the matching product instead of at the top.
  const isFirstFilterChange = useRef(!searchQuery);

  // Smooth-scroll to catalogue grid when filter or search changes
  useEffect(() => {
    if (isFirstFilterChange.current) {
      isFirstFilterChange.current = false;
      return;
    }
    const el = catalogSectionRef.current;
    if (!el) return;

    // Only scroll if the grid is below the sticky header area
    const headerOffset = 140; // navbar (64) + toolbar (~56) + padding
    const elementTop = el.getBoundingClientRect().top;

    if (elementTop < headerOffset) {
      // Grid is already visible — don't scroll
      return;
    }

    const targetY =
      window.scrollY + elementTop - headerOffset + 1;

    window.scrollTo({ top: targetY, behavior: 'smooth' });
  }, [activeCategory, searchQuery]);

  // Floating cart FAB on mobile — appears when scrolled past sticky toolbar
  const toolbarSentinelRef = useRef<HTMLDivElement>(null);
  const [showFloatingCart, setShowFloatingCart] = useState(false);

  useEffect(() => {
    const sentinel = toolbarSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowFloatingCart(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: '-64px 0px 0px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const {
    items: cartItems,
    customer,
    addItem,
    removeItem,
    increaseKg,
    decreaseKg,
    setKg,
    clearCart,
    updateCustomer,
    isInCart,
    totalProducts,
    totalWeight,
    cartVersion,
    setPreparation,
    setItemNote,
    justAddedId,
    hasLastOrder,
    saveLastOrder,
    loadLastOrder,
    getItem,
  } = useCart();

  // Cart icon animation — trigger on every cart mutation (add, remove, quantity change)
  const [cartBounceKey, setCartBounceKey] = useState(0);
  const [cartAnimStyle, setCartAnimStyle] = useState<'bounce' | 'shake' | 'lastItem'>('bounce');
  const [lastItemRemoving, setLastItemRemoving] = useState(false);
  const prevVersionRef = useRef(cartVersion);
  const lastItemTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Card removal pulse — visual feedback when user clicks ×
  const [removingProductId, setRemovingProductId] = useState<string | null>(null);
  const removalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevVersionRef.current !== cartVersion) {
      // Don't override a last-item animation in progress
      if (lastItemRemoving) {
        prevVersionRef.current = cartVersion;
        return;
      }
      setCartBounceKey(k => k + 1);
      setCartAnimStyle(prev => (prev === 'bounce' ? 'shake' : 'bounce'));
      prevVersionRef.current = cartVersion;
    }
  }, [cartVersion, lastItemRemoving]);

  // Toast state
  const [toastProduct, setToastProduct] = useState<Producto | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const categoryCounts = useMemo(() => computeCategoryCounts(productos), [productos]);

  const filteredProducts = useMemo(() => {
    let result = productos;

    if (activeCategory !== 'todos') {
      const mainCategories = ['pescado', 'especial', 'raciones', 'marisco'];
      if (mainCategories.includes(activeCategory)) {
        result = result.filter(p => p.categoria === activeCategory);
      } else {
        result = result.filter(p => p.subcategoria === activeCategory);
      }
    }

    if (searchQuery.trim()) {
      const q = normalizeSearch(searchQuery.trim());
      result = result.filter(p => {
        const name = normalizeSearch(pickLang(p, 'nombre', i18n.language));
        const origen = normalizeSearch(pickLang(p, 'origen', i18n.language));
        return name.includes(q) || origen.includes(q);
      });
    }

    return result;
  }, [productos, activeCategory, searchQuery, i18n.language]);

  // Determine whether to group products by subcategory in the grid.
  // Group when viewing a main category that has subcategories, or when viewing "all".
  // Don't group when a specific subcategory filter is already active.
  const shouldGroupBySubcategory = useMemo(() => {
    if (searchQuery.trim()) return false; // no grouping when searching
    const subcategoryFilters: CategoryFilter[] = [
      'azul', 'blanco', 'cefalopodos',
      'bivalvos', 'crustaceos_grandes', 'gambas_langostinos',
    ];
    if (subcategoryFilters.includes(activeCategory)) return false;
    // group when: todos, pescado, marisco, raciones
    return activeCategory === 'todos'
      || activeCategory === 'pescado'
      || activeCategory === 'marisco'
      || activeCategory === 'raciones';
  }, [activeCategory, searchQuery]);

  const { playAddToCartSound, playUndoSound } = useCartSound();

  const handleAddToCart = useCallback(
    (product: Producto) => {
      addItem(product.id);
      logAddToCart(product.id);
      playAddToCartSound();

      // Show or update toast — never stack multiple notifications
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      setToastProduct(product);
      setToastVisible(true);
      toastTimerRef.current = setTimeout(() => {
        setToastVisible(false);
        toastTimerRef.current = null;
      }, 3000);
    },
    [addItem, playAddToCartSound],
  );

  const handleRemoveFromCart = useCallback(
    (productId: string) => {
      // Start card removal pulse animation immediately
      setRemovingProductId(productId);
      playUndoSound();

      // Last item check — trigger special cart animation + card pulse before removing
      if (totalProducts === 1 && !lastItemRemoving) {
        setLastItemRemoving(true);
        setCartBounceKey(k => k + 1);
        setCartAnimStyle('lastItem');
        lastItemTimerRef.current = setTimeout(() => {
          removeItem(productId);
          setLastItemRemoving(false);
          setRemovingProductId(null);
          lastItemTimerRef.current = null;
        }, 420);
        return;
      }
      // Clear any in-flight last-item animation (spam-click)
      if (lastItemTimerRef.current) {
        clearTimeout(lastItemTimerRef.current);
        lastItemTimerRef.current = null;
        setLastItemRemoving(false);
      }

      // Normal remove: wait for card pulse (300ms), then execute removal
      if (removalTimerRef.current) {
        clearTimeout(removalTimerRef.current);
      }
      removalTimerRef.current = setTimeout(() => {
        removeItem(productId);
        setRemovingProductId(null);
        removalTimerRef.current = null;
      }, 300);
    },
    [totalProducts, lastItemRemoving, removeItem, playUndoSound],
  );

  const handleIncreaseKg = useCallback(
    (productId: string) => {
      increaseKg(productId);
      playUndoSound();
    },
    [increaseKg, playUndoSound],
  );

  const handleDecreaseKg = useCallback(
    (productId: string) => {
      decreaseKg(productId);
      playUndoSound();
    },
    [decreaseKg, playUndoSound],
  );

  const handleRemoveItem = useCallback(
    (productId: string) => {
      removeItem(productId);
      playUndoSound();
    },
    [removeItem, playUndoSound],
  );

  const handleDismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToastVisible(false);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      if (lastItemTimerRef.current) {
        clearTimeout(lastItemTimerRef.current);
      }
      if (removalTimerRef.current) {
        clearTimeout(removalTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      <Navbar />
      <main>
        <CompactHero />
        <StickyToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeCategory={activeCategory}
          onCategoryChange={(cat) => {
            setActiveCategory(cat);
            if (cat !== 'todos') logCategoryView(cat);
          }}
          cartCount={totalProducts}
          cartBounceKey={cartBounceKey}
          cartAnimStyle={cartAnimStyle}
          onCartClick={() => setDrawerOpen(true)}
          filterCounts={categoryCounts}
        />

        {/* Sentinel — triggers floating cart FAB when scrolled past toolbar */}
        <div ref={toolbarSentinelRef} className="h-px" aria-hidden="true" />

        {/* Active filters summary */}
        <ActiveFiltersRow
          activeCategory={activeCategory}
          searchQuery={searchQuery}
          resultCount={filteredProducts.length}
          onClearCategory={() => setActiveCategory('todos')}
          onClearSearch={() => setSearchQuery('')}
        />

        {/* Catalog grid */}
        <section className="bg-background-50">
          <div ref={catalogSectionRef} className="container-wide px-4 md:px-6 lg:px-12 pt-4 md:pt-8 pb-16 md:pb-24">
            {filteredProducts.length > 0 && (
              <p className="text-xs text-foreground-400 mb-4 md:mb-8">
                {filteredProducts.length}{' '}
                {filteredProducts.length === 1
                  ? 'producto encontrado'
                  : 'productos encontrados'}
              </p>
            )}
            {productosLoading ? (
              <div className="text-center py-20 md:py-28 text-sm text-foreground-400">
                {t('products.loading')}
              </div>
            ) : (
              <CatalogGrid
                products={filteredProducts}
                isInCart={isInCart}
                getItem={getItem}
                onAddToCart={handleAddToCart}
                onRemoveFromCart={handleRemoveFromCart}
                onIncrease={handleIncreaseKg}
                onDecrease={handleDecreaseKg}
                onSetKg={setKg}
                removingProductId={removingProductId}
                groupBy={shouldGroupBySubcategory ? 'subcategory' : undefined}
              />
            )}
          </div>
        </section>

        <SeasonalSection />
        <SpecialOrdersSection />
        <RestaurantSupplySection />
      </main>
      <Footer />

      {/* Cart drawer */}
      <CartDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        productos={productos}
        items={cartItems}
        customer={customer}
        onIncrease={handleIncreaseKg}
        onDecrease={handleDecreaseKg}
        onSetKg={setKg}
        onRemove={handleRemoveItem}
        onClearCart={clearCart}
        onCustomerChange={updateCustomer}
        onPreparationChange={setPreparation}
        onNoteChange={setItemNote}
        totalProducts={totalProducts}
        totalWeight={totalWeight}
        justAddedId={justAddedId}
        hasLastOrder={hasLastOrder}
        onSaveLastOrder={saveLastOrder}
        onLoadLastOrder={loadLastOrder}
      />

      {/* Toast notification */}
      <AddToCartToast
        product={toastProduct}
        visible={toastVisible}
        onDismiss={handleDismissToast}
        drawerOpen={drawerOpen}
      />

      {/* Floating cart button — mobile only, appears when scrolled past toolbar */}
      <div
        className={`fixed bottom-6 right-4 z-40 md:hidden transition-all duration-400 ease-out ${
          showFloatingCart
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-4 scale-90 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="relative w-14 h-14 flex items-center justify-center rounded-full bg-primary-500 text-background-50 shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:bg-primary-600 hover:shadow-[0_6px_24px_rgba(0,0,0,0.2)] active:scale-95 cursor-pointer whitespace-nowrap transition-all duration-300"
          aria-label={t('products.cart_label')}
        >
          <i className="ri-shopping-cart-line text-xl"></i>
          {totalProducts > 0 && (
            <span
              key={totalProducts}
              className="absolute -top-1 -right-1 min-w-[22px] h-[22px] flex items-center justify-center rounded-full bg-accent-500 text-background-50 text-[11px] font-bold leading-none px-1.5 shadow-[0_2px_6px_rgba(0,0,0,0.2)] animate-counter-pop"
            >
              {totalProducts}
            </span>
          )}
        </button>
      </div>
    </>
  );
}