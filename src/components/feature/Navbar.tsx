import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/hooks/useLanguage';

const navLinks = [
  { key: 'nav.about', href: '#about' },
  { key: 'nav.products', href: '/productos' },
  { key: 'nav.restaurants', href: '/productos' },
  { key: 'nav.contact', href: '#contact' },
];

export default function Navbar() {
  const { t } = useTranslation();
  const { currentLang, toggleLanguage } = useLanguage();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate(href);
    }
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-background-50/95 backdrop-blur-md shadow-[0_1px_0_0_rgba(0,0,0,0.04)]'
          : 'bg-transparent'
      }`}
      data-scrolled={scrolled}
    >
      <div className="w-full max-w-[1440px] mx-auto px-4 md:px-6 lg:px-12">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="flex items-center gap-2 group"
          >
            <span className={`font-heading text-xl md:text-2xl font-semibold tracking-tight transition-colors duration-500 ${scrolled ? 'text-foreground-950' : 'text-background-50'}`}>
              Arrantza
            </span>
            <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-accent-500 mt-1"></span>
            <span className={`hidden sm:inline text-xs tracking-[0.15em] uppercase mt-0.5 transition-colors duration-500 ${scrolled ? 'text-foreground-400' : 'text-background-50/60'}`}>
              {currentLang === 'es' ? 'Pescados y Mariscos' : 'Arrainak eta Itsaskiak'}
            </span>
          </a>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.key}
                href={link.href}
                onClick={(e) => { e.preventDefault(); handleNavClick(link.href); }}
                className={`text-sm transition-colors duration-300 whitespace-nowrap ${
                  scrolled
                    ? 'text-foreground-500 hover:text-foreground-950'
                    : 'text-background-50/80 hover:text-background-50'
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
                scrolled
                  ? 'text-foreground-300 hover:text-foreground-600 hover:bg-background-100'
                  : 'text-background-50/40 hover:text-background-50/80 hover:bg-background-50/10'
              }`}
              aria-label="Acceso pescadero"
              title="Acceso pescadero"
            >
              <i className="ri-lock-line text-base"></i>
            </a>

            {/* Language switcher */}
            <div className={`flex items-center rounded-full border overflow-hidden transition-colors duration-500 ${
              scrolled ? 'border-foreground-200/50' : 'border-background-50/25'
            }`}>
              <button
                onClick={() => currentLang !== 'es' && toggleLanguage()}
                className={`px-2.5 py-1 text-xs font-medium transition-colors duration-300 whitespace-nowrap cursor-pointer ${
                  currentLang === 'es'
                    ? 'bg-primary-500 text-background-50'
                    : scrolled ? 'text-foreground-500 hover:text-foreground-950' : 'text-white hover:text-white'
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
                    : scrolled ? 'text-foreground-500 hover:text-foreground-950' : 'text-white hover:text-white'
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
                <span className={`block h-px w-5 transition-all duration-300 ${mobileOpen ? 'rotate-45 translate-y-[3.5px] bg-foreground-950' : scrolled ? 'bg-foreground-950' : 'bg-background-50'}`}></span>
                <span className={`block h-px w-5 transition-all duration-300 ${mobileOpen ? 'opacity-0 bg-foreground-950' : scrolled ? 'bg-foreground-950' : 'bg-background-50'}`}></span>
                <span className={`block h-px w-5 transition-all duration-300 ${mobileOpen ? '-rotate-45 -translate-y-[3.5px] bg-foreground-950' : scrolled ? 'bg-foreground-950' : 'bg-background-50'}`}></span>
              </div>
            </button>
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

          <a
            href="/admin"
            onClick={(e) => { e.preventDefault(); handleNavClick('/admin'); }}
            className={`inline-flex items-center gap-1.5 text-xs text-foreground-300 hover:text-foreground-500 transition-all duration-300 mt-4 ${
              mobileOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: mobileOpen ? `${navLinks.length * 70}ms` : '0ms' }}
          >
            <i className="ri-lock-line text-xs"></i>
            Acceso pescadero
          </a>
        </div>
      </div>
    </nav>
  );
}