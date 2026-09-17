// Función de SOLO LECTURA, de uso manual y temporal, para investigar si el
// API ETWS de la báscula BM5 expone de algún modo la anulación de un
// ticket ya emitido (ver bascula-sync/index.ts: hoy el sync solo avanza
// hacia delante por _oid_ y nunca detecta anulaciones posteriores).
//
// No escribe nada: ni en public.bascula_ventas, ni en el stock, ni en
// settings. Solo hace GET contra el proxy ETWS y devuelve el JSON crudo
// tal cual lo entrega el terminal, sin filtrar campos por un tipo TS
// (a diferencia de bascula-sync, que solo lee los campos que ya conoce) —
// así se puede ver si hay algún campo como "estado", "anulado", etc. que
// el sync no esté leyendo, y qué tipos de documento existen además de
// Factura Simplificada (1) / Factura (2) / Albarán (3).
//
// Reutiliza las mismas credenciales y el mismo secreto que bascula-sync
// y bascula-catalogo (BASCULA_SYNC_SECRET) — no hace falta configurar
// nada nuevo. Borrar esta función (o dejarla, es inofensiva) una vez
// resuelta la investigación.
//
//   POST /bascula-diagnostico
//   Header: x-webhook-secret: <BASCULA_SYNC_SECRET>
//   Body: { "origen": "pescaderia_1", "limit"?: 20 }

const ETPROXY_BASE = 'https://etproxy.etpos.pt';
const ORIGENES_VALIDOS = ['pescaderia_1', 'pescaderia_2'];

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
  return fetch(`${ETPROXY_BASE}/${cfg.proxyId}/${puerto}${path}${query}`, {
    headers: { Authorization: authHeader },
  });
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

Deno.serve(async (req: Request) => {
  const secret = req.headers.get('x-webhook-secret') ?? '';
  const expected = Deno.env.get('BASCULA_SYNC_SECRET') ?? '';
  if (!secret || !expected || !safeEqual(secret, expected)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const origen = typeof body.origen === 'string' ? body.origen : '';
  const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 50) : 20;
  if (!ORIGENES_VALIDOS.includes(origen)) {
    return new Response(`"origen" inválido o ausente. Valores válidos: ${ORIGENES_VALIDOS.join(', ')}`, { status: 400 });
  }

  const cfg = leerCfgOrigen(origen);
  if (!cfg.proxyId || !cfg.publicKey || !cfg.privateKey) {
    return new Response(`Faltan secretos de configuración de la báscula para el origen "${origen}"`, { status: 500 });
  }

  try {
    let puerto = await obtenerPuertoActual(cfg.proxyId);

    // Lista de recursos disponibles en la base "year" — por si hay alguna
    // tabla relacionada con anulaciones/abonos que no estemos consultando.
    const { res: resRecursos, puerto: puerto1 } = await llamarETWSConReintento(cfg, puerto, '/year', '');
    puerto = puerto1;
    const recursos = resRecursos.ok ? await resRecursos.json() : `Error listando recursos (HTTP ${resRecursos.status})`;

    // TODOS los tipos de documento que conoce el terminal, sin filtrar por
    // {1, 2, 3} como hace bascula-sync — para ver si hay algún tipo extra
    // (p.ej. Nota de Abono / Rectificativa) que hoy se esté ignorando.
    const { res: resTipos, puerto: puerto2 } = await llamarETWSConReintento(cfg, puerto, '/year/tipos_docs', '');
    puerto = puerto2;
    const tiposDoc = resTipos.ok ? await resTipos.json() : `Error listando tipos_docs (HTTP ${resTipos.status})`;

    const tiposDocNumeros: number[] = Array.isArray(tiposDoc) ? (tiposDoc as { numero: number }[]).map((t) => t.numero) : [];

    // Para cada tipo de documento, los últimos N registros (más recientes
    // primero) de cabeceras y líneas, en crudo (sin tipar campos) — así se
    // ve si hay algún campo como "estado"/"anulado" que bascula-sync no
    // esté leyendo hoy.
    const documentosPorTipo: Record<string, unknown> = {};
    for (const tipoDoc of tiposDocNumeros) {
      const seekCabecera = encodeURIComponent(JSON.stringify({ tipo_doc: tipoDoc, posto: null, numero: null }));
      const seekLinea = encodeURIComponent(JSON.stringify({ tipo_doc: tipoDoc, posto: null, numero: null, linha_f: null }));

      const { res: resCab, puerto: puertoA } = await llamarETWSConReintento(
        cfg,
        puerto,
        '/year/documentos',
        `?seek=${seekCabecera}&filter=1&reverse=1&limit=${limit}`,
      );
      puerto = puertoA;
      const cabeceras = resCab.ok ? await resCab.json() : `Error (HTTP ${resCab.status})`;

      const { res: resLin, puerto: puertoB } = await llamarETWSConReintento(
        cfg,
        puerto,
        '/year/documentos_lnh',
        `?seek=${seekLinea}&filter=1&reverse=1&limit=${limit}`,
      );
      puerto = puertoB;
      const lineas = resLin.ok ? await resLin.json() : `Error (HTTP ${resLin.status})`;

      documentosPorTipo[`tipo_doc_${tipoDoc}`] = { cabeceras, lineas };
    }

    return new Response(
      JSON.stringify({ origen, recursos_year: recursos, tipos_docs: tiposDoc, documentos_por_tipo: documentosPorTipo }, null, 2),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(`Error: ${(err as Error).message}`, { status: 500 });
  }
});
