import { supabase, SITE_KEY } from './supabaseClient';
import { hasAnalyticsConsent } from './cookieConsent';

export type EventType = 'pageview' | 'tel_click' | 'whatsapp_click' | 'category_view' | 'product_view' | 'add_to_cart';
export type SourceCategory = 'google_ads' | 'google_organic' | 'social' | 'referral' | 'direct' | 'other';
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface VisitEntry {
  id: string;
  session_id: string;
  event_type: EventType;
  path: string;
  label: string | null;
  referrer: string | null;
  source_category: SourceCategory;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  device_type: DeviceType | null;
  is_returning: boolean;
  created_at: string;
}

const SESSION_KEY = 'pmz_session_id';
const SOURCE_KEY = 'pmz_source';
const VISITOR_KEY = 'pmz_visitor_id';
const RETURNING_KEY = 'pmz_is_returning';

const AD_MEDIUMS = ['cpc', 'ppc', 'paid', 'ads'];
const SOCIAL_HOSTS = ['facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com'];

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function detectDeviceType(): DeviceType {
  const ua = navigator.userAgent;
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod/i.test(ua)) return 'mobile';
  return 'desktop';
}

// Identificador anónimo y persistente (sin datos personales) solo para
// distinguir visitantes nuevos de recurrentes entre sesiones distintas.
function isReturningVisitor(): boolean {
  const cached = sessionStorage.getItem(RETURNING_KEY);
  if (cached !== null) return cached === '1';

  const hadVisitorId = !!localStorage.getItem(VISITOR_KEY);
  if (!hadVisitorId) {
    localStorage.setItem(VISITOR_KEY, crypto.randomUUID());
  }
  sessionStorage.setItem(RETURNING_KEY, hadVisitorId ? '1' : '0');
  return hadVisitorId;
}

interface Attribution {
  source_category: SourceCategory;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
}

function classify(utmSource: string | null, utmMedium: string | null, referrer: string | null): SourceCategory {
  const medium = utmMedium?.toLowerCase() ?? '';
  if (utmSource?.toLowerCase().includes('google') && AD_MEDIUMS.includes(medium)) return 'google_ads';
  if (!referrer) return utmSource ? 'other' : 'direct';

  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    if (host === window.location.hostname) return 'direct';
    if (host.includes('google.')) return 'google_organic';
    if (SOCIAL_HOSTS.some((s) => host.includes(s))) return 'social';
    return 'referral';
  } catch {
    return 'other';
  }
}

// Atribución "first touch": se calcula una vez por sesión (o cuando llegan
// nuevos utm_*) y se reutiliza para el resto de la navegación de esa visita.
function getAttribution(): Attribution {
  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get('utm_source');
  const stored = sessionStorage.getItem(SOURCE_KEY);

  if (stored && !utmSource) {
    return JSON.parse(stored) as Attribution;
  }

  const utm_medium = params.get('utm_medium');
  const utm_campaign = params.get('utm_campaign');
  const referrer = document.referrer || null;
  const attribution: Attribution = {
    source_category: classify(utmSource, utm_medium, referrer),
    utm_source: utmSource,
    utm_medium,
    utm_campaign,
    referrer,
  };
  sessionStorage.setItem(SOURCE_KEY, JSON.stringify(attribution));
  return attribution;
}

async function insertEvent(eventType: EventType, path: string, label?: string) {
  // Analítica propia (páginas vistas, clics, productos vistos...) requiere
  // consentimiento previo del usuario (banner de cookies) — sin él, no se
  // escribe nada en sessionStorage/localStorage ni se llama a Supabase.
  if (!hasAnalyticsConsent()) return;

  const attribution = getAttribution();
  try {
    await supabase.rpc('registrar_visita', {
      p_site_key: SITE_KEY,
      p_session_id: getSessionId(),
      p_event_type: eventType,
      p_path: path,
      p_label: label ?? null,
      p_referrer: attribution.referrer,
      p_source_category: attribution.source_category,
      p_utm_source: attribution.utm_source,
      p_utm_medium: attribution.utm_medium,
      p_utm_campaign: attribution.utm_campaign,
      p_device_type: detectDeviceType(),
      p_is_returning: isReturningVisitor(),
    });
  } catch {
    // El registro de visitas nunca debe interrumpir la navegación del usuario.
  }
}

export function logPageview(path: string) {
  void insertEvent('pageview', path);
}

export function logConversion(type: Extract<EventType, 'tel_click' | 'whatsapp_click'>) {
  void insertEvent(type, window.location.pathname);
}

export function logCategoryView(category: string) {
  void insertEvent('category_view', window.location.pathname, category);
}

// label guarda el id del producto — se resuelve a nombre en el panel de
// informes cruzando con el catálogo actual (igual que category_view).
export function logProductView(productId: string) {
  void insertEvent('product_view', window.location.pathname, productId);
}

export function logAddToCart(productId: string) {
  void insertEvent('add_to_cart', window.location.pathname, productId);
}
