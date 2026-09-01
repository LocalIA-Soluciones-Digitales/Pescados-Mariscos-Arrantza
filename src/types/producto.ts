export type ProductoCategoria = 'pescado' | 'especial' | 'raciones' | 'marisco' | 'congelados';
export type ProductoEstado = 'available' | 'new' | 'premium' | 'seasonal';

export type CategoriaFiltro = 'todos' | ProductoCategoria | string;

// Mismo listado y orden que el filtro del catálogo público (categorías + subcategorías de
// pescado y marisco, anidadas bajo su categoría padre). Compartido por los filtros de
// Productos y Stock en el panel de gestión.
export const CATEGORIA_FILTROS: { value: CategoriaFiltro; label: string; tipo: 'categoria' | 'subcategoria'; parent?: ProductoCategoria }[] = [
  { value: 'todos', label: 'Todos', tipo: 'categoria' },
  { value: 'pescado', label: 'Pescado', tipo: 'categoria' },
  { value: 'marisco', label: 'Marisco', tipo: 'categoria' },
  { value: 'congelados', label: 'Congelados', tipo: 'categoria' },
  { value: 'raciones', label: 'Raciones', tipo: 'categoria' },
  { value: 'especial', label: 'Especial', tipo: 'categoria' },
  { value: 'azul', label: 'Pescado Azul', tipo: 'subcategoria', parent: 'pescado' },
  { value: 'blanco', label: 'Pescado Blanco', tipo: 'subcategoria', parent: 'pescado' },
  { value: 'cefalopodos', label: 'Cefalópodos', tipo: 'subcategoria', parent: 'pescado' },
  { value: 'bivalvos', label: 'Bivalvos / Moluscos', tipo: 'subcategoria', parent: 'marisco' },
  { value: 'crustaceos_grandes', label: 'Crustáceos Grandes', tipo: 'subcategoria', parent: 'marisco' },
  { value: 'gambas_langostinos', label: 'Gambas y Langostinos', tipo: 'subcategoria', parent: 'marisco' },
];

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
