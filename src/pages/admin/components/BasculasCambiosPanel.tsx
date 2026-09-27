import { ORIGENES, ORIGEN_COLORS, type Origen } from '@/types/origen';
import type { ArticuloBascula, CambioBascula, useBasculasCambios } from '@/hooks/useBasculasCambios';

type Datos = ReturnType<typeof useBasculasCambios>;

const NOMBRE_BASCULA: Record<Origen, string> = { pescaderia_1: 'Báscula 1', pescaderia_2: 'Báscula 2' };
const PAPEL_BASCULA: Record<Origen, string> = {
  pescaderia_1: 'sus precios se copian a la web',
  pescaderia_2: 'solo se vigila',
};

const TIPO_LABELS: Record<CambioBascula['tipo'], { label: string; clase: string }> = {
  precio: { label: 'Precio', clase: 'bg-amber-50 text-amber-700' },
  renombrado: { label: 'Otro producto', clase: 'bg-red-50 text-red-600' },
  nuevo: { label: 'Nuevo', clase: 'bg-emerald-50 text-emerald-700' },
  eliminado: { label: 'Eliminado', clase: 'bg-red-50 text-red-600' },
  familia: { label: 'Familia', clase: 'bg-sky-50 text-sky-700' },
  unidades: { label: 'Unidades', clase: 'bg-sky-50 text-sky-700' },
};

const euros = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const precio = (a: ArticuloBascula) => `${euros(a.precio)}/${a.unidades === 'un' ? 'ud' : a.unidades || 'kg'}`;
const fecha = (iso: string) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

function detalle(c: CambioBascula): string {
  const a = c.antes;
  const d = c.despues;
  switch (c.tipo) {
    case 'precio':
      return `${d!.nombre}: ${euros(a!.precio)} → ${euros(d!.precio)}`;
    case 'renombrado':
      return `${a!.nombre} → ${d!.nombre}`;
    case 'nuevo':
      return `${d!.nombre} · ${precio(d!)} · familia ${d!.familia}`;
    case 'eliminado':
      return `${a!.nombre} · ${precio(a!)}`;
    case 'familia':
      return `${d!.nombre}: familia ${a!.familia} → ${d!.familia}`;
    case 'unidades':
      return `${d!.nombre}: ${a!.unidades} → ${d!.unidades}`;
  }
}

function describir(a: ArticuloBascula | null): string {
  return a ? `${a.nombre} · ${precio(a)} · f${a.familia}` : '—';
}

function ChipBascula({ origen }: { origen: Origen }) {
  const c = ORIGEN_COLORS[origen];
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${c.bg} ${c.text}`}>{NOMBRE_BASCULA[origen]}</span>;
}

export default function BasculasCambiosPanel({ datos }: { datos: Datos }) {
  const { cambios, estados, diferencias, loading, nuevos, visto, marcarVisto, refetch } = datos;

  return (
    <div className="px-4 md:px-8 py-6 pb-28 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          {ORIGENES.map((o) => {
            const e = estados[o];
            return (
              <p key={o} className="text-sm text-foreground-500 flex flex-wrap items-center gap-2">
                <ChipBascula origen={o} />
                <span className="text-xs text-foreground-400">{PAPEL_BASCULA[o]} ·</span>
                {!e ? (
                  <span>sin leer todavía</span>
                ) : e.conectada === false ? (
                  <span className="text-amber-700">
                    <i className="ri-plug-line mr-1"></i>
                    sin conexión ({e.ultimo_intento ? fecha(e.ultimo_intento) : '—'})
                    {e.ultima_lectura && <> · última lectura buena {fecha(e.ultima_lectura)}</>}
                  </span>
                ) : (
                  <span>
                    <i className="ri-checkbox-circle-line mr-1 text-emerald-600"></i>
                    leída {e.ultima_lectura ? fecha(e.ultima_lectura) : '—'} · {e.articulos ?? 0} artículos
                  </span>
                )}
              </p>
            );
          })}
          <p className="text-[11px] text-foreground-400">Se leen cada hora. Si una báscula está apagada, se vuelve a intentar a la hora siguiente.</p>
        </div>
        <button
          type="button"
          onClick={refetch}
          className="px-3 py-1.5 rounded-full text-xs font-medium bg-background-50 border border-background-200/70 text-foreground-500 hover:text-foreground-950"
        >
          Actualizar
        </button>
      </div>

      {nuevos > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-800">
            <i className="ri-alarm-warning-line mr-1"></i>
            {nuevos} cambio{nuevos === 1 ? '' : 's'} nuevo{nuevos === 1 ? '' : 's'} en las básculas
          </p>
          <button type="button" onClick={marcarVisto} className="px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200">
            Marcar como visto
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-foreground-400">Cargando…</p>
      ) : (
        <>
          <section>
            <h2 className="text-sm font-semibold text-foreground-950 mb-2">Diferencias entre las dos básculas</h2>
            {diferencias.length === 0 ? (
              <p className="text-sm text-foreground-400">Coinciden en productos, familias, precios y unidades.</p>
            ) : (
              <div className="bg-background-50 border border-background-200/70 rounded-lg divide-y divide-background-200/70">
                {diferencias.map((d) => (
                  <div key={d.codigo} className="px-3 py-2 text-sm grid grid-cols-[3rem_1fr] gap-x-2">
                    <span className="font-mono text-foreground-500">{d.codigo}</span>
                    <div className="min-w-0">
                      <p className="text-foreground-950 break-words">Báscula 1: {describir(d.bascula1)}</p>
                      <p className="text-foreground-500 break-words">Báscula 2: {describir(d.bascula2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-foreground-950 mb-2">Registro de cambios</h2>
            {cambios.length === 0 ? (
              <p className="text-sm text-foreground-400">Sin cambios registrados.</p>
            ) : (
              <div className="space-y-2">
                {cambios.map((c) => {
                  const tipo = TIPO_LABELS[c.tipo];
                  return (
                    <div
                      key={c.id}
                      className={`bg-background-50 border rounded-lg p-3 ${c.created_at > visto ? 'border-amber-300' : 'border-background-200/70'}`}
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <ChipBascula origen={c.origen} />
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${tipo.clase}`}>{tipo.label}</span>
                        <span className="font-mono text-xs text-foreground-500">{c.codigo}</span>
                        <span className="text-[10px] text-foreground-400">{fecha(c.created_at)}</span>
                      </div>
                      <p className="text-sm text-foreground-950 break-words">{detalle(c)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
