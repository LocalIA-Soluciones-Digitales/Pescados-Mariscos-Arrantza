import { supabase, SITE_KEY } from './supabaseClient';

export type ErrorSource = 'window_error' | 'unhandled_rejection' | 'react_boundary' | 'api';

export interface ErrorLogEntry {
  id: string;
  message: string;
  stack: string | null;
  source: ErrorSource;
  url: string | null;
  user_agent: string | null;
  created_at: string;
}

export async function logError(message: string, source: ErrorSource, stack?: string | null) {
  try {
    await supabase.rpc('crear_error_log', {
      p_site_key: SITE_KEY,
      p_message: message.slice(0, 2000),
      p_stack: stack ? stack.slice(0, 4000) : null,
      p_source: source,
      p_url: window.location.href,
      p_user_agent: navigator.userAgent,
    });
  } catch {
    // Si ni el log de errores funciona, no hay nada más que hacer aquí.
  }
}

let installed = false;

export function installGlobalErrorLogging() {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    logError(event.message, 'window_error', event.error?.stack);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logError(message, 'unhandled_rejection', stack);
  });
}
