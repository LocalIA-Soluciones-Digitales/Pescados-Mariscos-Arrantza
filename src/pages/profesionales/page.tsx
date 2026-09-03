import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/pages/home/components/Footer';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { logConversion } from '@/lib/visitLog';
import { useProductosPublicos } from '@/hooks/useProductosPublicos';
import { pickLang } from '@/types/producto';

/* ── Daily selection shows whatever the fishmonger marks as        ── */
/* ── "Destacado" in the admin panel (shared with the home carousel). ── */
const MAX_DAILY = 4;

/* ── Hero section ── */
function HeroSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1, rootMargin: '0px' });

  return (
    <section
      ref={ref}
      className="relative min-h-[90vh] md:min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src="https://ukhfaphloxlszomccgde.supabase.co/storage/v1/object/public/pescados-mariscos-arrantza/marketing/pro-hero-bg.jpg"
          alt=""
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-black/60"></div>
      </div>

      {/* Content */}
      <div className={`relative z-10 w-full max-w-[900px] mx-auto px-6 md:px-8 text-center transition-all duration-1000 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <span className="inline-block text-xs md:text-sm font-semibold uppercase tracking-[0.22em] mb-5 md:mb-7 animate-text-shine drop-shadow-[0_1px_4px_rgba(0,0,0,0.35)]">
          Arrantza para profesionales
        </span>
        <h1 className="font-heading text-3xl md:text-5xl lg:text-6xl font-semibold text-background-50 leading-[1.1] mb-5 md:mb-6 max-w-[700px] mx-auto">
          {t('pro.hero.title')}
        </h1>
        <p className="text-white/80 text-sm md:text-lg leading-relaxed max-w-[550px] mx-auto mb-8 md:mb-10">
          {t('pro.hero.subtitle')}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4">
          <button
            type="button"
            onClick={() => navigate('/productos')}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 md:px-8 md:py-4 bg-primary-500 text-background-50 rounded-full text-sm md:text-base font-semibold cursor-pointer whitespace-nowrap transition-all duration-300 hover:bg-primary-600 hover:scale-[1.03] active:scale-95 group"
          >
            {t('pro.hero.cta.catalog')}
            <span className="w-4 h-4 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1">
              <i className="ri-arrow-right-line"></i>
            </span>
          </button>
          <a
            href="#contact-form"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 md:px-8 md:py-4 bg-background-50/15 backdrop-blur-sm border border-background-50/30 text-background-50 rounded-full text-sm md:text-base font-semibold cursor-pointer whitespace-nowrap transition-all duration-300 hover:bg-background-50/25 hover:border-background-50/50 active:scale-95 group"
          >
            {t('pro.hero.cta.contact')}
            <span className="w-4 h-4 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1">
              <i className="ri-arrow-down-line"></i>
            </span>
          </a>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce">
        <span className="w-8 h-8 flex items-center justify-center text-background-50/50">
          <i className="ri-arrow-down-s-line text-xl"></i>
        </span>
      </div>
    </section>
  );
}

/* ── Business cards section ── */
function BusinessCards() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  const cards = [
    { icon: 'ri-restaurant-2-line', titleKey: 'pro.business.card1.title', descKey: 'pro.business.card1.desc' },
    { icon: 'ri-hotel-line', titleKey: 'pro.business.card2.title', descKey: 'pro.business.card2.desc' },
    { icon: 'ri-cake-2-line', titleKey: 'pro.business.card3.title', descKey: 'pro.business.card3.desc' },
    { icon: 'ri-building-2-line', titleKey: 'pro.business.card4.title', descKey: 'pro.business.card4.desc' },
  ];

  return (
    <section className="bg-background-50">
      <div ref={ref} className="max-w-[1200px] mx-auto px-4 md:px-6 lg:px-12 py-16 md:py-24">
        <div className={`text-center mb-12 md:mb-16 transition-all duration-800 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 className="font-heading text-2xl md:text-4xl font-semibold text-foreground-950 leading-[1.15] mb-4">
            {t('pro.business.title')}
          </h2>
          <p className="text-sm md:text-base text-foreground-500 leading-relaxed max-w-[650px] mx-auto">
            {t('pro.business.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {cards.map((card, idx) => (
            <div
              key={card.titleKey}
              className={`group bg-background-50 rounded-lg border border-background-200/70 p-6 md:p-8 text-center transition-all duration-500 ease-out hover:-translate-y-1 hover:border-background-300/80 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
              style={{ transitionDelay: `${idx * 100}ms` }}
            >
              <span className="w-14 h-14 md:w-16 md:h-16 flex items-center justify-center mx-auto mb-5 rounded-full bg-primary-100/70 text-primary-600 text-xl md:text-2xl group-hover:scale-110 group-hover:bg-primary-200/80 transition-all duration-300">
                <i className={card.icon}></i>
              </span>
              <h3 className="font-heading text-base md:text-lg font-semibold text-foreground-950 mb-3">
                {t(card.titleKey)}
              </h3>
              <p className="text-sm text-foreground-500 leading-relaxed">
                {t(card.descKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Daily selection section ── */
function DailySelection() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  const { productos } = useProductosPublicos();

  const featuredProducts = useMemo(() => {
    const destacados = productos.filter((p) => p.destacado && p.disponible);
    const source = destacados.length > 0 ? destacados : productos.filter((p) => p.disponible);
    return source.slice(0, MAX_DAILY);
  }, [productos]);

  if (featuredProducts.length === 0) return null;

  return (
    <section className="bg-background-100/50">
      <div ref={ref} className="max-w-[1200px] mx-auto px-4 md:px-6 lg:px-12 py-16 md:py-24">
        <div className={`text-center mb-12 md:mb-16 transition-all duration-800 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 className="font-heading text-2xl md:text-4xl font-semibold text-foreground-950 leading-[1.15] mb-4">
            {t('pro.daily.title')}
          </h2>
          <p className="text-sm md:text-base text-foreground-500 leading-relaxed max-w-[600px] mx-auto">
            {t('pro.daily.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-10 md:mb-12">
          {featuredProducts.map((producto, idx) => {
            const nombre = pickLang(producto, 'nombre', i18n.language);
            const origen = pickLang(producto, 'origen', i18n.language);
            return (
              <button
                key={producto.id}
                type="button"
                onClick={() => navigate('/productos')}
                className={`group bg-background-50 rounded-lg border border-background-200/70 overflow-hidden text-left cursor-pointer transition-all duration-500 ease-out hover:-translate-y-1 hover:border-background-300/80 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
                style={{ transitionDelay: `${idx * 100}ms` }}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-background-100">
                  {producto.imagen_url && (
                    <img
                      src={producto.imagen_url}
                      alt={nombre}
                      className="w-full h-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="p-4 md:p-5">
                  <h3 className="font-heading text-sm md:text-base font-semibold text-foreground-950 mb-1">
                    {nombre}
                  </h3>
                  {origen && (
                    <p className="text-xs text-foreground-400 mb-2">
                      <span className="inline-flex items-center gap-1">
                        <i className="ri-map-pin-line text-[10px]"></i>
                        {origen}
                      </span>
                    </p>
                  )}
                  <span className="text-sm md:text-base font-semibold text-foreground-950">{producto.precio}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={() => navigate('/productos')}
            className="inline-flex items-center gap-2 px-6 py-3 md:px-8 md:py-4 bg-primary-500 text-background-50 rounded-full text-sm md:text-base font-semibold cursor-pointer whitespace-nowrap transition-all duration-300 hover:bg-primary-600 hover:scale-[1.03] active:scale-95 group"
          >
            {t('pro.daily.cta')}
            <span className="w-4 h-4 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1">
              <i className="ri-arrow-right-line"></i>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

/* ── Process steps section ── */
function ProcessSteps() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  const steps = [
    { numberKey: 'pro.process.step1.number', titleKey: 'pro.process.step1.title', descKey: 'pro.process.step1.desc' },
    { numberKey: 'pro.process.step2.number', titleKey: 'pro.process.step2.title', descKey: 'pro.process.step2.desc' },
    { numberKey: 'pro.process.step3.number', titleKey: 'pro.process.step3.title', descKey: 'pro.process.step3.desc' },
  ];

  return (
    <section className="bg-background-50">
      <div ref={ref} className="max-w-[1200px] mx-auto px-4 md:px-6 lg:px-12 py-16 md:py-24">
        <div className={`text-center mb-12 md:mb-16 transition-all duration-800 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 className="font-heading text-2xl md:text-4xl font-semibold text-foreground-950 leading-[1.15]">
            {t('pro.process.title')}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10 lg:gap-16 max-w-[1000px] mx-auto">
          {steps.map((step, idx) => (
            <div
              key={step.titleKey}
              className={`text-center transition-all duration-500 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ transitionDelay: `${idx * 150}ms` }}
            >
              <span className="inline-block font-heading text-5xl md:text-6xl lg:text-7xl font-semibold text-foreground-100 mb-4 md:mb-6 leading-none select-none">
                {t(step.numberKey)}
              </span>
              <h3 className="font-heading text-lg md:text-xl font-semibold text-foreground-950 mb-3">
                {t(step.titleKey)}
              </h3>
              <p className="text-sm text-foreground-500 leading-relaxed max-w-[280px] mx-auto">
                {t(step.descKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Recurring orders section ── */
function RecurringOrders() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  return (
    <section className="relative bg-foreground-950 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      <div ref={ref} className="relative z-10 max-w-[700px] mx-auto px-4 md:px-6 lg:px-12 py-16 md:py-24 text-center">
        <div className={`transition-all duration-800 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 className="font-heading text-2xl md:text-4xl font-semibold text-background-50 leading-[1.15] mb-5 md:mb-6">
            {t('pro.recurring.title')}
          </h2>
          <p className="text-base md:text-lg text-white/70 leading-relaxed mb-8 md:mb-10 max-w-[550px] mx-auto">
            {t('pro.recurring.subtitle')}
          </p>
          <a
            href="https://wa.me/34619609888"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => logConversion('whatsapp_click')}
            className="inline-flex items-center gap-2 px-7 py-3.5 md:px-8 md:py-4 bg-accent-500 text-background-50 rounded-full text-sm md:text-base font-semibold cursor-pointer whitespace-nowrap transition-all duration-300 hover:bg-accent-600 hover:scale-[1.03] active:scale-95 group"
          >
            <span className="w-5 h-5 flex items-center justify-center">
              <i className="ri-whatsapp-line text-lg"></i>
            </span>
            {t('pro.recurring.cta')}
            <span className="w-4 h-4 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1">
              <i className="ri-arrow-right-line"></i>
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}

/* ── Special orders section ── */
function SpecialOrders() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  return (
    <section className="bg-background-100/50">
      <div ref={ref} className="max-w-[700px] mx-auto px-4 md:px-6 lg:px-12 py-16 md:py-24 text-center">
        <div className={`transition-all duration-800 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 className="font-heading text-2xl md:text-4xl font-semibold text-foreground-950 leading-[1.15] mb-4">
            {t('pro.special.title')}
          </h2>
          <p className="text-sm md:text-base text-foreground-500 leading-relaxed max-w-[500px] mx-auto mb-8 md:mb-10">
            {t('pro.special.subtitle')}
          </p>
          <a
            href="#contact-form"
            className="inline-flex items-center gap-2 px-7 py-3.5 md:px-8 md:py-4 bg-secondary-500 text-background-50 rounded-full text-sm md:text-base font-semibold cursor-pointer whitespace-nowrap transition-all duration-300 hover:bg-secondary-600 hover:scale-[1.03] active:scale-95 group"
          >
            {t('pro.special.cta')}
            <span className="w-4 h-4 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1">
              <i className="ri-arrow-right-line"></i>
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}

/* ── Contact form section ── */
function ContactForm() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  const [formState, setFormState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [formError, setFormError] = useState('');
  const [businessType, setBusinessType] = useState('');

  const businessTypes = [
    { value: 'restaurante', labelKey: 'pro.form.business_type.restaurant' },
    { value: 'hotel', labelKey: 'pro.form.business_type.hotel' },
    { value: 'catering', labelKey: 'pro.form.business_type.catering' },
    { value: 'comercio', labelKey: 'pro.form.business_type.commerce' },
    { value: 'otro', labelKey: 'pro.form.business_type.other' },
  ];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    // Honeypot check
    const honeypot = formData.get('company_alt') as string;
    if (honeypot && honeypot.trim()) {
      setFormState('success');
      form.reset();
      setBusinessType('');
      setTimeout(() => setFormState('idle'), 4000);
      return;
    }

    // Validate required fields
    const businessName = formData.get('business_name') as string;
    const contactPerson = formData.get('contact_person') as string;
    const phone = formData.get('phone') as string;
    const needs = formData.get('needs') as string;

    if (!businessName?.trim() || !contactPerson?.trim() || !businessType || !phone?.trim() || !needs?.trim()) {
      setFormError('Por favor, completa todos los campos obligatorios.');
      return;
    }

    if (needs.length > 500) {
      setFormError('El campo de necesidades no puede superar los 500 caracteres.');
      return;
    }

    setFormState('sending');
    setFormError('');

    try {
      const res = await fetch('https://readdy.ai/api/form/d9qvf6cnlsngrm4lm6lg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          business_name: businessName.trim(),
          contact_person: contactPerson.trim(),
          business_type: businessType,
          phone: phone.trim(),
          email: (formData.get('email') as string || '').trim(),
          needs: needs.trim(),
        }).toString(),
      });

      const responseText = await res.text();
      let parsed: any = {};
      try { parsed = JSON.parse(responseText); } catch { /* not JSON */ }

      if (res.ok && parsed?.code === 'OK') {
        setFormState('success');
        form.reset();
        setBusinessType('');
        setTimeout(() => setFormState('idle'), 5000);
      } else {
        const serverMsg = parsed?.meta?.message || parsed?.message || '';
        if (serverMsg.toLowerCase().includes('spam')) {
          setFormState('success');
          form.reset();
          setBusinessType('');
          setTimeout(() => setFormState('idle'), 4000);
        } else {
          setFormError(serverMsg || 'Ha ocurrido un error. Por favor, inténtalo de nuevo.');
          setFormState('error');
        }
      }
    } catch {
      setFormError('Ha ocurrido un error de conexión. Por favor, inténtalo de nuevo.');
      setFormState('error');
    }
  };

  return (
    <section id="contact-form" className="bg-background-50">
      <div ref={ref} className="max-w-[800px] mx-auto px-4 md:px-6 lg:px-12 py-16 md:py-24">
        <div className={`text-center mb-10 md:mb-14 transition-all duration-800 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 className="font-heading text-2xl md:text-4xl font-semibold text-foreground-950 leading-[1.15] mb-4">
            {t('pro.form.title')}
          </h2>
          <p className="text-sm md:text-base text-foreground-500 leading-relaxed max-w-[500px] mx-auto">
            {t('pro.form.subtitle')}
          </p>
        </div>

        {formState === 'success' ? (
          <div className={`text-center py-12 transition-all duration-500 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="w-16 h-16 flex items-center justify-center mx-auto mb-5 rounded-full bg-emerald-100 text-emerald-600 text-2xl">
              <i className="ri-check-line"></i>
            </span>
            <h3 className="font-heading text-xl font-semibold text-foreground-950 mb-2">
              {t('pro.form.success_title')}
            </h3>
            <p className="text-sm text-foreground-500">
              {t('pro.form.success_message')}
            </p>
          </div>
        ) : (
          <form
            id="profesionales-form"
            onSubmit={handleSubmit}
            data-readdy-form
            className={`space-y-5 md:space-y-6 transition-all duration-500 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6">
              <div>
                <label htmlFor="business_name" className="block text-sm font-medium text-foreground-700 mb-1.5">
                  {t('pro.form.business_name')} *
                </label>
                <input
                  type="text"
                  id="business_name"
                  name="business_name"
                  required
                  placeholder={t('pro.form.business_name_placeholder')}
                  className="w-full px-4 py-3 bg-background-100 border border-background-200/70 rounded-lg text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40 transition-all duration-300"
                />
              </div>
              <div>
                <label htmlFor="contact_person" className="block text-sm font-medium text-foreground-700 mb-1.5">
                  {t('pro.form.contact_person')} *
                </label>
                <input
                  type="text"
                  id="contact_person"
                  name="contact_person"
                  required
                  placeholder={t('pro.form.contact_person_placeholder')}
                  className="w-full px-4 py-3 bg-background-100 border border-background-200/70 rounded-lg text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40 transition-all duration-300"
                />
              </div>
              <div>
                <label htmlFor="business_type" className="block text-sm font-medium text-foreground-700 mb-1.5">
                  {t('pro.form.business_type')} *
                </label>
                <select
                  id="business_type"
                  name="business_type"
                  required
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full px-4 py-3 bg-background-100 border border-background-200/70 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40 transition-all duration-300 appearance-none cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 12px center',
                    paddingRight: '2.5rem',
                  }}
                >
                  <option value="" disabled>{t('pro.form.business_type_placeholder')}</option>
                  {businessTypes.map((bt) => (
                    <option key={bt.value} value={bt.value}>{t(bt.labelKey)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-foreground-700 mb-1.5">
                  {t('pro.form.phone')} *
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  required
                  placeholder={t('pro.form.phone_placeholder')}
                  className="w-full px-4 py-3 bg-background-100 border border-background-200/70 rounded-lg text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40 transition-all duration-300"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground-700 mb-1.5">
                {t('pro.form.email')}
              </label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder={t('pro.form.email_placeholder')}
                className="w-full px-4 py-3 bg-background-100 border border-background-200/70 rounded-lg text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40 transition-all duration-300"
              />
            </div>

            <div>
              <label htmlFor="needs" className="block text-sm font-medium text-foreground-700 mb-1.5">
                {t('pro.form.needs')} *
              </label>
              <textarea
                id="needs"
                name="needs"
                required
                rows={4}
                maxLength={500}
                placeholder={t('pro.form.needs_placeholder')}
                className="w-full px-4 py-3 bg-background-100 border border-background-200/70 rounded-lg text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40 transition-all duration-300 resize-none"
              ></textarea>
            </div>

            {/* Honeypot */}
            <div style={{ position: 'absolute', left: '-9999px', opacity: 0 }} aria-hidden="true">
              <input type="text" name="company_alt" tabIndex={-1} autoComplete="off" readOnly />
            </div>

            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200/60 rounded-lg px-4 py-3">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={formState === 'sending'}
              className="inline-flex items-center gap-2 px-7 py-3.5 md:px-8 md:py-4 bg-primary-500 text-background-50 rounded-full text-sm md:text-base font-semibold cursor-pointer whitespace-nowrap transition-all duration-300 hover:bg-primary-600 hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {formState === 'sending' ? t('pro.form.sending') : t('pro.form.submit')}
              <span className="w-4 h-4 flex items-center justify-center">
                <i className="ri-arrow-right-line"></i>
              </span>
            </button>

            <p className="text-xs text-foreground-400 leading-relaxed">
              {t('pro.form.privacy_pre')}{' '}
              <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground-600">
                {t('pro.form.privacy_link')}
              </a>
              .
            </p>
          </form>
        )}
      </div>
    </section>
  );
}

/* ── WhatsApp section ── */
function WhatsAppSection() {
  const { t } = useTranslation();
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  return (
    <section className="bg-background-100/50 border-t border-background-200/40">
      <div ref={ref} className="max-w-[600px] mx-auto px-4 md:px-6 lg:px-12 py-16 md:py-20 text-center">
        <div className={`transition-all duration-800 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <span className="w-16 h-16 flex items-center justify-center mx-auto mb-5 rounded-full bg-emerald-100 text-emerald-600 text-2xl">
            <i className="ri-whatsapp-line"></i>
          </span>
          <h2 className="font-heading text-2xl md:text-3xl font-semibold text-foreground-950 leading-[1.15] mb-3">
            {t('pro.whatsapp.title')}
          </h2>
          <p className="text-sm md:text-base text-foreground-500 leading-relaxed mb-8">
            {t('pro.whatsapp.subtitle')}
          </p>
          <a
            href="https://wa.me/34619609888"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => logConversion('whatsapp_click')}
            className="inline-flex items-center gap-2 px-7 py-3.5 md:px-8 md:py-4 bg-emerald-500 text-background-50 rounded-full text-sm md:text-base font-semibold cursor-pointer whitespace-nowrap transition-all duration-300 hover:bg-emerald-600 hover:scale-[1.03] active:scale-95 group"
          >
            <span className="w-5 h-5 flex items-center justify-center">
              <i className="ri-whatsapp-line text-lg"></i>
            </span>
            {t('pro.whatsapp.cta')}
            <span className="w-4 h-4 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1">
              <i className="ri-arrow-right-line"></i>
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}

/* ── Main page ── */
export default function Profesionales() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <Navbar />
      <main id="main-content" className={`transition-all duration-[600ms] ease-out ${visible ? 'opacity-100' : 'opacity-0'}`}>
        <HeroSection />
        <BusinessCards />
        <DailySelection />
        <ProcessSteps />
        <RecurringOrders />
        <SpecialOrders />
        <ContactForm />
        <WhatsAppSection />
      </main>
      <Footer />
    </>
  );
}
