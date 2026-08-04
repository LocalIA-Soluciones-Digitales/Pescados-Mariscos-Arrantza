import { useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

/* ------------------------------------------------------------------ */
/*  Data interface — designed so a non-technical owner can later       */
/*  update this from Google Sheets or any simple backend without      */
/*  touching the website code.                                        */
/* ------------------------------------------------------------------ */

type BadgeType = 'new' | 'available' | 'recommended' | 'seasonal';

interface FeaturedProduct {
  id: string;
  nameKey: string;
  image: string;
  badgeKey: BadgeType;
}

const featuredProducts: FeaturedProduct[] = [
  {
    id: 'lubina',
    nameKey: 'available.product1.name',
    image: 'https://readdy.ai/api/search-image?query=Whole%20fresh%20wild%20sea%20bass%20displayed%20on%20crushed%20ice%20at%20a%20traditional%20fish%20market%20counter%2C%20soft%20natural%20morning%20light%20from%20window%2C%20silver%20scales%20glistening%20with%20water%20droplets%2C%20shallow%20depth%20of%20field%2C%20editorial%20seafood%20photography%2C%20clean%20white%20marble%20surface%2C%20premium%20culinary%20aesthetic%2C%20minimal%20composition%20with%20neutral%20grey%20background&width=900&height=720&seq=available-lubina-v2&orientation=landscape',
    badgeKey: 'new',
  },
  {
    id: 'merluza',
    nameKey: 'available.product2.name',
    image: 'https://readdy.ai/api/search-image?query=Whole%20fresh%20hake%20fish%20from%20Cantabrian%20sea%20displayed%20on%20clean%20white%20marble%20counter%20with%20crushed%20ice%2C%20soft%20diffused%20natural%20daylight%2C%20white%20flesh%20visible%20through%20clean%20cut%2C%20editorial%20food%20photography%2C%20simple%20elegant%20composition%2C%20neutral%20tones%2C%20premium%20fishmonger%20display&width=900&height=720&seq=available-merluza-v2&orientation=landscape',
    badgeKey: 'recommended',
  },
  {
    id: 'rodaballo',
    nameKey: 'available.product3.name',
    image: 'https://readdy.ai/api/search-image?query=Whole%20fresh%20turbot%20with%20distinctive%20spotted%20dark%20skin%20laid%20on%20a%20clean%20light%20marble%20surface%2C%20natural%20window%20light%20from%20the%20side%20casting%20soft%20shadows%2C%20editorial%20seafood%20photography%2C%20premium%20fishmonger%20presentation%2C%20simple%20elegant%20composition%2C%20neutral%20grey-white%20tones%2C%20high%20detail%20on%20fish%20texture&width=900&height=720&seq=available-rodaballo-v2&orientation=landscape',
    badgeKey: 'seasonal',
  },
  {
    id: 'bonito',
    nameKey: 'available.product4.name',
    image: 'https://readdy.ai/api/search-image?query=Fresh%20northern%20bonito%20tuna%20steaks%20with%20rich%20red%20flesh%20displayed%20on%20clean%20white%20surface%20at%20traditional%20market%2C%20natural%20daylight%2C%20clean%20precise%20cuts%2C%20editorial%20food%20photography%2C%20minimal%20styling%2C%20simple%20background%2C%20water%20droplets%20on%20surface%2C%20premium%20quality%20seafood&width=900&height=720&seq=available-bonito-v2&orientation=landscape',
    badgeKey: 'new',
  },
  {
    id: 'besugo',
    nameKey: 'available.product5.name',
    image: 'https://readdy.ai/api/search-image?query=Whole%20fresh%20sea%20bream%20with%20pinkish%20silver%20skin%20displayed%20on%20crushed%20ice%20at%20fishmonger%20counter%2C%20soft%20morning%20natural%20light%2C%20editorial%20food%20photography%2C%20subtle%20ice%20crystal%20reflections%2C%20clean%20neutral%20background%2C%20elegant%20minimal%20seafood%20presentation%2C%20high%20detail%20on%20fish%20scales%20and%20eye%20clarity&width=900&height=720&seq=available-besugo-v2&orientation=landscape',
    badgeKey: 'available',
  },
  {
    id: 'rape',
    nameKey: 'available.product6.name',
    image: 'https://readdy.ai/api/search-image?query=Fresh%20monkfish%20tail%20fillets%20with%20white%20firm%20flesh%20displayed%20on%20clean%20marble%20surface%2C%20soft%20natural%20daylight%2C%20editorial%20seafood%20photography%2C%20simple%20elegant%20composition%2C%20neutral%20grey-white%20background%2C%20professional%20culinary%20presentation%2C%20clean%20cuts%20showing%20meat%20texture&width=900&height=720&seq=available-rape-v2&orientation=landscape',
    badgeKey: 'recommended',
  },
];

/* ------------------------------------------------------------------ */
/*  Badge style map — each type gets a subtle distinct accent         */
/* ------------------------------------------------------------------ */
const badgeStyles: Record<BadgeType, { dot: string; text: string; bg: string }> = {
  new: {
    dot: 'bg-accent-500',
    text: 'text-foreground-950',
    bg: 'bg-white/90',
  },
  available: {
    dot: 'bg-secondary-500',
    text: 'text-foreground-950',
    bg: 'bg-white/90',
  },
  recommended: {
    dot: 'bg-primary-500',
    text: 'text-foreground-950',
    bg: 'bg-white/90',
  },
  seasonal: {
    dot: 'bg-foreground-700',
    text: 'text-foreground-950',
    bg: 'bg-white/90',
  },
};

/* ------------------------------------------------------------------ */
/*  Carousel card component                                           */
/* ------------------------------------------------------------------ */
function ProductCard({
  product,
  didDragRef,
}: {
  product: FeaturedProduct;
  didDragRef: React.RefObject<boolean>;
}) {
  const { t } = useTranslation();
  const badgeKey = `available.badge.${product.badgeKey}`;

  const handleClick = (e: React.MouseEvent) => {
    if (didDragRef.current) {
      e.preventDefault();
    }
  };

  return (
    <Link
      to="/productos"
      onClick={handleClick}
      className="group flex-shrink-0 w-[260px] sm:w-[280px] cursor-pointer select-none rounded-lg overflow-hidden bg-background-50 border border-background-200/70 transition-all duration-500 ease-out hover:-translate-y-1 hover:border-background-300/80 block"
    >
      {/* Image container */}
      <div className="relative aspect-[4/5] overflow-hidden bg-background-100">
        <img
          src={product.image}
          alt={t(product.nameKey)}
          className="w-full h-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-105"
          draggable={false}
        />

        {/* Hover overlay — soft dark gradient + CTA */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-out flex items-end justify-center pb-8">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 text-foreground-950 text-sm font-medium whitespace-nowrap translate-y-2 group-hover:translate-y-0 transition-transform duration-400 ease-out">
            {t('available.hover_cta')}
            <i className="ri-arrow-right-line text-base"></i>
          </span>
        </div>

        {/* Premium badge */}
        <div className="absolute top-3 left-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-sm text-[11px] font-medium text-foreground-950 whitespace-nowrap shadow-sm">
            <span className={`w-1.5 h-1.5 rounded-full ${badgeStyles[product.badgeKey].dot}`}></span>
            {t(badgeKey)}
          </span>
        </div>
      </div>

      {/* Product name */}
      <div className="px-4 py-4">
        <h3 className="text-base md:text-lg font-heading font-semibold text-foreground-950 leading-tight">
          {t(product.nameKey)}
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
  }, [checkScrollLimits]);

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
            {featuredProducts.map((product) => (
              <div key={product.id} className="snap-start">
                <ProductCard product={product} didDragRef={didDragRef} />
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