import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buscarBasculaVentas, type BasculaVentaBusqueda } from '@/hooks/useBasculaVentas';
import type { BasculaVentaDiariaPorTienda } from '@/types/basculaVenta';
import { CAJA_TIPO_LABELS, esCajaIngreso, type CajaMovimiento, type CajaMovimientoTipo } from '@/types/caja';
import { ORIGENES, ORIGEN_COLORS, ORIGEN_LABELS, type Origen } from '@/types/origen';
import OrigenBadge from '@/components/base/OrigenBadge';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const ICONO_POR_TIPO: Record<CajaMovimientoTipo, string> = {
  ingreso_tarjeta: 'ri-bank-card-line',
  ingreso_efectivo: 'ri-money-euro-circle-line',
  ingreso_bares: 'ri-store-2-line',
  gasto_factura: 'ri-file-list-3-line',
  gasto_extra: 'ri-receipt-line',
};

const MAX_FILAS_INICIALES = 100;
const SIN_CONCEPTO = 'Sin concepto';
const VENTAS_BASCULA = 'Ventas de báscula';

function formatEUR(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function formatCantidad(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 3 });
}

function formatFechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const texto = new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatMes(prefijo: string): string {
  const [y, m] = prefijo.split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
}

// Normaliza para buscar sin que importen mayúsculas ni tildes
// ("salmon" encuentra "SALMÓN", "vinas" encuentra "Viñas").
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// ilike de Postgres sí distingue tildes: las vocales y la n de la búsqueda
// (ya normalizada) pasan a comodín "_" para no perder "SALMÓN" al buscar
// "salmon", y el filtro exacto se rehace luego en el cliente.
function patronIlike(busqueda: string): string {
  return `%${busqueda.replace(/[%_\\]/g, '').replace(/[aeioun]/g, '_')}%`;
}

function mesISO(d: Date): string {
  return d.toLocaleDateString('sv-SE').slice(0, 7);
}

// Exporta los resultados visibles (ya filtrados por texto/periodo/clase) a
// un CSV descargable, para llevar la búsqueda a una hoja de cálculo — con
// BOM para que Excel abra bien los acentos.
function exportarCSV(resultados: Resultado[]) {
  const cabecera = ['Fecha', 'Tipo', 'Concepto', 'Tienda', 'Importe'];
  const filas = resultados.map((r) => [
    r.fecha,
    r.clase === 'ingreso' ? 'Ingreso' : 'Gasto',
    r.titulo,
    r.origen ? ORIGEN_LABELS[r.origen] : '',
    (r.clase === 'gasto' ? -r.importe : r.importe).toFixed(2).replace('.', ','),
  ]);
  const csv = [cabecera, ...filas]
    .map((fila) => fila.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `caja-busqueda-${new Date().toLocaleDateString('sv-SE')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type Periodo = 'mes' | 'mes_pasado' | 'anio' | 'todo' | `m:${string}`;
type Clase = 'todo' | 'ingreso' | 'gasto';
type FiltroTienda = Origen | 'todas';
type FiltroFuente = 'todas' | 'bascula' | 'manual';
type FiltroTipoGasto = 'todos' | 'gasto_factura' | 'gasto_extra';

// Prefijo YYYY-MM si el periodo es un único mes, o null si abarca varios.
function mesDelPeriodo(periodo: Periodo): string | null {
  const hoy = new Date();
  if (periodo === 'mes') return mesISO(hoy);
  if (periodo === 'mes_pasado') return mesISO(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));
  if (periodo.startsWith('m:')) return periodo.slice(2);
  return null;
}

function rangoDelPeriodo(periodo: Periodo): { desde: string; hasta: string } | null {
  const mes = mesDelPeriodo(periodo);
  if (mes) {
    const [y, m] = mes.split('-').map(Number);
    return { desde: `${mes}-01`, hasta: new Date(y, m, 0).toLocaleDateString('sv-SE') };
  }
  if (periodo === 'anio') {
    const y = new Date().getFullYear();
    return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
  }
  return null;
}

function etiquetaPeriodo(periodo: Periodo): string {
  const mes = mesDelPeriodo(periodo);
  if (mes) return formatMes(mes);
  if (periodo === 'anio') return `Año ${new Date().getFullYear()}`;
  return 'Todo el histórico';
}

interface Resultado {
  key: string;
  fecha: string;
  clase: 'ingreso' | 'gasto';
  fuente: 'bascula' | 'manual';
  tipo: CajaMovimientoTipo | null;
  titulo: string;
  detalle: string;
  grupo: string;
  importe: number;
  origen: Origen | null;
  icon: string;
}

// Lo que necesita VistaDia para localizar y resaltar la fila exacta de un
// resultado dentro del día al que navega: los movimientos a mano se
// localizan por id (resaltar.key), las ventas de báscula por el nombre
// exacto del producto (resaltar.titulo coincide con designacion).
export interface ResaltarObjetivo {
  key: string;
  fuente: 'bascula' | 'manual';
  titulo: string;
  origen: Origen | null;
}

function desdeMovimiento(m: CajaMovimiento): Resultado {
  const concepto = m.concepto?.trim();
  return {
    key: m.id,
    fecha: m.fecha,
    clase: esCajaIngreso(m.tipo) ? 'ingreso' : 'gasto',
    fuente: 'manual',
    tipo: m.tipo,
    titulo: concepto || CAJA_TIPO_LABELS[m.tipo],
    detalle: esCajaIngreso(m.tipo) ? `${CAJA_TIPO_LABELS[m.tipo]} · a mano` : CAJA_TIPO_LABELS[m.tipo],
    grupo: concepto || SIN_CONCEPTO,
    importe: Number(m.importe),
    origen: m.origen,
    icon: ICONO_POR_TIPO[m.tipo],
  };
}

// Junta las líneas de báscula del mismo producto, día y tienda en una
// sola fila, para que buscar "merluza" en un año no liste miles de tickets.
function agruparLineasBascula(lineas: BasculaVentaBusqueda[]): Resultado[] {
  const map = new Map<string, Resultado & { cantidad: number; unidad: string }>();
  lineas.forEach((l) => {
    const key = `b|${l.fecha}|${l.origen}|${l.designacion}|${l.unidad}`;
    const actual = map.get(key);
    if (actual) {
      actual.cantidad += Number(l.cantidad);
      actual.importe += Number(l.importe);
      return;
    }
    map.set(key, {
      key,
      fecha: l.fecha,
      clase: 'ingreso',
      fuente: 'bascula',
      tipo: null,
      titulo: l.designacion,
      detalle: '',
      grupo: l.designacion,
      importe: Number(l.importe),
      origen: l.origen,
      icon: 'ri-scales-3-line',
      cantidad: Number(l.cantidad),
      unidad: l.unidad,
    });
  });
  return [...map.values()].map(({ cantidad, unidad, ...r }) => ({ ...r, detalle: `Báscula · ${formatCantidad(cantidad)} ${unidad}` }));
}

// flex-wrap (en vez de scroll horizontal) para que en móvil las opciones
// bajen a una segunda línea en vez de quedar cortadas fuera de la pantalla
// sin ninguna pista de que hay más — eso es lo que hacía que el filtro de
// Periodo pareciera roto en pantallas estrechas.
function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: string; dot?: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-background-100 border border-background-200/70">
      {options.map((o) => {
        const activo = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              activo
                ? 'bg-background-50 text-foreground-950 shadow-sm ring-1 ring-background-200/70'
                : 'text-foreground-500 hover:text-foreground-950'
            }`}
          >
            {o.dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${o.dot}`}></span>}
            {o.icon && <i className={`${o.icon} text-sm`}></i>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function GrupoFiltro({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0 w-full sm:w-auto">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground-400">{label}</span>
      <div className="flex flex-wrap items-center gap-2 min-w-0">{children}</div>
    </div>
  );
}

function TarjetaKpi({
  label,
  icon,
  valor,
  sub,
  tono,
  activa,
  atenuada,
  cargando,
  onClick,
}: {
  label: string;
  icon: string;
  valor: number;
  sub: string;
  tono: 'ingreso' | 'gasto' | 'neto';
  activa: boolean;
  atenuada: boolean;
  cargando?: boolean;
  onClick: () => void;
}) {
  const colores =
    tono === 'ingreso'
      ? { icon: 'bg-emerald-50 text-emerald-600', valor: 'text-emerald-700', ring: 'ring-emerald-500/50' }
      : tono === 'gasto'
        ? { icon: 'bg-red-50 text-red-500', valor: 'text-red-600', ring: 'ring-red-500/50' }
        : valor >= 0
          ? { icon: 'bg-primary-50 text-primary-600', valor: 'text-foreground-950', ring: 'ring-primary-500/50' }
          : { icon: 'bg-red-50 text-red-500', valor: 'text-red-600', ring: 'ring-primary-500/50' };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left bg-background-50 border border-background-200/70 rounded-2xl p-4 shadow-card transition-all hover:-translate-y-px hover:shadow-md ${
        activa ? `ring-2 ${colores.ring}` : ''
      } ${atenuada ? 'opacity-45' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm ${colores.icon}`}>
          <i className={icon}></i>
        </span>
        <span className="text-xs font-medium text-foreground-500">{label}</span>
        {activa && tono !== 'neto' && <i className="ri-filter-3-line ml-auto text-xs text-foreground-400"></i>}
      </div>
      <p className={`text-2xl sm:text-[28px] leading-tight font-semibold tabular-nums mt-3 ${colores.valor} ${cargando ? 'opacity-40' : ''}`}>
        {tono === 'gasto' && valor > 0 ? '-' : ''}
        {formatEUR(valor)}
      </p>
      <p className="text-xs text-foreground-400 mt-1">{sub}</p>
    </button>
  );
}

// Buscador unificado de Caja: una sola caja de texto que busca a la vez en
// gastos (por concepto), ingresos a mano y productos vendidos en báscula
// ("merluza", "gasolina", "Bizkaimar"…), con los resultados filtrables por
// clase, periodo, tienda, origen y tipo. Los movimientos de caja ya están en
// memoria (useCaja) y se filtran al teclear; las líneas de báscula son
// demasiadas para traerlas todas, así que solo se consultan al buscar un
// texto, acotadas al periodo. Sin texto, los ingresos de báscula salen de
// los totales diarios por tienda que ya carga CajaPanel.
export default function CajaBuscador({
  movimientos,
  basculaPorTienda,
  onIrADia,
}: {
  movimientos: CajaMovimiento[];
  basculaPorTienda: BasculaVentaDiariaPorTienda[];
  onIrADia: (fecha: string, resaltar?: ResaltarObjetivo) => void;
}) {
  const [texto, setTexto] = useState('');
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [clase, setClase] = useState<Clase>('todo');
  const [tienda, setTienda] = useState<FiltroTienda>('todas');
  const [fuente, setFuente] = useState<FiltroFuente>('todas');
  const [tipoGasto, setTipoGasto] = useState<FiltroTipoGasto>('todos');
  const [maxFilas, setMaxFilas] = useState(MAX_FILAS_INICIALES);
  const [sugerenciasAbiertas, setSugerenciasAbiertas] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const irAResultado = (r: Resultado) => {
    onIrADia(r.fecha, { key: r.key, fuente: r.fuente, titulo: r.titulo, origen: r.origen });
  };

  const busqueda = normalizar(texto);
  const rango = useMemo(() => rangoDelPeriodo(periodo), [periodo]);
  const enRango = (fecha: string) => !rango || (fecha >= rango.desde && fecha <= rango.hasta);

  // "/" enfoca el buscador desde cualquier parte de la página.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== '/' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => setMaxFilas(MAX_FILAS_INICIALES), [busqueda, periodo, clase, tienda, fuente, tipoGasto]);

  // Consulta a báscula con un pequeño retardo para no lanzar una petición
  // por tecla. El resultado se guarda junto a la clave con la que se pidió:
  // si no coincide con la búsqueda actual, aún está cargando.
  const claveBascula = busqueda.length >= 2 ? `${busqueda}|${rango?.desde ?? ''}|${rango?.hasta ?? ''}` : null;
  const [bascula, setBascula] = useState<{ clave: string; lineas: BasculaVentaBusqueda[] } | null>(null);
  useEffect(() => {
    if (!claveBascula) return;
    let cancelado = false;
    const t = setTimeout(() => {
      buscarBasculaVentas(patronIlike(busqueda), rango?.desde ?? null, rango?.hasta ?? null).then((lineas) => {
        if (!cancelado) setBascula({ clave: claveBascula, lineas });
      });
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [claveBascula, busqueda, rango]);
  const buscandoBascula = claveBascula !== null && bascula?.clave !== claveBascula;

  const mesesDisponibles = useMemo(() => {
    const set = new Set<string>();
    movimientos.forEach((m) => set.add(m.fecha.slice(0, 7)));
    basculaPorTienda.forEach((d) => set.add(d.fecha.slice(0, 7)));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [movimientos, basculaPorTienda]);

  // Todo lo que encaja con texto + periodo + subfiltros, de ambas clases:
  // de aquí salen los totales de las tarjetas, que así muestran ingresos y
  // gastos aunque la lista esté filtrada a una sola clase.
  const candidatos = useMemo(() => {
    const lista: Resultado[] = movimientos
      .filter((m) => enRango(m.fecha))
      .filter((m) => !busqueda || normalizar(`${m.concepto ?? ''} ${CAJA_TIPO_LABELS[m.tipo]}`).includes(busqueda))
      .map(desdeMovimiento);

    if (!busqueda) {
      basculaPorTienda
        .filter((d) => enRango(d.fecha))
        .forEach((d) =>
          lista.push({
            key: `d|${d.fecha}|${d.origen}`,
            fecha: d.fecha,
            clase: 'ingreso',
            fuente: 'bascula',
            tipo: null,
            titulo: VENTAS_BASCULA,
            detalle: `Báscula · ${d.num_tickets} ticket${d.num_tickets === 1 ? '' : 's'}`,
            grupo: VENTAS_BASCULA,
            importe: Number(d.total_importe),
            origen: d.origen,
            icon: 'ri-scales-3-line',
          }),
        );
    } else if (bascula && bascula.clave === claveBascula) {
      lista.push(...agruparLineasBascula(bascula.lineas.filter((l) => normalizar(l.designacion).includes(busqueda))));
    }

    return lista
      .filter((r) => {
        if (r.clase === 'ingreso' && clase === 'ingreso') {
          if (tienda !== 'todas' && r.origen !== tienda) return false;
          if (fuente !== 'todas' && r.fuente !== fuente) return false;
        }
        if (r.clase === 'gasto' && clase === 'gasto' && tipoGasto !== 'todos' && r.tipo !== tipoGasto) return false;
        return true;
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || (a.clase === b.clase ? b.importe - a.importe : a.clase === 'ingreso' ? -1 : 1));
    // enRango depende solo de rango.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movimientos, basculaPorTienda, busqueda, rango, bascula, claveBascula, clase, tienda, fuente, tipoGasto]);

  const resultados = useMemo(() => (clase === 'todo' ? candidatos : candidatos.filter((r) => r.clase === clase)), [candidatos, clase]);

  const totalIngresos = candidatos.filter((r) => r.clase === 'ingreso').reduce((n, r) => n + r.importe, 0);
  const totalGastos = candidatos.filter((r) => r.clase === 'gasto').reduce((n, r) => n + r.importe, 0);
  const nIngresos = candidatos.filter((r) => r.clase === 'ingreso').length;
  const nGastos = candidatos.length - nIngresos;

  // Conceptos de caja con más dinero del periodo. Antes se mostraban
  // siempre en una tira fija ("Rápido"); ahora alimentan el desplegable de
  // sugerencias del buscador, filtrados por lo que se va escribiendo.
  const conceptosFrecuentes = useMemo(() => {
    const map = new Map<string, { label: string; total: number; clase: 'ingreso' | 'gasto' }>();
    movimientos
      .filter((m) => enRango(m.fecha) && m.concepto?.trim())
      .forEach((m) => {
        const label = m.concepto!.trim();
        const key = normalizar(label);
        const actual = map.get(key) ?? { label, total: 0, clase: esCajaIngreso(m.tipo) ? 'ingreso' : 'gasto' };
        actual.total += Number(m.importe);
        map.set(key, actual);
      });
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movimientos, rango]);

  // Sugerencias por asunto (concepto), no por movimiento concreto: "cap"
  // debe proponer "Capotinas", no ya un gasto de un día suelto — para ir
  // directo a un movimiento en concreto está la lista de Movimientos de
  // abajo, que ya salta a la fila exacta al pulsarla (ver irAResultado).
  const sugerenciasConceptos = useMemo(() => {
    const base = busqueda ? conceptosFrecuentes.filter((c) => normalizar(c.label).includes(busqueda)) : conceptosFrecuentes;
    return base.slice(0, 6);
  }, [conceptosFrecuentes, busqueda]);

  const hayAlgunaSugerencia = sugerenciasConceptos.length > 0;

  const elegirSugerenciaConcepto = (label: string) => {
    setTexto(label);
    setSugerenciasAbiertas(false);
  };

  const desglose = useMemo(() => {
    const map = new Map<string, { label: string; total: number; n: number; clase: 'ingreso' | 'gasto' }>();
    resultados.forEach((r) => {
      const key = `${r.clase}|${normalizar(r.grupo)}`;
      const actual = map.get(key) ?? { label: r.grupo, total: 0, n: 0, clase: r.clase };
      actual.total += r.importe;
      actual.n += 1;
      map.set(key, actual);
    });
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 8);
  }, [resultados]);
  const maxDesglose = desglose[0]?.total ?? 0;

  // Evolución: por días si el periodo es un solo mes, por meses si no.
  const mesUnico = mesDelPeriodo(periodo);
  const evolucion = useMemo(() => {
    let claves: string[];
    if (mesUnico) {
      const [y, m] = mesUnico.split('-').map(Number);
      const dias = new Date(y, m, 0).getDate();
      claves = Array.from({ length: dias }, (_, i) => `${mesUnico}-${String(i + 1).padStart(2, '0')}`);
    } else if (periodo === 'anio') {
      const y = new Date().getFullYear();
      claves = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
    } else {
      const meses = candidatos.map((r) => r.fecha.slice(0, 7));
      if (meses.length === 0) return [];
      let [y, m] = meses.reduce((a, b) => (a < b ? a : b)).split('-').map(Number);
      const fin = mesISO(new Date());
      claves = [];
      for (let k = `${y}-${String(m).padStart(2, '0')}`; k <= fin; ) {
        claves.push(k);
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
        k = `${y}-${String(m).padStart(2, '0')}`;
      }
    }
    const largo = mesUnico ? 10 : 7;
    const buckets = new Map(claves.map((k) => [k, { ingreso: 0, gasto: 0 }]));
    candidatos.forEach((r) => {
      const b = buckets.get(r.fecha.slice(0, largo));
      if (b) b[r.clase] += r.importe;
    });
    return claves.map((k) => {
      const [yy, mm, dd] = k.split('-').map(Number);
      return {
        key: k,
        label: mesUnico ? String(dd) : `${MESES_CORTOS[mm - 1]}${periodo === 'anio' ? '' : ` ${String(yy).slice(2)}`}`,
        titulo: mesUnico ? formatFechaLarga(k) : formatMes(k),
        ...buckets.get(k)!,
      };
    });
  }, [candidatos, mesUnico, periodo]);
  const maxEvolucion = Math.max(
    0,
    ...evolucion.map((b) => Math.max(clase !== 'gasto' ? b.ingreso : 0, clase !== 'ingreso' ? b.gasto : 0)),
  );

  const hayFiltros = texto !== '' || periodo !== 'mes' || clase !== 'todo' || tienda !== 'todas' || fuente !== 'todas' || tipoGasto !== 'todos';
  const limpiar = () => {
    setTexto('');
    setPeriodo('mes');
    setClase('todo');
    setTienda('todas');
    setFuente('todas');
    setTipoGasto('todos');
  };

  const alternarClase = (c: Clase) => setClase((actual) => (actual === c ? 'todo' : c));

  return (
    <div className="space-y-4">
      <section className="bg-background-50 border border-background-200/70 rounded-2xl shadow-card overflow-hidden">
        <div className="p-4 sm:p-5 space-y-4">
          <div className="relative">
            <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-lg text-foreground-400"></i>
            <input
              ref={inputRef}
              type="search"
              autoFocus
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setSugerenciasAbiertas(true);
              }}
              onFocus={() => setSugerenciasAbiertas(true)}
              onBlur={() => setTimeout(() => setSugerenciasAbiertas(false), 120)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setTexto('');
              }}
              placeholder="Buscar en ingresos y gastos — gasolina, Bizkaimar, merluza, tarjeta…"
              className="h-14 w-full pl-12 pr-24 bg-background-100 border border-background-200/70 rounded-xl text-base placeholder:text-foreground-400 focus:outline-none focus:bg-background-50 focus:border-primary-400 focus:ring-4 focus:ring-primary-500/10 transition-all [&::-webkit-search-cancel-button]:hidden"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {buscandoBascula && <i className="ri-loader-4-line animate-spin text-foreground-400"></i>}
              {texto ? (
                <button
                  type="button"
                  onClick={() => {
                    setTexto('');
                    inputRef.current?.focus();
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-200/70 hover:text-foreground-950"
                >
                  <i className="ri-close-line"></i>
                </button>
              ) : (
                <kbd className="hidden sm:inline-flex items-center justify-center h-6 min-w-[24px] px-1.5 rounded-md border border-background-200 bg-background-50 text-[11px] text-foreground-400 font-sans">
                  /
                </kbd>
              )}
            </div>

            {sugerenciasAbiertas && hayAlgunaSugerencia && (
              <div className="absolute z-20 left-0 right-0 top-[calc(100%+0.5rem)] bg-background-50 border border-background-200/70 rounded-xl shadow-lg overflow-hidden max-h-[60vh] overflow-y-auto">
                <div className="py-1.5">
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground-400">
                    {busqueda ? 'Coincidencias' : 'Frecuentes'}
                  </p>
                  {sugerenciasConceptos.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => elegirSugerenciaConcepto(c.label)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-background-100"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.clase === 'ingreso' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                      <span className="flex-1 min-w-0 truncate text-sm text-foreground-800">{c.label}</span>
                      <span className="text-xs text-foreground-400 tabular-nums flex-shrink-0">{formatEUR(c.total)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <GrupoFiltro label="Mostrar">
              <Segmented<Clase>
                value={clase}
                onChange={setClase}
                options={[
                  { value: 'todo', label: 'Todo', icon: 'ri-stack-line' },
                  { value: 'ingreso', label: 'Ingresos', icon: 'ri-arrow-up-circle-line' },
                  { value: 'gasto', label: 'Gastos', icon: 'ri-arrow-down-circle-line' },
                ]}
              />
            </GrupoFiltro>

            <GrupoFiltro label="Periodo">
              <Segmented<Periodo>
                value={periodo}
                onChange={setPeriodo}
                options={[
                  { value: 'mes', label: 'Este mes' },
                  { value: 'mes_pasado', label: 'Mes pasado' },
                  { value: 'anio', label: 'Este año' },
                  { value: 'todo', label: 'Todo' },
                ]}
              />
              <div className="relative flex-shrink-0">
                <i className="ri-calendar-line absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-foreground-400 pointer-events-none"></i>
                <select
                  value={periodo.startsWith('m:') ? periodo : ''}
                  onChange={(e) => e.target.value && setPeriodo(e.target.value as Periodo)}
                  className={`h-8 pl-7 pr-3 rounded-lg border text-xs font-medium transition-colors ${
                    periodo.startsWith('m:')
                      ? 'bg-primary-500 border-primary-500 text-background-50'
                      : 'bg-background-100 border-background-200/70 text-foreground-500'
                  }`}
                >
                  <option value="">Otro mes…</option>
                  {mesesDisponibles.map((p) => (
                    <option key={p} value={`m:${p}`}>{formatMes(p)}</option>
                  ))}
                </select>
              </div>
            </GrupoFiltro>

            {clase === 'ingreso' && (
              <>
                <GrupoFiltro label="Tienda">
                  <Segmented<FiltroTienda>
                    value={tienda}
                    onChange={setTienda}
                    options={[
                      { value: 'todas', label: 'Todas' },
                      ...ORIGENES.map((o) => ({ value: o, label: ORIGEN_LABELS[o], dot: ORIGEN_COLORS[o].dot })),
                    ]}
                  />
                </GrupoFiltro>
                <GrupoFiltro label="Origen">
                  <Segmented<FiltroFuente>
                    value={fuente}
                    onChange={setFuente}
                    options={[
                      { value: 'todas', label: 'Todos' },
                      { value: 'bascula', label: 'Báscula', icon: 'ri-scales-3-line' },
                      { value: 'manual', label: 'A mano', icon: 'ri-edit-line' },
                    ]}
                  />
                </GrupoFiltro>
              </>
            )}

            {clase === 'gasto' && (
              <GrupoFiltro label="Tipo de gasto">
                <Segmented<FiltroTipoGasto>
                  value={tipoGasto}
                  onChange={setTipoGasto}
                  options={[
                    { value: 'todos', label: 'Todos' },
                    { value: 'gasto_factura', label: 'Facturas', icon: ICONO_POR_TIPO.gasto_factura },
                    { value: 'gasto_extra', label: 'Gastos extra', icon: ICONO_POR_TIPO.gasto_extra },
                  ]}
                />
              </GrupoFiltro>
            )}

            {hayFiltros && (
              <button
                type="button"
                onClick={limpiar}
                className="h-10 ml-auto inline-flex items-center gap-1 px-3 rounded-xl text-xs font-medium text-foreground-500 hover:bg-background-100 hover:text-foreground-950"
              >
                <i className="ri-refresh-line"></i>
                Limpiar
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-1">
        <h2 className="text-base font-semibold text-foreground-950">
          {texto.trim() ? <>Resultados para «{texto.trim()}»</> : 'Resumen'}
        </h2>
        <span className="text-sm text-foreground-400">· {etiquetaPeriodo(periodo)}</span>
        {buscandoBascula && <span className="text-xs text-foreground-400">· buscando en ventas de báscula…</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TarjetaKpi
          label="Ingresos"
          icon="ri-arrow-up-line"
          valor={totalIngresos}
          sub={`${nIngresos} movimiento${nIngresos === 1 ? '' : 's'}`}
          tono="ingreso"
          activa={clase === 'ingreso'}
          atenuada={clase === 'gasto'}
          cargando={buscandoBascula}
          onClick={() => alternarClase('ingreso')}
        />
        <TarjetaKpi
          label="Gastos"
          icon="ri-arrow-down-line"
          valor={totalGastos}
          sub={`${nGastos} gasto${nGastos === 1 ? '' : 's'}${nGastos > 1 ? ` · media ${formatEUR(totalGastos / nGastos)}` : ''}`}
          tono="gasto"
          activa={clase === 'gasto'}
          atenuada={clase === 'ingreso'}
          onClick={() => alternarClase('gasto')}
        />
        <TarjetaKpi
          label="Balance"
          icon="ri-scales-3-line"
          valor={totalIngresos - totalGastos}
          sub="Ingresos menos gastos"
          tono="neto"
          activa={false}
          atenuada={clase !== 'todo'}
          cargando={buscandoBascula}
          onClick={() => setClase('todo')}
        />
      </div>

      {resultados.length > 0 && (
        <div className="grid lg:grid-cols-5 gap-3">
          <section className="lg:col-span-3 bg-background-50 border border-background-200/70 rounded-2xl p-4 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-500">
                Evolución {mesUnico ? 'por día' : 'por mes'}
              </p>
              <div className="flex items-center gap-3 text-[11px] text-foreground-400">
                {clase !== 'gasto' && (
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500"></span>Ingresos</span>
                )}
                {clase !== 'ingreso' && (
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400"></span>Gastos</span>
                )}
              </div>
            </div>
            <div className="flex items-end gap-[3px] h-40 border-b border-background-200/70">
              {evolucion.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  title={`${b.titulo}${clase !== 'gasto' ? ` · Ingresos ${formatEUR(b.ingreso)}` : ''}${clase !== 'ingreso' ? ` · Gastos ${formatEUR(b.gasto)}` : ''}`}
                  onClick={() => (mesUnico ? onIrADia(b.key) : setPeriodo(`m:${b.key}`))}
                  className="group flex-1 min-w-0 h-full flex items-end justify-center gap-px rounded-t hover:bg-background-100"
                >
                  {clase !== 'gasto' && (
                    <span
                      className="flex-1 max-w-[14px] rounded-t-sm bg-emerald-500/85 group-hover:bg-emerald-500 transition-all"
                      style={{ height: `${maxEvolucion ? (b.ingreso / maxEvolucion) * 100 : 0}%` }}
                    ></span>
                  )}
                  {clase !== 'ingreso' && (
                    <span
                      className="flex-1 max-w-[14px] rounded-t-sm bg-red-400/85 group-hover:bg-red-500 transition-all"
                      style={{ height: `${maxEvolucion ? (b.gasto / maxEvolucion) * 100 : 0}%` }}
                    ></span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-[3px] mt-1.5">
              {evolucion.map((b, i) => (
                <span key={b.key} className="flex-1 min-w-0 text-center text-[10px] text-foreground-400 tabular-nums truncate">
                  {!mesUnico || i % 3 === 0 || i === evolucion.length - 1 ? b.label : ''}
                </span>
              ))}
            </div>
          </section>

          <section className="lg:col-span-2 bg-background-50 border border-background-200/70 rounded-2xl p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-500 mb-3">
              {texto.trim() ? 'Desglose' : 'Dónde se va y de dónde viene'}
            </p>
            <div className="space-y-2.5">
              {desglose.map((d) => {
                const buscable = d.label !== SIN_CONCEPTO && d.label !== VENTAS_BASCULA;
                return (
                  <button
                    key={`${d.clase}|${d.label}`}
                    type="button"
                    disabled={!buscable}
                    onClick={() => setTexto(d.label)}
                    className="w-full text-left group disabled:cursor-default"
                  >
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="truncate text-foreground-800 group-enabled:group-hover:underline">
                        {d.label} <span className="text-foreground-400">· {d.n}</span>
                      </span>
                      <span className={`tabular-nums font-medium flex-shrink-0 ${d.clase === 'ingreso' ? 'text-emerald-700' : 'text-red-600'}`}>
                        {formatEUR(d.total)}
                      </span>
                    </div>
                    <div className="h-1.5 mt-1 rounded-full bg-background-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${d.clase === 'ingreso' ? 'bg-emerald-500' : 'bg-red-400'}`}
                        style={{ width: `${maxDesglose ? (d.total / maxDesglose) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      <section className="bg-background-50 border border-background-200/70 rounded-2xl overflow-hidden shadow-card">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-background-200/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-500">Movimientos</p>
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-medium bg-background-100 text-foreground-500">
            {resultados.length}
          </span>
          {resultados.length > 0 && (
            <button
              type="button"
              onClick={() => exportarCSV(resultados)}
              className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-foreground-500 hover:bg-background-100 hover:text-foreground-950"
            >
              <i className="ri-download-2-line"></i>
              Exportar CSV
            </button>
          )}
        </div>
        {resultados.length === 0 ? (
          <div className="flex flex-col items-center text-center px-4 py-10">
            <span className="w-11 h-11 flex items-center justify-center rounded-full bg-background-100 text-foreground-400 text-xl mb-2">
              <i className={buscandoBascula ? 'ri-loader-4-line animate-spin' : 'ri-search-eye-line'}></i>
            </span>
            <p className="text-sm text-foreground-800">{buscandoBascula ? 'Buscando…' : 'Sin resultados'}</p>
            {!buscandoBascula && (
              <p className="text-xs text-foreground-400 mt-0.5">
                Prueba con otro periodo{hayFiltros ? ' o limpia los filtros' : ''}.
              </p>
            )}
          </div>
        ) : (
          <>
            {resultados.slice(0, maxFilas).map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => irAResultado(r)}
                title="Ver el día en caja"
                className="w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-background-200/50 last:border-b-0 hover:bg-background-100/60 transition-colors"
              >
                <span
                  className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full text-sm ${
                    r.clase === 'ingreso' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                  }`}
                >
                  <i className={r.icon}></i>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-sm text-foreground-950 truncate">{r.titulo}</p>
                    {r.origen && <OrigenBadge origen={r.origen} className="flex-shrink-0 hidden sm:inline-flex" />}
                  </div>
                  <p className="text-xs text-foreground-400 truncate">
                    {formatFechaLarga(r.fecha)} · {r.detalle}
                  </p>
                </div>
                <span
                  className={`text-sm font-semibold flex-shrink-0 tabular-nums ${r.clase === 'ingreso' ? 'text-emerald-700' : 'text-red-600'}`}
                >
                  {r.clase === 'ingreso' ? '+' : '-'}
                  {formatEUR(r.importe)}
                </span>
                <i className="ri-arrow-right-s-line text-foreground-300 flex-shrink-0"></i>
              </button>
            ))}
            {resultados.length > maxFilas && (
              <button
                type="button"
                onClick={() => setMaxFilas((n) => n + MAX_FILAS_INICIALES)}
                className="w-full py-3 text-xs font-medium text-foreground-500 hover:bg-background-100 hover:text-foreground-950"
              >
                Mostrar más ({resultados.length - maxFilas} restantes)
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
