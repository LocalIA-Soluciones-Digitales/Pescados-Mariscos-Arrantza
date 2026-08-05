import { describe, expect, it } from 'vitest';
import { buildOverviewStats, buildProductBreakdown, buildSeries } from './reportAnalytics';
import type { VisitEntry } from './visitLog';

function visit(overrides: Partial<VisitEntry>): VisitEntry {
  return {
    id: crypto.randomUUID(),
    session_id: 'session-1',
    event_type: 'pageview',
    path: '/',
    label: null,
    referrer: null,
    source_category: 'direct',
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    device_type: 'desktop',
    is_returning: false,
    created_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildSeries', () => {
  it('groups pageviews and conversions by day', () => {
    const visits = [
      visit({ event_type: 'pageview', created_at: '2026-01-01T10:00:00.000Z' }),
      visit({ event_type: 'pageview', created_at: '2026-01-01T18:00:00.000Z' }),
      visit({ event_type: 'whatsapp_click', created_at: '2026-01-01T18:05:00.000Z' }),
      visit({ event_type: 'pageview', created_at: '2026-01-02T09:00:00.000Z' }),
    ];

    const series = buildSeries(visits, 'day');

    expect(series).toEqual([
      { date: '2026-01-01', pageviews: 2, conversions: 1, google_ads_pageviews: 0 },
      { date: '2026-01-02', pageviews: 1, conversions: 0, google_ads_pageviews: 0 },
    ]);
  });

  it('counts google_ads pageviews separately from the total', () => {
    const visits = [
      visit({ event_type: 'pageview', source_category: 'google_ads' }),
      visit({ event_type: 'pageview', source_category: 'direct' }),
    ];

    const [point] = buildSeries(visits, 'day');

    expect(point.pageviews).toBe(2);
    expect(point.google_ads_pageviews).toBe(1);
  });
});

describe('buildOverviewStats', () => {
  it('computes bounce rate from single-pageview sessions', () => {
    const visits = [
      visit({ session_id: 'a', event_type: 'pageview' }),
      visit({ session_id: 'b', event_type: 'pageview' }),
      visit({ session_id: 'b', event_type: 'pageview' }),
    ];

    const stats = buildOverviewStats(visits);

    expect(stats.uniqueVisitors).toBe(2);
    expect(stats.totalPageviews).toBe(3);
    expect(stats.bounceRate).toBeCloseTo(0.5);
  });

  it('returns zeros when there are no pageviews', () => {
    const stats = buildOverviewStats([]);
    expect(stats.uniqueVisitors).toBe(0);
    expect(stats.bounceRate).toBe(0);
    expect(stats.avgPagesPerSession).toBe(0);
  });
});

describe('buildProductBreakdown', () => {
  it('separates views from adds-to-cart per product', () => {
    const visits = [
      visit({ event_type: 'product_view', label: 'rodaballo' }),
      visit({ event_type: 'product_view', label: 'rodaballo' }),
      visit({ event_type: 'product_view', label: 'merluza' }),
      visit({ event_type: 'add_to_cart', label: 'merluza' }),
    ];

    const breakdown = buildProductBreakdown(visits);

    expect(breakdown).toEqual([
      { productId: 'rodaballo', views: 2, addsToCart: 0 },
      { productId: 'merluza', views: 1, addsToCart: 1 },
    ]);
  });

  it('ignores events without a product label', () => {
    const visits = [visit({ event_type: 'product_view', label: null })];
    expect(buildProductBreakdown(visits)).toEqual([]);
  });
});
