import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { logConversion } from '@/lib/visitLog';

export default function Footer() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const footerLinks = [
    { href: '#about', key: 'nav.about' },
    { href: '/productos', key: 'nav.products' },
    { href: '/productos', key: 'nav.seasonal' },
    { href: '/productos', key: 'nav.restaurants' },
    { href: '#contact', key: 'nav.contact' },
  ];

  const handleClick = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    if (href.startsWith('#')) {
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate(href);
    }
  };

  return (
    <footer className="bg-primary-900 text-background-50/70">
      <div className="container-wide px-4 md:px-6 lg:px-12 py-12 sm:py-16 md:py-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 sm:gap-10 md:gap-12">
          {/* Brand */}
          <div className="sm:col-span-2 md:col-span-1">
            <span className="font-heading text-xl md:text-2xl font-semibold text-background-50">
              Arrantza
            </span>
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.15em] text-white/60 mt-1 mb-3 sm:mb-4">
              Pescados y Mariscos
            </p>
            <p className="text-sm text-white/70 leading-relaxed max-w-xs">
              Calle Jesús Aramburu, 1<br />
              48950 Erandio<br />
              Bizkaia, España
            </p>
            <div className="flex items-center gap-3 mt-3 sm:mt-4">
              <a
                href="tel:+34608240759"
                onClick={() => logConversion('tel_click')}
                className="text-sm text-white/70 hover:text-white transition-colors duration-300 whitespace-nowrap cursor-pointer"
              >
                +34 608 240 759
              </a>
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h4 className="font-heading text-sm font-semibold text-background-50 mb-3 sm:mb-4">
              Enlaces
            </h4>
            <div className="flex flex-col gap-1.5 sm:gap-2">
              {footerLinks.map((link) => (
                <a
                  key={link.key}
                  href={link.href}
                  onClick={(e) => handleClick(e, link.href)}
                  className="text-sm text-white/70 hover:text-white transition-colors duration-300 whitespace-nowrap cursor-pointer"
                >
                  {t(link.key)}
                </a>
              ))}
            </div>
          </div>

          {/* Tagline */}
          <div className="flex flex-col justify-between">
            <div>
              <p className="font-heading text-base sm:text-lg md:text-xl text-background-50 italic leading-relaxed">
                &ldquo;{t('footer.tagline')}&rdquo;
              </p>
            </div>
            {/* Google rating */}
            <div className="flex items-center gap-2 mt-4 sm:mt-6">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <i key={i} className="ri-star-fill text-accent-400 text-xs sm:text-sm"></i>
                ))}
              </div>
              <span className="text-[11px] sm:text-xs text-white/70">5.0 Google</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-background-50/10">
        <div className="container-wide px-4 md:px-6 lg:px-12 py-4 sm:py-5 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3">
          <p className="text-[11px] sm:text-xs text-white/60">
            &copy; {new Date().getFullYear()} Pescados y Mariscos Arrantza. {t('footer.rights')}
          </p>
          <div className="flex items-center gap-4 sm:gap-6">
            <a
              href="/aviso-legal"
              onClick={(e) => handleClick(e, '/aviso-legal')}
              className="text-[11px] sm:text-xs text-white/60 hover:text-white/85 transition-colors duration-300 whitespace-nowrap cursor-pointer"
            >
              {t('footer.privacy')}
            </a>
            <a
              href="/cookies"
              onClick={(e) => handleClick(e, '/cookies')}
              className="text-[11px] sm:text-xs text-white/60 hover:text-white/85 transition-colors duration-300 whitespace-nowrap cursor-pointer"
            >
              {t('footer.cookies')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}