import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getConsent, setConsent, onCookiePreferencesOpen } from '@/lib/cookieConsent';

export default function CookieConsentBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!getConsent()) setVisible(true);
    return onCookiePreferencesOpen(() => setVisible(true));
  }, []);

  if (!visible) return null;

  const decide = (analytics: boolean) => {
    setConsent(analytics);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t('cookies.banner.title')}
      className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-5 flex justify-center"
    >
      <div className="w-full max-w-2xl bg-foreground-950 text-background-50 rounded-2xl shadow-xl px-5 py-5 sm:px-7 sm:py-6">
        <h2 className="text-sm font-heading font-semibold mb-1.5">{t('cookies.banner.title')}</h2>
        <p className="text-xs text-background-50/75 leading-relaxed mb-4">
          {t('cookies.banner.body')}{' '}
          <a href="/cookies" target="_blank" rel="noopener noreferrer" className="underline hover:text-background-50">
            {t('cookies.banner.more_info')}
          </a>
          .
        </p>
        <div className="flex flex-col sm:flex-row gap-2.5 sm:justify-end">
          <button
            type="button"
            onClick={() => decide(false)}
            className="px-5 py-2.5 rounded-full text-xs font-medium border border-background-50/30 text-background-50 hover:bg-background-50/10 transition-colors duration-200 cursor-pointer"
          >
            {t('cookies.banner.reject')}
          </button>
          <button
            type="button"
            onClick={() => decide(true)}
            className="px-5 py-2.5 rounded-full text-xs font-semibold bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors duration-200 cursor-pointer"
          >
            {t('cookies.banner.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
