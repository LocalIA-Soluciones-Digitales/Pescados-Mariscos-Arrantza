import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const testimonialKeys = ['1', '2', '3', '4'];

export default function Testimonials() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation();
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const next = useCallback(() => {
    setCurrent((prev) => (prev + 1) % testimonialKeys.length);
  }, []);

  const prev = useCallback(() => {
    setCurrent((prev) => (prev - 1 + testimonialKeys.length) % testimonialKeys.length);
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [isPaused, next]);

  return (
    <section id="testimonials" className="section-padding bg-background-50">
      <div ref={ref} className="container-narrow">
        <div className={`text-center mb-12 md:mb-16 lg:mb-20 transition-all duration-800 ease-out ${isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
          <span className="section-label">{t('testimonials.label')}</span>
          <h2 className="section-title">{t('testimonials.title')}</h2>
        </div>

        {/* Testimonial card */}
        <div
          className={`text-center max-w-2xl mx-auto transition-all duration-800 ease-out ${isVisible ? 'animate-fade-up' : 'opacity-0'}`}
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="mb-6 sm:mb-8">
            {/* Stars */}
            <div className="flex justify-center gap-1 mb-4 sm:mb-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <i key={i} className="ri-star-fill text-accent-400 text-base sm:text-lg"></i>
              ))}
            </div>

            {/* Quote */}
            <blockquote
              className="text-base sm:text-lg md:text-2xl font-heading text-foreground-700 leading-relaxed italic mb-6 sm:mb-8 animate-fade-in px-2"
              key={current}
            >
              &ldquo;{t(`testimonials.${testimonialKeys[current]}.text`)}&rdquo;
            </blockquote>

            {/* Author */}
            <div className="animate-fade-in" key={`author-${current}`}>
              <p className="font-medium text-foreground-950 text-sm md:text-base">
                {t(`testimonials.${testimonialKeys[current]}.name`)}
              </p>
              <p className="text-xs md:text-sm text-foreground-400 mt-1">
                {t(`testimonials.${testimonialKeys[current]}.role`)}
              </p>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-center gap-3 sm:gap-4 mt-6 sm:mt-8">
            <button
              onClick={prev}
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full border border-foreground-200 text-foreground-500 hover:text-foreground-950 hover:border-foreground-400 transition-colors duration-300 cursor-pointer"
              aria-label="Previous testimonial"
            >
              <i className="ri-arrow-left-s-line text-base sm:text-lg"></i>
            </button>

            {/* Dots */}
            <div className="flex items-center gap-2">
              {testimonialKeys.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 cursor-pointer ${
                    i === current ? 'bg-primary-500 w-4 sm:w-5' : 'bg-foreground-200 hover:bg-foreground-300'
                  }`}
                  aria-label={`Testimonial ${i + 1}`}
                />
              ))}
            </div>

            <button
              onClick={next}
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full border border-foreground-200 text-foreground-500 hover:text-foreground-950 hover:border-foreground-400 transition-colors duration-300 cursor-pointer"
              aria-label="Next testimonial"
            >
              <i className="ri-arrow-right-s-line text-base sm:text-lg"></i>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}