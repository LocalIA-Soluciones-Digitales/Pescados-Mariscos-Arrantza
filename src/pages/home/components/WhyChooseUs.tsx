import { useTranslation } from 'react-i18next';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const reasons = [
  { key: 'item1', icon: 'ri-sun-line' },
  { key: 'item2', icon: 'ri-chat-3-line' },
  { key: 'item3', icon: 'ri-scales-line' },
  { key: 'item4', icon: 'ri-compass-line' },
  { key: 'item5', icon: 'ri-scissors-line' },
  { key: 'item6', icon: 'ri-heart-line' },
];

export default function WhyChooseUs() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="why" className="section-padding bg-background-50">
      <div ref={ref} className="container-wide">
        {/* Header */}
        <div className={`text-center mb-12 md:mb-16 lg:mb-20 transition-all duration-800 ease-out ${isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
          <span className="section-label">{t('why.label')}</span>
          <h2 className="section-title max-w-4xl mx-auto">{t('why.title')}</h2>
          <p className="section-subtitle mx-auto">{t('why.subtitle')}</p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 md:gap-10">
          {reasons.map((reason, i) => (
            <div
              key={reason.key}
              className="flex gap-4"
              style={{
                transitionDelay: isVisible ? `${i * 80}ms` : '0ms',
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0 flex items-center justify-center rounded-full bg-secondary-100 text-secondary-600 mt-0.5">
                <i className={`${reason.icon} text-base sm:text-lg`}></i>
              </div>
              <div>
                <h4 className="font-heading text-base sm:text-lg md:text-xl font-semibold text-foreground-950 mb-1.5 sm:mb-2">
                  {t(`why.${reason.key}.title`)}
                </h4>
                <p className="text-sm md:text-base text-foreground-400 leading-relaxed">
                  {t(`why.${reason.key}.desc`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}