// Extrae el catálogo COMPLETO de artículos programados en una báscula BM5
// (tabla ETWS /year/artigos), estén o no vendidos ya — a diferencia de
// bascula-sync, que solo ve un código en cuanto aparece en una venta. Se
// invoca a mano (no por cron) cuando hace falta rellenar los códigos de
// báscula de golpe, en vez de esperar a que cada producto se venda una vez.
//
//   POST /bascula-catalogo   { "origen": "pescaderia_1" }   (o pescaderia_2)
//   Header: x-webhook-secret: <BASCULA_SYNC_SECRET>
//
// Reutiliza las mismas credenciales por origen que bascula-sync (ver
// supabase/functions/bascula-sync/index.ts y su .env.example) — no hace
// falta configurar ningún secreto nuevo.
//
// El índice real de /year/artigos no está documentado de antemano: se
// descubre en cada llamada preguntando a ETWS por los recursos de la
// base "year" (GET /year), y se usa ese índice para paginar con "seek"
// (el API limita cada página a 100 filas). Es una operación de solo
// lectura: nunca se escribe nada en la báscula ni se toca el catálogo de
// productos — el volcado a productos_codigos_bascula se revisa y hace a
// mano después, para no arriesgarse a mapear mal un código real.

const ETPROXY_BASE = 'https://etproxy.etpos.pt';
const LOTE_MAX = 100;
const ORIGENES_VALIDOS = ['pescaderia_1', 'pescaderia_2'];
const MAX_PAGINAS = 50; // salvaguarda contra un bucle infinito si algo del API cambia

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

async function llamarETWS(cfg: CfgETWS, puerto: number, method: string, path: string, query: string): Promise<Response> {
  const authHeader = `ET5-HMAC-SHA1 ${cfg.publicKey}:${await firmarPeticion(cfg.privateKey, method, path, query, '')}`;
  return fetch(`${ETPROXY_BASE}/${cfg.proxyId}/${puerto}${path}${query}`, {
    method,
    headers: { Authorization: authHeader },
  });
}

async function llamarETWSConReintento(cfg: CfgETWS, puertoInicial: number, method: string, path: string, query: string): Promise<{ res: Response; puerto: number }> {
  let puerto = puertoInicial;
  let res = await llamarETWS(cfg, puerto, method, path, query);
  if (res.status === 403 || res.status === 502) {
    puerto = await obtenerPuertoActual(cfg.proxyId);
    res = await llamarETWS(cfg, puerto, method, path, query);
  }
  return { res, puerto };
}

interface RecursoETWS {
  uri: string;
  http_methods: string[];
  indexes: string[];
}

// Descubre las columnas del índice de /year/artigos preguntando a ETWS,
// en vez de asumirlas — así no dependemos de adivinar el esquema interno.
async function obtenerCamposIndiceArtigos(cfg: CfgETWS, puerto: number): Promise<string[]> {
  const { res } = await llamarETWSConReintento(cfg, puerto, 'GET', '/year', '');
  if (!res.ok) throw new Error(`No se pudo listar la base "year" (HTTP ${res.status})`);
  const recursos = (await res.json()) as RecursoETWS[];
  const artigos = recursos.find((r) => r.uri === '/year/artigos');
  if (!artigos || artigos.indexes.length === 0) return ['codigo'];
  return artigos.indexes[0].split(',').map((c) => c.trim());
}

Deno.serve(async (req: Request) => {
  const secret = req.headers.get('x-webhook-secret') ?? '';
  const expected = Deno.env.get('BASCULA_SYNC_SECRET') ?? '';
  if (!secret || !expected || !safeEqual(secret, expected)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const origen = typeof body.origen === 'string' ? body.origen : '';
  if (!ORIGENES_VALIDOS.includes(origen)) {
    return new Response(`"origen" inválido o ausente. Valores válidos: ${ORIGENES_VALIDOS.join(', ')}`, { status: 400 });
  }

  const cfg = leerCfgOrigen(origen);
  if (!cfg.proxyId || !cfg.publicKey || !cfg.privateKey) {
    return new Response(`Faltan secretos de configuración de la báscula para el origen "${origen}"`, { status: 500 });
  }

  try {
    let puerto = await obtenerPuertoActual(cfg.proxyId);
    const campos = await obtenerCamposIndiceArtigos(cfg, puerto);

    const vistos = new Set<string>();
    const articulos: Record<string, unknown>[] = [];
    let seek: Record<string, unknown> | null = null;

    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const query = seek
        ? `?seek=${encodeURIComponent(JSON.stringify(seek))}&filter=${campos.length}&limit=${LOTE_MAX}`
        : `?limit=${LOTE_MAX}`;
      const { res, puerto: puertoUsado } = await llamarETWSConReintento(cfg, puerto, 'GET', '/year/artigos', query);
      puerto = puertoUsado;
      if (!res.ok) throw new Error(`Error consultando /year/artigos (HTTP ${res.status})`);
      const filas = (await res.json()) as Record<string, unknown>[];

      let nuevas = 0;
      for (const fila of filas) {
        const clave = JSON.stringify(campos.map((c) => fila[c]));
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        delete fila._img_raw;
        delete fila._img_etq_raw;
        articulos.push(fila);
        nuevas++;
      }

      if (filas.length < LOTE_MAX) break; // última página
      const ultima = filas[filas.length - 1];
      seek = Object.fromEntries(campos.map((c) => [c, ultima[c] ?? null]));
      if (nuevas === 0) break; // no avanzamos: evita bucle infinito
    }

    return new Response(JSON.stringify({ origen, campos_indice: campos, total: articulos.length, articulos }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(`Error: ${(err as Error).message}`, { status: 500 });
  }
});
