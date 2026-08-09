import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAdminAuth } from '@/hooks/useAdminAuth';

type Props = Pick<ReturnType<typeof useAdminAuth>, 'signIn' | 'error' | 'resetPassword'>;

export default function AdminLogin({ signIn, error, resetPassword }: Props) {
  const [mode, setMode] = useState<'login' | 'recover'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recoverSent, setRecoverSent] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await signIn(email, password);
    setSubmitting(false);
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await resetPassword(email);
    setSubmitting(false);
    // Mensaje siempre genérico, no confirma si el correo existe en el sistema.
    setRecoverSent(true);
  };

  const switchMode = (next: 'login' | 'recover') => {
    setMode(next);
    setRecoverSent(false);
    setPassword('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-100 px-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label="Volver"
        className="fixed top-6 left-6 w-10 h-10 flex items-center justify-center rounded-full bg-background-50 border border-background-200/70 text-foreground-500 shadow-sm hover:text-foreground-950 hover:border-foreground-300/60 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      {mode === 'login' ? (
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-[360px] bg-background-50 border border-background-200/70 rounded-lg p-8 shadow-sm"
        >
          <h1 className="text-lg font-heading font-semibold text-foreground-950 mb-1 text-center">
            Panel de gestión
          </h1>
          <p className="text-sm text-foreground-400 mb-6 text-center">
            Pescados y Mariscos Arrantza
          </p>

          <label htmlFor="admin-email" className="block text-xs font-medium text-foreground-500 mb-2">
            Correo
          </label>
          <input
            id="admin-email"
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mb-4 px-4 py-3 bg-background-100 border border-background-200/70 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40 transition-all"
          />

          <label htmlFor="admin-password" className="block text-xs font-medium text-foreground-500 mb-2">
            Contraseña
          </label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 bg-background-100 border border-background-200/70 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40 transition-all"
          />

          <div className="mt-2 text-right">
            <button
              type="button"
              onClick={() => switchMode('recover')}
              className="text-xs text-foreground-400 hover:text-foreground-700 transition-colors"
            >
              ¿Has olvidado tu contraseña?
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-600 mt-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="w-full mt-5 px-4 py-3 bg-primary-500 text-background-50 rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      ) : (
        <form
          onSubmit={handleRecover}
          className="w-full max-w-[360px] bg-background-50 border border-background-200/70 rounded-lg p-8 shadow-sm"
        >
          <h1 className="text-lg font-heading font-semibold text-foreground-950 mb-1 text-center">
            Recuperar contraseña
          </h1>
          <p className="text-sm text-foreground-400 mb-6 text-center">
            Te enviaremos un enlace para crear una nueva contraseña
          </p>

          {recoverSent ? (
            <p className="text-sm text-foreground-600 text-center py-2">
              Si el correo está registrado, recibirás un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.
            </p>
          ) : (
            <>
              <label htmlFor="recover-email" className="block text-xs font-medium text-foreground-500 mb-2">
                Correo
              </label>
              <input
                id="recover-email"
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-background-100 border border-background-200/70 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40 transition-all"
              />

              <button
                type="submit"
                disabled={submitting || !email}
                className="w-full mt-5 px-4 py-3 bg-primary-500 text-background-50 rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? 'Enviando…' : 'Enviar enlace'}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => switchMode('login')}
            className="w-full mt-4 text-xs text-foreground-400 hover:text-foreground-700 transition-colors text-center"
          >
            Volver al inicio de sesión
          </button>
        </form>
      )}
    </div>
  );
}
