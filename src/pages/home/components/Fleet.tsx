import { useTranslation } from 'react-i18next';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

export default function Fleet() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1, rootMargin: '0px 0px -80px 0px' });

  return (
    <section className="relative bg-background-50">
      <div
        ref={ref}
        className={`relative h-[380px] sm:h-[440px] md:h-[520px] lg:h-[600px] overflow-hidden transition-all duration-1000 ease-out ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}`}
      >
        <img
          src="https://ukhfaphloxlszomccgde.supabase.co/storage/v1/object/public/pescados-mariscos-arrantza/marketing/arrantza-gallery-07.png"
          alt="Flota de bajura del Cantábrico volviendo a puerto al atardecer"
          className="absolute inset-0 w-full h-full object-cover object-[center_60%]"
          loading="lazy"
        />

        {/* Gradient overlay for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        {/* Caption */}
        <div className="relative z-10 h-full flex items-end">
          <div className="container-wide w-full px-4 md:px-6 lg:px-12 pb-8 sm:pb-10 md:pb-14">
            <div
              className={`max-w-xl transition-all duration-800 ease-out delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
            >
              <span className="text-[10px] sm:text-xs md:text-sm uppercase tracking-[0.2em] text-accent-300 mb-2 sm:mb-3 inline-block">
                {t('fleet.label')}
              </span>
              <h3 className="font-heading text-xl sm:text-2xl md:text-3xl lg:text-4xl font-semibold text-background-50 leading-[1.2] text-balance">
                {t('fleet.title')}
              </h3>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
