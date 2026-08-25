import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useReservasEventosPublico } from '@/hooks/useReservasEventosPublico';
import { dismissReservasPopup, isReservasPopupDismissed } from '@/lib/reservasPopup';

function formatFecha(iso: string, lang: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString(lang.startsWith('eu') ? 'eu-ES' : 'es-ES', { day: 'numeric', month: 'long' });
}

function eventoNombre(nombre_es: string, nombre_eu: string | null, lang: string): string {
  if (lang.startsWith('eu') && nombre_eu && nombre_eu.trim() !== '') return nombre_eu;
  return nombre_es;
}

// Aviso emergente que anuncia la campaña de reservas activa al entrar en la
// home. Se muestra una vez por campaña: si el cliente lo cierra, no vuelve
// a aparecer para esa misma campaña (aunque sí para la siguiente).
export default function ReservasPopup() {
  const { t, i18n } = useTranslation();
  const { eventos, loading } = useReservasEventosPublico();
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);

  const evento = eventos[0];

  useEffect(() => {
    if (loading || !evento) return;
    if (isReservasPopupDismissed(evento.id)) return;

    const showTimer = setTimeout(() => setVisible(true), 900);
    return () => clearTimeout(showTimer);
  }, [loading, evento]);

  useEffect(() => {
    if (!visible) return;
    const enterTimer = setTimeout(() => setEntered(true), 20);
    return () => clearTimeout(enterTimer);
  }, [visible]);

  if (!visible || !evento) return null;

  const close = () => {
    dismissReservasPopup(evento.id);
    setEntered(false);
    setTimeout(() => setVisible(false), 200);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('reservas.popup_title', { evento: eventoNombre(evento.nombre_es, evento.nombre_eu, i18n.language) })}
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
        <div className="relative bg-foreground-950 px-6 py-6 sm:px-8 sm:py-7">
          <button
            type="button"
            onClick={close}
            aria-label={t('reservas.popup_close')}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-background-50/70 hover:text-background-50 hover:bg-background-50/10 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
          <span className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-accent-300 mb-2 inline-block">
            {t('reservas.hero_label')}
          </span>
          <h2 className="font-heading text-xl sm:text-2xl font-semibold text-background-50 leading-[1.2] pr-8">
            {t('reservas.popup_title', { evento: eventoNombre(evento.nombre_es, evento.nombre_eu, i18n.language) })}
          </h2>
        </div>

        <div className="px-6 py-6 sm:px-8 sm:py-7">
          <p className="text-sm text-foreground-950/70 leading-relaxed mb-2">{t('reservas.popup_body')}</p>
          <p className="text-sm text-foreground-950/70 leading-relaxed mb-6">
            {t('reservas.delivery_label')}: <span className="font-medium text-foreground-950">{formatFecha(evento.fecha_entrega, i18n.language)}</span>
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <Link
              to="/reservas"
              onClick={close}
              className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary-500 text-background-50 text-sm font-semibold hover:bg-primary-600 transition-colors"
            >
              <i className="ri-calendar-check-line"></i>
              {t('reservas.reserve_now')}
            </Link>
            <button
              type="button"
              onClick={close}
              className="px-6 py-3 rounded-full text-sm font-medium border border-background-200 text-foreground-950/70 hover:bg-background-100 transition-colors cursor-pointer"
            >
              {t('reservas.popup_dismiss')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
