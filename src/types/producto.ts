export type ProductoCategoria = 'pescado' | 'especial' | 'raciones' | 'marisco' | 'congelados';
export type ProductoEstado = 'available' | 'new' | 'premium' | 'seasonal';

export interface Producto {
  id: string;
  nombre_es: string;
  nombre_eu: string | null;
  descripcion_es: string | null;
  descripcion_eu: string | null;
  origen_es: string | null;
  origen_eu: string | null;
  precio: string;
  categoria: ProductoCategoria;
  subcategoria: string | null;
  imagen_url: string | null;
  estado: ProductoEstado;
  disponible: boolean;
  destacado: boolean;
  stock_kg: number;
  stock_minimo: number;
  stock_alerta_enviada: boolean;
  orden: number;
  created_at: string;
  updated_at: string;
}

export type ProductoCampoBilingue = 'nombre' | 'descripcion' | 'origen';

export function pickLang(producto: Producto, campo: ProductoCampoBilingue, lang: string): string {
  const esValue = producto[`${campo}_es`] ?? '';
  if (lang.startsWith('eu')) {
    const euValue = producto[`${campo}_eu`];
    return euValue && euValue.trim() !== '' ? euValue : esValue;
  }
  return esValue;
}

// Strips accents/diacritics so search matches regardless of tildes (e.g. "salmon" matches "Salmón")
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
