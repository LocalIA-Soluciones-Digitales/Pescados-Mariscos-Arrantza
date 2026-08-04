import { useState } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';

export default function AdminLogin({ signIn, error }: Pick<ReturnType<typeof useAdminAuth>, 'signIn' | 'error'>) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await signIn(email, password);
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-100 px-4">
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
    </div>
  );
}
