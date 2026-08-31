import { useMemo, useState } from 'react';
import { useCaja, type NewCajaMovimientoInput } from '@/hooks/useCaja';
import { useBasculaVentasDiarias } from '@/hooks/useBasculaVentas';
import { CAJA_TIPOS_GASTO, CAJA_TIPOS_INGRESO, CAJA_TIPO_LABELS, esCajaIngreso, type CajaMovimiento, type CajaMovimientoTipo } from '@/types/caja';

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
  const texto = new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatFechaCorta(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

interface Totales {
  ingresos: number;
  gasto_factura: number;
  gasto_extra: number;
}

function totalesVacios(): Totales {
  return { ingresos: 0, gasto_factura: 0, gasto_extra: 0 };
}

function totalGastos(t: Totales): number {
  return t.gasto_factura + t.gasto_extra;
}

function totalNeto(t: Totales): number {
  return t.ingresos - totalGastos(t);
}

function NetoBadge({ valor }: { valor: number }) {
  const positivo = valor >= 0;
  return <span className={`font-semibold ${positivo ? 'text-emerald-700' : 'text-red-600'}`}>{formatEUR(valor)}</span>;
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
  const [tipo, setTipo] = useState<CajaMovimientoTipo>('gasto_factura');
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

  const campo = 'h-9 px-2.5 bg-background-100 border border-background-200/70 rounded-md text-sm';

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl p-3 shadow-card flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1 w-36">
        <label className="text-[11px] text-foreground-400">Fecha</label>
        <input type="date" value={fecha} onChange={(e) => onFechaChange(e.target.value)} className={`${campo} w-full`} />
      </div>

      <div className="flex flex-col gap-1 w-40">
        <label className="text-[11px] text-foreground-400">Tipo</label>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as CajaMovimientoTipo)} className={`${campo} w-full`}>
          <optgroup label="Ingreso (manual, de respaldo)">
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

      <div className="flex flex-col gap-1 flex-1 min-w-[160px] max-w-xs">
        <label className="text-[11px] text-foreground-400">Concepto</label>
        <input
          type="text"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder={CONCEPTO_PLACEHOLDER[tipo]}
          className={`${campo} w-full`}
        />
      </div>

      <div className="flex flex-col gap-1 w-32">
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
            className={`${campo} w-full pr-6 text-right`}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-foreground-400">€</span>
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={saving || !importe}
        className="h-9 px-4 rounded-full text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-50 flex-shrink-0"
      >
        {saving ? 'Guardando…' : 'Añadir'}
      </button>
    </div>
  );
}

function FilaMovimiento({ m, onEliminar }: { m: CajaMovimiento; onEliminar: (m: CajaMovimiento) => void }) {
  const ingreso = esCajaIngreso(m.tipo);
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-background-200/50 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm text-foreground-950">{CAJA_TIPO_LABELS[m.tipo]}</p>
        {m.concepto && <p className="text-xs text-foreground-400 truncate">{m.concepto}</p>}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className={`text-sm font-medium ${ingreso ? 'text-emerald-700' : 'text-red-600'}`}>
          {ingreso ? '+' : '-'}{formatEUR(m.importe)}
        </span>
        <button type="button" onClick={() => onEliminar(m)} className="w-7 h-7 flex items-center justify-center rounded-full text-foreground-400 hover:bg-red-50 hover:text-red-600">
          <i className="ri-delete-bin-line text-sm"></i>
        </button>
      </div>
    </div>
  );
}

function VistaDia({
  fecha,
  onFechaChange,
  basculaHoy,
  ticketsHoy,
  movimientosDelDia,
  onCrear,
  onEliminar,
}: {
  fecha: string;
  onFechaChange: (fecha: string) => void;
  basculaHoy: number;
  ticketsHoy: number;
  movimientosDelDia: CajaMovimiento[];
  onCrear: (input: NewCajaMovimientoInput) => Promise<CajaMovimiento | null>;
  onEliminar: (id: string) => Promise<boolean>;
}) {
  const ingresosManuales = movimientosDelDia.filter((m) => esCajaIngreso(m.tipo));
  const gastos = movimientosDelDia.filter((m) => !esCajaIngreso(m.tipo));
  const totalIngresosManuales = ingresosManuales.reduce((n, m) => n + Number(m.importe), 0);
  const totalGastosDia = gastos.reduce((n, m) => n + Number(m.importe), 0);
  const totalIngresosDia = basculaHoy + totalIngresosManuales;

  const eliminar = async (m: CajaMovimiento) => {
    if (!confirm(`¿Eliminar este movimiento de ${formatEUR(m.importe)}?`)) return;
    await onEliminar(m.id);
  };

  return (
    <div className="space-y-4">
      <FormNuevoMovimiento fecha={fecha} onFechaChange={onFechaChange} onCrear={onCrear} />

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-background-50 border border-background-200/70 rounded-xl p-3 shadow-card">
          <p className="text-[11px] text-foreground-400 mb-1">Ingresos</p>
          <p className="text-lg font-semibold text-emerald-700">{formatEUR(totalIngresosDia)}</p>
          <p className="text-[11px] text-foreground-400 mt-0.5">
            {ticketsHoy > 0 ? `${ticketsHoy} ticket${ticketsHoy === 1 ? '' : 's'} de báscula` : 'Sin ventas de báscula'}
            {totalIngresosManuales > 0 && ` · ${formatEUR(totalIngresosManuales)} a mano`}
          </p>
        </div>
        <div className="bg-background-50 border border-background-200/70 rounded-xl p-3 shadow-card">
          <p className="text-[11px] text-foreground-400 mb-1">Gastos</p>
          <p className="text-lg font-semibold text-red-600">{formatEUR(totalGastosDia)}</p>
        </div>
        <div className="bg-background-50 border border-background-200/70 rounded-xl p-3 shadow-card">
          <p className="text-[11px] text-foreground-400 mb-1">Neto del día</p>
          <p className="text-lg"><NetoBadge valor={totalIngresosDia - totalGastosDia} /></p>
        </div>
      </div>

      <p className="text-sm font-medium text-foreground-950">{formatFechaLarga(fecha)}</p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="bg-background-50 border border-background-200/70 rounded-xl overflow-hidden shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-500 px-3 pt-2.5 pb-1.5">Ingresos</p>
          {basculaHoy > 0 && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-background-200/50 bg-background-100/50">
              <p className="text-sm text-foreground-700">Ventas báscula ({ticketsHoy} ticket{ticketsHoy === 1 ? '' : 's'})</p>
              <span className="text-sm font-medium text-emerald-700">+{formatEUR(basculaHoy)}</span>
            </div>
          )}
          {ingresosManuales.length === 0 && basculaHoy === 0 ? (
            <p className="text-xs text-foreground-400 px-3 py-3">Sin ingresos registrados.</p>
          ) : (
            ingresosManuales.map((m) => <FilaMovimiento key={m.id} m={m} onEliminar={eliminar} />)
          )}
        </div>
        <div className="bg-background-50 border border-background-200/70 rounded-xl overflow-hidden shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-500 px-3 pt-2.5 pb-1.5">Gastos</p>
          {gastos.length === 0 ? (
            <p className="text-xs text-foreground-400 px-3 pb-3">Sin gastos registrados.</p>
          ) : (
            gastos.map((m) => <FilaMovimiento key={m.id} m={m} onEliminar={eliminar} />)
          )}
        </div>
      </div>
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
      <td className="px-3 py-2 text-right whitespace-nowrap text-emerald-700">{formatEUR(totales.ingresos)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap text-red-600">{formatEUR(totales.gasto_factura)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap text-red-600">{formatEUR(totales.gasto_extra)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap"><NetoBadge valor={totalNeto(totales)} /></td>
    </tr>
  );

  return (
    <div className="overflow-x-auto bg-background-50 border border-background-200/70 rounded-xl shadow-card">
      <table className="w-full text-sm min-w-[520px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-foreground-400 border-b border-background-200/70">
            <th className="px-3 py-2 text-left font-medium"></th>
            <th className="px-3 py-2 text-right font-medium">Ingresos</th>
            <th className="px-3 py-2 text-right font-medium">Facturas</th>
            <th className="px-3 py-2 text-right font-medium">Gastos extra</th>
            <th className="px-3 py-2 text-right font-medium">Neto</th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-center text-foreground-400">Sin movimientos.</td>
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

// Suma el ingreso automático de báscula de ese día más cualquier ingreso
// manual (de respaldo) registrado, y acumula los gastos por tipo.
function acumularTotales(t: Totales, m: CajaMovimiento): Totales {
  if (esCajaIngreso(m.tipo)) return { ...t, ingresos: t.ingresos + Number(m.importe) };
  return { ...t, [m.tipo]: t[m.tipo] + Number(m.importe) };
}

function sumarTotales(a: Totales, b: Totales): Totales {
  return { ingresos: a.ingresos + b.ingresos, gasto_factura: a.gasto_factura + b.gasto_factura, gasto_extra: a.gasto_extra + b.gasto_extra };
}

function VistaMes({
  anio,
  mes,
  onAnioChange,
  onMesChange,
  ingresosPorFecha,
  movimientos,
  onIrADia,
}: {
  anio: number;
  mes: number;
  onAnioChange: (anio: number) => void;
  onMesChange: (mes: number) => void;
  ingresosPorFecha: Map<string, number>;
  movimientos: CajaMovimiento[];
  onIrADia: (fecha: string) => void;
}) {
  const prefijo = `${anio}-${String(mes + 1).padStart(2, '0')}`;

  const porDia = useMemo(() => {
    const map = new Map<string, Totales>();
    ingresosPorFecha.forEach((importe, fecha) => {
      if (!fecha.startsWith(prefijo)) return;
      map.set(fecha, { ...(map.get(fecha) ?? totalesVacios()), ingresos: importe });
    });
    movimientos
      .filter((m) => m.fecha.startsWith(prefijo))
      .forEach((m) => map.set(m.fecha, acumularTotales(map.get(m.fecha) ?? totalesVacios(), m)));
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, totales]) => ({ key: fecha, label: formatFechaCorta(fecha), totales }));
  }, [ingresosPorFecha, movimientos, prefijo]);

  const totalMes = porDia.reduce((acc, f) => sumarTotales(acc, f.totales), totalesVacios());

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
  ingresosPorFecha,
  movimientos,
  onIrAMes,
}: {
  anio: number;
  onAnioChange: (anio: number) => void;
  ingresosPorFecha: Map<string, number>;
  movimientos: CajaMovimiento[];
  onIrAMes: (mes: number) => void;
}) {
  const porMes = useMemo(() => {
    const totalesPorMes: Totales[] = Array.from({ length: 12 }, totalesVacios);
    ingresosPorFecha.forEach((importe, fecha) => {
      if (!fecha.startsWith(String(anio))) return;
      const mes = Number(fecha.split('-')[1]) - 1;
      totalesPorMes[mes].ingresos += importe;
    });
    movimientos
      .filter((m) => m.fecha.startsWith(String(anio)))
      .forEach((m) => {
        const mes = Number(m.fecha.split('-')[1]) - 1;
        totalesPorMes[mes] = acumularTotales(totalesPorMes[mes], m);
      });
    return totalesPorMes.map((totales, i) => ({ key: String(i), label: MESES[i], totales }));
  }, [ingresosPorFecha, movimientos, anio]);

  const totalAnio = porMes.reduce((acc, f) => sumarTotales(acc, f.totales), totalesVacios());

  return (
    <div className="space-y-4">
      <select value={anio} onChange={(e) => onAnioChange(Number(e.target.value))} className="px-3 py-1.5 bg-background-50 border border-background-200/70 rounded-full text-sm">
        {[anio - 1, anio, anio + 1].map((a) => <option key={a} value={a}>{a}</option>)}
      </select>

      <TablaTotales
        filas={porMes.filter((f) => f.totales.ingresos > 0 || totalGastos(f.totales) > 0)}
        totalRow={{ label: 'Total del año', totales: totalAnio }}
        onFilaClick={(key) => onIrAMes(Number(key))}
      />
    </div>
  );
}

type Vista = 'dia' | 'mes' | 'anio';

export default function CajaPanel() {
  const { movimientos, loading: loadingMovimientos, crearMovimiento, eliminarMovimiento } = useCaja();
  const { dias, loading: loadingBascula } = useBasculaVentasDiarias();
  const [vista, setVista] = useState<Vista>('dia');
  const [fecha, setFecha] = useState(hoyISO());
  const [mes, setMes] = useState(new Date().getMonth());
  const [anio, setAnio] = useState(new Date().getFullYear());

  const ingresosPorFecha = useMemo(() => {
    const map = new Map<string, number>();
    dias.forEach((d) => map.set(d.fecha, d.total_importe));
    return map;
  }, [dias]);

  const ticketsPorFecha = useMemo(() => {
    const map = new Map<string, number>();
    dias.forEach((d) => map.set(d.fecha, d.num_tickets));
    return map;
  }, [dias]);

  const movimientosDelDia = useMemo(() => movimientos.filter((m) => m.fecha === fecha), [movimientos, fecha]);

  const irADia = (nuevaFecha: string) => {
    setFecha(nuevaFecha);
    setVista('dia');
  };

  const irAMes = (nuevoMes: number) => {
    setMes(nuevoMes);
    setVista('mes');
  };

  const loading = loadingMovimientos || loadingBascula;

  return (
    <>
      <div className="px-4 md:px-8 pt-6">
        <p className="text-xs text-foreground-400 mb-4">
          Los ingresos se calculan solos a partir de las ventas de la báscula (Factura Simplificada y Factura), igual
          que en Ventas › Tienda — normalmente no hace falta tocar nada. Si algún día falla la báscula o se escapa una
          venta, puedes añadir un ingreso a mano desde aquí y se sumará al automático. Los gastos (facturas y gastos
          extra) siempre se registran a mano. El total de día, mes y año se calcula solo.
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
            basculaHoy={ingresosPorFecha.get(fecha) ?? 0}
            ticketsHoy={ticketsPorFecha.get(fecha) ?? 0}
            movimientosDelDia={movimientosDelDia}
            onCrear={crearMovimiento}
            onEliminar={eliminarMovimiento}
          />
        ) : vista === 'mes' ? (
          <VistaMes
            anio={anio}
            mes={mes}
            onAnioChange={setAnio}
            onMesChange={setMes}
            ingresosPorFecha={ingresosPorFecha}
            movimientos={movimientos}
            onIrADia={irADia}
          />
        ) : (
          <VistaAnio anio={anio} onAnioChange={setAnio} ingresosPorFecha={ingresosPorFecha} movimientos={movimientos} onIrAMes={irAMes} />
        )}
      </div>
    </>
  );
}
