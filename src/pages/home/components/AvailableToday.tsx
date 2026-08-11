import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { useProductosPublicos } from '@/hooks/useProductosPublicos';
import { pickLang } from '@/types/producto';
import type { Producto, ProductoEstado } from '@/types/producto';

/* ------------------------------------------------------------------ */
/*  The carousel shows whatever the fishmonger marks as "Destacado"   */
/*  in the admin panel (live from Supabase). If nothing is marked yet */
/*  it falls back to the most recently added available products, so   */
/*  the section never renders empty.                                  */
/* ------------------------------------------------------------------ */
const MAX_FEATURED = 6;

/* ------------------------------------------------------------------ */
/*  Badge style map — each estado gets a subtle distinct accent       */
/* ------------------------------------------------------------------ */
const badgeStyles: Record<ProductoEstado, { dot: string }> = {
  new: { dot: 'bg-accent-500' },
  available: { dot: 'bg-secondary-500' },
  premium: { dot: 'bg-primary-500' },
  seasonal: { dot: 'bg-foreground-700' },
};

const badgeLabelKeys: Record<ProductoEstado, string> = {
  available: 'products.badge_available',
  seasonal: 'products.badge_seasonal',
  premium: 'products.badge_premium',
  new: 'products.badge_new',
};

/* ------------------------------------------------------------------ */
/*  Carousel card component                                           */
/* ------------------------------------------------------------------ */
function ProductCard({
  producto,
  didDragRef,
}: {
  producto: Producto;
  didDragRef: React.RefObject<boolean>;
}) {
  const { t, i18n } = useTranslation();

  const handleClick = (e: React.MouseEvent) => {
    if (didDragRef.current) {
      e.preventDefault();
    }
  };

  const productName = pickLang(producto, 'nombre', i18n.language);

  return (
    <Link
      to={`/productos?producto=${encodeURIComponent(producto.id)}`}
      onClick={handleClick}
      className="group flex-shrink-0 w-[260px] sm:w-[280px] cursor-pointer select-none rounded-lg overflow-hidden bg-background-50 border border-background-200/70 transition-all duration-500 ease-out hover:-translate-y-1 hover:border-background-300/80 block"
    >
      {/* Image container */}
      <div className="relative aspect-[4/5] overflow-hidden bg-background-100">
        {producto.imagen_url && (
          <img
            src={producto.imagen_url}
            alt={productName}
            className="w-full h-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-105"
            draggable={false}
          />
        )}

        {/* Premium badge */}
        <div className="absolute top-3 left-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-sm text-[11px] font-medium text-foreground-950 whitespace-nowrap shadow-sm">
            <span className={`w-1.5 h-1.5 rounded-full ${badgeStyles[producto.estado].dot}`}></span>
            {t(badgeLabelKeys[producto.estado])}
          </span>
        </div>
      </div>

      {/* Product name */}
      <div className="px-4 py-4">
        <h3 className="text-base md:text-lg font-heading font-semibold text-foreground-950 leading-tight">
          {productName}
        </h3>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Main section                                                      */
/* ------------------------------------------------------------------ */
export default function AvailableToday() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.05, rootMargin: '0px 0px -80px 0px' });
  const { productos, loading } = useProductosPublicos();

  const featuredProducts = useMemo(() => {
    const destacados = productos.filter((p) => p.destacado && p.disponible);
    const source = destacados.length > 0 ? destacados : productos.filter((p) => p.disponible);
    return source.slice(0, MAX_FEATURED);
  }, [productos]);

  /* ---- Carousel state ---- */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const scrollStartX = useRef(0);
  const didDragRef = useRef(false);

  /* Check scroll limits to toggle arrow visibility */
  const checkScrollLimits = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScrollLimits();
    el.addEventListener('scroll', checkScrollLimits, { passive: true });
    return () => el.removeEventListener('scroll', checkScrollLimits);
  }, [checkScrollLimits, featuredProducts.length]);

  /* ---- Scroll by one card ---- */
  const scrollBy = useCallback((direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const firstCard = el.firstElementChild;
    const cardWidth = firstCard ? firstCard.clientWidth : 280;
    const gap = 24;
    const amount = cardWidth + gap;
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  }, []);

  /* ---- Drag / swipe handling ---- */
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    didDragRef.current = false;
    setIsDragging(true);
    dragStartX.current = e.clientX;
    scrollStartX.current = el.scrollLeft;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = 'grabbing';
    el.style.scrollBehavior = 'auto';
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = e.clientX - dragStartX.current;
    if (Math.abs(dx) > 4) {
      didDragRef.current = true;
    }
    el.scrollLeft = scrollStartX.current - dx;
  }, [isDragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false);
    const el = scrollRef.current;
    if (!el) return;
    el.releasePointerCapture(e.pointerId);
    el.style.cursor = '';
    el.style.scrollBehavior = '';
  }, []);

  if (!loading && featuredProducts.length === 0) return null;

  return (
    <section id="available" className="relative bg-background-50 overflow-hidden">
      <div ref={ref} className="container-wide section-padding">
        {/* Header */}
        <div
          className={`text-center mb-12 md:mb-16 transition-all duration-800 ease-out ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <span className="section-label">{t('available.label')}</span>
          <h2 className="section-title max-w-2xl mx-auto">{t('available.title')}</h2>
          <p className="section-subtitle mx-auto max-w-xl">{t('available.subtitle')}</p>
        </div>

        {/* Carousel */}
        <div
          className={`relative transition-all duration-800 ease-out delay-150 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}
        >
          {/* Left arrow */}
          <button
            type="button"
            onClick={() => scrollBy('left')}
            className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-white/90 border border-background-200/70 text-foreground-700 cursor-pointer whitespace-nowrap transition-all duration-300 hover:bg-white hover:text-foreground-950 hover:border-background-300/80 -translate-x-3 md:-translate-x-5 ${
              canScrollLeft ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
            aria-label={t('available.carousel.prev')}
          >
            <i className="ri-arrow-left-s-line text-xl"></i>
          </button>

          {/* Scrollable track */}
          <div
            ref={scrollRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onScroll={checkScrollLimits}
            className="flex gap-6 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-2 -mx-2 py-2"
          >
            {featuredProducts.map((producto) => (
              <div key={producto.id} className="snap-start">
                <ProductCard producto={producto} didDragRef={didDragRef} />
              </div>
            ))}
          </div>

          {/* Right arrow */}
          <button
            type="button"
            onClick={() => scrollBy('right')}
            className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-white/90 border border-background-200/70 text-foreground-700 cursor-pointer whitespace-nowrap transition-all duration-300 hover:bg-white hover:text-foreground-950 hover:border-background-300/80 translate-x-3 md:translate-x-5 ${
              canScrollRight ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
            aria-label={t('available.carousel.next')}
          >
            <i className="ri-arrow-right-s-line text-xl"></i>
          </button>
        </div>

        {/* CTA */}
        <div
          className={`mt-14 md:mt-18 text-center transition-all duration-800 ease-out delay-300 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <Link
            to="/productos"
            className="inline-flex items-center gap-3 px-8 py-3.5 bg-primary-500 text-background-50 rounded-full text-sm font-medium cursor-pointer whitespace-nowrap transition-all duration-300 hover:bg-primary-600 group"
          >
            {t('available.catalog_cta')}
            <i className="ri-arrow-right-line text-base transition-transform duration-300 group-hover:translate-x-1"></i>
          </Link>
        </div>
      </div>
    </section>
  );
}
