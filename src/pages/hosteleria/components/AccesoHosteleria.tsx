import { useMemo } from 'react';
import { useCatalogoHosteleria } from '@/hooks/useCatalogoHosteleria';
import type { Producto, ProductoCategoria } from '@/types/producto';
import type { ProductoHosteleria } from '@/types/hosteleria';
import { CatalogoTienda } from '@/pages/productos/page';

const CATEGORIAS: ProductoCategoria[] = ['pescado', 'especial', 'marisco', 'congelados', 'preparados', 'raciones'];

// El catálogo de hostelería no incluye los campos de gestión de stock (el
// cliente no los necesita, y get_catalogo_hosteleria no los expone) — se
// rellenan con valores neutros para encajar en el tipo Producto que usan el
// catálogo y la cesta de la tienda. Todo lo que está en su tarifa se puede
// pedir: sin "agotado" ni etiquetas de novedad.
function toProducto(p: ProductoHosteleria): Producto {
  return {
    ...p,
    categoria: CATEGORIAS.includes(p.categoria as ProductoCategoria) ? (p.categoria as ProductoCategoria) : 'pescado',
    subcategoria: null,
    estado: 'available',
    disponible: true,
    destacado: false,
    stock_kg: 0,
    stock_minimo: 0,
    stock_alerta_enviada: false,
    gestion_stock: false,
    visible_web: true,
    por_piezas: false,
    pesos_pieza: null,
    created_at: '',
    updated_at: '',
  } as Producto;
}

// "Bares y restaurantes" → "bares-y-restaurantes", para la cesta de cada cliente.
function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/* ── Catálogo privado tras iniciar sesión ──
   Mismo catálogo que la tienda (fichas con foto, filtros, buscador y cesta),
   pero con los artículos y precios de la tarifa de este cliente, su propia
   cesta y la opción de cargar el pedido a su cuenta. */
export function CatalogoHosteleriaView({
  token,
  nombreNegocio,
  onLogout,
}: {
  token: string;
  nombreNegocio: string;
  onLogout: () => void;
}) {
  const { productos, loading, invalida } = useCatalogoHosteleria(token);
  const productosAdaptados = useMemo(() => productos.map(toProducto), [productos]);

  if (invalida) {
    // El token ha caducado o se ha invalidado (p.ej. cambio de PIN desde el
    // panel): se cierra la sesión local automáticamente al detectarlo.
    onLogout();
    return null;
  }

  return (
    <CatalogoTienda
      productos={productosAdaptados}
      productosLoading={loading}
      hosteleria={{ nombreNegocio, ambitoCesta: `hosteleria-${slug(nombreNegocio)}`, onLogout }}
    />
  );
}
