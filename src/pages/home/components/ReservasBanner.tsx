import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useReservasEventosPublico } from '@/hooks/useReservasEventosPublico';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

function formatFecha(iso: string, lang: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString(lang.startsWith('eu') ? 'eu-ES' : 'es-ES', { day: 'numeric', month: 'long' });
}

function eventoNombre(nombre_es: string, nombre_eu: string | null, lang: string): string {
  if (lang.startsWith('eu') && nombre_eu && nombre_eu.trim() !== '') return nombre_eu;
  return nombre_es;
}

// Solo se muestra si el pescadero tiene alguna campaña de reservas abierta
// (Navidad, Nochevieja...) — el resto del tiempo no ocupa espacio en la home.
export default function ReservasBanner() {
  const { t, i18n } = useTranslation();
  const { eventos, loading } = useReservasEventosPublico();
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

  if (loading || eventos.length === 0) return null;
  const evento = eventos[0];

  return (
    <section className="bg-background-50">
      <div className="w-full md:max-w-[1440px] md:mx-auto md:px-6 lg:px-12">
        <div
          ref={ref}
          className={`relative overflow-hidden md:rounded-2xl bg-foreground-950 transition-all duration-1000 ease-out ${
            isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
          }`}
        >
          <div
            className="absolute inset-0 opacity-[0.05] pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
          <div className="relative z-10 px-6 py-8 sm:px-10 sm:py-10 md:px-14 md:py-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="max-w-xl">
              <span className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-accent-300 mb-2 inline-block">
                {t('reservas.hero_label')}
              </span>
              <h3 className="font-heading text-xl sm:text-2xl md:text-3xl font-semibold text-background-50 leading-[1.2] mb-2">
                {eventoNombre(evento.nombre_es, evento.nombre_eu, i18n.language)}
              </h3>
              <p className="text-sm md:text-base text-white/70">
                {t('reservas.delivery_label')}: {formatFecha(evento.fecha_entrega, i18n.language)}
              </p>
            </div>
            <Link
              to="/reservas"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary-500 text-background-50 text-sm font-semibold whitespace-nowrap hover:bg-primary-600 transition-colors flex-shrink-0"
            >
              <i className="ri-calendar-check-line"></i>
              {t('reservas.reserve_now')}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
