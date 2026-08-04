import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export function useLanguage() {
  const { i18n } = useTranslation();

  const currentLang = i18n.language?.startsWith('eu') ? 'eu' : 'es';

  const switchLanguage = useCallback((lang: string) => {
    i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
    localStorage.setItem('arrantza_lang', lang);
  }, [i18n]);

  const toggleLanguage = useCallback(() => {
    const next = currentLang === 'es' ? 'eu' : 'es';
    switchLanguage(next);
  }, [currentLang, switchLanguage]);

  return { currentLang, switchLanguage, toggleLanguage };
}