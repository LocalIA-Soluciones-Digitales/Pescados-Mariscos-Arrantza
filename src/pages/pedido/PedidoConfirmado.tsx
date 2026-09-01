import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { supabase } from '@/lib/supabaseClient';
import type { Pedido } from '@/types/pedido';

type Status = 'checking' | 'pagado' | 'pendiente' | 'invalid';

const MAX_POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 1500;
const PESCADERO_WHATSAPP = '34619609888';

/* ------------------------------------------------------------------ */
/*  WhatsApp message for David — same shape as the local-payment       */
/*  order message in CartDrawer, but built from the paid `pedido` row  */
/*  (items already carry nombre/precioKg, no product lookup needed).   */
/* ------------------------------------------------------------------ */
function formatDisplayDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatKg(kg: number): string {
  return `${kg} kg`;
}

function formatPrice(amount: number): string {
  return `${amount.toFixed(2)} €`;
}

function buildWhatsAppMessage(pedido: Pedido, t: TFunction): string {
  const sep = '━━━━━━━━━━━━━━━━━━━━━━';
  const isHomeDelivery = pedido.metodo_entrega === 'home';
  const lines: string[] = [];

  lines.push('✅ PEDIDO PAGADO ONLINE');
  lines.push('');
  lines.push(sep);

  lines.push('');
  lines.push('👤 Cliente');
  lines.push(pedido.cliente_nombre || '—');
  lines.push('');
  lines.push('📞 Teléfono');
  lines.push(pedido.cliente_telefono || '—');

  if (pedido.cliente_email && pedido.cliente_email.trim()) {
    lines.push('');
    lines.push('📧 Correo electrónico');
    lines.push(pedido.cliente_email.trim());
  }

  if (pedido.cliente_negocio && pedido.cliente_negocio.trim()) {
    lines.push('');
    lines.push('🏢 Negocio');
    lines.push(pedido.cliente_negocio.trim());
  }

  lines.push('');
  lines.push(sep);
  lines.push('');

  if (isHomeDelivery) {
    lines.push('🚚 Envío a Domicilio');
    lines.push('');
    lines.push('📅 Fecha');
    lines.push(formatDisplayDate(pedido.fecha_preferida));
    lines.push('');
    lines.push('🕒 Hora');
    lines.push(pedido.hora_preferida || '—');
    lines.push('');
    lines.push('📍 Dirección de Entrega');
    lines.push(pedido.cliente_direccion || '—');
    lines.push(`${pedido.cliente_ciudad || ''} ${pedido.cliente_cp || ''}`.trim());
  } else {
    lines.push('🏪 Recogida en Tienda');
    lines.push('');
    lines.push('📅 Fecha');
    lines.push(formatDisplayDate(pedido.fecha_preferida));
    lines.push('');
    lines.push('🕒 Hora');
    lines.push(pedido.hora_preferida || '—');
    lines.push('');
    lines.push('📍 Dirección de Recogida');
    lines.push('Pescados y Mariscos Arrantza');
    lines.push('Calle Jesús Aramburu, 1');
    lines.push('48950 Erandio, Bizkaia');
  }

  lines.push('');
  lines.push(sep);

  for (const item of pedido.items) {
    const subtotal = item.precioKg * item.kg;
    const prepLabel = t(`cart.prep_${item.preparacion || 'whole'}` as any);

    lines.push('');
    lines.push(`🐟 ${item.nombre}`);
    lines.push('');
    lines.push(`⚖ Peso: ${formatKg(item.kg)}`);
    lines.push(`🔪 Preparación: ${prepLabel}`);
    lines.push(`💶 Precio: ${item.precioKg} €/Kg`);
    lines.push('');
    lines.push(`Subtotal: ${formatPrice(subtotal)}`);

    if (item.nota && item.nota.trim()) {
      lines.push('');
      lines.push(`📝 Instrucciones: ${item.nota.trim()}`);
    }

    lines.push('');
    lines.push(sep);
  }

  lines.push('');
  lines.push('📦 RESUMEN DEL PEDIDO');
  lines.push('');
  lines.push(`Productos: ${pedido.total_productos}`);
  lines.push('');
  lines.push(`Peso Estimado: ${formatKg(pedido.peso_total)}`);
  lines.push('');
  lines.push(sep);
  lines.push('');
  lines.push('💳 TOTAL PAGADO');
  lines.push('');
  lines.push(formatPrice(pedido.importe_estimado ?? 0));
  lines.push('');
  lines.push(sep);

  if (pedido.notas && pedido.notas.trim()) {
    lines.push('');
    lines.push('📝 Observaciones del Cliente');
    lines.push('');
    lines.push(pedido.notas.trim());
    lines.push('');
    lines.push(sep);
  }

  lines.push('');
  lines.push('Pagado online — no hace falta cobrar.');
  lines.push('');
  lines.push('Pescados y Mariscos Arrantza');

  return lines.join('\n');
}

export default function PedidoConfirmado() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState<Status>('checking');
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [whatsappSent, setWhatsappSent] = useState(false);
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (!sessionId) {
      setStatus('invalid');
      return;
    }

    let cancelled = false;

    // El webhook de Stripe puede tardar unos segundos en llegar respecto al
    // redirect del navegador — reintenta un rato antes de asumir que algo
    // falló, en vez de mostrar un error prematuro.
    const check = async () => {
      const { data } = await supabase.rpc('get_pedido_by_stripe_session', { p_session_id: sessionId });
      const pedido = (data as Pedido[] | null)?.[0];
      if (cancelled) return;

      if (!pedido) {
        setStatus('invalid');
        return;
      }
      if (pedido.estado_pago === 'pagado') {
        setPedido(pedido);
        setStatus('pagado');
        return;
      }
      if (pedido.estado_pago === 'fallido') {
        setStatus('invalid');
        return;
      }

      attemptsRef.current += 1;
      if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
        setStatus('pendiente');
        return;
      }
      setTimeout(check, POLL_INTERVAL_MS);
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const handleSendWhatsApp = () => {
    if (!pedido) return;
    const message = buildWhatsAppMessage(pedido, t);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${PESCADERO_WHATSAPP}&text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    setWhatsappSent(true);
  };

  const title =
    status === 'pagado'
      ? t('pedido_confirmado.success_title')
      : status === 'pendiente'
        ? t('pedido_confirmado.pending_title')
        : t('pedido_confirmado.invalid_title');
  const body =
    status === 'pagado'
      ? t('pedido_confirmado.success_body')
      : status === 'pendiente'
        ? t('pedido_confirmado.pending_body')
        : t('pedido_confirmado.invalid_body');

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-100 px-4">
      <div className="w-full max-w-[420px] bg-background-50 border border-background-200/70 rounded-lg p-8 shadow-sm text-center">
        {status === 'checking' ? (
          <p className="text-sm text-foreground-400">{t('pedido_confirmado.checking')}</p>
        ) : (
          <>
            <div
              className={`w-12 h-12 mx-auto mb-4 flex items-center justify-center rounded-full ${
                status === 'pagado'
                  ? 'bg-emerald-50 text-emerald-600'
                  : status === 'pendiente'
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-red-50 text-red-500'
              }`}
            >
              <i
                className={`text-xl ${
                  status === 'pagado'
                    ? 'ri-checkbox-circle-line'
                    : status === 'pendiente'
                      ? 'ri-time-line'
                      : 'ri-error-warning-line'
                }`}
              ></i>
            </div>
            <h1 className="font-heading text-lg font-semibold text-foreground-950 mb-2">{title}</h1>
            <p className="text-sm text-foreground-500 mb-6">{body}</p>

            {status === 'pagado' && pedido && (
              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="w-full mb-4 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 cursor-pointer transition-colors"
              >
                <i className="ri-whatsapp-line text-base"></i>
                {whatsappSent ? t('pedido_confirmado.whatsapp_button_sent') : t('pedido_confirmado.whatsapp_button')}
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-xs text-foreground-400 hover:text-foreground-700 transition-colors cursor-pointer"
            >
              {t('pedido_confirmado.back')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
