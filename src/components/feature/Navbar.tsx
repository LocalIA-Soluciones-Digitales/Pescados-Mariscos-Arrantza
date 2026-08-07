import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '@/hooks/useLanguage';

const navLinks = [
  { key: 'nav.about', href: '#about' },
  { key: 'nav.products', href: '/productos' },
  { key: 'nav.restaurants', href: '/profesionales' },
  { key: 'nav.contact', href: '#contact' },
];

export default function Navbar() {
  const { t } = useTranslation();
  const { currentLang, toggleLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Only the home hero is a dark full-bleed photo — everywhere else the
  // navbar must render with dark text/solid background from the start,
  // otherwise light text disappears against those pages' light hero.
  const isHome = location.pathname === '/';
  const showDark = scrolled || !isHome;

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const handleNavClick = (href: string) => {
    setMobileOpen(false);
    if (href.startsWith('#')) {
      if (location.pathname !== '/') {
        navigate('/');
        setTimeout(() => document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' }), 100);
        return;
      }
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate(href);
    }
  };

  const handleLogoClick = () => {
    setMobileOpen(false);
    if (location.pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate('/');
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50" data-scrolled={showDark}>
      {/* backdrop-blur-md below establishes a containing block for `position: fixed`
          descendants (same as transform/filter), so it must not wrap the mobile
          menu overlay — otherwise that overlay positions against this row instead
          of the viewport and collapses to the navbar's height when scrolled. */}
      <div
        className={`relative transition-all duration-500 ${
          showDark
            ? 'bg-background-50/95 backdrop-blur-md shadow-[0_1px_0_0_rgba(0,0,0,0.04)]'
            : 'bg-transparent'
        }`}
      >
        {/* Scrim behind the transparent navbar — guarantees contrast for white text
            regardless of what's in the hero photo directly underneath it */}
        {!showDark && (
          <div className="absolute inset-x-0 top-0 h-24 md:h-28 bg-gradient-to-b from-black/70 via-black/35 to-transparent pointer-events-none -z-10" />
        )}

        <div className="w-full max-w-[1440px] mx-auto px-4 md:px-6 lg:px-12">
          {/* Plain flex justify-between so mobile always gets equal, predictable
              left/right margins. Desktop nav links are pulled out of this flow
              and centered absolutely, so they can't disturb that spacing. */}
          <div className="relative flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <a
              href="/"
              onClick={(e) => { e.preventDefault(); handleLogoClick(); }}
              className="flex items-center gap-2 group"
            >
              <img
                src="/logo.png"
                alt="Arrantza"
                className="w-8 h-8 md:w-9 md:h-9 shrink-0 rounded-full object-cover shadow-[0_1px_4px_rgba(0,0,0,0.35)]"
              />
              <span className="flex items-baseline gap-2">
                <span className={`font-heading text-xl md:text-2xl font-semibold leading-none tracking-tight -translate-y-[1.5px] transition-colors duration-500 ${showDark ? 'text-foreground-950' : 'text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]'}`}>
                  Arrantza
                </span>
                <span className={`hidden sm:inline-block w-1.5 h-1.5 rounded-full self-center transition-colors duration-500 ${showDark ? 'bg-foreground-400' : 'bg-white/70'}`}></span>
                <span className={`hidden sm:inline text-xs leading-none tracking-[0.15em] uppercase -translate-y-[1.5px] transition-colors duration-500 ${showDark ? 'text-foreground-400' : 'text-white/70 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]'}`}>
                  {currentLang === 'es' ? 'Pescados y Mariscos' : 'Arrainak eta Itsaskiak'}
                </span>
              </span>
            </a>

            {/* Desktop nav — centered on the row independently of logo/right-side widths.
                inset-y-0 + items-center (not the position:absolute static-position fallback,
                which browsers resolve inconsistently) is what actually pins this to the same
                vertical axis as the in-flow logo/right-side items. */}
            <div className="hidden lg:flex items-center gap-8 absolute inset-y-0 left-1/2 -translate-x-1/2">
              {navLinks.map((link) => (
                <a
                  key={link.key}
                  href={link.href}
                  onClick={(e) => { e.preventDefault(); handleNavClick(link.href); }}
                  className={`text-sm font-medium leading-none transition-colors duration-300 whitespace-nowrap ${
                    showDark
                      ? 'text-foreground-500 hover:text-foreground-950'
                      : 'text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.6)] hover:text-white/80'
                  }`}
                >
                  {t(link.key)}
                </a>
              ))}
            </div>

            {/* Right side: language + mobile toggle */}
            <div className="flex items-center gap-4">
              {/* Admin access — discreet, desktop only */}
              <a
                href="/admin"
                onClick={(e) => { e.preventDefault(); navigate('/admin'); }}
                className={`hidden lg:flex w-8 h-8 items-center justify-center rounded-full transition-colors duration-300 ${
                  showDark
                    ? 'text-foreground-300 hover:text-foreground-600 hover:bg-background-100'
                    : 'text-white/50 [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] hover:text-white hover:bg-white/10'
                }`}
                aria-label="Gestión de productos"
                title="Gestión de productos"
              >
                <i className="ri-shield-user-line text-base"></i>
              </a>

              {/* Language switcher */}
              <div className={`flex items-center rounded-full border overflow-hidden transition-colors duration-500 ${
                showDark ? 'border-foreground-200/50' : 'border-white/40 bg-black/10'
              }`}>
                <button
                  onClick={() => currentLang !== 'es' && toggleLanguage()}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors duration-300 whitespace-nowrap cursor-pointer ${
                    currentLang === 'es'
                      ? 'bg-primary-500 text-background-50'
                      : showDark ? 'text-foreground-500 hover:text-foreground-950' : 'text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]'
                  }`}
                  aria-label="Cambiar a español"
                >
                  ES
                </button>
                <button
                  onClick={() => currentLang !== 'eu' && toggleLanguage()}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors duration-300 whitespace-nowrap cursor-pointer ${
                    currentLang === 'eu'
                      ? 'bg-primary-500 text-background-50'
                      : showDark ? 'text-foreground-500 hover:text-foreground-950' : 'text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]'
                  }`}
                  aria-label="Aldatu euskarara"
                >
                  EU
                </button>
              </div>

              {/* Mobile hamburger — larger touch target */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden relative w-11 h-11 flex items-center justify-center cursor-pointer -mr-2"
                aria-label={mobileOpen ? t('common.close') : t('common.open')}
              >
                <div className="flex flex-col gap-1.5 w-5 items-center">
                  <span className={`block h-px w-5 transition-all duration-300 ${mobileOpen ? 'rotate-45 translate-y-[3.5px] bg-foreground-950' : showDark ? 'bg-foreground-950' : 'bg-background-50'}`}></span>
                  <span className={`block h-px w-5 transition-all duration-300 ${mobileOpen ? 'opacity-0 bg-foreground-950' : showDark ? 'bg-foreground-950' : 'bg-background-50'}`}></span>
                  <span className={`block h-px w-5 transition-all duration-300 ${mobileOpen ? '-rotate-45 -translate-y-[3.5px] bg-foreground-950' : showDark ? 'bg-foreground-950' : 'bg-background-50'}`}></span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={`lg:hidden fixed inset-0 top-16 bg-background-50 z-40 transition-all duration-400 ${
          mobileOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
      >
        <div className="flex flex-col items-center justify-center h-full gap-6 pb-20 px-4">
          {navLinks.map((link, i) => (
            <a
              key={link.key}
              href={link.href}
              onClick={(e) => { e.preventDefault(); handleNavClick(link.href); }}
              className={`text-xl font-heading text-foreground-600 hover:text-foreground-950 transition-all duration-300 whitespace-nowrap cursor-pointer ${
                mobileOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
              style={{ transitionDelay: mobileOpen ? `${i * 70}ms` : '0ms' }}
            >
              {t(link.key)}
            </a>
          ))}
        </div>

        {/* Admin access — separated from primary nav, styled as a discreet utility action */}
        <a
          href="/admin"
          onClick={(e) => { e.preventDefault(); handleNavClick('/admin'); }}
          className={`absolute left-1/2 -translate-x-1/2 bottom-10 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-background-200/70 text-xs font-medium text-foreground-400 hover:text-foreground-700 hover:border-background-300 transition-all duration-300 ${
            mobileOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{ transitionDelay: mobileOpen ? `${navLinks.length * 70}ms` : '0ms' }}
        >
          <i className="ri-shield-user-line text-sm"></i>
          Gestión de productos
        </a>
      </div>
    </nav>
  );
}