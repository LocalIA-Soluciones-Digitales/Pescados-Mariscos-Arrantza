// Deja el catálogo de una báscula BM5 idéntico al de otra: copia todas las
// familias y artículos (/year/familias y /year/artigos, con sus imágenes)
// del origen al destino y borra del destino lo que el origen no tiene. Se
// invoca a mano (no por cron).
//
//   POST /bascula-copiar
//   { "origen": "pescaderia_1", "destino": "pescaderia_2", "lote": "2026-09-26",
//     "simular": true }
//   Header: x-webhook-secret: <BASCULA_SYNC_SECRET>
//
// - "simular" (por defecto true): no escribe nada en la báscula, solo
//   devuelve qué se escribiría y qué se borraría.
// - Antes de tocar nada, guarda las filas crudas del destino (artículos y
//   familias, con imágenes) en bascula_copias_seguridad bajo "lote". Solo
//   la primera vez por lote: si se repite la llamada, la copia buena sigue
//   siendo la de antes de empezar.
// - Es reanudable: cada llamada compara origen y destino y solo escribe lo
//   que todavía difiere, parando antes de "limite_seg" segundos. Se repite
//   hasta que devuelva "pendiente": false.
// - El stock que lleva cada báscula es suyo: los artículos copiados entran
//   con stock 0 en el destino.
// - Para borrar, ETWS borra TODO lo que coincida con la consulta (sin
//   filtro, la tabla entera). Por eso se borra código a código con
//   seek+filter (búsqueda exacta, ver bascula-catalogo) y solo tras leer
//   con la misma consulta y comprobar que devuelve exactamente esa fila.
// - Imágenes: se leen con extra_fields (_img_raw/_img_etq_raw, base64 del
//   fichero al que apunta img/img_etq). Enviar esos campos VACÍOS borra el
//   fichero en la báscula, y un fichero puede estar compartido entre
//   artículos: por eso solo se envían cuando traen contenido.
// - Todas las escrituras llevan no_rebuild y, al final, una última sin él
//   para que ETPOS redibuje la pantalla una sola vez (según el manual).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ETPROXY_BASE = 'https://etproxy.etpos.pt';
const LOTE_MAX = 100;
const ORIGENES_VALIDOS = ['pescaderia_1', 'pescaderia_2'];
const MAX_PAGINAS = 50;
const ESCRITURA_LOTE = 10;
// Campos que la báscula cambia sola o que son propios de cada terminal:
// no cuentan al comparar si un artículo ya está igual.
const CAMPOS_IGNORADOS = new Set(['_oid_', 'stock', 'd_entrada', 'd_saida', 'd_alterado', 'flg_alt']);
const CAMPOS_IMAGEN = ['_img_raw', '_img_etq_raw'];
const EXTRA_FIELDS = `extra_fields=${encodeURIComponent(JSON.stringify(CAMPOS_IMAGEN))}`;

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

type CfgETWS = { proxyId: string; publicKey: string; privateKey: string; puerto: number };
type Fila = Record<string, unknown>;

function leerCfgOrigen(origen: string): CfgETWS {
  const prefijo = `BASCULA_${origen.toUpperCase()}_`;
  return {
    proxyId: Deno.env.get(`${prefijo}PROXY_ID`) ?? '',
    publicKey: Deno.env.get(`${prefijo}PUBLIC_KEY`) ?? '',
    privateKey: Deno.env.get(`${prefijo}PRIVATE_KEY`) ?? '',
    puerto: 0,
  };
}

async function obtenerPuertoActual(proxyId: string): Promise<number> {
  const res = await fetch(`${ETPROXY_BASE}/api/proxy/${proxyId}`);
  if (!res.ok) throw new Error(`No se pudo consultar el puerto del proxy (HTTP ${res.status})`);
  const data = await res.json();
  return data.data.port as number;
}

async function llamarETWS(cfg: CfgETWS, method: string, path: string, query: string, body = ''): Promise<Response> {
  const enviar = async () => {
    const authHeader = `ET5-HMAC-SHA1 ${cfg.publicKey}:${await firmarPeticion(cfg.privateKey, method, path, query, body)}`;
    return fetch(`${ETPROXY_BASE}/${cfg.proxyId}/${cfg.puerto}${path}${query}`, {
      method,
      headers: body ? { Authorization: authHeader, 'Content-Type': 'application/json' } : { Authorization: authHeader },
      body: body || undefined,
    });
  };
  if (!cfg.puerto) cfg.puerto = await obtenerPuertoActual(cfg.proxyId);
  let res = await enviar();
  if (res.status === 403 || res.status === 502) {
    cfg.puerto = await obtenerPuertoActual(cfg.proxyId);
    res = await enviar();
  }
  return res;
}

async function leerTabla(cfg: CfgETWS, tabla: string): Promise<Fila[]> {
  const uri = `/year/${tabla}`;
  const vistos = new Set<string>();
  const filas: Fila[] = [];
  let seek: string | null = null;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const query = seek
      ? `?seek=${encodeURIComponent(JSON.stringify({ codigo: seek }))}&limit=${LOTE_MAX}&${EXTRA_FIELDS}`
      : `?limit=${LOTE_MAX}&${EXTRA_FIELDS}`;
    const res = await llamarETWS(cfg, 'GET', uri, query);
    if (!res.ok) throw new Error(`Error leyendo ${uri} (HTTP ${res.status})`);
    const pagina_ = (await res.json()) as Fila[];
    let nuevas = 0;
    for (const fila of pagina_) {
      const codigo = String(fila.codigo);
      if (vistos.has(codigo)) continue;
      vistos.add(codigo);
      filas.push(fila);
      nuevas++;
    }
    if (pagina_.length < LOTE_MAX || nuevas === 0) break;
    seek = String(pagina_[pagina_.length - 1].codigo);
  }
  return filas;
}

// Lo que cuenta para decidir si el destino ya está igual que el origen. Una
// imagen vacía en el origen no se envía (ver arriba), así que tampoco se
// compara: si no, ese artículo se reescribiría en cada llamada.
function contenido(fila: Fila, origen: Fila): string {
  return JSON.stringify(
    Object.keys(origen)
      .filter((k) => !CAMPOS_IGNORADOS.has(k) && !(CAMPOS_IMAGEN.includes(k) && !origen[k]))
      .sort()
      .map((k) => [k, fila[k] ?? null]),
  );
}

function paraEscribir(fila: Fila, tabla: string): Fila {
  const copia: Fila = { ...fila };
  delete copia._oid_;
  for (const campo of CAMPOS_IMAGEN) if (!copia[campo]) delete copia[campo];
  if (tabla === 'artigos') copia.stock = 0;
  return copia;
}

type Plan = { escribir: Fila[]; borrar: string[] };

function planificar(origen: Fila[], destino: Fila[]): Plan {
  const enDestino = new Map(destino.map((f) => [String(f.codigo), f]));
  const enOrigen = new Set(origen.map((f) => String(f.codigo)));
  return {
    escribir: origen.filter((f) => {
      const d = enDestino.get(String(f.codigo));
      return !d || contenido(d, f) !== contenido(f, f);
    }),
    borrar: destino.map((f) => String(f.codigo)).filter((c) => !enOrigen.has(c)),
  };
}

async function borrarUno(cfg: CfgETWS, tabla: string, codigo: string): Promise<void> {
  const uri = `/year/${tabla}`;
  const query = `?seek=${encodeURIComponent(JSON.stringify({ codigo }))}&filter=1`;
  const res = await llamarETWS(cfg, 'GET', uri, query);
  if (!res.ok) throw new Error(`Error comprobando ${tabla} ${codigo} antes de borrar (HTTP ${res.status})`);
  const filas = (await res.json()) as Fila[];
  if (filas.length !== 1 || String(filas[0].codigo) !== codigo) {
    throw new Error(`No se borra ${tabla} ${codigo}: la consulta devolvió ${filas.length} filas en vez de solo esa`);
  }
  const del = await llamarETWS(cfg, 'DELETE', uri, `${query}&no_rebuild=1`);
  if (!del.ok) throw new Error(`Error borrando ${tabla} ${codigo} (HTTP ${del.status}): ${await del.text()}`);
}

Deno.serve(async (req: Request) => {
  const secret = req.headers.get('x-webhook-secret') ?? '';
  const expected = Deno.env.get('BASCULA_SYNC_SECRET') ?? '';
  if (!secret || !expected || !safeEqual(secret, expected)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const origen = typeof body.origen === 'string' ? body.origen : '';
  const destino = typeof body.destino === 'string' ? body.destino : '';
  const lote = typeof body.lote === 'string' ? body.lote.trim() : '';
  const simular = body.simular !== false;
  const limiteMs = (typeof body.limite_seg === 'number' ? body.limite_seg : 100) * 1000;
  if (!ORIGENES_VALIDOS.includes(origen) || !ORIGENES_VALIDOS.includes(destino) || origen === destino) {
    return new Response(`"origen" y "destino" deben ser distintos y uno de: ${ORIGENES_VALIDOS.join(', ')}`, { status: 400 });
  }
  if (!lote) return new Response('Falta "lote" (nombre de la copia de seguridad)', { status: 400 });

  const cfgOrigen = leerCfgOrigen(origen);
  const cfgDestino = leerCfgOrigen(destino);
  for (const cfg of [cfgOrigen, cfgDestino]) {
    if (!cfg.proxyId || !cfg.publicKey || !cfg.privateKey) {
      return new Response('Faltan secretos de configuración de alguna báscula', { status: 500 });
    }
  }

  const inicio = Date.now();
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const tablas = ['familias', 'artigos'] as const;
    const datos: Record<string, { origen: Fila[]; destino: Fila[] }> = {};
    for (const tabla of tablas) {
      datos[tabla] = { origen: await leerTabla(cfgOrigen, tabla), destino: await leerTabla(cfgDestino, tabla) };
    }

    // Copia de seguridad del destino, solo la primera vez por lote.
    const { data: existentes, error: errSel } = await supabase
      .from('bascula_copias_seguridad')
      .select('tabla')
      .eq('lote', lote)
      .eq('origen', destino);
    if (errSel) throw new Error(`No se pudo consultar la copia de seguridad: ${errSel.message}`);
    const yaGuardadas = new Set((existentes ?? []).map((r) => r.tabla));
    for (const tabla of tablas) {
      if (yaGuardadas.has(tabla)) continue;
      const { error } = await supabase
        .from('bascula_copias_seguridad')
        .insert({ lote, origen: destino, tabla, filas: datos[tabla].destino });
      if (error) throw new Error(`No se pudo guardar la copia de seguridad de ${tabla}: ${error.message}`);
    }

    const planes = Object.fromEntries(tablas.map((t) => [t, planificar(datos[t].origen, datos[t].destino)])) as Record<string, Plan>;
    const resumen = (p: Record<string, Plan>) =>
      Object.fromEntries(tablas.map((t) => [t, { escribir: p[t].escribir.map((f) => String(f.codigo)), borrar: p[t].borrar }]));

    if (simular) {
      return Response.json({ origen, destino, lote, simular, total_origen: { familias: datos.familias.origen.length, artigos: datos.artigos.origen.length }, total_destino: { familias: datos.familias.destino.length, artigos: datos.artigos.destino.length }, plan: resumen(planes) });
    }

    const hechos = { escritos: 0, borrados: 0 };
    const tiempoAgotado = () => Date.now() - inicio > limiteMs;

    // Familias antes que artículos: un artículo no debe apuntar a una
    // familia que aún no existe. Los borrados, al final.
    for (const tabla of tablas) {
      const pendientes = planes[tabla].escribir;
      for (let i = 0; i < pendientes.length && !tiempoAgotado(); i += ESCRITURA_LOTE) {
        const lote_ = pendientes.slice(i, i + ESCRITURA_LOTE).map((f) => paraEscribir(f, tabla));
        const res = await llamarETWS(cfgDestino, 'PUT', `/year/${tabla}`, '?no_rebuild=1', JSON.stringify(lote_));
        if (!res.ok) throw new Error(`Error escribiendo ${tabla} ${lote_.map((f) => f.codigo).join(',')} (HTTP ${res.status}): ${await res.text()}`);
        hechos.escritos += lote_.length;
      }
    }
    for (const tabla of ['artigos', 'familias']) {
      for (const codigo of planes[tabla].borrar) {
        if (tiempoAgotado()) break;
        await borrarUno(cfgDestino, tabla, codigo);
        hechos.borrados++;
      }
    }

    // Una última escritura sin no_rebuild para que ETPOS redibuje la
    // pantalla: la primera familia del origen, que ya está igual.
    if (hechos.escritos + hechos.borrados > 0 && datos.familias.origen.length > 0) {
      const familia = paraEscribir(datos.familias.origen[0], 'familias');
      const res = await llamarETWS(cfgDestino, 'PUT', '/year/familias', '', JSON.stringify([familia]));
      if (!res.ok) throw new Error(`Error pidiendo a la báscula que redibuje la pantalla (HTTP ${res.status})`);
    }

    // Comprobación final: vuelve a leer el destino y cuenta lo que aún difiere.
    const restantes = Object.fromEntries(
      await Promise.all(tablas.map(async (t) => [t, planificar(datos[t].origen, await leerTabla(cfgDestino, t))] as const)),
    ) as Record<string, Plan>;
    const pendiente = tablas.some((t) => restantes[t].escribir.length > 0 || restantes[t].borrar.length > 0);
    return Response.json({ origen, destino, lote, simular, hechos, pendiente, restante: resumen(restantes) });
  } catch (err) {
    return new Response(`Error: ${(err as Error).message}`, { status: 500 });
  }
});
