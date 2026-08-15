import { useTranslation } from 'react-i18next';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

export default function About() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1, rootMargin: '0px 0px -80px 0px' });

  const pillars = [
    t('about.pillar1'),
    t('about.pillar2'),
    t('about.pillar3'),
    t('about.pillar4'),
    t('about.pillar5'),
  ];

  return (
    <section id="about" className="relative bg-background-50 overflow-hidden">
      <div ref={ref} className="container-wide">
        <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[500px] md:min-h-[700px] lg:min-h-[800px]">

          {/* ======== IMAGE SIDE ======== */}
          <div className={`relative h-[320px] sm:h-[420px] md:h-[560px] lg:h-auto overflow-hidden transition-all duration-900 ease-out ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
            {/* Main image */}
            <div className="absolute inset-0 lg:inset-4 xl:inset-8">
              <img
                src="https://ukhfaphloxlszomccgde.supabase.co/storage/v1/object/public/pescados-mariscos-arrantza/marketing/arrantza-story-02.jpg"
                alt="Manos de pescadero seleccionando pescado fresco en el mostrador"
                className="w-full h-full object-cover object-top"
              />
            </div>

            {/* Decorative accent block behind image */}
            <div className="absolute top-6 left-6 lg:top-12 lg:left-12 xl:top-16 xl:left-16 w-full h-full bg-accent-100/40 rounded-lg -z-10 hidden lg:block"></div>
          </div>

          {/* ======== CONTENT SIDE ======== */}
          <div className={`flex flex-col justify-center px-4 md:px-6 lg:px-12 xl:px-20 py-12 sm:py-16 md:py-20 lg:py-24 transition-all duration-800 ease-out delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            {/* Label */}
            <span className="section-label text-[10px] xs:text-xs uppercase tracking-[0.22em] text-foreground-400 mb-3 md:mb-4">
              {t('about.label')}
            </span>

            {/* Headline */}
            <h2 className="text-xl sm:text-2xl md:text-4xl lg:text-[2.5rem] xl:text-5xl font-heading font-semibold text-foreground-950 leading-[1.12] mb-6 md:mb-8 text-balance">
              {t('about.title')}
            </h2>

            {/* Body paragraphs */}
            <div className="space-y-4 md:space-y-5 text-sm md:text-base text-foreground-500 leading-relaxed max-w-lg">
              <p className={`transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '400ms' }}>
                {t('about.paragraph1')}
              </p>
              <p className={`transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '550ms' }}>
                {t('about.paragraph2')}
              </p>
              <p className={`transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '700ms' }}>
                {t('about.paragraph3')}
              </p>
            </div>

            {/* Pillar tags */}
            <div className={`flex flex-wrap gap-2 mt-8 md:mt-10 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '850ms' }}>
              {pillars.map((pillar, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 md:py-2 rounded-full bg-secondary-50 text-secondary-800 text-[11px] md:text-sm font-medium border border-secondary-200/60 whitespace-nowrap"
                >
                  <span className="w-1 h-1 rounded-full bg-secondary-400"></span>
                  {pillar}
                </span>
              ))}
            </div>

            {/* Stats row */}
            <div className={`grid grid-cols-3 gap-4 mt-10 md:mt-12 pt-8 md:pt-10 border-t border-foreground-100/50 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '1000ms' }}>
              <div>
                <span className="block text-xl sm:text-2xl md:text-3xl font-heading font-semibold text-foreground-950">40+</span>
                <span className="block text-[10px] md:text-xs text-foreground-400 mt-0.5 leading-tight">{t('about.stat1')}</span>
              </div>
              <div>
                <span className="block text-xl sm:text-2xl md:text-3xl font-heading font-semibold text-foreground-950">500+</span>
                <span className="block text-[10px] md:text-xs text-foreground-400 mt-0.5 leading-tight">{t('about.stat2')}</span>
              </div>
              <div>
                <span className="block text-xl sm:text-2xl md:text-3xl font-heading font-semibold text-foreground-950">5.0</span>
                <span className="block text-[10px] md:text-xs text-foreground-400 mt-0.5 leading-tight">{t('about.stat3')}</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}