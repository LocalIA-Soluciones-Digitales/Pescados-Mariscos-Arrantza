import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const galleryImages = [
  {
    src: 'https://ukhfaphloxlszomccgde.supabase.co/storage/v1/object/public/pescados-mariscos-arrantza/marketing/arrantza-gallery-01.jpg',
    alt: 'Pescado fresco sobre hielo en el mostrador',
  },
  {
    src: 'https://ukhfaphloxlszomccgde.supabase.co/storage/v1/object/public/pescados-mariscos-arrantza/marketing/arrantza-gallery-02.jpg',
    alt: 'Manos de pescadero fileteando pescado',
  },
  {
    src: 'https://ukhfaphloxlszomccgde.supabase.co/storage/v1/object/public/pescados-mariscos-arrantza/marketing/arrantza-gallery-03.jpg',
    alt: 'Marisco fresco sobre hielo',
  },
  {
    src: 'https://ukhfaphloxlszomccgde.supabase.co/storage/v1/object/public/pescados-mariscos-arrantza/marketing/arrantza-gallery-04.jpg',
    alt: 'Fachada de la pescadería Arrantza',
  },
  {
    src: 'https://ukhfaphloxlszomccgde.supabase.co/storage/v1/object/public/pescados-mariscos-arrantza/marketing/arrantza-gallery-05.jpg',
    alt: 'Anchoas frescas del Cantábrico',
  },
  {
    src: 'https://ukhfaphloxlszomccgde.supabase.co/storage/v1/object/public/pescados-mariscos-arrantza/marketing/arrantza-gallery-06.jpg',
    alt: 'Pescadero de Arrantza en el mostrador',
  },
];

export default function Gallery() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = 400;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  return (
    <section id="gallery" className="section-padding bg-background-100 overflow-hidden">
      <div ref={ref} className="container-wide">
        <div className={`text-center mb-12 md:mb-16 lg:mb-20 transition-all duration-800 ease-out ${isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
          <span className="section-label">{t('gallery.label')}</span>
          <h2 className="section-title">{t('gallery.title')}</h2>
        </div>
      </div>

      {/* Horizontal scroll gallery */}
      <div className={`relative transition-all duration-800 ease-out ${isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
        {/* Arrows — hidden on touch devices */}
        <div className="hidden md:flex absolute left-4 lg:left-6 top-1/2 -translate-y-1/2 z-10">
          <button
            onClick={() => scroll('left')}
            className="w-9 h-9 lg:w-10 lg:h-10 flex items-center justify-center rounded-full bg-background-50/90 text-foreground-950 hover:bg-background-50 transition-colors duration-300 cursor-pointer"
            aria-label="Previous"
          >
            <i className="ri-arrow-left-s-line text-lg lg:text-xl"></i>
          </button>
        </div>
        <div className="hidden md:flex absolute right-4 lg:right-6 top-1/2 -translate-y-1/2 z-10">
          <button
            onClick={() => scroll('right')}
            className="w-9 h-9 lg:w-10 lg:h-10 flex items-center justify-center rounded-full bg-background-50/90 text-foreground-950 hover:bg-background-50 transition-colors duration-300 cursor-pointer"
            aria-label="Next"
          >
            <i className="ri-arrow-right-s-line text-lg lg:text-xl"></i>
          </button>
        </div>

        {/* Scroll container */}
        <div
          ref={scrollRef}
          className="flex gap-4 px-4 md:px-12 overflow-x-auto scrollbar-hide snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {galleryImages.map((img, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-[82vw] sm:w-[320px] md:w-[420px] lg:w-[560px] snap-center"
            >
              <div className="aspect-[4/3] overflow-hidden rounded-lg">
                <img
                  src={img.src}
                  alt={img.alt}
                  title={img.alt}
                  className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                  loading={i > 1 ? 'lazy' : undefined}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}