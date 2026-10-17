import type { DeviceType, SourceCategory, VisitEntry } from './visitLog';
import type { ErrorLogEntry, ErrorSource } from './errorLog';

// Analítica del panel de desarrollo: todo se calcula en el cliente a partir
// de los eventos crudos de `visits` y `error_logs`. Las visitas a /admin se
// descartan (son nuestras, no de clientes) para no ensuciar las métricas.

export const DAY_MS = 86_400_000;
const INTERNAL_PATH_PREFIXES = ['/admin'];

export type RangeKey = '7d' | '28d' | '90d' | 'all';

export interface DateRange {
  from: Date; // inclusivo, 00:00 local
  to: Date; // exclusivo, 00:00 local del día siguiente a hoy
  days: number;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function dayKey(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function resolveRange(key: RangeKey, firstEventIso: string | undefined, now = new Date()): DateRange {
  const to = new Date(startOfDay(now).getTime() + DAY_MS);
  let from: Date;
  if (key === 'all') {
    from = firstEventIso ? startOfDay(new Date(firstEventIso)) : new Date(to.getTime() - 7 * DAY_MS);
  } else {
    const n = key === '7d' ? 7 : key === '28d' ? 28 : 90;
    from = new Date(to.getTime() - n * DAY_MS);
  }
  return { from, to, days: Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS)) };
}

export function previousRange(r: DateRange): DateRange {
  return { from: new Date(r.from.getTime() - r.days * DAY_MS), to: r.from, days: r.days };
}

export function isPublicEvent(v: VisitEntry): boolean {
  return !INTERNAL_PATH_PREFIXES.some((p) => v.path.startsWith(p));
}

export function inRange<T extends { created_at: string }>(rows: T[], r: DateRange): T[] {
  const a = r.from.getTime();
  const b = r.to.getTime();
  return rows.filter((row) => {
    const t = new Date(row.created_at).getTime();
    return t >= a && t < b;
  });
}

const isConversion = (e: VisitEntry) => e.event_type === 'tel_click' || e.event_type === 'whatsapp_click';

// ───────────────────────── Sesiones ─────────────────────────

export interface Session {
  id: string;
  start: number;
  end: number;
  pageviews: number;
  events: number;
  source: SourceCategory;
  device: DeviceType | null;
  returning: boolean;
  landing: string | null;
  exit: string | null;
  referrerHost: string | null;
  utm: string | null;
  sawProduct: boolean;
  addedToCart: boolean;
  converted: boolean;
}

function hostOf(ref: string | null): string | null {
  if (!ref) return null;
  try {
    return new URL(ref).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Agrupa los eventos (ya ordenados por fecha ascendente) en sesiones.
export function buildSessions(visits: VisitEntry[]): Session[] {
  const map = new Map<string, Session>();
  for (const v of visits) {
    const t = new Date(v.created_at).getTime();
    let s = map.get(v.session_id);
    if (!s) {
      s = {
        id: v.session_id,
        start: t,
        end: t,
        pageviews: 0,
        events: 0,
        source: v.source_category,
        device: v.device_type,
        returning: v.is_returning,
        landing: null,
        exit: null,
        referrerHost: hostOf(v.referrer),
        utm: v.utm_source || v.utm_campaign ? [v.utm_source, v.utm_medium, v.utm_campaign].map((x) => x ?? '—').join(' / ') : null,
        sawProduct: false,
        addedToCart: false,
        converted: false,
      };
      map.set(v.session_id, s);
    }
    s.events += 1;
    s.end = Math.max(s.end, t);
    s.start = Math.min(s.start, t);
    if (!s.device && v.device_type) s.device = v.device_type;
    if (v.event_type === 'pageview') {
      s.pageviews += 1;
      if (!s.landing) s.landing = v.path;
      s.exit = v.path;
    } else if (v.event_type === 'product_view') s.sawProduct = true;
    else if (v.event_type === 'add_to_cart') s.addedToCart = true;
    else if (isConversion(v)) s.converted = true;
  }
  return Array.from(map.values());
}

// ───────────────────────── KPIs ─────────────────────────

export interface Kpis {
  sessions: number;
  pageviews: number;
  pagesPerSession: number;
  bounceRate: number; // 0..1
  medianDurationSec: number;
  conversions: number;
  conversionRate: number; // sesiones con conversión / sesiones
  newPct: number; // 0..1
  addToCartRate: number; // sesiones con add_to_cart / sesiones
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function buildKpis(visits: VisitEntry[], sessions: Session[]): Kpis {
  const withPv = sessions.filter((s) => s.pageviews > 0);
  const n = withPv.length;
  const pageviews = visits.filter((v) => v.event_type === 'pageview').length;
  const conversions = visits.filter(isConversion).length;
  const multi = withPv.filter((s) => s.events > 1);
  return {
    sessions: n,
    pageviews,
    pagesPerSession: n ? pageviews / n : 0,
    bounceRate: n ? withPv.filter((s) => s.events === 1).length / n : 0,
    medianDurationSec: median(multi.map((s) => (s.end - s.start) / 1000)),
    conversions,
    conversionRate: n ? withPv.filter((s) => s.converted).length / n : 0,
    newPct: n ? withPv.filter((s) => !s.returning).length / n : 0,
    addToCartRate: n ? withPv.filter((s) => s.addedToCart).length / n : 0,
  };
}

export function pctChange(prev: number, cur: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / prev) * 100;
}

// ───────────────────────── Serie diaria + anomalías ─────────────────────────

export interface DailyPoint {
  date: string;
  sessions: number;
  pageviews: number;
  conversions: number;
  ads: number;
  baseline: number | null; // media móvil de los 14 días anteriores
  anomaly: 'high' | 'low' | null;
}

// Serie con TODOS los días del rango (también los de cero visitas — si no,
// el gráfico une puntos lejanos con una recta y parece una tendencia).
// Marca como anomalía el día cuyo nº de sesiones se sale de ±2σ respecto a
// los 14 días anteriores (con al menos 7 días de historia y σ>0).
export function buildDailySeries(visits: VisitEntry[], r: DateRange): DailyPoint[] {
  const byDay = new Map<string, { sessions: Set<string>; pageviews: number; conversions: number; ads: number }>();
  for (const v of visits) {
    const k = dayKey(v.created_at);
    let d = byDay.get(k);
    if (!d) {
      d = { sessions: new Set(), pageviews: 0, conversions: 0, ads: 0 };
      byDay.set(k, d);
    }
    if (v.event_type === 'pageview') {
      d.pageviews += 1;
      d.sessions.add(v.session_id);
      if (v.source_category === 'google_ads') d.ads += 1;
    } else if (isConversion(v)) d.conversions += 1;
  }

  const out: DailyPoint[] = [];
  for (let t = r.from.getTime(); t < r.to.getTime(); t += DAY_MS) {
    const k = dayKey(new Date(t));
    const d = byDay.get(k);
    out.push({ date: k, sessions: d?.sessions.size ?? 0, pageviews: d?.pageviews ?? 0, conversions: d?.conversions ?? 0, ads: d?.ads ?? 0, baseline: null, anomaly: null });
  }

  const WINDOW = 14;
  for (let i = 0; i < out.length; i++) {
    const hist = out.slice(Math.max(0, i - WINDOW), i).map((p) => p.sessions);
    if (hist.length < 7) continue;
    const mean = hist.reduce((a, b) => a + b, 0) / hist.length;
    const sd = Math.sqrt(hist.reduce((a, b) => a + (b - mean) ** 2, 0) / hist.length);
    out[i].baseline = Math.round(mean * 10) / 10;
    if (sd > 0) {
      const z = (out[i].sessions - mean) / sd;
      if (z > 2) out[i].anomaly = 'high';
      else if (z < -2) out[i].anomaly = 'low';
    }
  }
  return out;
}

// ───────────────────────── Heatmap día × hora ─────────────────────────

// matrix[weekday 0=lunes][hour] = páginas vistas
export function buildHeatmap(visits: VisitEntry[]): number[][] {
  const m = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const v of visits) {
    if (v.event_type !== 'pageview') continue;
    const d = new Date(v.created_at);
    m[(d.getDay() + 6) % 7][d.getHours()] += 1;
  }
  return m;
}

// ───────────────────────── Desgloses ─────────────────────────

export interface DimRow {
  key: string;
  sessions: number;
  pageviews: number;
  conversions: number;
  convRate: number;
  bounceRate: number;
}

export function breakdownBy(sessions: Session[], keyOf: (s: Session) => string | null): DimRow[] {
  const map = new Map<string, { sessions: number; pv: number; conv: number; bounces: number }>();
  for (const s of sessions) {
    if (s.pageviews === 0) continue;
    const k = keyOf(s);
    if (k === null) continue;
    const e = map.get(k) ?? { sessions: 0, pv: 0, conv: 0, bounces: 0 };
    e.sessions += 1;
    e.pv += s.pageviews;
    if (s.converted) e.conv += 1;
    if (s.events === 1) e.bounces += 1;
    map.set(k, e);
  }
  return Array.from(map.entries())
    .map(([key, e]) => ({ key, sessions: e.sessions, pageviews: e.pv, conversions: e.conv, convRate: e.conv / e.sessions, bounceRate: e.bounces / e.sessions }))
    .sort((a, b) => b.sessions - a.sessions);
}

export interface PageRow {
  path: string;
  views: number;
  sessions: number;
  entries: number;
  exits: number;
}

export function buildPages(visits: VisitEntry[], sessions: Session[]): PageRow[] {
  const map = new Map<string, { views: number; sess: Set<string> }>();
  for (const v of visits) {
    if (v.event_type !== 'pageview') continue;
    const e = map.get(v.path) ?? { views: 0, sess: new Set<string>() };
    e.views += 1;
    e.sess.add(v.session_id);
    map.set(v.path, e);
  }
  const entries = new Map<string, number>();
  const exits = new Map<string, number>();
  for (const s of sessions) {
    if (s.landing) entries.set(s.landing, (entries.get(s.landing) ?? 0) + 1);
    if (s.exit) exits.set(s.exit, (exits.get(s.exit) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([path, e]) => ({ path, views: e.views, sessions: e.sess.size, entries: entries.get(path) ?? 0, exits: exits.get(path) ?? 0 }))
    .sort((a, b) => b.views - a.views);
}

// ───────────────────────── Embudo y productos ─────────────────────────

export interface FunnelStep {
  label: string;
  value: number;
}

export function buildFunnel(sessions: Session[]): FunnelStep[] {
  const s = sessions.filter((x) => x.pageviews > 0);
  return [
    { label: 'Sesiones', value: s.length },
    { label: 'Más de una página', value: s.filter((x) => x.pageviews > 1).length },
    { label: 'Ven un producto', value: s.filter((x) => x.sawProduct).length },
    { label: 'Añaden al pedido', value: s.filter((x) => x.addedToCart).length },
    { label: 'Llaman / WhatsApp', value: s.filter((x) => x.converted).length },
  ];
}

export interface ProductRow {
  productId: string;
  views: number;
  adds: number;
  viewSessions: number;
  addRate: number; // adds / views
}

export function buildProducts(visits: VisitEntry[]): ProductRow[] {
  const map = new Map<string, { views: number; adds: number; sess: Set<string> }>();
  for (const v of visits) {
    if ((v.event_type !== 'product_view' && v.event_type !== 'add_to_cart') || !v.label) continue;
    const e = map.get(v.label) ?? { views: 0, adds: 0, sess: new Set<string>() };
    if (v.event_type === 'product_view') {
      e.views += 1;
      e.sess.add(v.session_id);
    } else e.adds += 1;
    map.set(v.label, e);
  }
  return Array.from(map.entries())
    .map(([productId, e]) => ({ productId, views: e.views, adds: e.adds, viewSessions: e.sess.size, addRate: e.views ? e.adds / e.views : 0 }))
    .sort((a, b) => b.views - a.views);
}

export function countLabels(visits: VisitEntry[], type: VisitEntry['event_type']): { key: string; count: number }[] {
  const map = new Map<string, number>();
  for (const v of visits) {
    if (v.event_type !== type || !v.label) continue;
    map.set(v.label, (map.get(v.label) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

// Intervalo de Wilson al 95 % para una proporción: con pocas vistas, un 50 %
// de añadidos (1 de 2) no dice nada; el intervalo lo deja a la vista.
export function wilson(successes: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

// ───────────────────────── Calidad de datos ─────────────────────────

export interface DataQuality {
  totalEvents: number;
  internalEvents: number;
  withoutDevice: number;
  sessionsWithoutPageview: number;
  firstEvent: string | null;
  lastEvent: string | null;
  eventsByType: { type: string; count: number }[];
}

export function buildDataQuality(all: VisitEntry[], publicSessions: Session[]): DataQuality {
  const byType = new Map<string, number>();
  let internal = 0;
  let noDevice = 0;
  for (const v of all) {
    byType.set(v.event_type, (byType.get(v.event_type) ?? 0) + 1);
    if (!isPublicEvent(v)) internal += 1;
    if (!v.device_type) noDevice += 1;
  }
  return {
    totalEvents: all.length,
    internalEvents: internal,
    withoutDevice: noDevice,
    sessionsWithoutPageview: publicSessions.filter((s) => s.pageviews === 0).length,
    firstEvent: all[0]?.created_at ?? null,
    lastEvent: all[all.length - 1]?.created_at ?? null,
    eventsByType: Array.from(byType.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ───────────────────────── Errores agrupados ─────────────────────────

export interface ErrorGroup {
  fingerprint: string;
  message: string;
  source: ErrorSource;
  count: number;
  first: string;
  last: string;
  urls: { url: string; count: number }[];
  browsers: { name: string; count: number }[];
  daily: number[]; // últimos 14 días, el último es hoy
  sample: ErrorLogEntry; // la ocurrencia más reciente
  ids: string[];
}

// Normaliza el mensaje para que el mismo fallo con distinto id/número/URL
// caiga en el mismo grupo.
export function fingerprintOf(e: ErrorLogEntry): string {
  const msg = e.message
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\b\d+(\.\d+)?\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
  return `${e.source}|${msg}`;
}

export function browserOf(ua: string | null): string {
  if (!ua) return 'Desconocido';
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Otro';
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Otro';
  if (/bot|crawler|spider|Headless/i.test(ua)) return `Bot (${br})`;
  return `${br} · ${os}`;
}

function topCounts(values: string[], limit = 5): { name: string; count: number }[] {
  const m = new Map<string, number>();
  values.forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
  return Array.from(m.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function groupErrors(errors: ErrorLogEntry[], now = new Date()): ErrorGroup[] {
  const today = startOfDay(now).getTime();
  const map = new Map<string, ErrorLogEntry[]>();
  for (const e of errors) {
    const fp = fingerprintOf(e);
    const arr = map.get(fp) ?? [];
    arr.push(e);
    map.set(fp, arr);
  }
  return Array.from(map.entries())
    .map(([fingerprint, list]) => {
      const sorted = list.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
      const daily = new Array<number>(14).fill(0);
      for (const e of sorted) {
        const ago = Math.floor((today - startOfDay(new Date(e.created_at)).getTime()) / DAY_MS);
        if (ago >= 0 && ago < 14) daily[13 - ago] += 1;
      }
      return {
        fingerprint,
        message: sorted[0].message,
        source: sorted[0].source,
        count: sorted.length,
        first: sorted[sorted.length - 1].created_at,
        last: sorted[0].created_at,
        urls: topCounts(sorted.map((e) => (e.url ? e.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] || '/' : '—'))).map((x) => ({ url: x.name, count: x.count })),
        browsers: topCounts(sorted.map((e) => browserOf(e.user_agent))),
        daily,
        sample: sorted[0],
        ids: sorted.map((e) => e.id),
      };
    })
    .sort((a, b) => b.last.localeCompare(a.last));
}
