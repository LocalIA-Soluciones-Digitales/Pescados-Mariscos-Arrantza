// Escaneo del catálogo de una báscula BM5 (tabla ETWS /year/artigos) para
// mantener los precios de la web al día y avisar de cambios. (El nombre
// "diario" es histórico: ahora corre cada hora.)
//
//   POST /bascula-precios-diario   { "origen": "pescaderia_1" }
//   Opcional: "simular": true  — calcula y devuelve los cambios sin escribir nada
//             "vigilar": true  — solo registra: ver más abajo
//   Header: x-webhook-secret: <BASCULA_SYNC_SECRET>
//     o bien la sesión de un desarrollador (Authorization: Bearer <jwt>):
//     es el botón de actualizar del panel de desarrollo (Básculas), que
//     lanza al momento la misma lectura que el cron.
//
// Lo dispara un cron cada hora por báscula (ver supabase/schema.sql). Si la
// báscula está apagada o da 502 (pasa a menudo, ver bascula-sync), no pasa
// nada: se apunta el intento para el panel de desarrollo y se sale con 200.
// Si a las 13:30 aún no se ha podido leer ese día, avisa por push una sola
// vez (solo la báscula que alimenta la web, no la vigilada).
//
// Cada ejecución:
//   1. Lee todos los artículos de la báscula.
//   2. Los compara con la foto anterior (public.bascula_catalogo) y apunta
//      cada diferencia en public.bascula_catalogo_cambios: artículo nuevo,
//      eliminado, renombrado, o cambio de precio, familia o unidades.
//   3. Copia el precio y el nombre a la web: productos con código mapeado en
//      productos_codigos_bascula para ese origen, y artículos de hostelería
//      importados de esa báscula y familia, y artículos de campañas de
//      reserva (Navidad…) enlazadas a esa báscula y familia. El nombre web
//      es el de la báscula, solo más legible (nombreArticulo/nombreTienda).
//      La categoría web sigue a la familia (1 Pescado, 2 Pescado de carta,
//      3 Marisco, 4 Congelado, 5 Varios); si un artículo pasa a otra familia
//      (Navidad, hostelería) o desaparece de la báscula, se oculta de la tienda.
//      Y al revés: un artículo que entra en una familia de la tienda (alta
//      nueva o cambio de familia) sin producto web enlazado aparece en la
//      tienda. Si hay un producto con el mismo nombre sin código vivo (el del
//      código que se acaba de borrar, o uno antiguo oculto) se reutiliza con
//      su foto; si no, se crea sin foto. En los dos casos se enlaza el código
//      en las dos básculas (la 2 es copia de la 1).
//      Las tarifas de hostelería y las campañas de reserva enlazadas a una
//      familia se mantienen como lista cerrada: el artículo que entra en la
//      familia se da de alta (sin foto) y el que sale o se borra se oculta.
//   4. Guarda la foto nueva y manda un push a los desarrolladores con el resumen.
//
// La primera ejecución solo guarda la foto de partida (no hay con qué
// comparar) y actualiza precios, sin avisar de "nuevos".
//
// Modo "vigilar" (báscula 2): la web solo sigue los precios de la báscula 1,
// pero se vigila la 2 para saber si alguien la cambia. Hace los pasos 1, 2 y
// la foto del 4 sin tocar la web. En las dos básculas los avisos push van
// solo a los desarrolladores (public.enviar_push_desarrollador), y los
// cambios se ven en el panel de desarrollo.
//
// Reutiliza los secretos de bascula-sync (credenciales ETWS por origen,
// BASCULA_CLIENTE_ID y BASCULA_SYNC_SECRET). El push sale por
// public.enviar_push_desarrollador (solo dispositivos de desarrolladores).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ETPROXY_BASE = 'https://etproxy.etpos.pt';
const LOTE_MAX = 100;
const MAX_PAGINAS = 50;
const ORIGENES_VALIDOS = ['pescaderia_1', 'pescaderia_2'];
const NOMBRE_ORIGEN: Record<string, string> = { pescaderia_1: 'báscula 1', pescaderia_2: 'báscula 2' };
const HORA_AVISO_FALLO_MIN = 13 * 60 + 30; // 13:30 Madrid
// Si la báscula devuelve menos de la mitad de artículos que la foto
// anterior, se da la lectura por incompleta en vez de marcar la otra mitad
// como eliminada.
const MIN_PROPORCION_LECTURA = 0.5;
// Cada familia de la tienda (1-5 de la báscula) es una categoría de la web.
// Las demás (6 Navidad, 7-9 hostelería…) no se muestran en la tienda.
const CATEGORIA_POR_FAMILIA: Record<string, string> = {
  '1': 'pescado', '2': 'especial', '3': 'marisco', '4': 'congelados', '5': 'preparados',
};
// Artículos de caja que no son producto (BOLSA 501, VARIOS UD 10% 505): no se
// dan de alta solos en la tienda aunque estén en una familia de la tienda.
const NO_ES_PRODUCTO = /^(BOLSA|VARIOS)\b/i;

function safeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function firmarPeticion(privateKeyHex: string, method: string, path: string, query: string, body: string): Promise<string> {
  const keyBytes = hexToBytes(privateKeyHex);
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const input = method + path + query + body;
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

type CfgETWS = { proxyId: string; publicKey: string; privateKey: string };

function leerCfgOrigen(origen: string): CfgETWS {
  const prefijo = `BASCULA_${origen.toUpperCase()}_`;
  return {
    proxyId: Deno.env.get(`${prefijo}PROXY_ID`) ?? '',
    publicKey: Deno.env.get(`${prefijo}PUBLIC_KEY`) ?? '',
    privateKey: Deno.env.get(`${prefijo}PRIVATE_KEY`) ?? '',
  };
}

async function obtenerPuertoActual(proxyId: string): Promise<number> {
  const res = await fetch(`${ETPROXY_BASE}/api/proxy/${proxyId}`);
  if (!res.ok) throw new Error(`No se pudo consultar el puerto del proxy (HTTP ${res.status})`);
  const data = await res.json();
  return data.data.port as number;
}

async function llamarETWS(cfg: CfgETWS, puerto: number, path: string, query: string): Promise<Response> {
  const authHeader = `ET5-HMAC-SHA1 ${cfg.publicKey}:${await firmarPeticion(cfg.privateKey, 'GET', path, query, '')}`;
  return fetch(`${ETPROXY_BASE}/${cfg.proxyId}/${puerto}${path}${query}`, { headers: { Authorization: authHeader } });
}

async function llamarETWSConReintento(cfg: CfgETWS, puertoInicial: number, path: string, query: string): Promise<{ res: Response; puerto: number }> {
  let puerto = puertoInicial;
  let res = await llamarETWS(cfg, puerto, path, query);
  if (res.status === 403 || res.status === 502) {
    puerto = await obtenerPuertoActual(cfg.proxyId);
    res = await llamarETWS(cfg, puerto, path, query);
  }
  return { res, puerto };
}

interface Articulo {
  codigo: string;
  nombre: string;
  familia: string;
  precio: number;
  unidades: string;
  iva: number;
}

// Mismo recorrido que bascula-catalogo: páginas de 100 con "seek" por
// código y SIN "filter" (con "filter" ETWS busca por igualdad exacta y la
// paginación se corta en la primera página, ver bascula-catalogo).
async function leerArticulos(cfg: CfgETWS): Promise<Articulo[]> {
  let puerto = await obtenerPuertoActual(cfg.proxyId);
  const vistos = new Set<string>();
  const articulos: Articulo[] = [];
  let seek: string | null = null;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const query = seek !== null
      ? `?seek=${encodeURIComponent(JSON.stringify({ codigo: seek }))}&limit=${LOTE_MAX}`
      : `?limit=${LOTE_MAX}`;
    const { res, puerto: puertoUsado } = await llamarETWSConReintento(cfg, puerto, '/year/artigos', query);
    puerto = puertoUsado;
    if (!res.ok) throw new Error(`Error consultando /year/artigos (HTTP ${res.status})`);
    const filas = (await res.json()) as Record<string, unknown>[];

    let nuevas = 0;
    for (const fila of filas) {
      const codigo = String(fila.codigo ?? '').trim();
      if (!codigo || vistos.has(codigo)) continue;
      vistos.add(codigo);
      nuevas++;
      if (fila.desactivo === true) continue; // desactivado = fuera del catálogo
      articulos.push({
        codigo,
        nombre: String(fila.designacao ?? '').replace(/\s+/g, ' ').trim(),
        familia: String(fila.familia ?? '').trim(),
        precio: Math.round(Number(fila.preco1 ?? 0) * 100) / 100,
        unidades: String(fila.unidades ?? '').trim(),
        iva: Number(fila.iva ?? 0),
      });
    }

    if (filas.length < LOTE_MAX || nuevas === 0) break;
    seek = String(filas[filas.length - 1].codigo ?? '');
  }
  return articulos;
}

// "Merluza  (luarca)" y "MERLUZA (LUARCA)" son el mismo producto: solo se
// considera renombrado si cambia algo más que mayúsculas, tildes o espacios.
function claveNombre(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function formatoPrecioWeb(a: Articulo): string {
  return `${a.precio.toFixed(2).replace('.', ',')}€/${a.unidades === 'un' ? 'ud' : 'kg'}`;
}

function horaMadrid(): { fecha: string; minutos: number } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, minutos: Number(partes.hour) * 60 + Number(partes.minute) };
}

type TipoCambio = 'nuevo' | 'eliminado' | 'renombrado' | 'precio' | 'familia' | 'unidades';
interface Cambio {
  codigo: string;
  tipo: TipoCambio;
  antes: Articulo | null;
  despues: Articulo | null;
}

function compararCatalogos(anterior: Map<string, Articulo>, actual: Map<string, Articulo>): Cambio[] {
  const cambios: Cambio[] = [];
  for (const [codigo, a] of actual) {
    const prev = anterior.get(codigo);
    if (!prev) {
      cambios.push({ codigo, tipo: 'nuevo', antes: null, despues: a });
      continue;
    }
    if (claveNombre(prev.nombre) !== claveNombre(a.nombre)) {
      cambios.push({ codigo, tipo: 'renombrado', antes: prev, despues: a });
    }
    if (prev.familia !== a.familia) cambios.push({ codigo, tipo: 'familia', antes: prev, despues: a });
    if (Math.abs(prev.precio - a.precio) > 0.001) cambios.push({ codigo, tipo: 'precio', antes: prev, despues: a });
    if (prev.unidades !== a.unidades) cambios.push({ codigo, tipo: 'unidades', antes: prev, despues: a });
  }
  for (const [codigo, prev] of anterior) {
    if (!actual.has(codigo)) cambios.push({ codigo, tipo: 'eliminado', antes: prev, despues: null });
  }
  return cambios;
}

interface FilaLista {
  id: string;
  codigo_bascula: string | null;
  activo: boolean;
}

// Qué dar de alta, reactivar, ocultar o renombrar en una lista cerrada
// enlazada a una familia de la báscula (tarifa de hostelería, campaña de
// reservas). Solo se actúa sobre los códigos que han cambiado hoy en la
// báscula, para no pisar lo que el pescadero haya activado u ocultado a mano.
function cambiosLista(familia: string, filas: FilaLista[], actual: Map<string, Articulo>, cambios: Cambio[]) {
  const porCodigo = new Map(filas.filter((x) => x.codigo_bascula).map((x) => [x.codigo_bascula as string, x]));
  const altas: Articulo[] = [];
  const reactivar: string[] = [];
  const ocultar: string[] = [];
  const renombrar: { id: string; articulo: Articulo }[] = [];
  const tocados = new Set(cambios.filter((c) => c.tipo !== 'precio' && c.tipo !== 'unidades').map((c) => c.codigo));
  const renombrados = new Set(cambios.filter((c) => c.tipo === 'renombrado').map((c) => c.codigo));
  for (const codigo of tocados) {
    const a = actual.get(codigo);
    const fila = porCodigo.get(codigo);
    const enFamilia = !!a && a.familia === familia;
    if (enFamilia && !fila) altas.push(a!);
    else if (enFamilia && fila && !fila.activo) reactivar.push(fila.id);
    else if (!enFamilia && fila && fila.activo) ocultar.push(fila.id);
    if (enFamilia && fila && renombrados.has(codigo)) renombrar.push({ id: fila.id, articulo: a! });
  }
  return { altas, reactivar, ocultar, renombrar };
}

// La báscula escribe sin tildes: se las ponemos a las palabras habituales.
const TILDES: Record<string, string> = {
  salmon: 'salmón', mejillon: 'mejillón', camaron: 'camarón', txipiron: 'txipirón', atun: 'atún', gambon: 'gambón',
  patagonico: 'patagónico', rio: 'río', martin: 'martín', salazon: 'salazón', canada: 'canadá', pais: 'país',
  piscifactoria: 'piscifactoría', kiskillon: 'kiskillón', cantabrico: 'cantábrico',
};

// El nombre web es el de la báscula, solo más legible:
// "F. KABRATXO" → "Filete de kabratxo", "RABAS (1/2kgr)" → "Rabas (1/2 kg)",
// "LUBINA menu" → "Lubina (menú)". Sin añadir ni quitar palabras.
function nombreArticulo(nombre: string): string {
  const t = nombre.toLowerCase()
    .replace(/\bmenu\b/, '(menú)')
    .replace(/^f[.,]\s*/, 'filete de ')
    .replace(/(\d)\s*(?:grs?|gr\.)(?![a-z])/g, '$1 g')
    .replace(/(\d)\s*kgrs?(?![a-z])|(\d)\s*kg(?![a-z])/g, (_, a, b) => `${a ?? b} kg`)
    .replace(/(\d)\s*und?(?![a-z])/g, '$1 ud')
    .replace(/[a-zñ]+/g, (p) => TILDES[p] ?? p)
    .replace(/\s*\/\s*/g, (s) => (/\s/.test(s) ? ' / ' : '/'))
    .replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// La tienda usa mayúscula en cada palabra: "Lomo de Bakalao Desalado".
const MINUSCULAS = new Set(['de', 'del', 'la', 'el', 'a', 'al', 'en', 'y', 'con', 'sin', 'para', 'g', 'kg', 'ud']);
function nombreTienda(nombre: string): string {
  return nombreArticulo(nombre).split(' ')
    .map((p, i) => (i > 0 && MINUSCULAS.has(p.replace(/[()]/g, '')) ? p : p.replace(/^(\(?)(\p{L})/u, (_, a, b) => a + b.toUpperCase())))
    .join(' ');
}

const euros = (n: number) => `${n.toFixed(2).replace('.', ',')}€`;

// Texto corto para la notificación: primero lo que cambia de producto
// (movidos, renombrados, eliminados, nuevos) y al final el recuento de
// precios. Un producto que desaparece de un código y aparece con el mismo
// nombre en otro se cuenta como "movido", no como baja + alta.
function resumenAviso(cambios: Cambio[], preciosWeb: number, sinActualizar: string[], altasWeb: string[] = []): string {
  const eliminados = cambios.filter((c) => c.tipo === 'eliminado');
  const nuevos = cambios.filter((c) => c.tipo === 'nuevo');
  const movidos: string[] = [];
  const nuevosSinPareja = [...nuevos];
  const eliminadosSinPareja: Cambio[] = [];
  for (const e of eliminados) {
    const i = nuevosSinPareja.findIndex((n) => claveNombre(n.despues!.nombre) === claveNombre(e.antes!.nombre));
    if (i >= 0) {
      movidos.push(`${e.antes!.nombre} ${e.codigo}→${nuevosSinPareja[i].codigo}`);
      nuevosSinPareja.splice(i, 1);
    } else {
      eliminadosSinPareja.push(e);
    }
  }

  const partes: string[] = [];
  const lista = (titulo: string, items: string[]) => {
    if (items.length === 0) return;
    const visibles = items.slice(0, 3).join(', ');
    partes.push(`${titulo}: ${visibles}${items.length > 3 ? ` y ${items.length - 3} más` : ''}`);
  };
  lista('Movido', movidos);
  lista('Cambiado', cambios.filter((c) => c.tipo === 'renombrado').map((c) => `${c.codigo} ${c.antes!.nombre} → ${c.despues!.nombre}`));
  lista('Eliminado', eliminadosSinPareja.map((c) => `${c.codigo} ${c.antes!.nombre}`));
  lista('Nuevo', nuevosSinPareja.map((c) => `${c.codigo} ${c.despues!.nombre}`));
  lista('Familia', cambios.filter((c) => c.tipo === 'familia').map((c) => `${c.codigo} ${c.despues!.nombre} f${c.antes!.familia}→f${c.despues!.familia}`));

  const precios = cambios.filter((c) => c.tipo === 'precio');
  if (precios.length === 1) {
    const c = precios[0];
    partes.push(`Precio: ${c.despues!.nombre} ${euros(c.antes!.precio)} → ${euros(c.despues!.precio)}`);
  } else if (precios.length > 1) {
    partes.push(`${precios.length} precios cambiados`);
  }
  lista('En la tienda', altasWeb);
  if (preciosWeb > 0) partes.push(`${preciosWeb} actualizados en la web`);
  if (sinActualizar.length > 0) partes.push(`Revisar en la web (ya no está en la báscula): ${sinActualizar.slice(0, 3).join(', ')}${sinActualizar.length > 3 ? ` y ${sinActualizar.length - 3} más` : ''}`);

  const texto = partes.join(' · ');
  return texto.length > 300 ? `${texto.slice(0, 297)}…` : texto;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Llamada desde el panel: vale la sesión de un desarrollador, con el mismo
// criterio que las políticas RLS (public.is_developer()).
async function esDesarrollador(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const cliente = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await cliente.rpc('is_developer');
  return !error && data === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const res = await atender(req);
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
});

async function atender(req: Request): Promise<Response> {
  const secret = req.headers.get('x-webhook-secret') ?? '';
  const expected = Deno.env.get('BASCULA_SYNC_SECRET') ?? '';
  const porSecreto = !!secret && !!expected && safeEqual(secret, expected);
  if (!porSecreto && !(await esDesarrollador(req))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const origen = typeof body.origen === 'string' ? body.origen : '';
  if (!ORIGENES_VALIDOS.includes(origen)) {
    return new Response(`"origen" inválido o ausente. Valores válidos: ${ORIGENES_VALIDOS.join(', ')}`, { status: 400 });
  }
  const simular = body.simular === true;
  const vigilar = body.vigilar === true;

  const cfg = leerCfgOrigen(origen);
  const clienteId = Deno.env.get('BASCULA_CLIENTE_ID') ?? '';
  if (!cfg.proxyId || !cfg.publicKey || !cfg.privateKey || !clienteId) {
    return new Response(`Faltan secretos de configuración de la báscula para el origen "${origen}"`, { status: 500 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const claveOk = `bascula_catalogo_ok_${origen}`;
  const claveFallo = `bascula_catalogo_fallo_avisado_${origen}`;
  const claveVigilancia = `bascula_vigilancia_${origen}`;
  const { fecha, minutos } = horaMadrid();

  const leerSetting = async (key: string) => {
    const { data } = await supabase.from('settings').select('value').eq('cliente_id', clienteId).eq('key', key).maybeSingle();
    return data?.value as unknown;
  };
  const guardarSetting = (key: string, value: unknown) =>
    supabase.from('settings').upsert({ cliente_id: clienteId, key, value }, { onConflict: 'key,cliente_id' });
  // Los avisos de las básculas van solo a los desarrolladores, no al
  // pescadero; también se ven en el panel de desarrollo (Básculas).
  const avisar = async (titulo: string, cuerpo: string, tag: string) => {
    const { error } = await supabase.rpc('enviar_push_desarrollador', {
      p_cliente_id: clienteId, p_titulo: titulo, p_cuerpo: cuerpo, p_tag: tag,
    });
    if (error) console.error('bascula-precios-diario: fallo al avisar', error.message);
  };

  // Estado de la vigilancia para el panel de desarrollo. Una báscula
  // apagada no es un error: se apunta el intento y se sale con 200.
  const sinConexion = async (mensaje: string) => {
    const prev = ((await leerSetting(claveVigilancia)) ?? {}) as Record<string, unknown>;
    if (!simular) {
      await guardarSetting(claveVigilancia, { ...prev, ultimo_intento: new Date().toISOString(), conectada: false, mensaje });
    }
    return json({ omitido: 'báscula sin conexión', mensaje });
  };
  const guardarLecturaOk = async () => {
    const ahora = new Date().toISOString();
    await guardarSetting(claveVigilancia, { ultimo_intento: ahora, ultima_lectura: ahora, conectada: true, articulos: articulos.length });
    await guardarSetting(claveOk, fecha);
  };

  let articulos: Articulo[];
  try {
    articulos = await leerArticulos(cfg);
    if (articulos.length === 0) throw new Error('La báscula no devolvió ningún artículo');
  } catch (err) {
    const mensaje = (err as Error).message;
    if (!vigilar && !simular && minutos >= HORA_AVISO_FALLO_MIN && (await leerSetting(claveOk)) !== fecha && (await leerSetting(claveFallo)) !== fecha) {
      await avisar(
        `⚠️ No se pudo leer la ${NOMBRE_ORIGEN[origen]}`,
        `Hoy no se han podido revisar los precios de la web (${mensaje}). Se sigue intentando cada hora.`,
        `bascula-catalogo-fallo-${origen}-${fecha}`,
      );
      await guardarSetting(claveFallo, fecha);
    }
    return sinConexion(mensaje);
  }

  const { data: filasAnteriores, error: errAnterior } = await supabase
    .from('bascula_catalogo')
    .select('codigo, nombre, familia, precio, unidades, iva')
    .eq('cliente_id', clienteId)
    .eq('origen', origen);
  if (errAnterior) return json({ error: errAnterior.message }, 500);

  const anterior = new Map<string, Articulo>(
    (filasAnteriores ?? []).map((f) => [f.codigo as string, { ...(f as Articulo), precio: Number(f.precio), iva: Number(f.iva) }]),
  );
  const actual = new Map(articulos.map((a) => [a.codigo, a]));
  const primeraVez = anterior.size === 0;

  if (!primeraVez && actual.size < anterior.size * MIN_PROPORCION_LECTURA) {
    return sinConexion(`Lectura incompleta: ${actual.size} artículos frente a ${anterior.size} de la foto anterior`);
  }

  const cambios = primeraVez ? [] : compararCatalogos(anterior, actual);
  const codigosRenombrados = new Set(cambios.filter((c) => c.tipo === 'renombrado').map((c) => c.codigo));
  const codigosEliminados = new Set(cambios.filter((c) => c.tipo === 'eliminado').map((c) => c.codigo));
  const codigosCambioFamilia = new Set(cambios.filter((c) => c.tipo === 'familia').map((c) => c.codigo));

  // Registra los cambios y sustituye la foto por la lectura de ahora.
  const guardarFoto = async (): Promise<string | null> => {
    if (cambios.length > 0) {
      const { error } = await supabase.from('bascula_catalogo_cambios').insert(
        cambios.map((c) => ({ cliente_id: clienteId, origen, codigo: c.codigo, tipo: c.tipo, antes: c.antes, despues: c.despues })),
      );
      if (error) return error.message;
    }
    const { error: errFoto } = await supabase
      .from('bascula_catalogo')
      .upsert(articulos.map((a) => ({ cliente_id: clienteId, origen, ...a })), { onConflict: 'cliente_id,origen,codigo' });
    if (errFoto) return errFoto.message;
    if (codigosEliminados.size > 0) {
      await supabase.from('bascula_catalogo').delete().eq('cliente_id', clienteId).eq('origen', origen).in('codigo', [...codigosEliminados]);
    }
    return null;
  };

  if (vigilar) {
    const resultado = { origen, primeraVez, simulado: simular, articulos: actual.size, cambios };
    if (simular) return json(resultado);
    const error = await guardarFoto();
    if (error) return json({ error }, 500);
    await guardarLecturaOk();
    if (cambios.length > 0) {
      await avisar(`⚖️ Cambios en la ${NOMBRE_ORIGEN[origen]}`, resumenAviso(cambios, 0, []), `bascula-vigilancia-${origen}-${Date.now()}`);
    }
    return json(resultado);
  }

  // Precios de la tienda online: productos con código de esta báscula.
  const { data: mapeos, error: errMapeos } = await supabase
    .from('productos_codigos_bascula')
    .select('codigo_bascula, productos (id, nombre_es, precio, categoria, visible_web)')
    .eq('cliente_id', clienteId)
    .eq('origen', origen);
  if (errMapeos) return json({ error: errMapeos.message }, 500);

  // Altas en la tienda: artículos que hoy entran en una familia de la tienda
  // (nuevos o con cambio de familia) y cuyo código no tiene producto web.
  const codigoPorProducto = new Map<string, string>();
  for (const m of mapeos ?? []) {
    const p = m.productos as unknown as { id: string } | null;
    if (p) codigoPorProducto.set(p.id, m.codigo_bascula as string);
  }
  const codigosConProducto = new Set(codigoPorProducto.values());
  const candidatosAlta = [...new Set(cambios.filter((c) => c.tipo === 'nuevo' || c.tipo === 'familia').map((c) => c.codigo))]
    .map((codigo) => actual.get(codigo))
    .filter((a): a is Articulo => !!a && !!CATEGORIA_POR_FAMILIA[a.familia] && !codigosConProducto.has(a.codigo)
      && a.precio > 0 && !NO_ES_PRODUCTO.test(a.nombre));

  const altasProductos: { articulo: Articulo; reutilizar: { id: string; nombre: string } | null }[] = [];
  const reutilizados = new Set<string>();
  if (candidatosAlta.length > 0) {
    const { data: todos, error: errTodos } = await supabase.from('productos').select('id, nombre_es').eq('cliente_id', clienteId);
    if (errTodos) return json({ error: errTodos.message }, 500);
    for (const a of candidatosAlta) {
      // Mismo nombre y sin código vivo en esta báscula: es el mismo producto
      // que se ha movido de código o que vuelve a venderse.
      const libre = (todos ?? []).find((p) => {
        const codigo = codigoPorProducto.get(p.id as string);
        return !reutilizados.has(p.id as string) && claveNombre(p.nombre_es as string) === claveNombre(a.nombre) && (!codigo || !actual.has(codigo));
      });
      if (libre) reutilizados.add(libre.id as string);
      altasProductos.push({ articulo: a, reutilizar: libre ? { id: libre.id as string, nombre: libre.nombre_es as string } : null });
    }
  }

  const preciosProductos: { id: string; nombre: string; antes: string; despues: string }[] = [];
  const sinActualizar: string[] = [];
  const nombresProductos: { id: string; antes: string; despues: string }[] = [];
  const categoriasProductos: { id: string; nombre: string; categoria: string | null; visible_web: boolean }[] = [];
  for (const m of mapeos ?? []) {
    const p = m.productos as unknown as { id: string; nombre_es: string; precio: string; categoria: string; visible_web: boolean } | null;
    const a = actual.get(m.codigo_bascula as string);
    if (!p || reutilizados.has(p.id)) continue; // el reutilizado se trata en las altas
    // Solo se avisa el día en que el código desaparece; los días siguientes
    // el producto web se queda como está.
    if (!a) {
      if (codigosEliminados.has(m.codigo_bascula as string)) sinActualizar.push(p.nombre_es);
      // Si el artículo ya no está en la báscula, deja de venderse en la
      // tienda (se oculta, no se borra: conserva foto e historial por si
      // vuelve a darse de alta).
      if (codigosEliminados.has(m.codigo_bascula as string) && p.visible_web) {
        categoriasProductos.push({ id: p.id, nombre: p.nombre_es, categoria: null, visible_web: false });
      }
      continue;
    }
    // El nombre de la web sigue al de la báscula, igual que el precio.
    if (codigosRenombrados.has(a.codigo)) {
      const despues = nombreTienda(a.nombre);
      if (despues !== p.nombre_es) nombresProductos.push({ id: p.id, antes: p.nombre_es, despues });
    }
    const nuevo = formatoPrecioWeb(a);
    if (p.precio !== nuevo) preciosProductos.push({ id: p.id, nombre: p.nombre_es, antes: p.precio, despues: nuevo });

    // La categoría sigue a la familia. Solo el día que el artículo cambia de
    // familia se toca la visibilidad, para no pisar un producto que el
    // pescadero haya ocultado a mano desde el panel.
    const categoria = CATEGORIA_POR_FAMILIA[a.familia] ?? null;
    const cambiaFamilia = codigosCambioFamilia.has(a.codigo);
    const visible = cambiaFamilia ? categoria !== null : p.visible_web;
    if ((categoria && categoria !== p.categoria) || visible !== p.visible_web) {
      categoriasProductos.push({ id: p.id, nombre: p.nombre_es, categoria, visible_web: visible });
    }
  }

  // Precios de hostelería: artículos importados de esta báscula, solo si
  // el código sigue en la misma familia de la que se importó la tarifa.
  const { data: listas, error: errListas } = await supabase
    .from('hosteleria_listas_precio')
    .select('id, bascula_familia, hosteleria_articulos (id, codigo_bascula, nombre, precio, unidad, activo)')
    .eq('cliente_id', clienteId)
    .eq('bascula_origen', origen);
  if (errListas) return json({ error: errListas.message }, 500);

  const preciosHosteleria: { id: string; nombre: string; antes: number; despues: number; unidad: 'kg' | 'un' }[] = [];
  for (const l of listas ?? []) {
    for (const h of (l.hosteleria_articulos ?? []) as { id: string; codigo_bascula: string | null; nombre: string; precio: number; unidad: string }[]) {
      const a = h.codigo_bascula ? actual.get(h.codigo_bascula) : undefined;
      if (!a || a.familia !== l.bascula_familia || codigosRenombrados.has(a.codigo)) continue;
      const unidad = a.unidades === 'un' ? 'un' : 'kg';
      if (Math.abs(Number(h.precio) - a.precio) > 0.001 || h.unidad !== unidad) {
        preciosHosteleria.push({ id: h.id, nombre: h.nombre, antes: Number(h.precio), despues: a.precio, unidad });
      }
    }
  }
  const listasHosteleria = (listas ?? []).map((l) => ({
    id: l.id as string,
    ...cambiosLista(l.bascula_familia as string, (l.hosteleria_articulos ?? []) as FilaLista[], actual, cambios),
  }));

  // Precios de campañas de reserva (Navidad…): artículos de reservas_articulos
  // de las campañas enlazadas a esta báscula, mismo criterio que hostelería.
  const { data: campanas, error: errCampanas } = await supabase
    .from('reservas_eventos')
    .select('id, cliente_id, bascula_familia, reservas_articulos (id, codigo_bascula, nombre_es, precio, unidad, activo)')
    .eq('cliente_id', clienteId)
    .eq('bascula_origen', origen);
  if (errCampanas) return json({ error: errCampanas.message }, 500);

  const preciosReservas: { id: string; nombre: string; antes: number; despues: number; unidad: 'kg' | 'un' }[] = [];
  for (const e of campanas ?? []) {
    for (const r of (e.reservas_articulos ?? []) as { id: string; codigo_bascula: string | null; nombre_es: string; precio: number; unidad: string }[]) {
      const a = r.codigo_bascula ? actual.get(r.codigo_bascula) : undefined;
      if (!a || a.familia !== e.bascula_familia || codigosRenombrados.has(a.codigo)) continue;
      const unidad = a.unidades === 'un' ? 'un' : 'kg';
      if (Math.abs(Number(r.precio) - a.precio) > 0.001 || r.unidad !== unidad) {
        preciosReservas.push({ id: r.id, nombre: r.nombre_es, antes: Number(r.precio), despues: a.precio, unidad });
      }
    }
  }
  const listasReservas = (campanas ?? []).map((e) => ({
    id: e.id as string,
    cliente_id: e.cliente_id as string,
    ...cambiosLista(e.bascula_familia as string, (e.reservas_articulos ?? []) as FilaLista[], actual, cambios),
  }));

  const resultado = {
    origen, fecha, primeraVez, simulado: simular,
    articulos: actual.size,
    cambios: cambios.map((c) => ({ codigo: c.codigo, tipo: c.tipo, antes: c.antes, despues: c.despues })),
    preciosProductos, nombresProductos, categoriasProductos, preciosHosteleria, preciosReservas, sinActualizar,
    altasProductos: altasProductos.map((x) => ({ codigo: x.articulo.codigo, nombre: x.articulo.nombre, reutiliza: x.reutilizar?.nombre ?? null })),
    listasHosteleria: listasHosteleria.map((l) => ({ id: l.id, altas: l.altas.map((a) => a.codigo), reactivar: l.reactivar.length, ocultar: l.ocultar.length, renombrar: l.renombrar.length })),
    listasReservas: listasReservas.map((l) => ({ id: l.id, altas: l.altas.map((a) => a.codigo), reactivar: l.reactivar.length, ocultar: l.ocultar.length, renombrar: l.renombrar.length })),
  };
  if (simular) return json(resultado);

  for (const n of nombresProductos) {
    const { error } = await supabase.from('productos').update({ nombre_es: n.despues, nombre_eu: null }).eq('id', n.id);
    if (error) return json({ error: `Renombrando ${n.antes}: ${error.message}` }, 500);
  }
  for (const p of preciosProductos) {
    const { error } = await supabase.from('productos').update({ precio: p.despues }).eq('id', p.id);
    if (error) return json({ error: `Actualizando ${p.nombre}: ${error.message}` }, 500);
  }
  for (const c of categoriasProductos) {
    const datos = c.categoria ? { categoria: c.categoria, subcategoria: null, visible_web: c.visible_web } : { visible_web: c.visible_web };
    const { error } = await supabase.from('productos').update(datos).eq('id', c.id);
    if (error) return json({ error: `Actualizando la categoría de ${c.nombre}: ${error.message}` }, 500);
  }
  const altasWeb: string[] = [];
  for (const x of altasProductos) {
    const a = x.articulo;
    const datos = {
      precio: formatoPrecioWeb(a), categoria: CATEGORIA_POR_FAMILIA[a.familia], orden: Number(a.codigo) || 0, visible_web: true, disponible: true,
    };
    let id = x.reutilizar?.id;
    if (id) {
      const { error } = await supabase.from('productos').update(datos).eq('id', id);
      if (error) return json({ error: `Alta en la tienda de ${x.reutilizar!.nombre}: ${error.message}` }, 500);
      altasWeb.push(`${a.codigo} ${x.reutilizar!.nombre}`);
    } else {
      const { data, error } = await supabase.from('productos')
        .insert({ cliente_id: clienteId, nombre_es: nombreTienda(a.nombre), ...datos }).select('id').single();
      if (error) return json({ error: `Alta en la tienda de ${a.nombre}: ${error.message}` }, 500);
      id = data.id as string;
      altasWeb.push(`${a.codigo} ${nombreTienda(a.nombre)} (sin foto)`);
    }
    // Enlace del código en las dos básculas, salvo que en alguna ese código
    // ya sea de otro producto (no se pisa).
    for (const o of ORIGENES_VALIDOS) {
      const { data: ocupado } = await supabase.from('productos_codigos_bascula').select('producto_id')
        .eq('cliente_id', clienteId).eq('origen', o).eq('codigo_bascula', a.codigo).maybeSingle();
      if (ocupado && ocupado.producto_id !== id) continue;
      const { error } = await supabase.from('productos_codigos_bascula')
        .upsert({ cliente_id: clienteId, producto_id: id, origen: o, codigo_bascula: a.codigo }, { onConflict: 'producto_id,origen' });
      if (error) return json({ error: `Enlazando ${a.codigo} en ${NOMBRE_ORIGEN[o]}: ${error.message}` }, 500);
    }
  }
  for (const h of preciosHosteleria) {
    const { error } = await supabase.from('hosteleria_articulos').update({ precio: h.despues, unidad: h.unidad }).eq('id', h.id);
    if (error) return json({ error: `Actualizando ${h.nombre} (hostelería): ${error.message}` }, 500);
  }

  for (const r of preciosReservas) {
    const { error } = await supabase.from('reservas_articulos').update({ precio: r.despues, unidad: r.unidad }).eq('id', r.id);
    if (error) return json({ error: `Actualizando ${r.nombre} (reservas): ${error.message}` }, 500);
  }

  const unidadDe = (a: Articulo) => (a.unidades === 'un' ? 'un' : 'kg');
  for (const l of listasHosteleria) {
    if (l.altas.length > 0) {
      const { error } = await supabase.from('hosteleria_articulos').insert(l.altas.map((a) => ({
        lista_id: l.id, codigo_bascula: a.codigo, nombre: nombreArticulo(a.nombre), precio: a.precio, unidad: unidadDe(a), orden: Number(a.codigo) || 0,
      })));
      if (error) return json({ error: `Alta en hostelería: ${error.message}` }, 500);
    }
    if (l.reactivar.length > 0) await supabase.from('hosteleria_articulos').update({ activo: true }).in('id', l.reactivar);
    if (l.ocultar.length > 0) await supabase.from('hosteleria_articulos').update({ activo: false }).in('id', l.ocultar);
    for (const x of l.renombrar) {
      await supabase.from('hosteleria_articulos').update({ nombre: nombreArticulo(x.articulo.nombre), precio: x.articulo.precio, unidad: unidadDe(x.articulo), imagen_url: null }).eq('id', x.id);
    }
  }
  for (const l of listasReservas) {
    if (l.altas.length > 0) {
      const { error } = await supabase.from('reservas_articulos').insert(l.altas.map((a) => ({
        evento_id: l.id, cliente_id: l.cliente_id, codigo_bascula: a.codigo, nombre_es: nombreArticulo(a.nombre), precio: a.precio, unidad: unidadDe(a), orden: Number(a.codigo) || 0,
      })));
      if (error) return json({ error: `Alta en reservas: ${error.message}` }, 500);
    }
    if (l.reactivar.length > 0) await supabase.from('reservas_articulos').update({ activo: true }).in('id', l.reactivar);
    if (l.ocultar.length > 0) await supabase.from('reservas_articulos').update({ activo: false }).in('id', l.ocultar);
    for (const x of l.renombrar) {
      await supabase.from('reservas_articulos').update({ nombre_es: nombreArticulo(x.articulo.nombre), nombre_eu: null, precio: x.articulo.precio, unidad: unidadDe(x.articulo), imagen_url: null }).eq('id', x.id);
    }
  }

  const errorFoto = await guardarFoto();
  if (errorFoto) return json({ error: errorFoto }, 500);

  const preciosWeb = preciosProductos.length + preciosHosteleria.length + preciosReservas.length;
  if (cambios.length > 0 || preciosWeb > 0 || sinActualizar.length > 0) {
    const estructurales = cambios.some((c) => c.tipo !== 'precio');
    await avisar(
      estructurales ? `⚖️ Cambios en la ${NOMBRE_ORIGEN[origen]}` : `⚖️ Precios nuevos (${NOMBRE_ORIGEN[origen]})`,
      resumenAviso(cambios, preciosWeb, sinActualizar, altasWeb),
      // Cada escaneo con cambios es un aviso aparte: con la misma etiqueta
      // el móvil sustituiría el de la hora anterior.
      `bascula-catalogo-${origen}-${Date.now()}`,
    );
  }

  await guardarLecturaOk();
  return json(resultado);
}
