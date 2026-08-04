import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const galleryImages = [
  {
    src: 'https://readdy.ai/api/search-image?query=Fresh%20whole%20fish%20displayed%20on%20crushed%20ice%20at%20traditional%20fish%20market%20counter%2C%20morning%20natural%20light%20from%20window%2C%20editorial%20still%20life%20photography%2C%20muted%20cool%20tones%2C%20texture%20of%20fish%20scales%20and%20melting%20ice%2C%20authentic%20market%20atmosphere%2C%20shallow%20depth%20of%20field&width=800&height=600&seq=arrantza-gallery-01&orientation=landscape',
    alt: 'Pescado fresco sobre hielo en el mostrador',
  },
  {
    src: 'https://readdy.ai/api/search-image?query=Fishmonger%20hands%20skillfully%20filleting%20a%20large%20fish%20with%20a%20sharp%20knife%20on%20wooden%20cutting%20board%2C%20close-up%20editorial%20shot%2C%20warm%20overhead%20light%2C%20artisan%20craftsmanship%2C%20motion%20blur%20on%20hands%2C%20professional%20kitchen%20aesthetic&width=800&height=600&seq=arrantza-gallery-02&orientation=landscape',
    alt: 'Manos de pescadero fileteando pescado',
  },
  {
    src: 'https://readdy.ai/api/search-image?query=Beautiful%20arrangement%20of%20fresh%20seafood%20including%20lobster%20prawns%20and%20shellfish%20on%20marble%20surface%20with%20ice%2C%20overhead%20editorial%20food%20photography%2C%20soft%20natural%20lighting%2C%20luxury%20culinary%20aesthetic%2C%20cool%20blue%20and%20white%20tones&width=800&height=600&seq=arrantza-gallery-03&orientation=landscape',
    alt: 'Marisco fresco sobre hielo',
  },
  {
    src: 'https://readdy.ai/api/search-image?query=Traditional%20Basque%20fish%20market%20storefront%20with%20wooden%20signage%20and%20fresh%20fish%20visible%20through%20glass%2C%20morning%20street%20scene%20in%20coastal%20town%2C%20warm%20golden%20light%2C%20authentic%20local%20business%20atmosphere%2C%20architectural%20photography&width=800&height=600&seq=arrantza-gallery-04&orientation=landscape',
    alt: 'Fachada de la pescadería Arrantza',
  },
  {
    src: 'https://readdy.ai/api/search-image?query=Close-up%20of%20fresh%20anchovies%20glistening%20on%20bed%20of%20crushed%20ice%20with%20sea%20salt%20crystals%2C%20editorial%20macro%20photography%2C%20silver%20blue%20fish%20texture%2C%20soft%20diffused%20lighting%2C%20minimalist%20composition%2C%20high%20contrast%20detail&width=800&height=600&seq=arrantza-gallery-05&orientation=landscape',
    alt: 'Anchoas frescas del Cantábrico',
  },
  {
    src: 'https://readdy.ai/api/search-image?query=Friendly%20experienced%20fishmonger%20smiling%20behind%20counter%20of%20traditional%20fish%20market%2C%20surrounded%20by%20fresh%20seafood%20display%2C%20warm%20interior%20lighting%2C%20authentic%20portrait%20photography%2C%20family%20business%20atmosphere%2C%20natural%20expression&width=800&height=600&seq=arrantza-gallery-06&orientation=landscape',
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