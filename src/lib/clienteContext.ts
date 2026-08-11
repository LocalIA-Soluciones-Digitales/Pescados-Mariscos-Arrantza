import { supabase, SITE_KEY } from './supabaseClient';

let cachedClienteId: string | null = null;

// Este panel de admin está desplegado como parte de la web de un único
// negocio (identificado por SITE_KEY), así que todo lo que se cree desde
// aquí (productos, etc.) pertenece siempre a ese mismo cliente.
export async function getMiClienteId(): Promise<string> {
  if (cachedClienteId) return cachedClienteId;
  const { data, error } = await supabase.rpc('cliente_id_from_site_key', { p_site_key: SITE_KEY });
  if (error || !data) throw new Error('No se pudo determinar el cliente de este sitio');
  cachedClienteId = data as string;
  return cachedClienteId;
}
