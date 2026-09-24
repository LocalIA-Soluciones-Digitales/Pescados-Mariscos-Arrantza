import { useCallback, useEffect, useState } from 'react';
import { supabase, SITE_KEY } from '@/lib/supabaseClient';

const TOKEN_KEY = 'arrantza_hosteleria_token';
const NOMBRE_KEY = 'arrantza_hosteleria_nombre';

function readStoredSession(): { token: string; nombreNegocio: string } | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const nombreNegocio = localStorage.getItem(NOMBRE_KEY);
    if (token && nombreNegocio) return { token, nombreNegocio };
  } catch {
    // localStorage no disponible (privado/bloqueado) — se queda sin sesión persistida
  }
  return null;
}

// Sesión de un cliente de hostelería (restaurante/bar): no usa Supabase Auth,
// solo un token de corta vida guardado en localStorage tras validar
// código+PIN en hosteleria_login. Si el token es inválido/ha caducado, el
// catálogo (useCatalogoHosteleria) avisa vía onSessionInvalid y aquí se
// limpia la sesión guardada.
export function useHosteleriaAuth() {
  const [session, setSession] = useState<{ token: string; nombreNegocio: string } | null>(() => readStoredSession());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (codigo: string, pin: string) => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase
      .rpc('hosteleria_login', { p_site_key: SITE_KEY, p_codigo: codigo, p_pin: pin })
      .single();

    setLoading(false);
    if (rpcError || !data) {
      setError('Código o PIN incorrectos.');
      return false;
    }

    const { token, nombre_negocio } = data as { token: string; nombre_negocio: string };
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(NOMBRE_KEY, nombre_negocio);
    } catch {
      // seguimos igualmente: la sesión vivirá solo en memoria hasta recargar
    }
    setSession({ token, nombreNegocio: nombre_negocio });
    return true;
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(NOMBRE_KEY);
    } catch {
      // nada que hacer si localStorage no está disponible
    }
    setSession(null);
  }, []);

  // Si el catálogo detecta que el token ya no es válido (caducado o PIN
  // cambiado desde el panel), se limpia la sesión para volver a pedir login.
  useEffect(() => {
    if (!session) setError(null);
  }, [session]);

  return { session, loading, error, login, logout, clearError: () => setError(null) };
}
