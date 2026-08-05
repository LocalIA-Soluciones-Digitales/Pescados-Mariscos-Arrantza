import { useErrorLogs } from '@/hooks/useErrorLogs';

const SOURCE_LABELS: Record<string, string> = {
  window_error: 'Error de script',
  unhandled_rejection: 'Promesa sin capturar',
  react_boundary: 'Error de React',
  api: 'API',
};

export default function ErrorLogsPanel() {
  const { errors, loading, clearAll } = useErrorLogs();

  return (
    <div className="px-4 md:px-8 py-6 pb-28">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-foreground-400">{errors.length} error{errors.length === 1 ? '' : 'es'} registrados (últimos 200)</p>
        {errors.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirm('¿Borrar todo el registro de errores?')) clearAll();
            }}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100"
          >
            Vaciar registro
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-foreground-400">Cargando…</p>
      ) : errors.length === 0 ? (
        <p className="text-sm text-foreground-400">Sin errores registrados. Buena señal.</p>
      ) : (
        <div className="space-y-2">
          {errors.map((err) => (
            <div key={err.id} className="bg-background-50 border border-background-200/70 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-background-200/70 text-foreground-500">
                  {SOURCE_LABELS[err.source] ?? err.source}
                </span>
                <span className="text-[10px] text-foreground-400">{new Date(err.created_at).toLocaleString('es-ES')}</span>
              </div>
              <p className="text-sm text-foreground-950 break-words">{err.message}</p>
              {err.url && <p className="text-xs text-foreground-400 mt-1 break-all">{err.url}</p>}
              {err.stack && (
                <details className="mt-1">
                  <summary className="text-xs text-foreground-400 cursor-pointer">Stack trace</summary>
                  <pre className="text-[10px] text-foreground-500 whitespace-pre-wrap break-all mt-1">{err.stack}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
