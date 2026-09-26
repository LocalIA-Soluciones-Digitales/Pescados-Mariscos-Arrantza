import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Navbar from '@/components/feature/Navbar';
import Footer from '@/pages/home/components/Footer';
import { logConversion } from '@/lib/visitLog';
import { supabase, SITE_KEY } from '@/lib/supabaseClient';
import { useHosteleriaAuth } from '@/hooks/useHosteleriaAuth';
import { CatalogoHosteleriaView } from './components/AccesoHosteleria';

type Pestana = 'entrar' | 'solicitar';

const inputClass =
  'w-full px-4 py-3 bg-background-50 border border-background-200/70 rounded-lg text-sm text-foreground-950 placeholder:text-foreground-400 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40';

/* ── Entrar con código + PIN ── */
function LoginForm({
  onLogin,
  loading,
  error,
}: {
  onLogin: (codigo: string, pin: string) => Promise<boolean>;
  loading: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [codigo, setCodigo] = useState('');
  const [pin, setPin] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo.trim() || !pin.trim()) return;
    await onLogin(codigo.trim(), pin.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-foreground-500 leading-relaxed mb-1">{t('host.access.subtitle')}</p>
      {/* autoComplete="off": el código no es un email, y sin esto el navegador
          rellena aquí el usuario guardado del panel de gestión. */}
      <input
        type="text"
        name="hosteleria-codigo"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        placeholder={t('host.access.code_placeholder')}
        aria-label={t('host.access.code_placeholder')}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        className={inputClass}
      />
      <input
        type="password"
        name="hosteleria-pin"
        inputMode="numeric"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder={t('host.access.pin_placeholder')}
        aria-label={t('host.access.pin_placeholder')}
        autoComplete="off"
        className={inputClass}
      />
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200/60 rounded-lg px-3 py-2">{error}</p>}
      <button
        type="submit"
        disabled={loading || !codigo.trim() || !pin.trim()}
        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-500 text-background-50 rounded-full text-sm font-semibold hover:bg-primary-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? t('host.access.entering') : t('host.access.submit')}
        {!loading && <i className="ri-arrow-right-line"></i>}
      </button>
    </form>
  );
}

/* ── Pedir cuenta: queda en el panel de gestión (pestaña Hostelería) ── */
function SolicitudForm() {
  const { t } = useTranslation();
  const [estado, setEstado] = useState<'idle' | 'sending' | 'success'>('idle');
  const [error, setError] = useState('');
  const [tipo, setTipo] = useState('');

  const tipos = [
    { value: 'restaurante', labelKey: 'host.form.business_type.restaurant' },
    { value: 'hotel', labelKey: 'host.form.business_type.hotel' },
    { value: 'catering', labelKey: 'host.form.business_type.catering' },
    { value: 'comercio', labelKey: 'host.form.business_type.commerce' },
    { value: 'otro', labelKey: 'host.form.business_type.other' },
  ];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    // Honeypot: un bot rellena el campo oculto; se le da por enviado sin guardar nada.
    if ((data.get('company_alt') as string)?.trim()) {
      setEstado('success');
      return;
    }

    const negocio = (data.get('business_name') as string)?.trim();
    const contacto = (data.get('contact_person') as string)?.trim();
    const telefono = (data.get('phone') as string)?.trim();
    const necesidades = (data.get('needs') as string)?.trim();
    if (!negocio || !contacto || !tipo || !telefono || !necesidades) {
      setError(t('host.form.required_error'));
      return;
    }

    setEstado('sending');
    setError('');
    const { error: rpcError } = await supabase.rpc('crear_solicitud_hosteleria', {
      p_site_key: SITE_KEY,
      p_nombre_negocio: negocio,
      p_persona_contacto: contacto,
      p_tipo_negocio: tipo,
      p_telefono: telefono,
      p_email: (data.get('email') as string) || '',
      p_necesidades: necesidades,
    });

    if (rpcError) {
      setError(t('host.form.send_error'));
      setEstado('idle');
      return;
    }
    form.reset();
    setTipo('');
    setEstado('success');
  };

  if (estado === 'success') {
    return (
      <div className="text-center py-8">
        <span className="w-14 h-14 flex items-center justify-center mx-auto mb-4 rounded-full bg-emerald-100 text-emerald-600 text-2xl">
          <i className="ri-check-line"></i>
        </span>
        <h3 className="font-heading text-lg font-semibold text-foreground-950 mb-1">{t('host.form.success_title')}</h3>
        <p className="text-sm text-foreground-500">{t('host.form.success_message')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-foreground-500 leading-relaxed mb-1">{t('host.access.request_text')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input name="business_name" required placeholder={`${t('host.form.business_name')} *`} aria-label={t('host.form.business_name')} className={inputClass} />
        <input name="contact_person" required placeholder={`${t('host.form.contact_person')} *`} aria-label={t('host.form.contact_person')} autoComplete="name" className={inputClass} />
        <input name="phone" type="tel" required placeholder={`${t('host.form.phone')} *`} aria-label={t('host.form.phone')} autoComplete="tel" className={inputClass} />
        <select
          name="business_type"
          required
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          aria-label={t('host.form.business_type')}
          className={`${inputClass} appearance-none cursor-pointer ${tipo ? '' : 'text-foreground-400'}`}
        >
          <option value="" disabled>{`${t('host.form.business_type')} *`}</option>
          {tipos.map((tp) => (
            <option key={tp.value} value={tp.value}>{t(tp.labelKey)}</option>
          ))}
        </select>
      </div>
      <input name="email" type="email" placeholder={t('host.form.email')} aria-label={t('host.form.email')} autoComplete="email" className={inputClass} />
      <textarea
        name="needs"
        required
        rows={3}
        maxLength={500}
        placeholder={`${t('host.form.needs_placeholder')} *`}
        aria-label={t('host.form.needs')}
        className={`${inputClass} resize-none`}
      ></textarea>

      <div style={{ position: 'absolute', left: '-9999px', opacity: 0 }} aria-hidden="true">
        <input type="text" name="company_alt" tabIndex={-1} autoComplete="off" readOnly />
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200/60 rounded-lg px-3 py-2">{error}</p>}

      <button
        type="submit"
        disabled={estado === 'sending'}
        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-500 text-background-50 rounded-full text-sm font-semibold hover:bg-primary-600 disabled:opacity-60 transition-colors"
      >
        {estado === 'sending' ? t('host.form.sending') : t('host.form.submit')}
      </button>
      <p className="text-[11px] text-foreground-400 leading-relaxed text-center">
        {t('host.form.privacy_pre')}{' '}
        <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground-600">
          {t('host.form.privacy_link')}
        </a>
        .
      </p>
    </form>
  );
}

/* ── Main page ── */
export default function Hosteleria() {
  const { t } = useTranslation();
  const { session, loading, error, login, logout } = useHosteleriaAuth();
  const [pestana, setPestana] = useState<Pestana>('entrar');

  // Con sesión activa, cada negocio ve directamente su perfil y sus productos.
  if (session) {
    // El catálogo ya incluye su propia barra de navegación y pie (es el de la tienda).
    return <CatalogoHosteleriaView token={session.token} nombreNegocio={session.nombreNegocio} onLogout={logout} />;
  }

  // Sin sesión: solo entrar o pedir cuenta. Los precios de hostelería son
  // privados por negocio, así que aquí no se enseña ningún producto ni precio.
  return (
    <>
      <Navbar />
      <main id="main-content" className="relative min-h-[calc(100vh-64px)] flex items-center justify-center overflow-hidden px-4 py-24 md:py-28">
        <div className="absolute inset-0">
          <img
            src="https://ukhfaphloxlszomccgde.supabase.co/storage/v1/object/public/pescados-mariscos-arrantza/marketing/pro-hero-bg.jpg"
            alt=""
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70"></div>
        </div>

        <div className="relative z-10 w-full max-w-[460px] animate-fade-up-1">
          <div className="text-center mb-6 md:mb-8">
            <h1 className="font-heading text-3xl md:text-4xl font-semibold text-background-50 leading-[1.1] mb-3">
              {t('host.hero.title')}
            </h1>
            <p className="text-white/80 text-sm md:text-base leading-relaxed">{t('host.hero.subtitle')}</p>
          </div>

          <div className="bg-background-50 rounded-2xl shadow-2xl p-5 md:p-7">
            <div role="tablist" className="grid grid-cols-2 gap-1 p-1 bg-background-100 rounded-full mb-5">
              {(['entrar', 'solicitar'] as Pestana[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={pestana === p}
                  onClick={() => setPestana(p)}
                  className={`py-2 rounded-full text-sm font-semibold transition-colors ${
                    pestana === p ? 'bg-background-50 text-foreground-950 shadow-sm' : 'text-foreground-500 hover:text-foreground-800'
                  }`}
                >
                  {p === 'entrar' ? t('host.access.title') : t('host.access.request_cta')}
                </button>
              ))}
            </div>

            {pestana === 'entrar' ? <LoginForm onLogin={login} loading={loading} error={error} /> : <SolicitudForm />}
          </div>

          <a
            href="https://wa.me/34619609888"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => logConversion('whatsapp_click')}
            className="mt-5 flex items-center justify-center gap-1.5 text-sm text-white/80 hover:text-white"
          >
            <i className="ri-whatsapp-line text-base"></i>
            {t('host.access.request_whatsapp')}
          </a>
        </div>
      </main>
      <Footer />
    </>
  );
}
