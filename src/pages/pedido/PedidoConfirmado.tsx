import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabaseClient';
import type { Pedido } from '@/types/pedido';

type Status = 'checking' | 'pagado' | 'pendiente' | 'invalid';

const MAX_POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 1500;

export default function PedidoConfirmado() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState<Status>('checking');
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
