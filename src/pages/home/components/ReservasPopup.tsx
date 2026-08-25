import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useReservasEventosPublico } from '@/hooks/useReservasEventosPublico';
import { dismissReservasPopup, isReservasPopupDismissed } from '@/lib/reservasPopup';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function formatFecha(iso: string, lang: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString(lang.startsWith('eu') ? 'eu-ES' : 'es-ES', { day: 'numeric', month: 'long' });
}

function eventoNombre(nombre_es: string, nombre_eu: string | null, lang: string): string {
  if (lang.startsWith('eu') && nombre_eu && nombre_eu.trim() !== '') return nombre_eu;
  return nombre_es;
}

function diasRestantes(fechaLimite: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = new Date(`${fechaLimite}T00:00:00`);
  return Math.ceil((limite.getTime() - hoy.getTime()) / MS_PER_DAY);
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

  const dias = evento.fecha_limite ? diasRestantes(evento.fecha_limite) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('reservas.popup_title', { evento: eventoNombre(evento.nombre_es, evento.nombre_eu, i18n.language) })}
      className={`fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-foreground-950/55 backdrop-blur-[2px] p-4 transition-opacity duration-200 ${
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
        <div className="relative overflow-hidden bg-gradient-to-br from-primary-950 via-foreground-950 to-foreground-900 px-6 pt-6 pb-7 sm:px-8 sm:pt-7 sm:pb-8">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-accent-400/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-10 w-40 h-40 rounded-full bg-primary-300/10 blur-3xl pointer-events-none" />
          <div
            className="absolute inset-0 opacity-[0.05] pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />

          <button
            type="button"
            onClick={close}
            aria-label={t('reservas.popup_close')}
            className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full text-background-50/70 hover:text-background-50 hover:bg-background-50/10 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>

          <div className="relative z-10">
            <span className="w-11 h-11 flex items-center justify-center rounded-full bg-background-50/10 ring-1 ring-background-50/15 text-accent-300 text-lg mb-4">
              <i className="ri-calendar-event-line"></i>
            </span>
            <span className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-accent-300 mb-2 inline-block">
              {t('reservas.hero_label')}
            </span>
            <h2 className="font-heading text-xl sm:text-2xl font-semibold text-background-50 leading-[1.2] pr-8">
              {t('reservas.popup_title', { evento: eventoNombre(evento.nombre_es, evento.nombre_eu, i18n.language) })}
            </h2>
          </div>
        </div>

        <div className="px-6 py-6 sm:px-8 sm:py-7">
          <p className="text-sm text-foreground-950/70 leading-relaxed mb-4">{t('reservas.popup_body')}</p>

          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background-100 text-foreground-700 text-xs font-medium">
              <i className="ri-calendar-check-line"></i>
              {formatFecha(evento.fecha_entrega, i18n.language)}
            </span>
            {dias !== null && dias >= 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent-100 text-accent-700 text-xs font-semibold">
                <i className="ri-time-line"></i>
                {dias === 0
                  ? t('reservas.popup_urgency_today')
                  : dias === 1
                    ? t('reservas.popup_urgency_single')
                    : t('reservas.popup_urgency_plural', { count: dias })}
              </span>
            )}
          </div>

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
