// Utilidad de UN SOLO USO (borrar tras ejecutarla) para corregir tickets
// anulados de DÍAS YA PASADOS, de antes de que bascula-sync empezara a
// detectar anulaciones (ver supabase/functions/bascula-sync/index.ts).
//
// bascula-sync solo revisa, en cada ejecución, las cabeceras que el API
// ETWS trae en su ventana de los últimos 100 documentos por tipo_doc —
// así que una anulación de un ticket ya viejo (fuera de esa ventana) no
// se corrige sola. Esta función recorre TODOS los tickets que ya tenemos
// guardados en public.bascula_ventas / bascula_albaran_lineas y que
// todavía no están marcados como anulados, y por cada uno pregunta a
// ETWS su estado ACTUAL con una búsqueda exacta (seek con los 3 campos
// del índice + "filter=3" — a diferencia del cursor de paginación, aquí
// SÍ queremos la búsqueda por igualdad exacta que describe el comentario
// de bascula-catalogo/index.ts, para pedir un ticket concreto por su
// clave en vez de recorrer todo el historial).
//
// Si lo encuentra anulado, llama a la misma función de reversión que usa
// bascula-sync (anular_venta_bascula / anular_albaran_bascula, ambas
// idempotentes) para reponer el stock que corresponda y excluirlo de la
// facturación diaria.
//
//   POST /bascula-revision-historica
//   Header: x-webhook-secret: <BASCULA_SYNC_SECRET>
//   Body: { "origen": "pescaderia_1" }
//
// Reutiliza los mismos secretos que bascula-sync — no hace falta
// configurar nada nuevo.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ETPROXY_BASE = 'https://etproxy.etpos.pt';
const ORIGENES_VALIDOS = ['pescaderia_1', 'pescaderia_2'];
const CONCURRENCIA = 6; // peticiones ETWS en paralelo por tanda, para no tardar horas ni saturar el proxy

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

interface CabeceraDocumento {
  tipo_doc: number;
  posto: number;
  numero: number;
  anulado: boolean;
}

type TicketRef = { tipo_doc: number; posto: number; numero: number };

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
  const clienteId = Deno.env.get('BASCULA_CLIENTE_ID') ?? '';
  if (!cfg.proxyId || !cfg.publicKey || !cfg.privateKey || !clienteId) {
    return new Response(`Faltan secretos de configuración de la báscula para el origen "${origen}"`, { status: 500 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: ventasPendientes } = await supabase
    .from('bascula_ventas')
    .select('ticket_tipo_doc, ticket_posto, ticket_numero')
    .eq('cliente_id', clienteId)
    .eq('origen', origen)
    .eq('anulado', false);

  const { data: albaranesPendientes } = await supabase
    .from('bascula_albaran_lineas')
    .select('ticket_posto, ticket_numero')
    .eq('cliente_id', clienteId)
    .eq('origen', origen)
    .eq('anulada', false);

  const clavesVistas = new Set<string>();
  const tickets: TicketRef[] = [];
  for (const v of ventasPendientes ?? []) {
    const key = `${v.ticket_tipo_doc}|${v.ticket_posto}|${v.ticket_numero}`;
    if (clavesVistas.has(key)) continue;
    clavesVistas.add(key);
    tickets.push({ tipo_doc: v.ticket_tipo_doc, posto: v.ticket_posto, numero: v.ticket_numero });
  }
  for (const a of albaranesPendientes ?? []) {
    const key = `3|${a.ticket_posto}|${a.ticket_numero}`;
    if (clavesVistas.has(key)) continue;
    clavesVistas.add(key);
    tickets.push({ tipo_doc: 3, posto: a.ticket_posto, numero: a.ticket_numero });
  }

  let puerto = await obtenerPuertoActual(cfg.proxyId);

  const resultado = {
    origen,
    tickets_revisados: 0,
    anulados_encontrados: 0,
    filas_corregidas: 0,
    no_encontrados: [] as TicketRef[],
    errores: [] as string[],
  };

  async function revisarTicket(t: TicketRef): Promise<void> {
    const seek = encodeURIComponent(JSON.stringify({ tipo_doc: t.tipo_doc, posto: t.posto, numero: t.numero }));
    const query = `?seek=${seek}&filter=3&limit=1`;
    try {
      const { res, puerto: nuevoPuerto } = await llamarETWSConReintento(cfg, puerto, '/year/documentos', query);
      puerto = nuevoPuerto;
      if (!res.ok) {
        resultado.errores.push(`ticket ${t.tipo_doc}/${t.posto}/${t.numero}: HTTP ${res.status}`);
        return;
      }
      const filas = (await res.json()) as CabeceraDocumento[];
      resultado.tickets_revisados++;
      const cabecera = filas.find((f) => f.tipo_doc === t.tipo_doc && f.posto === t.posto && f.numero === t.numero);
      if (!cabecera) {
        resultado.no_encontrados.push(t);
        return;
      }
      if (!cabecera.anulado) return;

      resultado.anulados_encontrados++;
      if (t.tipo_doc === 3) {
        const { data: n, error } = await supabase.rpc('anular_albaran_bascula', {
          p_cliente_id: clienteId,
          p_origen: origen,
          p_posto: t.posto,
          p_numero: t.numero,
        });
        if (error) resultado.errores.push(`anular_albaran_bascula ${t.posto}/${t.numero}: ${error.message}`);
        else resultado.filas_corregidas += n ?? 0;
      } else {
        const { data: n, error } = await supabase.rpc('anular_venta_bascula', {
          p_cliente_id: clienteId,
          p_origen: origen,
          p_tipo_doc: t.tipo_doc,
          p_posto: t.posto,
          p_numero: t.numero,
        });
        if (error) resultado.errores.push(`anular_venta_bascula ${t.tipo_doc}/${t.posto}/${t.numero}: ${error.message}`);
        else resultado.filas_corregidas += n ?? 0;
      }
    } catch (err) {
      resultado.errores.push(`ticket ${t.tipo_doc}/${t.posto}/${t.numero}: ${(err as Error).message}`);
    }
  }

  for (let i = 0; i < tickets.length; i += CONCURRENCIA) {
    const tanda = tickets.slice(i, i + CONCURRENCIA);
    await Promise.all(tanda.map((t) => revisarTicket(t)));
  }

  return new Response(JSON.stringify(resultado), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
