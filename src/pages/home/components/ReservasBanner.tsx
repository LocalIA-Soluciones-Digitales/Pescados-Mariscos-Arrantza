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
    <section className="bg-background-50 py-8 sm:py-10 md:py-14">
      <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-12">
        <div
          ref={ref}
          className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-950 via-foreground-950 to-foreground-900 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.35)] transition-all duration-1000 ease-out min-h-[320px] sm:min-h-[360px] md:min-h-[420px] flex ${
            isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
          }`}
        >
          {evento.imagen_url ? (
            <>
              <img src={evento.imagen_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-foreground-950 via-foreground-950/55 to-foreground-950/10" />
              <div className="absolute inset-0 bg-gradient-to-r from-foreground-950/50 via-transparent to-transparent" />
            </>
          ) : (
            <div
              className="absolute inset-0 opacity-[0.05] pointer-events-none"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }}
            />
          )}

          <div className="relative z-10 w-full flex flex-col justify-end px-6 py-8 sm:px-10 sm:py-10 md:px-12 md:py-11 lg:px-14">
            <span className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-accent-300 mb-3 inline-flex items-center gap-2">
              <i className="ri-calendar-event-line"></i>
              {t('reservas.hero_label')}
            </span>
            <h3 className="font-heading text-2xl sm:text-3xl md:text-4xl font-semibold text-background-50 leading-[1.15] mb-4 max-w-lg">
              {eventoNombre(evento.nombre_es, evento.nombre_eu, i18n.language)}
            </h3>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
              <span className="inline-flex items-center gap-2 w-fit px-4 py-2 rounded-full bg-background-50/10 backdrop-blur-sm ring-1 ring-background-50/15 text-white text-xs sm:text-sm font-medium">
                <i className="ri-calendar-check-line text-accent-300"></i>
                {t('reservas.delivery_label')}: {formatFecha(evento.fecha_entrega, i18n.language)}
              </span>
              <Link
                to="/reservas"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary-500 text-background-50 text-sm font-semibold whitespace-nowrap hover:bg-primary-600 transition-colors w-fit"
              >
                <i className="ri-arrow-right-line"></i>
                {t('reservas.reserve_now')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
