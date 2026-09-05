import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const GALLERY_BASE_URL = 'https://ukhfaphloxlszomccgde.supabase.co/storage/v1/object/public/pescados-mariscos-arrantza/marketing';

const galleryImages = [
  {
    src: `${GALLERY_BASE_URL}/arrantza-gallery-real-01.jpg`,
    alt: 'Mostrador de la pescadería Arrantza con pescado fresco sobre hielo',
    caption: 'Nuestro mostrador, con pescado fresco cada día',
  },
  {
    src: `${GALLERY_BASE_URL}/arrantza-gallery-real-02.jpg`,
    alt: 'Pescadero de Arrantza sonriendo en el mostrador',
    caption: 'El equipo de Arrantza, pasión por el oficio',
  },
  {
    src: `${GALLERY_BASE_URL}/arrantza-gallery-real-03.jpg`,
    alt: 'Selección de marisco y pescado fresco sobre sal',
    caption: 'Gambas, boquerones y pescado recién llegado de lonja',
  },
  {
    src: `${GALLERY_BASE_URL}/arrantza-gallery-real-04.jpg`,
    alt: 'Cesta variada de marisco fresco: bogavante, centollo, langostinos y percebes',
    caption: 'Selección de marisco: bogavante, centollo y percebes',
  },
  {
    src: `${GALLERY_BASE_URL}/arrantza-gallery-real-05.jpg`,
    alt: 'Pescado y carne fresca en el mostrador de Arrantza',
    caption: 'Variedad diaria de pescado y carne fresca',
  },
];

const REPEAT_COUNT = 3;
const MIDDLE_SET = 1;

const loopedImages = Array.from({ length: REPEAT_COUNT }, (_, setIndex) =>
  galleryImages.map((img, itemIndex) => ({ ...img, itemIndex, setIndex }))
).flat();

export default function Gallery() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const setStartRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = 400;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  // Carrusel infinito: se triplica el set de imágenes y, cuando el usuario
  // llega al set de los extremos, se recoloca el scroll al set central sin
  // animación (misma imagen en el mismo sitio), dando la sensación de que
  // no tiene ni principio ni fin.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const leftOf = (el: HTMLDivElement) =>
      el.getBoundingClientRect().left - container.getBoundingClientRect().left + container.scrollLeft;

    const middleStart = setStartRefs.current[MIDDLE_SET];
    if (middleStart) {
      container.scrollLeft = leftOf(middleStart);
    }

    let settleTimeout: ReturnType<typeof setTimeout>;
    const correctPosition = () => {
      const firstStart = setStartRefs.current[0];
      const midStart = setStartRefs.current[MIDDLE_SET];
      const lastStart = setStartRefs.current[REPEAT_COUNT - 1];
      if (!firstStart || !midStart || !lastStart) return;

      const midLeft = leftOf(midStart);
      const lastLeft = leftOf(lastStart);
      const setWidth = midLeft - leftOf(firstStart);
      if (setWidth <= 0) return;

      if (container.scrollLeft < midLeft) {
        container.scrollLeft += setWidth;
      } else if (container.scrollLeft >= lastLeft) {
        container.scrollLeft -= setWidth;
      }
    };

    const handleScroll = () => {
      clearTimeout(settleTimeout);
      settleTimeout = setTimeout(correctPosition, 120);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', correctPosition);
    return () => {
      clearTimeout(settleTimeout);
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', correctPosition);
    };
  }, []);

  const closeLightbox = () => setLightboxIndex(null);
  const showPrev = () => setLightboxIndex((i) => (i === null ? null : (i - 1 + galleryImages.length) % galleryImages.length));
  const showNext = () => setLightboxIndex((i) => (i === null ? null : (i + 1) % galleryImages.length));

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') showPrev();
      if (e.key === 'ArrowRight') showNext();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxIndex]);

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
          {loopedImages.map((img) => (
            <div
              key={`${img.setIndex}-${img.itemIndex}`}
              ref={img.itemIndex === 0 ? (el) => { setStartRefs.current[img.setIndex] = el; } : undefined}
              className="flex-shrink-0 w-[82vw] sm:w-[320px] md:w-[420px] lg:w-[560px] snap-center"
            >
              <button
                type="button"
                onClick={() => setLightboxIndex(img.itemIndex)}
                aria-label={`Ampliar: ${img.caption}`}
                className="group relative block w-full aspect-[4/3] overflow-hidden rounded-lg cursor-zoom-in"
              >
                <img
                  src={img.src}
                  alt={img.alt}
                  title={img.alt}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  loading={img.setIndex === MIDDLE_SET && img.itemIndex < 2 ? undefined : 'lazy'}
                />
                {/* Caption overlay */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground-950/80 via-foreground-950/25 to-transparent pt-10 pb-3 px-4">
                  <p className="text-background-50 text-xs sm:text-sm leading-snug">{img.caption}</p>
                </div>
                {/* Zoom hint icon */}
                <span className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-foreground-950/40 text-background-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <i className="ri-zoom-in-line text-base"></i>
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={galleryImages[lightboxIndex].caption}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground-950/90 backdrop-blur-sm p-4 animate-fade-up"
          onClick={closeLightbox}
        >
          <button
            type="button"
            onClick={closeLightbox}
            aria-label="Cerrar"
            className="absolute top-4 right-4 lg:top-6 lg:right-6 z-10 w-10 h-10 lg:w-11 lg:h-11 flex items-center justify-center rounded-full text-background-50/80 hover:text-background-50 hover:bg-background-50/10 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-2xl"></i>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              showPrev();
            }}
            aria-label="Anterior"
            className="absolute left-2 sm:left-4 lg:left-6 top-1/2 -translate-y-1/2 z-10 w-9 h-9 lg:w-11 lg:h-11 flex items-center justify-center rounded-full bg-background-50/10 text-background-50 hover:bg-background-50/20 transition-colors cursor-pointer"
          >
            <i className="ri-arrow-left-s-line text-xl lg:text-2xl"></i>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              showNext();
            }}
            aria-label="Siguiente"
            className="absolute right-2 sm:right-4 lg:right-6 top-1/2 -translate-y-1/2 z-10 w-9 h-9 lg:w-11 lg:h-11 flex items-center justify-center rounded-full bg-background-50/10 text-background-50 hover:bg-background-50/20 transition-colors cursor-pointer"
          >
            <i className="ri-arrow-right-s-line text-xl lg:text-2xl"></i>
          </button>

          <div
            className="relative max-w-5xl w-full max-h-[85vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={galleryImages[lightboxIndex].src}
              alt={galleryImages[lightboxIndex].alt}
              className="max-w-full max-h-[70vh] object-contain rounded-lg"
            />
            <p className="mt-4 text-center text-background-50 text-sm sm:text-base px-4">
              {galleryImages[lightboxIndex].caption}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
