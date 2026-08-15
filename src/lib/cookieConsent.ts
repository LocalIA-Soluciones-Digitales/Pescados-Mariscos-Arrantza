const CONSENT_KEY = 'arrantza_cookie_consent';
const REOPEN_EVENT = 'arrantza:cookie-preferences-open';
const CHANGE_EVENT = 'arrantza:cookie-consent-change';

export interface CookieConsent {
  analytics: boolean;
  decidedAt: string;
}

export function getConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CookieConsent;
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent(): boolean {
  return getConsent()?.analytics === true;
}

export function setConsent(analytics: boolean): void {
  const value: CookieConsent = { analytics, decidedAt: new Date().toISOString() };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(value));
  } catch {
    // localStorage no disponible — el banner puede volver a aparecer en la próxima visita
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: value }));
}

// Permite reabrir el selector de cookies desde cualquier punto de la web
// (enlace "Preferencias de cookies" en el pie de página) sin duplicar el
// componente del banner.
export function openCookiePreferences(): void {
  window.dispatchEvent(new Event(REOPEN_EVENT));
}

export function onCookiePreferencesOpen(handler: () => void): () => void {
  window.addEventListener(REOPEN_EVENT, handler);
  return () => window.removeEventListener(REOPEN_EVENT, handler);
}

export function onCookieConsentChange(handler: (consent: CookieConsent) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<CookieConsent>).detail);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}
