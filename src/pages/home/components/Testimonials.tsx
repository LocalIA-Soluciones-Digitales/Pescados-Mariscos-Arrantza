import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { useResenasPublicas } from '@/hooks/useResenasPublicas';
import { submitResena } from '@/lib/resenasLog';
import { useTurnstile } from '@/hooks/useTurnstile';
import TurnstileWidget from '@/components/feature/TurnstileWidget';
import { isTurnstileEnabled } from '@/config/turnstile';

const JSONLD_ID = 'reviews-jsonld';

// Inserta/actualiza el bloque de Review + AggregateRating con las reseñas
// reales aprobadas. Se hace en cliente porque el catálogo de reseñas vive
// en Supabase, no en el HTML estático servido por el sitio (SPA sin SSR).
function useReviewsJsonLd(resenas: { nombre: string; valoracion: number; comentario: string; created_at: string }[]) {
  useEffect(() => {
    if (resenas.length === 0) return;

    const avg = resenas.reduce((sum, r) => sum + r.valoracion, 0) / resenas.length;
    const data = {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'Pescados y Mariscos Arrantza',
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: avg.toFixed(1),
        reviewCount: resenas.length,
      },
      review: resenas.slice(0, 20).map((r) => ({
        '@type': 'Review',
        author: { '@type': 'Person', name: r.nombre },
        reviewRating: { '@type': 'Rating', ratingValue: r.valoracion, bestRating: 5 },
        reviewBody: r.comentario,
        datePublished: r.created_at.slice(0, 10),
      })),
    };

    let script = document.getElementById(JSONLD_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = JSONLD_ID;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data);

    return () => {
      script?.remove();
    };
  }, [resenas]);
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="w-8 h-8 flex items-center justify-center text-xl cursor-pointer"
          aria-label={`${n} estrellas`}
        >
          <i className={n <= value ? 'ri-star-fill text-accent-400' : 'ri-star-line text-foreground-300'}></i>
        </button>
      ))}
    </div>
  );
}

function ReviewFormModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const turnstile = useTurnstile();
  const [nombre, setNombre] = useState('');
  const [valoracion, setValoracion] = useState(5);
  const [comentario, setComentario] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !comentario.trim()) {
      setError(t('testimonials.form_required'));
      return;
    }
    if (isTurnstileEnabled() && !turnstile.verified) return;

    setSubmitting(true);
    setError(null);
    const result = await submitResena({ nombre, valoracion, comentario });
    setSubmitting(false);

    if (!result.ok) {
      setError(t('testimonials.form_error'));
      return;
    }
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground-950/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] bg-background-50 rounded-lg border border-background-200/70 shadow-2xl p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-heading font-semibold text-foreground-950">{t('testimonials.form_title')}</h2>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-200/70">
            <i className="ri-close-line"></i>
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <span className="w-12 h-12 flex items-center justify-center mx-auto mb-3 rounded-full bg-emerald-100 text-emerald-600 text-2xl">
              <i className="ri-check-line"></i>
            </span>
            <p className="text-sm text-foreground-700">{t('testimonials.form_success')}</p>
            <button type="button" onClick={onClose} className="mt-5 px-5 py-2 rounded-full text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600">
              {t('common.close')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-xs font-medium text-foreground-500 mb-1">{t('testimonials.form_name')}</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={100}
                className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-foreground-500 mb-1">{t('testimonials.form_rating')}</label>
              <StarPicker value={valoracion} onChange={setValoracion} />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-foreground-500 mb-1">{t('testimonials.form_comment')}</label>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                maxLength={1000}
                rows={4}
                className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
              />
            </div>

            {isTurnstileEnabled() && <TurnstileWidget onTokenReceived={turnstile.onTokenReceived} />}

            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

            <p className="text-[11px] text-foreground-400 mb-4">{t('testimonials.form_moderation_note')}</p>

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-5 py-2.5 rounded-full text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-60"
            >
              {submitting ? t('testimonials.form_sending') : t('testimonials.form_submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Testimonials() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation();
  const { resenas, loading } = useResenasPublicas();
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  useReviewsJsonLd(resenas);

  const next = useCallback(() => {
    setCurrent((prev) => (prev + 1) % resenas.length);
  }, [resenas.length]);

  const prev = useCallback(() => {
    setCurrent((p) => (p - 1 + resenas.length) % resenas.length);
  }, [resenas.length]);

  useEffect(() => {
    if (isPaused || resenas.length <= 1) return;
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [isPaused, next, resenas.length]);

  // El índice puede quedar fuera de rango si llegan menos reseñas tras un refetch
  useEffect(() => {
    if (current >= resenas.length) setCurrent(0);
  }, [resenas.length, current]);

  if (loading) return null;

  const activeReview = resenas[current];

  return (
    <section id="testimonials" className="section-padding bg-background-50">
      <div ref={ref} className="container-narrow">
        <div className={`text-center mb-12 md:mb-16 lg:mb-20 transition-all duration-800 ease-out ${isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
          <span className="section-label">{t('testimonials.label')}</span>
          <h2 className="section-title">{t('testimonials.title')}</h2>
        </div>

        {activeReview ? (
          <div
            className={`text-center max-w-2xl mx-auto transition-all duration-800 ease-out ${isVisible ? 'animate-fade-up' : 'opacity-0'}`}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            <div className="mb-6 sm:mb-8">
              <div className="flex justify-center gap-1 mb-4 sm:mb-6">
                {[1, 2, 3, 4, 5].map((i) => (
                  <i key={i} className={i <= activeReview.valoracion ? 'ri-star-fill text-accent-400 text-base sm:text-lg' : 'ri-star-line text-foreground-300 text-base sm:text-lg'}></i>
                ))}
              </div>

              <blockquote
                className="text-base sm:text-lg md:text-2xl font-heading text-foreground-700 leading-relaxed italic mb-6 sm:mb-8 animate-fade-in px-2"
                key={current}
              >
                &ldquo;{activeReview.comentario}&rdquo;
              </blockquote>

              <div className="animate-fade-in" key={`author-${current}`}>
                <p className="font-medium text-foreground-950 text-sm md:text-base">{activeReview.nombre}</p>
              </div>
            </div>

            {resenas.length > 1 && (
              <div className="flex items-center justify-center gap-3 sm:gap-4 mt-6 sm:mt-8">
                <button
                  onClick={prev}
                  className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full border border-foreground-200 text-foreground-500 hover:text-foreground-950 hover:border-foreground-400 transition-colors duration-300 cursor-pointer"
                  aria-label="Anterior"
                >
                  <i className="ri-arrow-left-s-line text-base sm:text-lg"></i>
                </button>

                <div className="flex items-center gap-2">
                  {resenas.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrent(i)}
                      className={`w-2 h-2 rounded-full transition-all duration-300 cursor-pointer ${
                        i === current ? 'bg-primary-500 w-4 sm:w-5' : 'bg-foreground-200 hover:bg-foreground-300'
                      }`}
                      aria-label={`Reseña ${i + 1}`}
                    />
                  ))}
                </div>

                <button
                  onClick={next}
                  className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full border border-foreground-200 text-foreground-500 hover:text-foreground-950 hover:border-foreground-400 transition-colors duration-300 cursor-pointer"
                  aria-label="Siguiente"
                >
                  <i className="ri-arrow-right-s-line text-base sm:text-lg"></i>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={`text-center max-w-md mx-auto transition-all duration-800 ease-out ${isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
            <p className="text-sm text-foreground-400">{t('testimonials.empty')}</p>
          </div>
        )}

        <div className="text-center mt-10 md:mt-12">
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs md:text-sm font-medium bg-background-100 text-foreground-600 hover:bg-background-200/70 cursor-pointer"
          >
            <i className="ri-chat-quote-line"></i>
            {t('testimonials.cta_review')}
          </button>
        </div>
      </div>

      {formOpen && <ReviewFormModal onClose={() => setFormOpen(false)} />}
    </section>
  );
}
