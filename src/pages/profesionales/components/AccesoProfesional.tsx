import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCatalogoProfesional } from '@/hooks/useCatalogoProfesional';
import { useCart } from '@/hooks/useCart';
import { useCartSound } from '@/hooks/useCartSound';
import { CATEGORIA_FILTROS, type CategoriaFiltro, type Producto, normalizeSearch } from '@/types/producto';
import type { ProductoProfesional } from '@/types/profesional';
import ProductImagePlaceholder from '@/components/base/ProductImagePlaceholder';
import CartDrawer from '@/pages/productos/components/CartDrawer';

/* ── Tarjeta compacta de "¿ya tienes acceso?", visible en la landing pública ── */
export function AccesoProfesionalCard({
  onLogin,
  loading,
  error,
}: {
  onLogin: (codigo: string, pin: string) => Promise<boolean>;
  loading: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [codigo, setCodigo] = useState('');
  const [pin, setPin] = useState('');
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo.trim() || !pin.trim()) return;
    await onLogin(codigo.trim(), pin.trim());
  };

  return (
    <section className="bg-primary-50/60 border-y border-primary-100">
      <div className="max-w-[560px] mx-auto px-4 md:px-6 lg:px-12 py-8 md:py-10 text-center">
        {!expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-2 text-sm md:text-base font-semibold text-primary-700 hover:text-primary-800 cursor-pointer"
          >
            <i className="ri-lock-line"></i>
            {t('pro.access.prompt')}
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="text-left">
            <div className="flex items-center gap-2 mb-4 justify-center">
              <span className="w-9 h-9 flex items-center justify-center rounded-full bg-primary-100 text-primary-700">
                <i className="ri-lock-line"></i>
              </span>
              <h3 className="font-heading text-base md:text-lg font-semibold text-foreground-950">{t('pro.access.title')}</h3>
            </div>
            <p className="text-xs md:text-sm text-foreground-500 text-center mb-5">{t('pro.access.subtitle')}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <input
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder={t('pro.access.code_placeholder')}
                autoComplete="username"
                className="w-full px-4 py-3 bg-background-50 border border-background-200/70 rounded-lg text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40"
              />
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={t('pro.access.pin_placeholder')}
                autoComplete="current-password"
                className="w-full px-4 py-3 bg-background-50 border border-background-200/70 rounded-lg text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40"
              />
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200/60 rounded-lg px-3 py-2 mb-3">{error}</p>}

            <button
              type="submit"
              disabled={loading || !codigo.trim() || !pin.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-500 text-background-50 rounded-full text-sm font-semibold hover:bg-primary-600 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? t('pro.access.entering') : t('pro.access.submit')}
            </button>
            <p className="text-[11px] text-foreground-400 text-center mt-3">{t('pro.access.no_account')}</p>
          </form>
        )}
      </div>
    </section>
  );
}

// El catálogo profesional no incluye los campos de gestión de stock (el
// profesional no los necesita, y get_catalogo_profesional no los expone) —
// se rellenan con valores neutros solo para encajar en el tipo Producto que
// espera useCart/CartDrawer, que nunca los lee.
function toProducto(p: ProductoProfesional): Producto {
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

/* ── Catálogo privado tras iniciar sesión ── */
function ProductoProfesionalCard({
  producto,
  lang,
  kgEnCarrito,
  onAdd,
  onIncrease,
  onDecrease,
}: {
  producto: ProductoProfesional;
  lang: string;
  kgEnCarrito: number | null;
  onAdd: () => void;
  onIncrease: () => void;
  onDecrease: () => void;
}) {
  const nombre = lang.startsWith('eu') && producto.nombre_eu ? producto.nombre_eu : producto.nombre_es;
  const origen = lang.startsWith('eu') && producto.origen_eu ? producto.origen_eu : producto.origen_es;

  return (
    <div className="bg-background-50 rounded-lg border border-background-200/70 overflow-hidden">
      <div className="relative aspect-[4/3] overflow-hidden bg-background-100">
        {producto.imagen_url ? (
          <img src={producto.imagen_url} alt={nombre} className="w-full h-full object-cover object-top" loading="lazy" />
        ) : (
          <ProductImagePlaceholder />
        )}
      </div>
      <div className="p-3 md:p-4">
        <h3 className="font-heading text-sm font-semibold text-foreground-950 mb-1 truncate">{nombre}</h3>
        {origen && (
          <p className="text-[11px] text-foreground-400 mb-1.5 flex items-center gap-1">
            <i className="ri-map-pin-line text-[10px]"></i>
            {origen}
          </p>
        )}
        <span className="text-sm font-semibold text-primary-700 block mb-2">{producto.precio}</span>

        {kgEnCarrito === null ? (
          <button
            type="button"
            onClick={onAdd}
            className="w-full px-3 py-1.5 rounded-full text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600"
          >
            + Añadir
          </button>
        ) : (
          <div className="flex items-center justify-between bg-background-100 rounded-full px-1 py-1">
            <button
              type="button"
              onClick={onDecrease}
              className="w-7 h-7 flex items-center justify-center rounded-full text-foreground-600 hover:bg-background-200/70"
              aria-label="Reducir cantidad"
            >
              −
            </button>
            <span className="text-xs font-semibold text-foreground-950 tabular-nums">{kgEnCarrito} kg</span>
            <button
              type="button"
              onClick={onIncrease}
              className="w-7 h-7 flex items-center justify-center rounded-full text-foreground-600 hover:bg-background-200/70"
              aria-label="Aumentar cantidad"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CatalogoProfesionalView({
  token,
  nombreNegocio,
  onLogout,
}: {
  token: string;
  nombreNegocio: string;
  onLogout: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { productos, loading, invalida } = useCatalogoProfesional(token);
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState<CategoriaFiltro>('todos');
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

  // Rellena el negocio automáticamente con el nombre del cliente profesional
  // — no tiene sentido pedírselo si ya sabemos quién es por su sesión.
  useEffect(() => {
    if (!customer.business.trim()) updateCustomer('business', nombreNegocio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombreNegocio]);

  const productosAdaptados = useMemo(() => productos.map(toProducto), [productos]);

  const visibles = useMemo(() => {
    let result = productos;
    if (categoria !== 'todos') {
      const filtro = CATEGORIA_FILTROS.find((c) => c.value === categoria);
      result = result.filter((p) =>
        filtro?.tipo === 'subcategoria' ? p.subcategoria === categoria : p.categoria === categoria,
      );
    }
    if (search.trim()) {
      const q = normalizeSearch(search.trim());
      result = result.filter((p) => normalizeSearch(p.nombre_es).includes(q) || (p.nombre_eu && normalizeSearch(p.nombre_eu).includes(q)));
    }
    return result;
  }, [productos, categoria, search]);

  if (invalida) {
    // El token ha caducado o se ha invalidado (p.ej. cambio de PIN desde el
    // panel): se cierra la sesión local automáticamente al detectarlo.
    onLogout();
    return null;
  }

  return (
    <main id="main-content" className="min-h-[70vh] max-w-[1200px] mx-auto px-4 md:px-6 lg:px-12 py-10 md:py-14 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <p className="text-xs uppercase tracking-wide text-primary-600 font-semibold mb-1">{t('pro.catalog.private_label')}</p>
          <h1 className="font-heading text-2xl md:text-3xl font-semibold text-foreground-950">{nombreNegocio}</h1>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium bg-background-100 text-foreground-600 hover:bg-background-200/70"
        >
          <i className="ri-logout-box-r-line"></i>
          {t('pro.catalog.logout')}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('pro.catalog.search_placeholder')}
          className="w-full sm:max-w-[320px] px-4 py-2.5 bg-background-100 border border-background-200/70 rounded-full text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-foreground-300/60"
        />
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {CATEGORIA_FILTROS.filter((c) => c.tipo === 'categoria').map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategoria(c.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                categoria === c.value ? 'bg-primary-500 text-background-50' : 'bg-background-100 text-foreground-500 hover:bg-background-200/70'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-foreground-400">{t('pro.catalog.loading')}</p>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-foreground-400">{t('pro.catalog.empty')}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {visibles.map((producto) => {
            const item = getItem(producto.id);
            return (
              <ProductoProfesionalCard
                key={producto.id}
                producto={producto}
                lang={i18n.language}
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
        </div>
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
