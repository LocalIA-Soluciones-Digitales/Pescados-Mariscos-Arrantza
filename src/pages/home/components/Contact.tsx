import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { logConversion } from '@/lib/visitLog';
import { submitNewsletter } from '@/lib/newsletterLog';

export default function Contact() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation();
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    // Honeypot check
    const honeypot = formData.get('company_alt');
    if (honeypot && String(honeypot).trim() !== '') {
      setStatus('success');
      form.reset();
      return;
    }

    setStatus('idle');
    setErrorMsg('');

    const email = String(formData.get('email') ?? '');
    const result = await submitNewsletter(email, i18n.language === 'eu' ? 'eu' : 'es');

    if (result.ok) {
      setAlreadySubscribed(result.alreadySubscribed);
      setStatus('success');
      form.reset();
    } else {
      setStatus('error');
      setErrorMsg(
        i18n.language === 'eu' ? 'Ezin izan da harpidetza gorde. Saiatu berriro.' : 'No se pudo guardar la suscripción. Inténtalo de nuevo.',
      );
    }
  };

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
            href="tel:+34608240759"
            onClick={() => logConversion('tel_click')}
            className="group bg-background-50 rounded-lg p-6 sm:p-8 text-center hover:-translate-y-1 transition-all duration-500 cursor-pointer"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-4 sm:mb-5 flex items-center justify-center rounded-full bg-primary-100 text-primary-600 transition-colors duration-300 group-hover:bg-primary-200">
              <i className="ri-phone-line text-xl sm:text-2xl"></i>
            </div>
            <h4 className="font-heading text-base sm:text-lg font-semibold text-foreground-950 mb-2">
              {t('contact.phone.label')}
            </h4>
            <p className="text-lg sm:text-xl font-medium text-foreground-700">+34 608 240 759</p>
          </a>

          {/* Email */}
          <a
            href="mailto:jonmendiola98@gmail.com"
            className="group bg-background-50 rounded-lg p-6 sm:p-8 text-center hover:-translate-y-1 transition-all duration-500 cursor-pointer"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-4 sm:mb-5 flex items-center justify-center rounded-full bg-accent-100 text-accent-600 transition-colors duration-300 group-hover:bg-accent-200">
              <i className="ri-mail-line text-xl sm:text-2xl"></i>
            </div>
            <h4 className="font-heading text-base sm:text-lg font-semibold text-foreground-950 mb-2">
              {t('contact.email.label')}
            </h4>
            <p className="text-base sm:text-lg font-medium text-foreground-700">jonmendiola98@gmail.com</p>
          </a>
        </div>

        {/* Newsletter */}
        <div className={`bg-background-50 rounded-lg p-6 sm:p-8 md:p-12 text-center max-w-xl mx-auto transition-all duration-800 ease-out ${isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
          <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-4 sm:mb-5 flex items-center justify-center rounded-full bg-secondary-100 text-secondary-600">
            <i className="ri-newspaper-line text-lg sm:text-xl"></i>
          </div>
          <h3 className="font-heading text-lg sm:text-xl md:text-2xl font-semibold text-foreground-950 mb-2">
            {t('contact.newsletter.title')}
          </h3>
          <p className="text-xs sm:text-sm text-foreground-400 mb-5 sm:mb-7">
            {t('contact.newsletter.subtitle')}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
            <input
              type="email"
              name="email"
              required
              placeholder={t('contact.newsletter.placeholder')}
              className="flex-1 min-w-0 px-4 sm:px-5 py-3 rounded-full border border-foreground-200 bg-transparent text-sm text-foreground-950 placeholder:text-foreground-300 focus:outline-none focus:border-accent-400 transition-colors duration-300"
            />
            {/* Honeypot */}
            <input
              type="text"
              name="company_alt"
              className="field-company_alt"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              readOnly
            />
            <button
              type="submit"
              className="px-6 sm:px-7 py-3 rounded-full bg-primary-500 text-background-50 font-medium text-sm hover:bg-primary-600 transition-colors duration-300 whitespace-nowrap cursor-pointer flex-shrink-0"
            >
              {t('contact.newsletter.button')}
            </button>
          </form>

          {/* Status messages */}
          {status === 'success' && (
            <p className="mt-4 text-sm text-accent-600">
              {alreadySubscribed
                ? i18n.language === 'eu'
                  ? 'Dagoeneko harpidetuta zaude. Eskerrik asko!'
                  : 'Ya estabas suscrito. ¡Gracias!'
                : i18n.language === 'eu'
                  ? 'Eskerrik asko! Zure harpidetza berretsi da.'
                  : '¡Gracias! Tu suscripción se ha confirmado.'}
            </p>
          )}
          {status === 'error' && (
            <p className="mt-4 text-sm text-red-500">{errorMsg}</p>
          )}
        </div>
      </div>
    </section>
  );
}