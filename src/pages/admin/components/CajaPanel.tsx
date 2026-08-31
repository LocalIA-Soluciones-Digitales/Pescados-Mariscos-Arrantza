import { useMemo, useState } from 'react';
import { useCaja, type NewCajaMovimientoInput } from '@/hooks/useCaja';
import { CAJA_TIPO_LABELS, CAJA_TIPOS_GASTO, CAJA_TIPOS_INGRESO, esCajaIngreso, type CajaMovimiento, type CajaMovimientoTipo } from '@/types/caja';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const CONCEPTO_PLACEHOLDER: Record<CajaMovimientoTipo, string> = {
  ingreso_tarjeta: 'Nota (opcional)',
  ingreso_efectivo: 'Nota (opcional)',
  ingreso_bares: 'Bar o cliente (opcional)',
  gasto_factura: 'Proveedor (opcional)',
  gasto_extra: 'Motivo (opcional)',
};

function hoyISO(): string {
  return new Date().toLocaleDateString('sv-SE');
}

function formatEUR(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function formatFechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatFechaCorta(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

interface Totales {
  ingreso_tarjeta: number;
  ingreso_efectivo: number;
  ingreso_bares: number;
  gasto_factura: number;
  gasto_extra: number;
}

function totalesVacios(): Totales {
  return { ingreso_tarjeta: 0, ingreso_efectivo: 0, ingreso_bares: 0, gasto_factura: 0, gasto_extra: 0 };
}

function acumular(t: Totales, m: CajaMovimiento): Totales {
  return { ...t, [m.tipo]: t[m.tipo] + Number(m.importe) };
}

function totalIngresos(t: Totales): number {
  return t.ingreso_tarjeta + t.ingreso_efectivo + t.ingreso_bares;
}

function totalGastos(t: Totales): number {
  return t.gasto_factura + t.gasto_extra;
}

function totalNeto(t: Totales): number {
  return totalIngresos(t) - totalGastos(t);
}

function NetoBadge({ valor }: { valor: number }) {
  const positivo = valor >= 0;
  return (
    <span className={`font-semibold ${positivo ? 'text-emerald-700' : 'text-red-600'}`}>{formatEUR(valor)}</span>
  );
}

function FormNuevoMovimiento({
  fecha,
  onFechaChange,
  onCrear,
}: {
  fecha: string;
  onFechaChange: (fecha: string) => void;
  onCrear: (input: NewCajaMovimientoInput) => Promise<CajaMovimiento | null>;
}) {
  const [tipo, setTipo] = useState<CajaMovimientoTipo>('ingreso_tarjeta');
  const [concepto, setConcepto] = useState('');
  const [importe, setImporte] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const valor = Number(importe.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) return;
    setSaving(true);
    const creado = await onCrear({ fecha, tipo, concepto: concepto.trim() || null, importe: valor });
    setSaving(false);
    if (!creado) {
      alert('No se pudo guardar el movimiento.');
      return;
    }
    setConcepto('');
    setImporte('');
  };

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl p-3 shadow-card flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-foreground-400">Fecha</label>
        <input
          type="date"
          value={fecha}
          onChange={(e) => onFechaChange(e.target.value)}
          className="px-2 py-1.5 bg-background-100 border border-background-200/70 rounded-md text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-foreground-400">Tipo</label>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as CajaMovimientoTipo)}
          className="px-2 py-1.5 bg-background-100 border border-background-200/70 rounded-md text-sm"
        >
          <optgroup label="Ingreso">
            {CAJA_TIPOS_INGRESO.map((t) => (
              <option key={t} value={t}>{CAJA_TIPO_LABELS[t]}</option>
            ))}
          </optgroup>
          <optgroup label="Gasto">
            {CAJA_TIPOS_GASTO.map((t) => (
              <option key={t} value={t}>{CAJA_TIPO_LABELS[t]}</option>
            ))}
          </optgroup>
        </select>
      </div>

      <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
        <label className="text-[11px] text-foreground-400">Concepto</label>
        <input
          type="text"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder={CONCEPTO_PLACEHOLDER[tipo]}
          className="w-full px-2 py-1.5 bg-background-100 border border-background-200/70 rounded-md text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-foreground-400">Importe</label>
        <div className="relative">
          <input
            type="number"
            step="0.01"
            min="0"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="0,00"
            className="w-28 pl-2 pr-6 py-1.5 bg-background-100 border border-background-200/70 rounded-md text-sm text-right"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-foreground-400">€</span>
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={saving || !importe}
        className="px-4 py-2 rounded-full text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-50"
      >
        {saving ? 'Guardando…' : 'Añadir'}
      </button>
    </div>
  );
}

function VistaDia({
  fecha,
  onFechaChange,
  movimientosDelDia,
  onCrear,
  onEliminar,
}: {
  fecha: string;
  onFechaChange: (fecha: string) => void;
  movimientosDelDia: CajaMovimiento[];
  onCrear: (input: NewCajaMovimientoInput) => Promise<CajaMovimiento | null>;
  onEliminar: (id: string) => Promise<boolean>;
}) {
  const ingresos = movimientosDelDia.filter((m) => esCajaIngreso(m.tipo));
  const gastos = movimientosDelDia.filter((m) => !esCajaIngreso(m.tipo));
  const totales = movimientosDelDia.reduce(acumular, totalesVacios());

  const eliminar = async (m: CajaMovimiento) => {
    if (!confirm(`¿Eliminar este movimiento de ${formatEUR(m.importe)}?`)) return;
    await onEliminar(m.id);
  };

  const Fila = ({ m }: { m: CajaMovimiento }) => (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-background-200/50 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm text-foreground-950">{CAJA_TIPO_LABELS[m.tipo]}</p>
        {m.concepto && <p className="text-xs text-foreground-400 truncate">{m.concepto}</p>}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className={`text-sm font-medium ${esCajaIngreso(m.tipo) ? 'text-emerald-700' : 'text-red-600'}`}>
          {esCajaIngreso(m.tipo) ? '+' : '-'}{formatEUR(m.importe)}
        </span>
        <button type="button" onClick={() => eliminar(m)} className="w-7 h-7 flex items-center justify-center rounded-full text-foreground-400 hover:bg-red-50 hover:text-red-600">
          <i className="ri-delete-bin-line text-sm"></i>
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <FormNuevoMovimiento fecha={fecha} onFechaChange={onFechaChange} onCrear={onCrear} />

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-background-50 border border-background-200/70 rounded-xl p-3 shadow-card">
          <p className="text-[11px] text-foreground-400 mb-1">Ingresos</p>
          <p className="text-lg font-semibold text-emerald-700">{formatEUR(totalIngresos(totales))}</p>
        </div>
        <div className="bg-background-50 border border-background-200/70 rounded-xl p-3 shadow-card">
          <p className="text-[11px] text-foreground-400 mb-1">Gastos</p>
          <p className="text-lg font-semibold text-red-600">{formatEUR(totalGastos(totales))}</p>
        </div>
        <div className="bg-background-50 border border-background-200/70 rounded-xl p-3 shadow-card">
          <p className="text-[11px] text-foreground-400 mb-1">Neto del día</p>
          <p className="text-lg"><NetoBadge valor={totalNeto(totales)} /></p>
        </div>
      </div>

      <p className="text-sm font-medium text-foreground-950 capitalize">{formatFechaLarga(fecha)}</p>

      {movimientosDelDia.length === 0 ? (
        <p className="text-sm text-foreground-400">Todavía no hay movimientos este día.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-background-50 border border-background-200/70 rounded-xl overflow-hidden shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-500 px-3 pt-2.5 pb-1.5">Ingresos</p>
            {ingresos.length === 0 ? (
              <p className="text-xs text-foreground-400 px-3 pb-3">Sin ingresos registrados.</p>
            ) : (
              ingresos.map((m) => <Fila key={m.id} m={m} />)
            )}
          </div>
          <div className="bg-background-50 border border-background-200/70 rounded-xl overflow-hidden shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-500 px-3 pt-2.5 pb-1.5">Gastos</p>
            {gastos.length === 0 ? (
              <p className="text-xs text-foreground-400 px-3 pb-3">Sin gastos registrados.</p>
            ) : (
              gastos.map((m) => <Fila key={m.id} m={m} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TablaTotales({
  filas,
  totalRow,
  onFilaClick,
}: {
  filas: { key: string; label: string; totales: Totales }[];
  totalRow: { label: string; totales: Totales };
  onFilaClick?: (key: string) => void;
}) {
  const Row = ({ label, totales, onClick, bold }: { label: string; totales: Totales; onClick?: () => void; bold?: boolean }) => (
    <tr onClick={onClick} className={`${onClick ? 'cursor-pointer hover:bg-background-100' : ''} ${bold ? 'font-semibold border-t-2 border-background-200' : 'border-b border-background-200/50'}`}>
      <td className="px-3 py-2 whitespace-nowrap">{label}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">{formatEUR(totales.ingreso_tarjeta)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">{formatEUR(totales.ingreso_efectivo)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">{formatEUR(totales.ingreso_bares)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap text-red-600">{formatEUR(totales.gasto_factura)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap text-red-600">{formatEUR(totales.gasto_extra)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap"><NetoBadge valor={totalNeto(totales)} /></td>
    </tr>
  );

  return (
    <div className="overflow-x-auto bg-background-50 border border-background-200/70 rounded-xl shadow-card">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-foreground-400 border-b border-background-200/70">
            <th className="px-3 py-2 text-left font-medium"></th>
            <th className="px-3 py-2 text-right font-medium">Tarjeta</th>
            <th className="px-3 py-2 text-right font-medium">Efectivo</th>
            <th className="px-3 py-2 text-right font-medium">Bares</th>
            <th className="px-3 py-2 text-right font-medium">Facturas</th>
            <th className="px-3 py-2 text-right font-medium">Gastos extra</th>
            <th className="px-3 py-2 text-right font-medium">Neto</th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-4 text-center text-foreground-400">Sin movimientos.</td>
            </tr>
          ) : (
            filas.map((f) => <Row key={f.key} label={f.label} totales={f.totales} onClick={onFilaClick ? () => onFilaClick(f.key) : undefined} />)
          )}
          <Row label={totalRow.label} totales={totalRow.totales} bold />
        </tbody>
      </table>
    </div>
  );
}

function VistaMes({
  anio,
  mes,
  onAnioChange,
  onMesChange,
  movimientos,
  onIrADia,
}: {
  anio: number;
  mes: number;
  onAnioChange: (anio: number) => void;
  onMesChange: (mes: number) => void;
  movimientos: CajaMovimiento[];
  onIrADia: (fecha: string) => void;
}) {
  const delMes = useMemo(
    () => movimientos.filter((m) => {
      const [y, mo] = m.fecha.split('-').map(Number);
      return y === anio && mo - 1 === mes;
    }),
    [movimientos, anio, mes],
  );

  const porDia = useMemo(() => {
    const map = new Map<string, Totales>();
    delMes.forEach((m) => map.set(m.fecha, acumular(map.get(m.fecha) ?? totalesVacios(), m)));
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, totales]) => ({ key: fecha, label: formatFechaCorta(fecha), totales }));
  }, [delMes]);

  const totalMes = delMes.reduce(acumular, totalesVacios());

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select value={mes} onChange={(e) => onMesChange(Number(e.target.value))} className="px-3 py-1.5 bg-background-50 border border-background-200/70 rounded-full text-sm">
          {MESES.map((nombre, i) => <option key={nombre} value={i}>{nombre}</option>)}
        </select>
        <select value={anio} onChange={(e) => onAnioChange(Number(e.target.value))} className="px-3 py-1.5 bg-background-50 border border-background-200/70 rounded-full text-sm">
          {[anio - 1, anio, anio + 1].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <TablaTotales filas={porDia} totalRow={{ label: 'Total del mes', totales: totalMes }} onFilaClick={onIrADia} />
    </div>
  );
}

function VistaAnio({
  anio,
  onAnioChange,
  movimientos,
  onIrAMes,
}: {
  anio: number;
  onAnioChange: (anio: number) => void;
  movimientos: CajaMovimiento[];
  onIrAMes: (mes: number) => void;
}) {
  const delAnio = useMemo(() => movimientos.filter((m) => m.fecha.startsWith(String(anio))), [movimientos, anio]);

  const porMes = useMemo(() => {
    const totalesPorMes: Totales[] = Array.from({ length: 12 }, totalesVacios);
    delAnio.forEach((m) => {
      const mes = Number(m.fecha.split('-')[1]) - 1;
      totalesPorMes[mes] = acumular(totalesPorMes[mes], m);
    });
    return totalesPorMes.map((totales, i) => ({ key: String(i), label: MESES[i], totales }));
  }, [delAnio]);

  const totalAnio = delAnio.reduce(acumular, totalesVacios());

  return (
    <div className="space-y-4">
      <select value={anio} onChange={(e) => onAnioChange(Number(e.target.value))} className="px-3 py-1.5 bg-background-50 border border-background-200/70 rounded-full text-sm">
        {[anio - 1, anio, anio + 1].map((a) => <option key={a} value={a}>{a}</option>)}
      </select>

      <TablaTotales
        filas={porMes.filter((f) => totalIngresos(f.totales) > 0 || totalGastos(f.totales) > 0)}
        totalRow={{ label: 'Total del año', totales: totalAnio }}
        onFilaClick={(key) => onIrAMes(Number(key))}
      />
    </div>
  );
}

type Vista = 'dia' | 'mes' | 'anio';

export default function CajaPanel() {
  const { movimientos, loading, crearMovimiento, eliminarMovimiento } = useCaja();
  const [vista, setVista] = useState<Vista>('dia');
  const [fecha, setFecha] = useState(hoyISO());
  const [mes, setMes] = useState(new Date().getMonth());
  const [anio, setAnio] = useState(new Date().getFullYear());

  const movimientosDelDia = useMemo(() => movimientos.filter((m) => m.fecha === fecha), [movimientos, fecha]);

  const irADia = (nuevaFecha: string) => {
    setFecha(nuevaFecha);
    setVista('dia');
  };

  const irAMes = (nuevoMes: number) => {
    setMes(nuevoMes);
    setVista('mes');
  };

  return (
    <>
      <div className="px-4 md:px-8 pt-6">
        <p className="text-xs text-foreground-400 mb-4">
          Registra aquí cada ingreso (tarjeta, efectivo o venta a bares) y cada gasto (facturas de proveedor o gastos
          extra) del día. El total de ingresos, gastos y el neto se calculan solos, tanto por día como por mes y por
          año — no hace falta sumar nada a mano.
        </p>
      </div>

      <div
        className="sticky z-10 bg-background-100/95 backdrop-blur-sm border-b border-background-200/50 px-4 md:px-8 py-3 flex items-center gap-1.5"
        style={{ top: 'var(--admin-header-height, 0px)' }}
      >
        {([
          { value: 'dia', label: 'Día' },
          { value: 'mes', label: 'Mes' },
          { value: 'anio', label: 'Año' },
        ] as { value: Vista; label: string }[]).map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => setVista(v.value)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
              vista === v.value ? 'bg-primary-500 text-background-50' : 'bg-background-50 text-foreground-500 hover:bg-background-200/70'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="px-4 md:px-8 py-6 pb-28">
        {loading ? (
          <p className="text-sm text-foreground-400">Cargando…</p>
        ) : vista === 'dia' ? (
          <VistaDia
            fecha={fecha}
            onFechaChange={setFecha}
            movimientosDelDia={movimientosDelDia}
            onCrear={crearMovimiento}
            onEliminar={eliminarMovimiento}
          />
        ) : vista === 'mes' ? (
          <VistaMes anio={anio} mes={mes} onAnioChange={setAnio} onMesChange={setMes} movimientos={movimientos} onIrADia={irADia} />
        ) : (
          <VistaAnio anio={anio} onAnioChange={setAnio} movimientos={movimientos} onIrAMes={irAMes} />
        )}
      </div>
    </>
  );
}
