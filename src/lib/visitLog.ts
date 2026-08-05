import { supabase } from './supabaseClient';

export type EventType = 'pageview' | 'tel_click' | 'whatsapp_click' | 'category_view';
export type SourceCategory = 'google_ads' | 'google_organic' | 'social' | 'referral' | 'direct' | 'other';

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
  created_at: string;
}

const SESSION_KEY = 'pmz_session_id';
const SOURCE_KEY = 'pmz_source';

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
  const attribution = getAttribution();
  try {
    await supabase.from('visits').insert({
      session_id: getSessionId(),
      event_type: eventType,
      path,
      label: label ?? null,
      referrer: attribution.referrer,
      source_category: attribution.source_category,
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
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
