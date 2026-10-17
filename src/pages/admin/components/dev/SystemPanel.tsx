import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { VisitEntry } from '@/lib/visitLog';
import { buildDataQuality, buildSessions, isPublicEvent } from '@/lib/devAnalytics';
import { tiendaCerradaHoy } from '@/lib/tiendaCerrada';
import { Card, DataTable, StatusDot, fmtAgo, fmtInt } from './ui';
import { EVENT_LABELS } from './labels';

// Mismo umbral que useBasculaSyncEstado: dos vueltas del cron de 5 min.
const SYNC_UMBRAL_MS = 12 * 60 * 1000;

interface SettingRow {
  key: string;
  value: unknown;
  updated_at: string;
}

interface TableStat {
  table: string;
  count: number | null;
  last: string | null;
  error?: string;
}

// Tablas cuyo volumen y última escritura interesa vigilar. Si alguna no
// tiene created_at o RLS la oculta, la fila sale con "—" en vez de romper.
const TABLES = [
  'visits',
  'error_logs',
  'pedidos',
  'productos',
  'bascula_ventas',
  'bascula_albaran_lineas',
  'stock_movimientos',
  'caja_movimientos',
  'compras',
  'compras_correo',
  'reservas',
  'reservas_avisos',
  'solicitudes_stock',
  'hosteleria_clientes',
  'hosteleria_solicitudes',
  'push_suscripciones',
  'resenas',
  'bascula_catalogo_cambios',
];

const SYNC_LABELS: Record<string, string> = {
  pescaderia_1: 'Báscula 1',
  pescaderia_2: 'Báscula 2',
};

function valueSummary(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array · ${v.length}`;
  if (typeof v === 'object') return `objeto · ${Object.keys(v as object).length} claves`;
  if (typeof v === 'string') return `texto · ${v.length} car.`;
  return typeof v;
}

function SettingValue({ v }: { v: unknown }) {
  const [shown, setShown] = useState(false);
  return shown ? (
    <pre className="max-w-[28rem] max-h-40 overflow-auto text-[10px] font-mono whitespace-pre-wrap break-all text-foreground-700">{JSON.stringify(v, null, 2)}</pre>
  ) : (
    <button type="button" onClick={() => setShown(true)} className="text-[11px] text-foreground-400 hover:text-foreground-950">
      {valueSummary(v)} <i className="ri-eye-line ml-0.5" />
    </button>
  );
}

export default function SystemPanel({ visits }: { visits: VisitEntry[] }) {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [tables, setTables] = useState<TableStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<Date>(new Date());
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, stats] = await Promise.all([
      supabase.from('settings').select('key, value, updated_at').order('updated_at', { ascending: false }),
      Promise.all(
        TABLES.map(async (table): Promise<TableStat> => {
          const [{ count, error }, lastRes] = await Promise.all([
            supabase.from(table).select('*', { count: 'exact', head: true }),
            supabase.from(table).select('created_at').order('created_at', { ascending: false }).limit(1),
          ]);
          const lastRow = (lastRes.data as { created_at: string }[] | null)?.[0];
          return { table, count: error ? null : count ?? 0, last: lastRow?.created_at ?? null, error: error?.message };
        }),
      ),
    ]);
    setSettings((s as SettingRow[] | null) ?? []);
    setTables(stats.sort((a, b) => (b.count ?? -1) - (a.count ?? -1)));
    setCheckedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const syncs = useMemo(
    () =>
      settings
        .filter((s) => s.key.startsWith('bascula_last_oid_'))
        .map((s) => {
          const origen = s.key.replace('bascula_last_oid_', '');
          const age = Date.now() - new Date(s.updated_at).getTime();
          return { origen, updated_at: s.updated_at, ok: age <= SYNC_UMBRAL_MS };
        })
        .sort((a, b) => a.origen.localeCompare(b.origen)),
    [settings],
  );

  const quality = useMemo(() => {
    const pub = visits.filter(isPublicEvent);
    return buildDataQuality(visits, buildSessions(pub));
  }, [visits]);

  const cerrada = tiendaCerradaHoy();
  const filteredSettings = settings.filter((s) => !filter || s.key.toLowerCase().includes(filter.toLowerCase()));
  const supabaseHost = (() => {
    try {
      return new URL(import.meta.env.VITE_SUPABASE_URL as string).host;
    } catch {
      return '—';
    }
  })();

  return (
    <div className="space-y-5">
      {/* Estado de integraciones */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {syncs.length === 0 && !loading && (
          <div className="bg-background-50 border border-background-200/70 rounded-xl p-4 text-xs text-foreground-400">Sin registro de bascula-sync en settings.</div>
        )}
        {syncs.map((s) => (
          <div key={s.origen} className="bg-background-50 border border-background-200/70 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <StatusDot tone={s.ok ? 'ok' : cerrada ? 'off' : 'bad'} />
              <p className="text-sm font-semibold text-foreground-950">{SYNC_LABELS[s.origen] ?? s.origen} · bascula-sync</p>
            </div>
            <p className="mt-2 text-xs text-foreground-600">Última sincronización {fmtAgo(s.updated_at)}</p>
            <p className="text-[11px] text-foreground-400 tabular-nums">{new Date(s.updated_at).toLocaleString('es-ES')}</p>
            {!s.ok && <p className={`mt-2 text-[11px] font-medium ${cerrada ? 'text-foreground-500' : 'text-red-700'}`}>{cerrada ? 'Tienda cerrada hoy (dom/lun): normal que esté apagada.' : 'Sin sincronizar en más de 12 min.'}</p>}
          </div>
        ))}
        <div className="bg-background-50 border border-background-200/70 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <StatusDot tone="ok" />
            <p className="text-sm font-semibold text-foreground-950">Entorno</p>
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
            <dt className="text-foreground-400">Modo</dt>
            <dd className="text-foreground-700 font-mono">{import.meta.env.MODE}</dd>
            <dt className="text-foreground-400">Supabase</dt>
            <dd className="text-foreground-700 font-mono truncate">{supabaseHost}</dd>
            <dt className="text-foreground-400">Comprobado</dt>
            <dd className="text-foreground-700">{checkedAt.toLocaleTimeString('es-ES')}</dd>
          </dl>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Volumen de tablas */}
        <Card
          title="Tablas"
          subtitle="Filas totales y última escritura (created_at)"
          pad={false}
          actions={
            <button type="button" onClick={load} disabled={loading} className="w-8 h-8 rounded-full flex items-center justify-center text-foreground-500 hover:text-foreground-950 hover:bg-background-100 disabled:opacity-40" title="Recargar">
              <i className={`ri-refresh-line ${loading ? 'animate-spin' : ''}`} />
            </button>
          }
        >
          <DataTable
            rows={tables}
            rowKey={(r) => r.table}
            empty={loading ? 'Cargando…' : 'Sin datos.'}
            columns={[
              { key: 't', label: 'Tabla', render: (r) => <span className="font-mono text-[11px] text-foreground-950">{r.table}</span> },
              { key: 'c', label: 'Filas', align: 'right', render: (r) => (r.count === null ? <span title={r.error} className="text-foreground-400">—</span> : fmtInt(r.count)) },
              { key: 'l', label: 'Última', align: 'right', render: (r) => (r.last ? <span title={new Date(r.last).toLocaleString('es-ES')}>{fmtAgo(r.last)}</span> : <span className="text-foreground-400">—</span>) },
            ]}
          />
        </Card>

        {/* Calidad de datos de analítica */}
        <Card title="Calidad de la analítica" subtitle="Eventos crudos de la tabla visits cargados en el panel">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-foreground-400">Eventos cargados</dt>
              <dd className="text-lg font-semibold text-foreground-950 tabular-nums">{fmtInt(quality.totalEvents)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-foreground-400">Rango</dt>
              <dd className="text-foreground-700 tabular-nums">{quality.firstEvent ? `${new Date(quality.firstEvent).toLocaleDateString('es-ES')} → ${new Date(quality.lastEvent!).toLocaleDateString('es-ES')}` : '—'}</dd>
              {quality.lastEvent && <dd className="text-[11px] text-foreground-400">último evento {fmtAgo(quality.lastEvent)}</dd>}
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-foreground-400">Excluidos (/admin)</dt>
              <dd className="text-foreground-700 tabular-nums">{fmtInt(quality.internalEvents)} <span className="text-foreground-400">({quality.totalEvents ? ((quality.internalEvents / quality.totalEvents) * 100).toFixed(1) : 0}%)</span></dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-foreground-400">Sin device_type</dt>
              <dd className="text-foreground-700 tabular-nums">{fmtInt(quality.withoutDevice)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[11px] uppercase tracking-wide text-foreground-400">Sesiones sin pageview</dt>
              <dd className="text-foreground-700 tabular-nums">{fmtInt(quality.sessionsWithoutPageview)} <span className="text-foreground-400">— eventos sueltos (p. ej. consentimiento de cookies dado tras la primera página)</span></dd>
            </div>
          </dl>
          <div className="mt-4 pt-4 border-t border-background-200/70 space-y-1.5">
            {quality.eventsByType.map((e) => (
              <div key={e.type} className="flex items-center justify-between text-xs">
                <span className="text-foreground-600">{EVENT_LABELS[e.type] ?? e.type} <span className="font-mono text-[10px] text-foreground-400">{e.type}</span></span>
                <span className="tabular-nums text-foreground-950">{fmtInt(e.count)}</span>
              </div>
            ))}
          </div>
          {quality.totalEvents >= 50_000 && <p className="mt-3 text-[11px] font-medium text-amber-700">Se ha alcanzado el tope de 50.000 eventos: los más antiguos no están en el análisis.</p>}
        </Card>
      </div>

      {/* Settings */}
      <Card
        title="Settings"
        subtitle={`${settings.length} claves en public.settings · los valores van ocultos (algunos guardan credenciales)`}
        pad={false}
        actions={<input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar clave…" className="px-3 py-1.5 bg-background-100 border border-background-200/70 rounded-full text-xs w-40 focus:outline-none focus:border-foreground-300/60" />}
      >
        <DataTable
          rows={filteredSettings}
          rowKey={(r) => r.key}
          empty={loading ? 'Cargando…' : 'Ninguna clave coincide.'}
          columns={[
            { key: 'k', label: 'Clave', render: (r) => <span className="font-mono text-[11px] text-foreground-950">{r.key}</span> },
            { key: 'v', label: 'Valor', render: (r) => <SettingValue v={r.value} /> },
            { key: 'u', label: 'Actualizado', align: 'right', render: (r) => <span title={new Date(r.updated_at).toLocaleString('es-ES')}>{fmtAgo(r.updated_at)}</span> },
          ]}
        />
      </Card>
    </div>
  );
}
