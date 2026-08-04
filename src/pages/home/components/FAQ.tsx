import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const faqItems = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];

export default function FAQ() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => {
    setOpenIndex(openIndex === i ? null : i);
  };

  return (
    <section id="faq" className="section-padding bg-background-100">
      <div ref={ref} className="container-narrow">
        <div className={`text-center mb-12 md:mb-16 lg:mb-20 transition-all duration-800 ease-out ${isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
          <span className="section-label">{t('faq.label')}</span>
          <h2 className="section-title">{t('faq.title')}</h2>
        </div>

        <div className={`space-y-2 sm:space-y-4 transition-all duration-800 ease-out ${isVisible ? 'animate-fade-up' : 'opacity-0'}`}>
          {faqItems.map((item, i) => (
            <div
              key={item}
              className="bg-background-50 rounded-lg overflow-hidden transition-all duration-300"
            >
              <button
                onClick={() => toggle(i)}
                className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 py-4 sm:py-6 text-left cursor-pointer group"
              >
                <span className="font-medium text-foreground-800 text-sm md:text-base pr-6 leading-snug">
                  {t(`faq.${item}`)}
                </span>
                <div className={`w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 flex items-center justify-center rounded-full border border-foreground-200 transition-all duration-300 ${
                  openIndex === i ? 'bg-foreground-950 border-foreground-950' : 'group-hover:border-foreground-400'
                }`}>
                  <i className={`ri-${openIndex === i ? 'subtract' : 'add'}-line text-xs sm:text-sm ${
                    openIndex === i ? 'text-background-50' : 'text-foreground-400'
                  }`}></i>
                </div>
              </button>

              <div
                className={`overflow-hidden transition-all duration-400 ease-out ${
                  openIndex === i ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <p className="px-4 sm:px-6 pb-4 sm:pb-6 text-sm md:text-base text-foreground-500 leading-relaxed">
                  {t(`faq.a${i + 1}`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}