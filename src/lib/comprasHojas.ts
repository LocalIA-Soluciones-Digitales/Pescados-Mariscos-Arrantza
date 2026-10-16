// Varias fotos o PDF de golpe: qué hojas son páginas del mismo albarán y
// cuáles empiezan otro, y si un albarán ya estaba guardado (el papel que
// viene con el género y el PDF que llega por email son el mismo albarán).
import { normalizarCompra, unificarProveedor } from './comprasOcr';

export interface DatosHoja {
  proveedor: string | null;
  numero: string | null;
  total: number | null;
}

// «A26 / 5055» y «A26/5055» son el mismo número.
export const claveNumero = (n: string | null | undefined) => (n ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const numeroValido = (n: string | null | undefined) => claveNumero(n).length >= 3;

export function mismoProveedor(a: string, b: string): boolean {
  return normalizarCompra(a) === normalizarCompra(b) || unificarProveedor(a, [b]) === b;
}

// ¿La hoja sigue al albarán que va antes? Con número en las dos, manda el
// número; si no, un proveedor distinto empieza otro albarán, una hoja sin
// cabecera es continuación, y del mismo proveedor solo se junta si lo de
// antes aún no tenía total (el total va en la última página).
export function esContinuacion(albaran: DatosHoja, hoja: DatosHoja): boolean {
  if (numeroValido(albaran.numero) && numeroValido(hoja.numero)) return claveNumero(albaran.numero) === claveNumero(hoja.numero);
  if (albaran.proveedor && hoja.proveedor && !mismoProveedor(albaran.proveedor, hoja.proveedor)) return false;
  if (!hoja.proveedor && !numeroValido(hoja.numero)) return true;
  return albaran.total == null;
}

// Para cada hoja, si va con la anterior. `fijadas` son las que David ha
// unido o separado a mano (null = automático). La primera nunca se une.
export function agruparHojas(hojas: DatosHoja[], fijadas: (boolean | null)[] = []): boolean[] {
  const unidas: boolean[] = [];
  let albaran: DatosHoja | null = null;
  hojas.forEach((h, i) => {
    const unida = i > 0 && albaran != null && (fijadas[i] ?? esContinuacion(albaran, h));
    unidas.push(unida);
    albaran =
      unida && albaran
        ? { proveedor: albaran.proveedor ?? h.proveedor, numero: albaran.numero ?? h.numero, total: h.total ?? albaran.total }
        : { ...h };
  });
  return unidas;
}

// Otro albarán ya guardado (no anulado) con el mismo número y proveedor.
export function buscarRepetida<T extends { id: string; estado: string; proveedor: string | null; numero: string | null }>(
  compras: T[],
  proveedor: string | null,
  numero: string | null,
  excepto?: string,
): T | null {
  if (!numeroValido(numero)) return null;
  return (
    compras.find(
      (c) =>
        c.id !== excepto &&
        c.estado !== 'anulada' &&
        claveNumero(c.numero) === claveNumero(numero) &&
        (!c.proveedor || !proveedor || mismoProveedor(proveedor, c.proveedor)),
    ) ?? null
  );
}
