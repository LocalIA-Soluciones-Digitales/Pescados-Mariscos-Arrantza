import { useTranslation } from 'react-i18next';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { logConversion } from '@/lib/visitLog';

export default function LocationMap() {
  const { t } = useTranslation();
  const weekdayTimes = t('location.hours.weekday.time').split(' · ');
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="location" className="section-padding bg-background-50">
      <div ref={ref} className="container-wide">
        <div className={`text-center mb-12 md:mb-16 lg:mb-20 transition-all duration-800 ease-out ${isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
          <span className="section-label">{t('location.label')}</span>
          <h2 className="section-title">{t('location.title')}</h2>
        </div>

        <div className={`grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8 md:gap-10 transition-all duration-800 ease-out ${isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
          {/* Info card */}
          <div className="lg:col-span-2 bg-background-100 rounded-lg p-6 sm:p-8 md:p-10">
            {/* Address */}
            <div className="mb-6 sm:mb-8">
              <div className="flex items-center gap-2 mb-2 sm:mb-4">
                <i className="ri-map-pin-line text-accent-500 text-lg"></i>
                <span className="text-[10px] sm:text-xs uppercase tracking-[0.15em] text-foreground-400 font-medium">
                  {t('location.label')}
                </span>
              </div>
              <p className="text-foreground-700 leading-relaxed text-sm md:text-base">
                {t('location.address')}
              </p>
            </div>

            {/* Hours */}
            <div className="mb-6 sm:mb-8">
              <div className="flex items-center gap-2 mb-2 sm:mb-4">
                <i className="ri-time-line text-accent-500 text-lg"></i>
                <span className="text-[10px] sm:text-xs uppercase tracking-[0.15em] text-foreground-400 font-medium">
                  {t('location.hours.title')}
                </span>
              </div>

              <div className="space-y-2 sm:space-y-4">
                <div className="flex flex-wrap justify-between items-start gap-x-2 gap-y-1">
                  <span className="text-sm text-foreground-400 whitespace-nowrap">{t('location.hours.monday')}</span>
                  <span className="text-sm font-medium text-foreground-400 text-right whitespace-nowrap">{t('location.hours.monday.time')}</span>
                </div>
                <div className="flex flex-wrap justify-between items-start gap-x-2 gap-y-1 pt-2 border-t border-foreground-100/50">
                  <span className="text-sm text-foreground-700 whitespace-nowrap">{t('location.hours.weekday')}</span>
                  <div className="flex flex-col items-end gap-1 sm:gap-2">
                    {weekdayTimes.map((time, i) => (
                      <span key={i} className="text-sm font-medium text-foreground-950 leading-snug whitespace-nowrap">
                        {time}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap justify-between items-start gap-x-2 gap-y-1">
                  <span className="text-sm text-foreground-700 whitespace-nowrap">{t('location.hours.sunday')}</span>
                  <span className="text-sm font-medium text-foreground-950 text-right whitespace-nowrap">{t('location.hours.sunday.time')}</span>
                </div>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-center justify-center">
              <a
                href="tel:+34608240759"
                onClick={() => logConversion('tel_click')}
                className="flex items-center justify-center gap-2 w-full sm:w-auto sm:min-w-[140px] bg-primary-500 text-background-50 px-3 py-2 rounded-full font-medium text-sm hover:bg-primary-600 transition-colors duration-300 whitespace-nowrap cursor-pointer"
              >
                <i className="ri-phone-line text-base"></i>
                {t('location.phone')}
              </a>
              <a
                href="https://maps.app.goo.gl/hqSHLmm6UsavZVzM6"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full sm:w-auto sm:min-w-[140px] border border-foreground-200 text-foreground-950 px-3 py-2 rounded-full font-medium text-sm hover:bg-foreground-50 transition-colors duration-300 whitespace-nowrap cursor-pointer"
              >
                <i className="ri-navigation-line text-base"></i>
                {t('location.directions')}
              </a>
            </div>
          </div>

          {/* Map */}
          <div className="lg:col-span-3 rounded-lg overflow-hidden h-[350px] sm:h-[400px] lg:h-auto min-h-[300px]">
            <iframe
              src="https://www.google.com/maps?q=Pescados+y+Mariscos+Arrantza,+Jesus+Aranburu+Kalea,+1,+48950+Altzaga,+Biscay&ftid=0xd4e5a88380885e5:0x34c6512b6d44913&output=embed"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Pescados y Mariscos Arrantza - Ubicación en Erandio"
              aria-label="Mapa de ubicación oficial de Pescados y Mariscos Arrantza en Erandio con información del negocio"
            ></iframe>
          </div>
        </div>
      </div>
    </section>
  );
}