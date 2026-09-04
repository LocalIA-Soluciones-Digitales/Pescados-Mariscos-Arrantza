// Runs after `vite build`. The site is a client-rendered SPA, so `vite build`
// only produces one out/index.html shared by every route — every URL would
// otherwise serve the homepage's title/description/canonical/JSON-LD to any
// crawler that doesn't execute JS (most AI answer-engine bots don't).
//
// This script clones out/index.html per secondary route and swaps the SEO
// region (marked by the <!-- Primary SEO --> ... <!-- Fonts --> comments in
// index.html) for route-specific content, then writes out/<route>/index.html.
// Vercel serves a matching static file before falling back to the SPA
// rewrite in vercel.json, so /productos resolves to out/productos/index.html
// directly while unknown paths still fall through to the client router.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'out');
const SITE = 'https://pescaderiaarrantza.com';

// Vercel injects VITE_* build env vars into process.env already. For local
// `npm run build` testing, fall back to reading .env.local directly.
function loadDotEnvLocal() {
  const path = join(ROOT, '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnvLocal();

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonLdScript(obj) {
  // Escape "<" so a "</script>" inside admin-entered product text (pulled live
  // from Supabase for the /productos ItemList) can't prematurely close the tag.
  const json = JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

const LOCAL_BUSINESS_BASE = {
  '@type': 'LocalBusiness',
  name: 'Pescados y Mariscos Arrantza',
  description:
    'Pescadería familiar en Erandio, Bizkaia. Pescado y marisco fresco del Cantábrico seleccionado cada mañana en lonja.',
  image:
    'https://ukhfaphloxlszomccgde.supabase.co/storage/v1/object/public/pescados-mariscos-arrantza/marketing/arrantza-hero-01.jpg',
  telephone: '+34619609888',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Calle Jesús Aramburu, 1',
    addressLocality: 'Erandio',
    addressRegion: 'Bizkaia',
    postalCode: '48950',
    addressCountry: 'ES',
  },
  geo: { '@type': 'GeoCoordinates', latitude: 43.31, longitude: -2.925 },
  aggregateRating: { '@type': 'AggregateRating', ratingValue: '5.0', reviewCount: '87' },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '08:00',
      closes: '14:00',
    },
  ],
  priceRange: '€€',
  url: `${SITE}/`,
};

function localBusiness() {
  return { '@context': 'https://schema.org', ...LOCAL_BUSINESS_BASE };
}

function organization() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Pescados y Mariscos Arrantza',
    url: `${SITE}/`,
    logo: `${SITE}/logo.png`,
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+34619609888',
      contactType: 'customer service',
      availableLanguage: ['Spanish', 'Basque'],
    },
  };
}

function website() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Pescados y Mariscos Arrantza',
    url: `${SITE}/`,
    inLanguage: 'es-ES',
  };
}

function breadcrumbList(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE}${item.path}`,
    })),
  };
}

function serviceSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'Suministro de pescado y marisco fresco para hostelería',
    provider: {
      '@type': 'LocalBusiness',
      name: 'Pescados y Mariscos Arrantza',
      telephone: '+34619609888',
      url: `${SITE}/`,
    },
    areaServed: { '@type': 'AdministrativeArea', name: 'Bizkaia' },
    audience: { '@type': 'BusinessAudience', audienceType: 'Restaurantes y hostelería' },
  };
}

// Best-effort: embed a live snapshot of the catalog as an ItemList so
// GEO crawlers have real product names/descriptions to cite. Price is
// intentionally omitted — `producto.precio` is free text (e.g. "3,50 €/kg")
// entered by the fishmonger, not a clean numeric value, and emitting an
// invalid/misleading schema.org Offer.price is worse than omitting it.
async function fetchProductItemList() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn('[generate-static-routes] Supabase env vars not set — skipping Product schema for /productos');
    return null;
  }
  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from('productos')
      .select('nombre_es, descripcion_es, categoria, imagen_url, disponible, orden')
      .eq('disponible', true)
      .order('orden', { ascending: true })
      .limit(60);
    if (error) {
      console.warn('[generate-static-routes] Supabase fetch failed:', error.message);
      return null;
    }
    if (!data || data.length === 0) return null;
    return {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Catálogo de pescado y marisco fresco - Arrantza',
      itemListElement: data.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Product',
          name: p.nombre_es,
          ...(p.descripcion_es ? { description: p.descripcion_es } : {}),
          category: p.categoria,
          ...(p.imagen_url ? { image: p.imagen_url } : {}),
        },
      })),
    };
  } catch (e) {
    console.warn('[generate-static-routes] Supabase fetch threw:', e.message);
    return null;
  }
}

function buildHeadRegion(route) {
  const canonical = `${SITE}${route.path}`;
  const parts = [];
  parts.push('<!-- Primary SEO -->');
  parts.push(`<title>${escapeHtml(route.title)}</title>`);
  parts.push(`<meta name="description" content="${escapeHtml(route.description)}" />`);
  parts.push('');
  parts.push('<!-- Canonical -->');
  parts.push(`<link rel="canonical" href="${canonical}" />`);
  parts.push('');
  parts.push('<!-- hreflang -->');
  parts.push(`<link rel="alternate" hreflang="es" href="${canonical}" />`);
  parts.push(`<link rel="alternate" hreflang="x-default" href="${canonical}" />`);
  parts.push('');
  parts.push('<!-- Open Graph -->');
  parts.push(`<meta property="og:title" content="${escapeHtml(route.ogTitle || route.title)}" />`);
  parts.push(`<meta property="og:description" content="${escapeHtml(route.ogDescription || route.description)}" />`);
  parts.push('<meta property="og:type" content="website" />');
  parts.push(`<meta property="og:url" content="${canonical}" />`);
  parts.push('<meta property="og:locale" content="es_ES" />');
  parts.push('');
  parts.push('<!-- Twitter Card -->');
  parts.push('<meta name="twitter:card" content="summary_large_image" />');
  parts.push(`<meta name="twitter:title" content="${escapeHtml(route.twitterTitle || route.title)}" />`);
  parts.push(
    `<meta name="twitter:description" content="${escapeHtml(route.twitterDescription || route.description)}" />`
  );
  parts.push('');
  parts.push('<!-- Geo Tags -->');
  parts.push('<meta name="geo.position" content="43.3100;-2.9250" />');
  parts.push('<meta name="geo.region" content="ES-PV" />');
  parts.push('<meta name="geo.placename" content="Erandio, Bizkaia, País Vasco" />');
  parts.push('');
  parts.push(`<meta http-equiv="Last-Modified" content="${route.lastmod}" />`);
  parts.push('');
  for (const schema of route.schemas) {
    parts.push(jsonLdScript(schema));
    parts.push('');
  }
  return parts.join('\n    ');
}

async function main() {
  const templatePath = join(OUT_DIR, 'index.html');
  if (!existsSync(templatePath)) {
    throw new Error(`generate-static-routes: ${templatePath} not found — run "vite build" first`);
  }
  const template = readFileSync(templatePath, 'utf8');

  const START_MARK = '<!-- Primary SEO -->';
  const END_MARK = '<!-- End Primary SEO region';
  const startIdx = template.indexOf(START_MARK);
  const endIdx = template.indexOf(END_MARK);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      'generate-static-routes: SEO region markers not found in out/index.html — ' +
        'index.html\'s "<!-- Primary SEO -->" / "<!-- End Primary SEO region" comments were renamed or removed.'
    );
  }
  const before = template.slice(0, startIdx);
  const after = template.slice(endIdx);

  const productItemList = await fetchProductItemList();

  const routes = [
    {
      path: '/productos',
      dir: 'productos',
      title: 'Catálogo de Pescado y Marisco Fresco | Arrantza Erandio',
      description:
        'Catálogo diario de pescado y marisco fresco en Erandio: lubina, merluza, pulpo, txipirón y más, seleccionado cada mañana en lonja del Cantábrico. Ven a la tienda o pide para hostelería.',
      lastmod: '2026-08-11',
      schemas: [
        localBusiness(),
        organization(),
        website(),
        breadcrumbList([
          { name: 'Inicio', path: '/' },
          { name: 'Catálogo', path: '/productos' },
        ]),
        ...(productItemList ? [productItemList] : []),
      ],
    },
    {
      path: '/reservas',
      dir: 'reservas',
      title: 'Reservas para Navidad y Fechas Especiales | Arrantza Erandio',
      description:
        'Reserva con antelación tu pescado y marisco fresco para Navidad, Nochevieja u otras fechas especiales. Elige productos y cantidades y recógelo listo el día que necesites.',
      lastmod: '2026-08-25',
      schemas: [
        localBusiness(),
        organization(),
        website(),
        breadcrumbList([
          { name: 'Inicio', path: '/' },
          { name: 'Reservas', path: '/reservas' },
        ]),
      ],
    },
    {
      path: '/profesionales',
      dir: 'profesionales',
      title: 'Suministro de Pescado Fresco para Hostelería | Arrantza Profesionales',
      description:
        'Servicio profesional de suministro diario de pescado y marisco fresco del Cantábrico para restaurantes y hoteles en Bizkaia. Más de 20 establecimientos confían en Arrantza.',
      lastmod: '2026-08-11',
      schemas: [
        localBusiness(),
        organization(),
        website(),
        breadcrumbList([
          { name: 'Inicio', path: '/' },
          { name: 'Profesionales', path: '/profesionales' },
        ]),
        serviceSchema(),
      ],
    },
    {
      path: '/aviso-legal',
      dir: 'aviso-legal',
      title: 'Aviso Legal | Pescados y Mariscos Arrantza',
      description:
        'Aviso legal y condiciones de uso del sitio web de Pescados y Mariscos Arrantza, pescadería familiar en Erandio, Bizkaia.',
      lastmod: '2026-08-11',
      schemas: [
        organization(),
        website(),
        breadcrumbList([
          { name: 'Inicio', path: '/' },
          { name: 'Aviso Legal', path: '/aviso-legal' },
        ]),
      ],
    },
    {
      path: '/cookies',
      dir: 'cookies',
      title: 'Política de Cookies | Pescados y Mariscos Arrantza',
      description:
        'Información sobre el uso de cookies en el sitio web de Pescados y Mariscos Arrantza: qué cookies utilizamos y cómo puedes gestionarlas o desactivarlas.',
      lastmod: '2026-08-11',
      schemas: [
        organization(),
        website(),
        breadcrumbList([
          { name: 'Inicio', path: '/' },
          { name: 'Política de Cookies', path: '/cookies' },
        ]),
      ],
    },
    {
      path: '/privacidad',
      dir: 'privacidad',
      title: 'Política de Privacidad | Pescados y Mariscos Arrantza',
      description:
        'Información sobre el tratamiento de datos personales en el sitio web de Pescados y Mariscos Arrantza: finalidades, base jurídica, conservación y tus derechos.',
      lastmod: '2026-08-15',
      schemas: [
        organization(),
        website(),
        breadcrumbList([
          { name: 'Inicio', path: '/' },
          { name: 'Política de Privacidad', path: '/privacidad' },
        ]),
      ],
    },
    {
      path: '/condiciones-contratacion',
      dir: 'condiciones-contratacion',
      title: 'Condiciones de Contratación | Pescados y Mariscos Arrantza',
      description:
        'Condiciones que regulan el proceso de pedido a través del sitio web de Pescados y Mariscos Arrantza: naturaleza del encargo, precio, pago, entrega y derecho de desistimiento.',
      lastmod: '2026-08-15',
      schemas: [
        organization(),
        website(),
        breadcrumbList([
          { name: 'Inicio', path: '/' },
          { name: 'Condiciones de Contratación', path: '/condiciones-contratacion' },
        ]),
      ],
    },
  ];

  for (const route of routes) {
    const headRegion = buildHeadRegion(route);
    const html = `${before}${headRegion}\n\n    ${after}`;
    const dir = join(OUT_DIR, route.dir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), html, 'utf8');
    console.log(`[generate-static-routes] wrote out/${route.dir}/index.html`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
