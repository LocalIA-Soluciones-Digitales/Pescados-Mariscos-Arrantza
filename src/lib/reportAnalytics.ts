import type { DeviceType, SourceCategory, VisitEntry } from './visitLog';

export type Granularity = 'day' | 'week' | 'month';

export interface SeriesPoint {
  date: string;
  pageviews: number;
  conversions: number;
  google_ads_pageviews: number;
}

export interface SourceBreakdown {
  source_category: SourceCategory;
  pageviews: number;
  conversions: number;
}

export interface CategoryBreakdown {
  category: string;
  views: number;
}

export interface ProductBreakdown {
  productId: string;
  views: number;
  addsToCart: number;
}

export interface PeriodStats {
  days: number;
  pageviews: number;
  conversions: number;
  avgPageviewsPerDay: number;
  avgConversionsPerDay: number;
  conversionRate: number;
  googleAdsPageviews: number;
}

export interface Comparison {
  before: PeriodStats;
  after: PeriodStats;
  pageviewsChangePct: number | null;
  conversionsChangePct: number | null;
  conversionRateChangePct: number | null;
}

export interface OverviewStats {
  uniqueVisitors: number;
  totalPageviews: number;
  avgPagesPerSession: number;
  bounceRate: number;
  newVisitorPct: number;
}

export interface PageBreakdown {
  path: string;
  views: number;
}

export interface DeviceBreakdown {
  device_type: DeviceType;
  views: number;
}

export interface WeekdayBreakdown {
  weekday: number; // 0 = lunes … 6 = domingo
  views: number;
}

const isConversion = (e: VisitEntry) => e.event_type === 'tel_click' || e.event_type === 'whatsapp_click';

function bucketKey(iso: string, granularity: Granularity): string {
  const d = new Date(iso);
  if (granularity === 'month') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (granularity === 'week') {
    const diffToMonday = (d.getDay() + 6) % 7;
    const monday = new Date(d);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(d.getDate() - diffToMonday);
    return monday.toISOString().slice(0, 10);
  }
  return iso.slice(0, 10);
}

export function buildSeries(visits: VisitEntry[], granularity: Granularity = 'day'): SeriesPoint[] {
  const byBucket = new Map<string, SeriesPoint>();

  for (const v of visits) {
    const key = bucketKey(v.created_at, granularity);
    if (!byBucket.has(key)) {
      byBucket.set(key, { date: key, pageviews: 0, conversions: 0, google_ads_pageviews: 0 });
    }
    const point = byBucket.get(key)!;
    if (v.event_type === 'pageview') {
      point.pageviews += 1;
      if (v.source_category === 'google_ads') point.google_ads_pageviews += 1;
    } else if (isConversion(v)) {
      point.conversions += 1;
    }
  }

  return Array.from(byBucket.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function buildCategoryBreakdown(visits: VisitEntry[]): CategoryBreakdown[] {
  const byCategory = new Map<string, number>();

  for (const v of visits) {
    if (v.event_type !== 'category_view' || !v.label) continue;
    byCategory.set(v.label, (byCategory.get(v.label) ?? 0) + 1);
  }

  return Array.from(byCategory.entries())
    .map(([category, views]) => ({ category, views }))
    .sort((a, b) => b.views - a.views);
}

// Compara cuánto se mira un producto (product_view) frente a cuánto se
// añade realmente al pedido (add_to_cart) — permite detectar productos que
// se miran mucho pero apenas se piden, o al revés.
export function buildProductBreakdown(visits: VisitEntry[]): ProductBreakdown[] {
  const byProduct = new Map<string, ProductBreakdown>();

  for (const v of visits) {
    if (v.event_type !== 'product_view' && v.event_type !== 'add_to_cart') continue;
    if (!v.label) continue;
    if (!byProduct.has(v.label)) {
      byProduct.set(v.label, { productId: v.label, views: 0, addsToCart: 0 });
    }
    const entry = byProduct.get(v.label)!;
    if (v.event_type === 'product_view') entry.views += 1;
    else entry.addsToCart += 1;
  }

  return Array.from(byProduct.values()).sort((a, b) => b.views - a.views);
}

export function buildSourceBreakdown(visits: VisitEntry[]): SourceBreakdown[] {
  const byCategory = new Map<SourceCategory, SourceBreakdown>();

  for (const v of visits) {
    if (v.event_type !== 'pageview' && !isConversion(v)) continue;
    if (!byCategory.has(v.source_category)) {
      byCategory.set(v.source_category, { source_category: v.source_category, pageviews: 0, conversions: 0 });
    }
    const entry = byCategory.get(v.source_category)!;
    if (v.event_type === 'pageview') entry.pageviews += 1;
    else entry.conversions += 1;
  }

  return Array.from(byCategory.values()).sort((a, b) => b.pageviews - a.pageviews);
}

export function buildOverviewStats(visits: VisitEntry[]): OverviewStats {
  const pageviews = visits.filter((v) => v.event_type === 'pageview');
  const bySession = new Map<string, { count: number; isReturning: boolean }>();

  for (const v of pageviews) {
    const entry = bySession.get(v.session_id) ?? { count: 0, isReturning: v.is_returning };
    entry.count += 1;
    bySession.set(v.session_id, entry);
  }

  const sessions = Array.from(bySession.values());
  const totalSessions = sessions.length;
  const bounces = sessions.filter((s) => s.count === 1).length;
  const returning = sessions.filter((s) => s.isReturning).length;

  return {
    uniqueVisitors: totalSessions,
    totalPageviews: pageviews.length,
    avgPagesPerSession: totalSessions > 0 ? pageviews.length / totalSessions : 0,
    bounceRate: totalSessions > 0 ? bounces / totalSessions : 0,
    newVisitorPct: totalSessions > 0 ? ((totalSessions - returning) / totalSessions) * 100 : 0,
  };
}

const INTERNAL_PATH_PREFIXES = ['/admin'];

export function buildTopPages(visits: VisitEntry[], limit = 10): PageBreakdown[] {
  const byPath = new Map<string, number>();

  for (const v of visits) {
    if (v.event_type !== 'pageview') continue;
    if (INTERNAL_PATH_PREFIXES.some((p) => v.path.startsWith(p))) continue;
    byPath.set(v.path, (byPath.get(v.path) ?? 0) + 1);
  }

  return Array.from(byPath.entries())
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}

export function buildDeviceBreakdown(visits: VisitEntry[]): DeviceBreakdown[] {
  const byDevice = new Map<DeviceType, number>();

  for (const v of visits) {
    if (v.event_type !== 'pageview' || !v.device_type) continue;
    byDevice.set(v.device_type, (byDevice.get(v.device_type) ?? 0) + 1);
  }

  return Array.from(byDevice.entries())
    .map(([device_type, views]) => ({ device_type, views }))
    .sort((a, b) => b.views - a.views);
}

export function buildWeekdayBreakdown(visits: VisitEntry[]): WeekdayBreakdown[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];

  for (const v of visits) {
    if (v.event_type !== 'pageview') continue;
    const jsDay = new Date(v.created_at).getDay(); // 0 = domingo … 6 = sábado
    const mondayFirst = (jsDay + 6) % 7;
    counts[mondayFirst] += 1;
  }

  return counts.map((views, weekday) => ({ weekday, views }));
}

function periodStats(visits: VisitEntry[], from: Date, to: Date): PeriodStats {
  const inRange = visits.filter((v) => {
    const t = new Date(v.created_at).getTime();
    return t >= from.getTime() && t < to.getTime();
  });

  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
  const pageviews = inRange.filter((v) => v.event_type === 'pageview').length;
  const conversions = inRange.filter(isConversion).length;
  const googleAdsPageviews = inRange.filter((v) => v.event_type === 'pageview' && v.source_category === 'google_ads').length;

  return {
    days,
    pageviews,
    conversions,
    avgPageviewsPerDay: pageviews / days,
    avgConversionsPerDay: conversions / days,
    conversionRate: pageviews > 0 ? conversions / pageviews : 0,
    googleAdsPageviews,
  };
}

function pctChange(before: number, after: number): number | null {
  if (before === 0) return after > 0 ? null : 0;
  return ((after - before) / before) * 100;
}

// Compara el tráfico/conversiones en la ventana simétrica antes y después de
// la fecha de lanzamiento (p.ej. 14 días antes vs 14 días después).
export function buildComparison(visits: VisitEntry[], launchDate: Date, windowDays: number): Comparison {
  const beforeFrom = new Date(launchDate.getTime() - windowDays * 86_400_000);
  const afterTo = new Date(launchDate.getTime() + windowDays * 86_400_000);

  const before = periodStats(visits, beforeFrom, launchDate);
  const after = periodStats(visits, launchDate, afterTo);

  return {
    before,
    after,
    pageviewsChangePct: pctChange(before.avgPageviewsPerDay, after.avgPageviewsPerDay),
    conversionsChangePct: pctChange(before.avgConversionsPerDay, after.avgConversionsPerDay),
    conversionRateChangePct: pctChange(before.conversionRate, after.conversionRate),
  };
}
