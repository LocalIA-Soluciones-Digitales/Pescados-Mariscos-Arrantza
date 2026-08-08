import { useEffect, useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { logConversion } from '@/lib/visitLog';

function isShopOpen(): boolean {
  const now = new Date();
  const day = now.getDay();
  const totalMinutes = now.getHours() * 60 + now.getMinutes();

  if (day === 1) return false;
  if (day === 0) {
    return totalMinutes >= 9 * 60 && totalMinutes < 14 * 60;
  }
  const morning = totalMinutes >= 9 * 60 && totalMinutes < 14 * 60;
  const evening = totalMinutes >= 17 * 60 && totalMinutes < 20 * 60;
  return morning || evening;
}

export default function Hero() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(true);

  const handleScroll = useCallback(() => {
    if (!bgRef.current) return;
    const isMobile = window.innerWidth < 768;
    if (isMobile) return;
    const scrollY = window.scrollY;
    const vh = window.innerHeight;
    if (scrollY < vh) {
      const progress = scrollY / vh;
      const scale = 1 + progress * 0.12;
      const translateY = progress * 30;
      bgRef.current.style.transform = `scale(${scale}) translateY(${translateY}px)`;
    }
  }, []);

  useEffect(() => {
    let rafId: number;
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        handleScroll();
        rafId = 0;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [handleScroll]);

  useEffect(() => {
    setIsOpen(isShopOpen());
    const interval = setInterval(() => setIsOpen(isShopOpen()), 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative min-h-screen w-full overflow-hidden flex flex-col"
    >
      {/* Background image — static on mobile for performance */}
      <div
        ref={bgRef}
        className="absolute inset-0 bg-cover bg-center md:will-change-transform"
        style={{
          backgroundImage: `url('https://readdy.ai/api/search-image?query=Fresh%20whole%20fish%20and%20seafood%20displayed%20on%20a%20wet%20marble%20counter%20with%20crushed%20ice%20under%20soft%20morning%20natural%20light%2C%20editorial%20food%20photography%20with%20shallow%20depth%20of%20field%2C%20muted%20dark%20moody%20tones%2C%20professional%20culinary%20aesthetic%2C%20texture%20of%20fish%20scales%20and%20ice%20crystals%20in%20sharp%20focus&width=1800&height=1200&seq=arrantza-hero-01&orientation=landscape')`,
          transform: 'scale(1) translateY(0)',
        }}
      />

      {/* Dark overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/65" />

      {/* ── Main content area: flex-1 fills all available space above the bottom bar ── */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center w-full px-4 md:px-6 pt-24 md:pt-28 lg:pt-32 pb-10 md:pb-14">
        <div className="max-w-[800px] w-full flex flex-col items-center text-center">

          {/* ── 1. Title ── */}
          <h1 className="animate-fade-up-1 opacity-0 text-3xl md:text-5xl lg:text-7xl font-heading font-semibold text-background-50 leading-[1.08] md:leading-[1.06] text-balance mb-6 md:mb-8 lg:mb-10 tracking-tight">
            {t('hero.title')}
          </h1>

          {/* ── 2. Subtitle ── */}
          <p className="animate-fade-up-2 opacity-0 text-sm md:text-lg lg:text-xl text-white leading-relaxed max-w-lg mx-auto mb-8 md:mb-10 lg:mb-12 text-balance font-light">
            {t('hero.subtitle')}
          </p>

          {/* ── 3. Primary CTA + 4. Secondary CTA ── */}
          <div className="animate-fade-up-3 opacity-0 flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-5 mb-10 md:mb-12 lg:mb-14">

            {/* Primary: Ver catálogo */}
            <button
              onClick={() => navigate('/productos')}
              className="group relative inline-flex items-center gap-2.5 bg-background-50 text-foreground-950 px-8 md:px-10 py-4 md:py-5 rounded-full font-semibold text-sm md:text-base hover:bg-background-100 transition-all duration-300 whitespace-nowrap cursor-pointer overflow-hidden hover:scale-[1.03] active:scale-95 w-full sm:w-auto justify-center shadow-[0_8px_32px_rgba(255,255,255,0.06)]"
            >
              {/* Hover shine sweep */}
              <span className="absolute inset-0 overflow-hidden rounded-full pointer-events-none">
                <span className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-[shine_0.8s_ease]" />
              </span>
              <span className="relative z-10 flex items-center gap-2.5">
                <i className="ri-book-open-line text-lg" />
                {t('hero.cta.catalog')}
                <i className="ri-arrow-right-line text-base ml-0.5 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </button>

            {/* Secondary: Llamar ahora */}
            <a
              href="tel:+34608240759"
              onClick={() => logConversion('tel_click')}
              className="group inline-flex items-center gap-2.5 border border-background-50/20 hover:border-background-50/40 text-background-50 px-8 md:px-9 py-4 md:py-5 rounded-full font-medium text-sm md:text-base hover:bg-background-50/6 transition-all duration-300 whitespace-nowrap cursor-pointer hover:scale-[1.03] active:scale-95 w-full sm:w-auto justify-center"
            >
              <span className="relative z-10 flex items-center gap-2.5">
                <i className="ri-phone-line text-lg" />
                {t('hero.cta.call')}
              </span>
            </a>
          </div>

          {/* ── 5. Trust bar ── */}
          <div className="animate-fade-up-4 opacity-0">
            <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-10 lg:gap-16">
              {/* Row 1 — Daily market selection */}
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  <i className="ri-ship-line text-accent-300 text-[20px]" />
                </span>
                <span className="text-white/70 text-xs sm:text-sm font-medium whitespace-nowrap">
                  {t('hero.trust.bar1')}
                </span>
              </div>

              {/* Row 2 — Personalized preparation */}
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  <i className="ri-knife-line text-accent-300 text-[20px]" />
                </span>
                <span className="text-white/70 text-xs sm:text-sm font-medium whitespace-nowrap">
                  {t('hero.trust.bar2')}
                </span>
              </div>

              {/* Row 3 — Pickup or delivery */}
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  <i className="ri-truck-line text-accent-300 text-[20px]" />
                </span>
                <span className="text-white/70 text-xs sm:text-sm font-medium whitespace-nowrap">
                  {t('hero.trust.bar3')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 6. Bottom bar: status badge + designer credit ── */}
      <div className="relative z-10 px-4 md:px-6 lg:px-12 pb-5 md:pb-7 flex items-end justify-between pointer-events-none w-full">
        {/* Status badge — left */}
        <div className="animate-fade-up-5 opacity-0 pointer-events-auto">
          <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 border text-xs font-medium tracking-wide backdrop-blur-sm ${isOpen ? 'border-accent-400/30 bg-accent-400/10 text-accent-200' : 'border-red-400/30 bg-red-400/10 text-red-200'}`}>
            <span className="relative flex-shrink-0 w-2 h-2">
              {isOpen ? (
                <>
                  <span className="absolute inset-0 rounded-full bg-accent-300 animate-ping opacity-50" />
                  <span className="relative block w-2 h-2 rounded-full bg-accent-300" />
                </>
              ) : (
                <span className="block w-2 h-2 rounded-full bg-red-300" />
              )}
            </span>
            {isOpen ? t('floating.open') : t('floating.closed')}
          </div>
        </div>

        {/* Designer credit — right */}
        <div className="animate-fade-up-5 opacity-0 pointer-events-auto">
          <div className="text-right">
            <span className="block text-[10px] text-white tracking-wide font-light">
              Designed &amp; Developed by
            </span>
            <span className="block text-[11px] text-white font-medium tracking-wide mt-1">
              local<span className="font-bold text-accent-300">IA</span>.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}