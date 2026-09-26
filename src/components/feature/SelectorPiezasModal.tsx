import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumKg, kgPorPieza, precioDeTexto, redondearKg } from '@/lib/unidadVenta';

// Selector de cantidad para el pescado entero que se puede pedir por piezas
// (merluza, lubina…). El cliente elige cuántas piezas y el peso de CADA
// una de una lista cerrada; el total lo calcula la web y se lo enseña con
// palabras, para que nunca ponga "2 piezas y 4 kg" queriendo decir 2 de
// 2 kg. También deja pedir por peso total, como el resto de productos.
// Lo usan la tienda y las reservas.

const MAX_PIEZAS = 20;

export interface SelectorPiezasProducto {
  nombre: string;
  precio: string;
  pesos: number[];
}

function Stepper({
  valor,
  etiqueta,
  onMenos,
  onMas,
  menosOff,
  masOff,
}: {
  valor: string;
  etiqueta: string;
  onMenos: () => void;
  onMas: () => void;
  menosOff: boolean;
  masOff: boolean;
}) {
  const { t } = useTranslation();
  const boton =
    'w-9 h-9 flex items-center justify-center rounded-full text-lg font-medium text-foreground-600 hover:bg-background-200/70 cursor-pointer disabled:text-foreground-300 disabled:hover:bg-transparent disabled:cursor-not-allowed';
  return (
    <div className="flex items-center bg-background-100 rounded-full p-1 flex-shrink-0" role="group" aria-label={etiqueta}>
      <button type="button" onClick={onMenos} disabled={menosOff} className={boton} aria-label={t('pieces.less')}>
        −
      </button>
      <span className="min-w-[64px] text-center text-base font-semibold text-foreground-950 tabular-nums">{valor}</span>
      <button type="button" onClick={onMas} disabled={masOff} className={boton} aria-label={t('pieces.more')}>
        +
      </button>
    </div>
  );
}

export default function SelectorPiezasModal({
  producto,
  inicial,
  textoConfirmar,
  onConfirm,
  onClose,
}: {
  producto: SelectorPiezasProducto;
  // Cantidad que ya hay en el carrito/reserva, si se está editando.
  inicial?: { kg: number; piezas?: number };
  textoConfirmar?: string;
  onConfirm: (kg: number, piezas?: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [entered, setEntered] = useState(false);
  const editando = Boolean(inicial && inicial.kg > 0);
  const porPesoAntes = editando && !inicial?.piezas;

  const pesoInicial = inicial?.piezas ? kgPorPieza(inicial.kg, inicial.piezas) : null;
  const [modo, setModo] = useState<'piezas' | 'peso'>(porPesoAntes ? 'peso' : 'piezas');
  const [piezas, setPiezas] = useState(inicial?.piezas ?? 1);
  // Sin peso preseleccionado: obliga a elegirlo a conciencia.
  const [pesoPieza, setPesoPieza] = useState<number | null>(
    pesoInicial !== null && producto.pesos.includes(pesoInicial) ? pesoInicial : null,
  );
  const [kgTotal, setKgTotal] = useState(porPesoAntes && inicial ? inicial.kg : 1);

  const close = () => {
    setEntered(false);
    setTimeout(onClose, 200);
  };

  useEffect(() => {
    const timer = setTimeout(() => setEntered(true), 20);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const precioKg = precioDeTexto(producto.precio);
  const total = modo === 'piezas' ? (pesoPieza !== null ? redondearKg(piezas * pesoPieza) : null) : kgTotal;
  const importe = total !== null && precioKg > 0 ? (total * precioKg).toFixed(2).replace('.', ',') : null;
  const listo = total !== null && total > 0;

  const confirmar = () => {
    if (total === null || total <= 0) return;
    onConfirm(total, modo === 'piezas' ? piezas : undefined);
    close();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={producto.nombre}
      className={`fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-foreground-950/50 p-4 transition-opacity duration-200 ${
        entered ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full sm:max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-background-50 rounded-2xl shadow-2xl transition-all duration-200 ${
          entered ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-95'
        }`}
      >
        <div className="px-5 pt-5 pb-4 sm:px-6 border-b border-background-200/60">
          <button
            type="button"
            onClick={close}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-foreground-400 hover:text-foreground-950 hover:bg-background-100 cursor-pointer"
            aria-label={t('cart.close_label')}
          >
            <i className="ri-close-line text-lg"></i>
          </button>
          <h2 className="font-heading text-lg font-semibold text-foreground-950 pr-8 leading-tight">{producto.nombre}</h2>
          <p className="text-sm text-foreground-500 mt-0.5">{producto.precio}</p>

          <p className="text-xs font-medium text-foreground-500 mt-4 mb-1.5">{t('pieces.how_title')}</p>
          <div className="grid grid-cols-2 gap-1 p-1 bg-background-100 rounded-full" role="tablist">
            {(['piezas', 'peso'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={modo === m}
                onClick={() => setModo(m)}
                className={`py-2 rounded-full text-sm font-medium cursor-pointer transition-colors ${
                  modo === m ? 'bg-background-50 text-foreground-950 shadow-sm' : 'text-foreground-500 hover:text-foreground-800'
                }`}
              >
                {m === 'piezas' ? t('pieces.mode_pieces') : t('pieces.mode_weight')}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-5 sm:px-6 space-y-5">
          {modo === 'piezas' ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground-800">{t('pieces.how_many')}</p>
                <Stepper
                  valor={String(piezas)}
                  etiqueta={t('pieces.how_many')}
                  onMenos={() => setPiezas((n) => Math.max(1, n - 1))}
                  onMas={() => setPiezas((n) => Math.min(MAX_PIEZAS, n + 1))}
                  menosOff={piezas <= 1}
                  masOff={piezas >= MAX_PIEZAS}
                />
              </div>

              <div>
                <p className="text-sm font-medium text-foreground-800">{t('pieces.each_weight')}</p>
                <p className="text-xs text-foreground-400 mt-0.5 mb-2.5">{t('pieces.each_weight_hint')}</p>
                <div className="flex flex-wrap gap-2">
                  {producto.pesos.map((peso) => (
                    <button
                      key={peso}
                      type="button"
                      onClick={() => setPesoPieza(peso)}
                      aria-pressed={pesoPieza === peso}
                      className={`px-3.5 py-2 rounded-full text-sm font-medium tabular-nums border cursor-pointer transition-colors ${
                        pesoPieza === peso
                          ? 'bg-primary-500 border-primary-500 text-background-50'
                          : 'bg-background-50 border-background-200 text-foreground-700 hover:border-foreground-300'
                      }`}
                    >
                      {formatNumKg(peso)} kg
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground-800">{t('pieces.total_weight')}</p>
              <Stepper
                valor={`${formatNumKg(kgTotal)} kg`}
                etiqueta={t('pieces.total_weight')}
                onMenos={() => setKgTotal((k) => Math.max(0.5, redondearKg(k - 0.5)))}
                onMas={() => setKgTotal((k) => redondearKg(k + 0.5))}
                menosOff={kgTotal <= 0.5}
                masOff={false}
              />
            </div>
          )}

          {/* Resumen en palabras: lo que de verdad se va a preparar */}
          <div
            className={`rounded-xl px-4 py-3 border ${listo ? 'bg-primary-50 border-primary-200/70' : 'bg-background-100 border-background-200/70'}`}
            aria-live="polite"
          >
            {modo === 'piezas' && pesoPieza === null ? (
              <p className="text-sm text-foreground-500">{t('pieces.pick_weight')}</p>
            ) : (
              <>
                <p className="text-base font-semibold text-foreground-950 leading-snug">
                  {modo === 'peso'
                    ? t('pieces.summary_weight', { kg: formatNumKg(kgTotal) })
                    : t(piezas === 1 ? 'pieces.summary_one' : 'pieces.summary_many', {
                        count: piezas,
                        kg: formatNumKg(pesoPieza ?? 0),
                      })}
                </p>
                <p className="text-sm text-foreground-600 mt-0.5 tabular-nums">
                  {modo === 'piezas' && piezas > 1 && t('pieces.summary_total', { kg: formatNumKg(total ?? 0) })}
                  {modo === 'piezas' && piezas > 1 && importe !== null && ' · '}
                  {importe !== null && t('pieces.approx_price', { price: importe })}
                </p>
              </>
            )}
          </div>

          <p className="text-xs text-foreground-400 leading-relaxed">{t('pieces.disclaimer')}</p>

          <button
            type="button"
            onClick={confirmar}
            disabled={!listo}
            className="w-full py-3 rounded-full bg-primary-500 text-background-50 text-sm font-semibold hover:bg-primary-600 disabled:bg-background-200 disabled:text-foreground-400 cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            {textoConfirmar ?? (editando ? t('pieces.save') : t('pieces.add'))}
          </button>
        </div>
      </div>
    </div>
  );
}
