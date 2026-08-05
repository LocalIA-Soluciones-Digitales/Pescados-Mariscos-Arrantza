import type { SourceCategory, VisitEntry } from './visitLog';

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
