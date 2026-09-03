import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pickLang } from '@/types/producto';
import type { Producto } from '@/types/producto';
import { getDeviceId } from '@/lib/deviceId';
import { logSolicitudStock } from '@/lib/solicitudesStockLog';

// Modal que permite al cliente pedir que se le avise / se reponga un
// producto agotado, sin necesidad de cuenta — mismo patrón visual que
// ReservasPopup, pero disparado desde la tarjeta de producto en vez de
// aparecer solo.
export default function SolicitudStockModal({ product, onClose }: { product: Producto; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [entered, setEntered] = useState(false);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [notas, setNotas] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const enterTimer = setTimeout(() => setEntered(true), 20);
    return () => clearTimeout(enterTimer);
  }, []);

  const close = () => {
    setEntered(false);
    setTimeout(onClose, 200);
  };

  const handleSubmit = async () => {
    setError(null);
    setSending(true);
    const cantidadKg = cantidad.trim() ? Number(cantidad) : null;
    const result = await logSolicitudStock({
      productoId: product.id,
      clienteNombre: nombre.trim(),
      clienteTelefono: telefono.trim(),
      cantidadKg: cantidadKg !== null && Number.isFinite(cantidadKg) ? cantidadKg : null,
      notas: notas.trim(),
      deviceId: getDeviceId(),
    });
    setSending(false);
    if (!result.ok) {
      setError(t('stock_request.error_generic'));
      return;
    }
    setSuccess(true);
  };

  const productName = pickLang(product, 'nombre', i18n.language);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('stock_request.modal_title')}
      className={`fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-foreground-950/50 p-4 transition-opacity duration-200 ${
        entered ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full sm:max-w-md bg-background-50 rounded-2xl shadow-2xl overflow-hidden transition-all duration-200 ${
          entered ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-95'
        }`}
      >
        {success ? (
          <div className="px-6 py-8 sm:px-8 text-center">
            <span className="w-14 h-14 flex items-center justify-center mx-auto mb-4 rounded-full bg-emerald-100 text-emerald-600 text-2xl">
              <i className="ri-check-line"></i>
            </span>
            <h2 className="font-heading text-lg sm:text-xl font-semibold text-foreground-950 mb-2">
              {t('stock_request.success_title')}
            </h2>
            <p className="text-sm text-foreground-500 leading-relaxed mb-6">
              {t('stock_request.success_subtitle', { producto: productName })}
            </p>
            <button
              type="button"
              onClick={close}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-background-100 text-foreground-700 text-sm font-medium hover:bg-background-200/70 transition-colors cursor-pointer"
            >
              {t('stock_request.success_close')}
            </button>
          </div>
        ) : (
          <>
            <div className="relative bg-foreground-950 px-6 py-6 sm:px-8 sm:py-7">
              <button
                type="button"
                onClick={close}
                aria-label={t('stock_request.close_label')}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-background-50/70 hover:text-background-50 hover:bg-background-50/10 transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
              <span className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-accent-300 mb-2 inline-block">
                {productName}
              </span>
              <h2 className="font-heading text-xl sm:text-2xl font-semibold text-background-50 leading-[1.2] pr-8">
                {t('stock_request.modal_title')}
              </h2>
            </div>

            <div className="px-6 py-6 sm:px-8 sm:py-7">
              <p className="text-sm text-foreground-500 leading-relaxed mb-5">
                {t('stock_request.modal_subtitle', { producto: productName })}
              </p>

              <div className="space-y-3">
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder={t('stock_request.form_name')}
                  className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
                />
                <input
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder={t('stock_request.form_phone')}
                  className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
                />
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  placeholder={t('stock_request.form_quantity')}
                  className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
                />
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder={t('stock_request.form_notes')}
                  rows={2}
                  className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm resize-none focus:outline-none focus:border-foreground-300/60"
                />

                {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={sending}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-primary-500 text-background-50 text-sm font-semibold hover:bg-primary-600 disabled:opacity-60 transition-colors"
                >
                  <i className="ri-notification-3-line text-base"></i>
                  {sending ? t('stock_request.submit_sending') : t('stock_request.submit_button')}
                </button>

                <p className="text-[11px] text-foreground-400 leading-relaxed">
                  {t('stock_request.form_privacy_pre')}{' '}
                  <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground-600">
                    {t('stock_request.form_privacy_link')}
                  </a>
                  .
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
