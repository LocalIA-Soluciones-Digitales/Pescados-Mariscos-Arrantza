import type { ReactNode } from 'react';
import type { RangeKey } from '@/lib/devAnalytics';

// Piezas compartidas del panel de desarrollo: tarjetas, KPIs con delta y
// sparkline, selector de rango y tablas densas. Mismo lenguaje visual que el
// panel de gestión (fondos background-50, bordes background-200/70).

export const CHART = {
  ink: '#182b38', // primary-500
  inkSoft: '#7e92a3', // primary-300
  accent: '#49645c', // accent-500
  warm: '#948777', // secondary-500
  grid: '#e7e4df', // background-200
  axis: '#6c7376', // foreground-400
  danger: '#b42318',
};

export const fmtInt = (n: number) => n.toLocaleString('es-ES');
export const fmtPct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

export function fmtDuration(sec: number): string {
  if (sec <= 0) return '—';
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m} min ${String(s).padStart(2, '0')} s`;
}

export function fmtAgo(iso: string | Date): string {
  const t = typeof iso === 'string' ? new Date(iso).getTime() : iso.getTime();
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

export function fmtShortDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function Card({ title, subtitle, actions, children, className = '', pad = true }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`bg-background-50 border border-background-200/70 rounded-xl ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-4 md:px-5 pt-4">
          <div className="min-w-0">
            {title && <h3 className="font-body text-sm font-semibold text-foreground-950">{title}</h3>}
            {subtitle && <p className="text-xs text-foreground-400 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'p-4 md:p-5' : 'pt-3'}>{children}</div>
    </section>
  );
}

export function Delta({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct === null) return <span className="text-[11px] font-medium text-foreground-400">nuevo</span>;
  if (Math.abs(pct) < 0.5) return <span className="text-[11px] font-medium text-foreground-400">= 0%</span>;
  const good = invert ? pct < 0 : pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${good ? 'text-emerald-700' : 'text-red-700'}`}>
      <i className={pct > 0 ? 'ri-arrow-up-line' : 'ri-arrow-down-line'} />
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export function Sparkline({ values, color = CHART.ink, height = 28 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const w = 100;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${height - 2 - (v / max) * (height - 4)}`);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <polyline points={`0,${height} ${pts.join(' ')} ${w},${height}`} fill={color} fillOpacity={0.08} stroke="none" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Kpi({ label, value, delta, invert, spark, hint }: { label: string; value: string; delta?: number | null; invert?: boolean; spark?: number[]; hint?: string }) {
  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl px-4 pt-3.5 pb-2 flex flex-col min-w-0" title={hint}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-400 truncate">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-2xl font-semibold text-foreground-950 tabular-nums leading-tight">{value}</p>
        {delta !== undefined && <Delta pct={delta} invert={invert} />}
      </div>
      <div className="mt-auto pt-2 h-8">{spark && <Sparkline values={spark} />}</div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = 'sm' }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; size?: 'sm' | 'xs' }) {
  return (
    <div className="inline-flex items-center p-0.5 rounded-full bg-background-100 border border-background-200/70">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`${size === 'xs' ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'} rounded-full font-medium whitespace-nowrap transition-colors ${
            value === o.value ? 'bg-primary-500 text-background-50 shadow-sm' : 'text-foreground-500 hover:text-foreground-950'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: '7d', label: '7 días' },
  { value: '28d', label: '28 días' },
  { value: '90d', label: '90 días' },
  { value: 'all', label: 'Todo' },
];

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky z-10 -mx-4 md:-mx-8 px-4 md:px-8 py-2.5 bg-background-100/95 backdrop-blur border-b border-background-200/70 flex flex-wrap items-center gap-2 justify-between" style={{ top: 'var(--admin-header-height, 0px)' }}>
      {children}
    </div>
  );
}

export function Meter({ value, max, color = CHART.ink }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full bg-background-200/60 rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

export interface Column<T> {
  key: string;
  label: string;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({ rows, columns, rowKey, empty = 'Sin datos en este rango.', maxRows }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; empty?: string; maxRows?: number }) {
  const shown = maxRows ? rows.slice(0, maxRows) : rows;
  if (rows.length === 0) return <p className="px-4 md:px-5 pb-4 text-xs text-foreground-400">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-background-200/70">
            {columns.map((c) => (
              <th key={c.key} className={`px-4 md:px-5 py-2 font-medium text-[11px] uppercase tracking-wide text-foreground-400 whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={rowKey(r)} className="border-b border-background-200/40 last:border-0 hover:bg-background-100/60">
              {columns.map((c) => (
                <td key={c.key} className={`px-4 md:px-5 py-2 text-foreground-600 ${c.align === 'right' ? 'text-right tabular-nums whitespace-nowrap' : 'text-left'} ${c.className ?? ''}`}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {maxRows && rows.length > maxRows && <p className="px-4 md:px-5 py-2 text-[11px] text-foreground-400">Mostrando {maxRows} de {rows.length}</p>}
    </div>
  );
}

export function Empty({ icon = 'ri-bar-chart-2-line', title, body }: { icon?: string; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <i className={`${icon} text-3xl text-foreground-300`} />
      <p className="mt-3 text-sm font-medium text-foreground-700">{title}</p>
      {body && <p className="mt-1 text-xs text-foreground-400 max-w-sm">{body}</p>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-background-200/50" />
        ))}
      </div>
      <div className="h-72 rounded-xl bg-background-200/50" />
    </div>
  );
}

export function StatusDot({ tone }: { tone: 'ok' | 'warn' | 'bad' | 'off' }) {
  const c = tone === 'ok' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : tone === 'bad' ? 'bg-red-500' : 'bg-foreground-300';
  return (
    <span className="relative inline-flex w-2 h-2 flex-shrink-0">
      {tone === 'ok' && <span className={`absolute inset-0 rounded-full ${c} opacity-40 animate-ping`} />}
      <span className={`relative inline-flex w-2 h-2 rounded-full ${c}`} />
    </span>
  );
}
