import type { DeviceType, SourceCategory } from '@/lib/visitLog';

export const PAGE_LABELS: Record<string, string> = {
  '/': 'Inicio',
  '/productos': 'Catálogo',
  '/hosteleria': 'Hostelería',
  '/reservas': 'Reservas',
  '/aviso-legal': 'Aviso legal',
  '/cookies': 'Política de cookies',
  '/privacidad': 'Privacidad',
};

export const pageLabel = (path: string) => PAGE_LABELS[path] ?? path;

export const SOURCE_LABELS: Record<SourceCategory, string> = {
  google_ads: 'Google Ads',
  google_organic: 'Google orgánico',
  social: 'Redes sociales',
  referral: 'Enlaces externos',
  direct: 'Directo',
  other: 'Otros',
};

export const SOURCE_COLORS: Record<SourceCategory, string> = {
  google_ads: '#49645c',
  google_organic: '#4f6678',
  social: '#948777',
  referral: '#7e92a3',
  direct: '#182b38',
  other: '#c2bdb5',
};

export const DEVICE_LABELS: Record<DeviceType, string> = {
  mobile: 'Móvil',
  tablet: 'Tablet',
  desktop: 'Escritorio',
};

export const CATEGORY_LABELS: Record<string, string> = {
  pescado: 'Pescado',
  especial: 'Pescado de carta',
  raciones: 'Raciones',
  marisco: 'Marisco',
  congelados: 'Congelado',
  preparados: 'Varios',
  azul: 'Pescado Azul',
  blanco: 'Pescado Blanco',
  cefalopodos: 'Cefalópodos',
  bivalvos: 'Bivalvos / Moluscos',
  crustaceos_grandes: 'Crustáceos Grandes',
  gambas_langostinos: 'Gambas y Langostinos',
};

export const EVENT_LABELS: Record<string, string> = {
  pageview: 'Página vista',
  tel_click: 'Clic en teléfono',
  whatsapp_click: 'Clic en WhatsApp',
  category_view: 'Categoría vista',
  product_view: 'Producto visto',
  add_to_cart: 'Añadido al pedido',
};

export const ERROR_SOURCE_LABELS: Record<string, string> = {
  window_error: 'Script',
  unhandled_rejection: 'Promesa',
  react_boundary: 'React',
  api: 'API',
};

export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
