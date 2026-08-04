import { useTranslation } from 'react-i18next';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const steps = [
  { icon: 'ri-anchor-line', number: '01', titleKey: 'process.step1.title', descKey: 'process.step1.desc' },
  { icon: 'ri-knife-line', number: '02', titleKey: 'process.step2.title', descKey: 'process.step2.desc' },
  { icon: 'ri-bowl-line', number: '03', titleKey: 'process.step3.title', descKey: 'process.step3.desc' },
];

export default function Process() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  return (
    <section className="relative bg-background-50 overflow-hidden">
      <div ref={ref} className="container-wide section-padding">
        {/* Header */}
        <div className="text-center mb-12 md:mb-16 lg:mb-24">
          <span className="section-label">{t('process.label')}</span>
          <h2 className="section-title max-w-2xl mx-auto">{t('process.title')}</h2>
        </div>

        {/* Timeline container */}
        <div className="relative max-w-5xl mx-auto">
          {/* Horizontal connecting line — desktop only */}
          <div
            className={`absolute hidden lg:block top-8 left-[calc(16.667%-2rem)] right-[calc(16.667%-2rem)] h-px transition-all duration-1000 ease-out ${isVisible ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'}`}
            style={{ transformOrigin: 'left center' }}
          >
            <div className="w-full h-full bg-gradient-to-r from-accent-300/50 via-foreground-200/40 to-accent-300/50"></div>
          </div>

          {/* Steps grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 md:gap-10 lg:gap-0">
            {steps.map((step, idx) => (
              <div
                key={step.number}
                className={`relative flex lg:flex-col items-start lg:items-center gap-4 lg:gap-0 transition-all duration-800 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-14'}`}
                style={{ transitionDelay: `${200 + idx * 200}ms` }}
              >
                {/* Icon circle — sits on the timeline */}
                <div className="relative z-10 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-background-50 border-2 border-accent-200 flex items-center justify-center flex-shrink-0 shadow-[0_0_0_8px_oklch(var(--background-50))]">
                  <span className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-accent-600">
                    <i className={`${step.icon} text-lg sm:text-xl`}></i>
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 lg:text-center lg:mt-8 lg:px-4">
                  {/* Large faint number */}
                  <span className="block text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-heading font-bold text-foreground-100/30 leading-none mb-1 lg:mb-0 select-none">
                    {step.number}
                  </span>

                  {/* Title */}
                  <h3 className="text-sm sm:text-base md:text-lg font-semibold text-foreground-950 mb-1.5 lg:mb-2 lg:mt-2">
                    {t(step.titleKey)}
                  </h3>

                  {/* Description */}
                  <p className="text-sm md:text-base text-foreground-500 leading-relaxed max-w-xs lg:mx-auto">
                    {t(step.descKey)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}