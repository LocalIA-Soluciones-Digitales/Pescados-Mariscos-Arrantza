import { useState } from 'react';
import { useNewsletter } from '@/hooks/useNewsletter';

export default function NewsletterPanel() {
  const { subscribers, loading, remove } = useNewsletter();
  const [copied, setCopied] = useState(false);

  const copyEmails = async () => {
    await navigator.clipboard.writeText(subscribers.map((s) => s.email).join(', '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="px-4 md:px-8 py-6 pb-28">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-foreground-400">
          {subscribers.length} suscriptor{subscribers.length === 1 ? '' : 'es'} al newsletter
        </p>
        {subscribers.length > 0 && (
          <button
            type="button"
            onClick={copyEmails}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-background-100 text-foreground-600 hover:bg-background-200/70"
          >
            {copied ? 'Copiado' : 'Copiar todos los correos'}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-foreground-400">Cargando…</p>
      ) : subscribers.length === 0 ? (
        <p className="text-sm text-foreground-400">Todavía no hay suscriptores.</p>
      ) : (
        <div className="space-y-2">
          {subscribers.map((sub) => (
            <div key={sub.id} className="bg-background-50 border border-background-200/70 rounded-lg p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-foreground-950 truncate">{sub.email}</p>
                <p className="text-[10px] text-foreground-400 mt-0.5">
                  {sub.idioma.toUpperCase()} · {new Date(sub.created_at).toLocaleString('es-ES')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`¿Eliminar ${sub.email} de la lista?`)) remove(sub.id);
                }}
                className="px-2.5 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 flex-shrink-0"
              >
                <i className="ri-delete-bin-line"></i>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
