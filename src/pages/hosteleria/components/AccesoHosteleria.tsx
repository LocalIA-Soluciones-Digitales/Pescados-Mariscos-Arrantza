import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCatalogoHosteleria } from '@/hooks/useCatalogoHosteleria';
import { useCart } from '@/hooks/useCart';
import { useCartSound } from '@/hooks/useCartSound';
import { type Producto, normalizeSearch } from '@/types/producto';
import type { ProductoHosteleria } from '@/types/hosteleria';
import CartDrawer from '@/pages/productos/components/CartDrawer';

// El catálogo de hostelería no incluye los campos de gestión de stock (el
// cliente no los necesita, y get_catalogo_hosteleria no los expone) —
// se rellenan con valores neutros solo para encajar en el tipo Producto que
// espera useCart/CartDrawer, que nunca los lee.
function toProducto(p: ProductoHosteleria): Producto {
  return {
    ...p,
    destacado: p.destacado,
    stock_kg: 0,
    stock_minimo: 0,
    stock_alerta_enviada: false,
    gestion_stock: false,
    created_at: '',
    updated_at: '',
  } as Producto;
}

/* ── Catálogo privado tras iniciar sesión: lista de precios compacta ──
   Los artículos vienen de la familia de la báscula de su tarifa (nombre y
   precio tal cual los tiene programados el pescadero), así que no llevan
   foto ni categoría: una lista tipo tarifa es más rápida de leer y de pedir. */
function ArticuloHosteleriaRow({
  producto,
  kgEnCarrito,
  onAdd,
  onIncrease,
  onDecrease,
}: {
  producto: ProductoHosteleria;
  kgEnCarrito: number | null;
  onAdd: () => void;
  onIncrease: () => void;
  onDecrease: () => void;
}) {
  const { t } = useTranslation();
  const [importe, unidad] = producto.precio.split('/');

  return (
    <li className="flex items-center gap-3 px-4 md:px-5 py-3 border-b border-background-200/60 last:border-b-0">
      <p className="flex-1 min-w-0 text-sm md:text-[15px] font-medium text-foreground-900 truncate">{producto.nombre_es}</p>
      <p className="text-sm md:text-[15px] font-semibold text-foreground-950 tabular-nums whitespace-nowrap">
        {importe}
        <span className="text-xs font-normal text-foreground-400">/{unidad}</span>
      </p>
      <div className="w-[112px] flex-shrink-0 flex justify-end">
        {kgEnCarrito === null ? (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-primary-500 text-background-50 hover:bg-primary-600 active:scale-95 transition-all"
          >
            <i className="ri-add-line"></i>
            {t('host.catalog.add')}
          </button>
        ) : (
          <div className="flex items-center justify-between w-full bg-primary-50 rounded-full p-0.5">
            <button
              type="button"
              onClick={onDecrease}
              className="w-7 h-7 flex items-center justify-center rounded-full text-primary-700 hover:bg-primary-100"
              aria-label="Reducir cantidad"
            >
              <i className="ri-subtract-line"></i>
            </button>
            <span className="text-xs font-semibold text-foreground-950 tabular-nums">{kgEnCarrito} kg</span>
            <button
              type="button"
              onClick={onIncrease}
              className="w-7 h-7 flex items-center justify-center rounded-full text-primary-700 hover:bg-primary-100"
              aria-label="Aumentar cantidad"
            >
              <i className="ri-add-line"></i>
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export function CatalogoHosteleriaView({
  token,
  nombreNegocio,
  onLogout,
}: {
  token: string;
  nombreNegocio: string;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const { productos, loading, invalida } = useCatalogoHosteleria(token);
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { playAddToCartSound } = useCartSound();

  const {
    items: cartItems,
    customer,
    addItem,
    removeItem,
    increaseKg,
    decreaseKg,
    setKg,
    clearCart,
    updateCustomer,
    getItem,
    totalProducts,
    totalWeight,
    setPreparation,
    setItemNote,
    justAddedId,
    orderHistory,
    saveLastOrder,
    loadOrder,
  } = useCart();

  // Rellena el negocio automáticamente con el nombre del cliente de hostelería
  // — no tiene sentido pedírselo si ya sabemos quién es por su sesión.
  useEffect(() => {
    if (!customer.business.trim()) updateCustomer('business', nombreNegocio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombreNegocio]);

  const productosAdaptados = useMemo(() => productos.map(toProducto), [productos]);

  const iniciales = nombreNegocio
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  const visibles = useMemo(() => {
    if (!search.trim()) return productos;
    const q = normalizeSearch(search.trim());
    return productos.filter((p) => normalizeSearch(p.nombre_es).includes(q));
  }, [productos, search]);

  if (invalida) {
    // El token ha caducado o se ha invalidado (p.ej. cambio de PIN desde el
    // panel): se cierra la sesión local automáticamente al detectarlo.
    onLogout();
    return null;
  }

  return (
    <main id="main-content" className="min-h-[70vh] max-w-[860px] mx-auto px-4 md:px-6 py-10 md:py-14 pb-28">
      <section className="flex items-center gap-4 bg-background-50 border border-background-200/70 rounded-2xl p-4 md:p-5 mb-6">
        <span className="w-12 h-12 md:w-14 md:h-14 flex-shrink-0 flex items-center justify-center rounded-full bg-primary-100 text-primary-700 font-heading text-lg md:text-xl font-semibold">
          {iniciales}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-primary-600 font-semibold">{t('host.catalog.private_label')}</p>
          <h1 className="font-heading text-xl md:text-2xl font-semibold text-foreground-950 truncate">{nombreNegocio}</h1>
          {!loading && <p className="text-xs text-foreground-400 mt-0.5">{t('host.catalog.count', { count: productos.length })}</p>}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-full text-xs font-medium bg-background-100 text-foreground-600 hover:bg-background-200/70 flex-shrink-0"
          aria-label={t('host.catalog.logout')}
        >
          <i className="ri-logout-box-r-line"></i>
          <span className="hidden sm:inline">{t('host.catalog.logout')}</span>
        </button>
      </section>

      {productos.length > 0 && (
        <div className="mb-4">
          <div className="relative sm:max-w-[340px]">
            <i className="ri-search-line absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground-400 text-sm"></i>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('host.catalog.search_placeholder')}
              className="w-full pl-9 pr-4 py-2.5 bg-background-100 border border-background-200/70 rounded-full text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-foreground-300/60"
            />
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-foreground-400">{t('host.catalog.loading')}</p>
      ) : productos.length === 0 ? (
        <p className="text-sm text-foreground-500 bg-background-100 rounded-lg px-4 py-6 text-center">{t('host.catalog.empty_list')}</p>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-foreground-400">{t('host.catalog.empty')}</p>
      ) : (
        <ul className="bg-background-50 rounded-xl border border-background-200/70 overflow-hidden">
          {visibles.map((producto) => {
            const item = getItem(producto.id);
            return (
              <ArticuloHosteleriaRow
                key={producto.id}
                producto={producto}
                kgEnCarrito={item ? item.kg : null}
                onAdd={() => {
                  addItem(producto.id);
                  playAddToCartSound();
                }}
                onIncrease={() => increaseKg(producto.id)}
                onDecrease={() => {
                  if ((item?.kg ?? 0) <= 0.5) removeItem(producto.id);
                  else decreaseKg(producto.id);
                }}
              />
            );
          })}
        </ul>
      )}

      {/* Botón flotante del carrito */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 flex items-center justify-center rounded-full bg-primary-500 text-background-50 shadow-lg hover:bg-primary-600 active:scale-95 transition-all duration-300"
        aria-label={t('products.cart_label')}
      >
        <i className="ri-shopping-cart-line text-xl"></i>
        {totalProducts > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] flex items-center justify-center rounded-full bg-accent-500 text-background-50 text-[11px] font-bold leading-none px-1.5">
            {totalProducts}
          </span>
        )}
      </button>

      <CartDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        productos={productosAdaptados}
        items={cartItems}
        customer={customer}
        onIncrease={increaseKg}
        onDecrease={decreaseKg}
        onSetKg={setKg}
        onRemove={removeItem}
        onClearCart={clearCart}
        onCustomerChange={updateCustomer}
        onPreparationChange={setPreparation}
        onNoteChange={setItemNote}
        totalProducts={totalProducts}
        totalWeight={totalWeight}
        justAddedId={justAddedId}
        orderHistory={orderHistory}
        onSaveLastOrder={saveLastOrder}
        onLoadOrder={loadOrder}
        allowAccountPayment
      />
    </main>
  );
}
