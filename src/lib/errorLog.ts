import { supabase } from './supabaseClient';

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
    await supabase.from('error_logs').insert({
      message: message.slice(0, 2000),
      stack: stack ? stack.slice(0, 4000) : null,
      source,
      url: window.location.href,
      user_agent: navigator.userAgent,
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
