import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

export default function AdminResetPassword() {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });

    // El enlace del correo ya puede haber generado la sesión antes de montar este listener.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      setChecking(false);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError('No se pudo actualizar la contraseña');
      return;
    }
    setDone(true);
    setTimeout(() => navigate('/admin'), 1500);
  };

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-foreground-400">Cargando…</div>;
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-100 px-4">
        <div className="w-full max-w-[360px] bg-background-50 border border-background-200/70 rounded-lg p-8 shadow-sm text-center">
          <p className="text-sm text-foreground-600">
            Este enlace no es válido o ha caducado. Solicita uno nuevo desde el panel de acceso.
          </p>
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="mt-5 text-xs text-foreground-400 hover:text-foreground-700 transition-colors"
          >
            Volver al panel de acceso
          </button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-foreground-500">
        Contraseña actualizada. Redirigiendo…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-100 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[360px] bg-background-50 border border-background-200/70 rounded-lg p-8 shadow-sm"
      >
        <h1 className="text-lg font-heading font-semibold text-foreground-950 mb-1 text-center">
          Nueva contraseña
        </h1>
        <p className="text-sm text-foreground-400 mb-6 text-center">
          Pescados y Mariscos Arrantza
        </p>

        <label htmlFor="new-password" className="block text-xs font-medium text-foreground-500 mb-2">
          Nueva contraseña
        </label>
        <input
          id="new-password"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 px-4 py-3 bg-background-100 border border-background-200/70 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40 transition-all"
        />

        <label htmlFor="confirm-password" className="block text-xs font-medium text-foreground-500 mb-2">
          Repite la contraseña
        </label>
        <input
          id="confirm-password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-4 py-3 bg-background-100 border border-background-200/70 rounded-lg text-sm text-foreground-950 focus:outline-none focus:border-foreground-300/60 focus:ring-1 focus:ring-foreground-200/40 transition-all"
        />

        {error && (
          <p className="text-xs text-red-600 mt-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !password || !confirm}
          className="w-full mt-5 px-4 py-3 bg-primary-500 text-background-50 rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {submitting ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </div>
  );
}
