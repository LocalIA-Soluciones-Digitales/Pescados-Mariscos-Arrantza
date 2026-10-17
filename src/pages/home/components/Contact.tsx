import { useTranslation } from 'react-i18next';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { logConversion } from '@/lib/visitLog';

export default function Contact() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation();

  return (
    <section id="contact" className="section-padding bg-background-100">
      <div ref={ref} className="container-narrow">
        <div className={`text-center mb-12 md:mb-16 lg:mb-20 transition-all duration-800 ease-out ${isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
          <span className="section-label">{t('contact.label')}</span>
          <h2 className="section-title">{t('contact.title')}</h2>
          <p className="section-subtitle mx-auto">{t('contact.subtitle')}</p>
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8 mb-12 md:mb-16 transition-all duration-800 ease-out ${isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
          {/* Phone */}
          <a
            href="tel:+34619609888"
            onClick={() => logConversion('tel_click')}
            className="group bg-background-50 rounded-lg p-6 sm:p-8 text-center hover:-translate-y-1 transition-all duration-500 cursor-pointer"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-4 sm:mb-5 flex items-center justify-center rounded-full bg-primary-100 text-primary-600 transition-colors duration-300 group-hover:bg-primary-200">
              <i className="ri-phone-line text-xl sm:text-2xl"></i>
            </div>
            <h4 className="font-heading text-base sm:text-lg font-semibold text-foreground-950 mb-2">
              {t('contact.phone.label')}
            </h4>
            <p className="text-lg sm:text-xl font-medium text-foreground-700">+34 619 60 98 88</p>
          </a>

          {/* Email */}
          <a
            href="mailto:d-tamayo@hotmail.com"
            className="group bg-background-50 rounded-lg p-6 sm:p-8 text-center hover:-translate-y-1 transition-all duration-500 cursor-pointer"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-4 sm:mb-5 flex items-center justify-center rounded-full bg-accent-100 text-accent-600 transition-colors duration-300 group-hover:bg-accent-200">
              <i className="ri-mail-line text-xl sm:text-2xl"></i>
            </div>
            <h4 className="font-heading text-base sm:text-lg font-semibold text-foreground-950 mb-2">
              {t('contact.email.label')}
            </h4>
            <p className="text-base sm:text-lg font-medium text-foreground-700">d-tamayo@hotmail.com</p>
          </a>
        </div>

      </div>
    </section>
  );
}
