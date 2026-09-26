import { ORIGENES, type Origen } from '@/types/origen';
import { esCajaIngreso, type CajaMovimiento } from '@/types/caja';

// Totales de Contabilidad (ingresos por tienda + gastos por tipo) y su
// aritmética, compartidos por CajaPanel y CajaResumenPeriodo.

export interface Totales {
  ingresos: number;
  ingresos_por_tienda: Partial<Record<Origen, number>>;
  gasto_factura: number;
  gasto_extra: number;
}

export function totalesVacios(): Totales {
  return { ingresos: 0, ingresos_por_tienda: {}, gasto_factura: 0, gasto_extra: 0 };
}

export function totalGastos(t: Totales): number {
  return t.gasto_factura + t.gasto_extra;
}

export function totalNeto(t: Totales): number {
  return t.ingresos - totalGastos(t);
}

// Suma un movimiento manual de caja: los ingresos (de respaldo) van a su
// tienda y los gastos se acumulan por tipo.
export function acumularTotales(t: Totales, m: CajaMovimiento): Totales {
  if (esCajaIngreso(m.tipo) && m.origen) {
    return {
      ...t,
      ingresos: t.ingresos + Number(m.importe),
      ingresos_por_tienda: { ...t.ingresos_por_tienda, [m.origen]: (t.ingresos_por_tienda[m.origen] ?? 0) + Number(m.importe) },
    };
  }
  if (m.tipo === 'gasto_factura' || m.tipo === 'gasto_extra') {
    return { ...t, [m.tipo]: t[m.tipo] + Number(m.importe) };
  }
  return t;
}

export function sumarTotales(a: Totales, b: Totales): Totales {
  const ingresos_por_tienda: Partial<Record<Origen, number>> = {};
  ORIGENES.forEach((o) => {
    ingresos_por_tienda[o] = (a.ingresos_por_tienda[o] ?? 0) + (b.ingresos_por_tienda[o] ?? 0);
  });
  return {
    ingresos: a.ingresos + b.ingresos,
    ingresos_por_tienda,
    gasto_factura: a.gasto_factura + b.gasto_factura,
    gasto_extra: a.gasto_extra + b.gasto_extra,
  };
}

export interface FilaPeriodo {
  key: string;
  label: string;
  labelCorto: string;
  totales: Totales;
  tickets: number;
  // Ingresos que vienen de báscula (sin los manuales), para el ticket medio.
  bascula: number;
  esActual: boolean;
  futuro: boolean;
  // Referencia con la que se compara esta fila: el mismo día de la semana
  // anterior (vistas por día) o el mismo mes del año anterior (vista Año).
  anterior?: { label: string; totales: Totales };
}

export interface PatronDia {
  label: string;
  media: number;
  tickets: number;
  dias: number;
}

export interface Agregado {
  totales: Totales;
  tickets: number;
  bascula: number;
}

export function agregar(filas: { totales: Totales; tickets: number; bascula: number }[]): Agregado {
  return filas.reduce<Agregado>(
    (acc, f) => ({ totales: sumarTotales(acc.totales, f.totales), tickets: acc.tickets + f.tickets, bascula: acc.bascula + f.bascula }),
    { totales: totalesVacios(), tickets: 0, bascula: 0 },
  );
}
