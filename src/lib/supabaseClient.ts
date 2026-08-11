import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Identifica a este negocio frente a las funciones públicas multi-cliente
// (get_productos_publico, crear_pedido...). Cada web de cliente tiene la suya.
export const SITE_KEY = import.meta.env.VITE_SITE_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
