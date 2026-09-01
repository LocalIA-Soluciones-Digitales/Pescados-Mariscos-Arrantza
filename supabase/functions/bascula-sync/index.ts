// Sincroniza con las pesadas registradas en las básculas BM5 (Balanzas
// Marques) de las dos pescaderías (David compra en el mercado y reparte
// género entre ambas, así que comparten stock y facturación). Se invoca
// por cron cada 5 minutos, una vez por cada terminal — el cron indica en
// el cuerpo de la petición de qué báscula se trata:
//
//   { "origen": "pescaderia_1" }   o   { "origen": "pescaderia_2" }
//
// (ver el bloque "Sincronización de stock con las básculas BM5" en
// supabase/schema.sql). Por cada línea de ticket nueva de esa báscula:
//   1. la guarda en public.bascula_ventas, con su origen — para la
//      facturación diaria (combinada y desglosada por tienda), y
//   2. si es una venta a peso ("unidade": "kg") de un producto con un
//      código mapeado para ESE origen (productos_codigos_bascula),
//      descuenta esos kg del stock compartido.
//
// IMPORTANTE sobre el API ETWS: las tablas /year/documentos y
// /year/documentos_lnh están indexadas empezando por "tipo_doc" (1 =
// Factura Simplificada — clientes normales, 2 = Factura — clientes con
// cuenta tipo restaurantes, 3 = Albarán — según /year/tipos_docs). Un
// GET sin "seek" recorre ese índice en su orden natural, así que
// "reverse=1" sin más SOLO devuelve el tipo con el número más alto
// (Albarán) y nunca llega a Factura Simplificada, que es el tipo que
// más se usa. Por eso aquí se consulta cada tipo_doc por separado con
// "seek", en vez de un único GET sin filtrar.
//
// El Albarán (tipo_doc 3) NO se procesa: según el negocio, es solo la
// entrega provisional de género a un cliente tipo restaurante, y a fin
// de mes se cierra reagrupando varios Albaranes en una Factura (tipo_doc
// 2) — el documento que realmente factura la venta. Contar el Albarán
// además de la Factura duplicaría tanto el stock descontado como la
// facturación diaria (una vez al entregar, otra al facturar el mes).
// Solo se procesan tipo_doc 1 (Factura Simplificada) y 2 (Factura), que
// son los que representan la venta ya facturada.
//
// Cada báscula tiene su propio contador interno de _oid_, así que el
// "último ticket procesado" se guarda en `settings` con una clave por
// origen (bascula_last_oid_pescaderia_1 / _pescaderia_2), no una global
// — dos terminales pueden compartir el mismo número de oid para tickets
// completamente distintos.
//
// Documentación del API ETWS: la trajo el suministrador de la báscula
// (Balanzas Marques / Merkapesaje) tras activar ETPROXY en el propio
// terminal (menú Red > Opciones > "..." junto a "Acepta comandos desde
// ETWS"), y las credenciales HMAC se generaron desde "Configurar
// Servicio Web" > Cliente "GENERIC" en esa misma pantalla. Esas
// credenciales pueden cambiar si alguien vuelve a pulsar "Generar" en
// el terminal — si esta función empieza a fallar con 401, hay que
// volver a esa pantalla y actualizar los secretos de ese origen.
//
// Secretos requeridos (supabase secrets set ...), por cada origen (p.ej.
// PESCADERIA_1 y PESCADERIA_2 — el nombre debe ser el "origen" en
// mayúsculas):
//   BASCULA_PESCADERIA_1_PROXY_ID / _PUBLIC_KEY / _PRIVATE_KEY
//   BASCULA_PESCADERIA_2_PROXY_ID / _PUBLIC_KEY / _PRIVATE_KEY
// Compartidos entre ambos orígenes:
//   BASCULA_CLIENTE_ID    — uuid de public.clientes (el mismo negocio)
//   BASCULA_SYNC_SECRET   — mismo valor guardado en el x-webhook-secret del cron
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — ya los provee Supabase automáticamente

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ETPROXY_BASE = 'https://etproxy.etpos.pt';
const LOTE_MAX = 100; // tope del propio API ETWS por consulta
const TIPOS_DOC_A_PROCESAR = new Set([1, 2]);
const ORIGENES_VALIDOS = ['pescaderia_1', 'pescaderia_2'];

// Comparación en tiempo constante: evita filtrar por temporización cuántos
// caracteres iniciales del secreto coinciden (timing side-channel), igual
// que en el resto de Edge Functions de este proyecto.
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

// Firma HMAC-SHA1 de "método + ruta + query + body", tal como exige el
// API ETWS (cabecera "ET5-HMAC-SHA1 {clave pública hex}:{HMAC en base64}").
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

async function llamarETWSConReintento(cfg: CfgETWS, puertoInicial: number, path: string, query: string): Promise<Response> {
  let res = await llamarETWS(cfg, puertoInicial, path, query);
  if (res.status === 403 || res.status === 502) {
    // El puerto remoto del proxy es dinámico y puede haber cambiado.
    const nuevoPuerto = await obtenerPuertoActual(cfg.proxyId);
    res = await llamarETWS(cfg, nuevoPuerto, path, query);
  }
  return res;
}

async function obtenerTiposDoc(cfg: CfgETWS, puerto: number): Promise<number[]> {
  const res = await llamarETWSConReintento(cfg, puerto, '/year/tipos_docs', '');
  if (!res.ok) throw new Error(`No se pudo consultar tipos_docs (HTTP ${res.status})`);
  const tipos = (await res.json()) as { numero: number }[];
  return tipos.map((t) => t.numero);
}

// GET .../{path}?seek={...}&filter=N&reverse=1&limit=M, filtrando por los
// primeros N campos del índice (aquí siempre empezando por tipo_doc, con
// el resto de campos del índice como "no me importa" según el manual).
async function seekPorTipoDoc<T>(cfg: CfgETWS, puerto: number, path: string, camposIndiceExtra: string[], tipoDoc: number): Promise<T[]> {
  const seekObj: Record<string, number | null> = { tipo_doc: tipoDoc };
  for (const campo of camposIndiceExtra) seekObj[campo] = null;
  const query = `?seek=${encodeURIComponent(JSON.stringify(seekObj))}&filter=1&reverse=1&limit=${LOTE_MAX}`;
  const res = await llamarETWSConReintento(cfg, puerto, path, query);
  if (!res.ok) throw new Error(`Error consultando ${path} (tipo_doc ${tipoDoc}, HTTP ${res.status})`);
  return (await res.json()) as T[];
}

interface LineaDocumento {
  _oid_: number;
  tipo_doc: number;
  posto: number;
  numero: number;
  codigo: string;
  designacao: string;
  unidade: string;
  quantidade: number;
  preco_unit: number;
  valor: number;
}

interface CabeceraDocumento {
  tipo_doc: number;
  posto: number;
  numero: number;
  d_doc: string;
  h_doc: string;
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
  const clienteId = Deno.env.get('BASCULA_CLIENTE_ID') ?? '';
  if (!cfg.proxyId || !cfg.publicKey || !cfg.privateKey || !clienteId) {
    return new Response(`Faltan secretos de configuración de la báscula para el origen "${origen}"`, { status: 500 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const settingKey = `bascula_last_oid_${origen}`;
  const { data: settingRow } = await supabase
    .from('settings')
    .select('value')
    .eq('cliente_id', clienteId)
    .eq('key', settingKey)
    .maybeSingle();
  const lastOid: number = typeof settingRow?.value === 'number' ? settingRow.value : 0;
  const esPrimeraEjecucion = lastOid === 0;

  const { data: codigosMapeados } = await supabase
    .from('productos_codigos_bascula')
    .select('producto_id, codigo_bascula')
    .eq('cliente_id', clienteId)
    .eq('origen', origen);
  const productoIdPorCodigo = new Map((codigosMapeados ?? []).map((c) => [c.codigo_bascula as string, c.producto_id as string]));

  const puertoActual = await obtenerPuertoActual(cfg.proxyId);
  const tiposDoc = (await obtenerTiposDoc(cfg, puertoActual)).filter((t) => TIPOS_DOC_A_PROCESAR.has(t));

  // Cabeceras y líneas de cada tipo de documento por separado: el
  // índice de estas tablas empieza por tipo_doc, así que un GET sin
  // "seek" solo alcanza el tipo con el número más alto (ver comentario
  // al principio del fichero).
  const cabeceras: CabeceraDocumento[] = [];
  const lineas: LineaDocumento[] = [];
  for (const tipoDoc of tiposDoc) {
    cabeceras.push(...(await seekPorTipoDoc<CabeceraDocumento>(cfg, puertoActual, '/year/documentos', ['posto', 'numero'], tipoDoc)));
    lineas.push(...(await seekPorTipoDoc<LineaDocumento>(cfg, puertoActual, '/year/documentos_lnh', ['posto', 'numero', 'linha_f'], tipoDoc)));
  }

  const fechaPorTicket = new Map(cabeceras.map((c) => [`${c.tipo_doc}|${c.posto}|${c.numero}`, { fecha: c.d_doc, hora: c.h_doc }]));

  if (lineas.length === 0) {
    return new Response('Sin tickets registrados todavía', { status: 200 });
  }

  const nuevas = lineas.filter((l) => l._oid_ > lastOid).sort((a, b) => a._oid_ - b._oid_);
  const maxOidVisto = Math.max(...lineas.map((l) => l._oid_));

  const resultado = { origen, guardadas: 0, stock_descontado: 0, sin_mapear: [] as string[], primera_ejecucion: esPrimeraEjecucion };

  // En la primera ejecución no hay "último ticket procesado": solo se
  // fija el punto de partida, para no registrar de golpe todo el
  // histórico de ventas ya realizadas antes de activar la sincronización.
  if (!esPrimeraEjecucion) {
    for (const linea of nuevas) {
      if (!linea.codigo) continue;

      const claveTicket = `${linea.tipo_doc}|${linea.posto}|${linea.numero}`;
      const cabecera = fechaPorTicket.get(claveTicket);
      const hoy = new Date().toISOString().slice(0, 10);
      const productoId = productoIdPorCodigo.get(linea.codigo) ?? null;

      const { error: errorInsert } = await supabase.from('bascula_ventas').upsert(
        {
          cliente_id: clienteId,
          origen,
          producto_id: productoId,
          linea_oid: linea._oid_,
          ticket_tipo_doc: linea.tipo_doc,
          ticket_posto: linea.posto,
          ticket_numero: linea.numero,
          fecha: cabecera?.fecha ?? hoy,
          hora: cabecera?.hora ?? null,
          codigo_bascula: linea.codigo,
          designacion: linea.designacao,
          unidad: linea.unidade,
          cantidad: linea.quantidade,
          precio_unit: linea.preco_unit,
          importe: linea.valor,
        },
        { onConflict: 'origen,linea_oid', ignoreDuplicates: true },
      );

      if (errorInsert) {
        console.error(`[${origen}] Error guardando línea (ticket ${linea.numero}, código ${linea.codigo}):`, errorInsert.message);
        continue;
      }
      resultado.guardadas++;

      if (linea.unidade !== 'kg') continue;

      if (!productoId) {
        resultado.sin_mapear.push(linea.codigo);
        continue;
      }

      const { error: errorStock } = await supabase.rpc('descontar_stock_bascula', {
        p_cliente_id: clienteId,
        p_origen: origen,
        p_codigo_bascula: linea.codigo,
        p_kg: linea.quantidade,
      });
      if (errorStock) {
        console.error(`[${origen}] Error descontando stock (ticket ${linea.numero}, código ${linea.codigo}):`, errorStock.message);
        continue;
      }
      resultado.stock_descontado++;
    }
  }

  await supabase
    .from('settings')
    .upsert({ cliente_id: clienteId, key: settingKey, value: maxOidVisto }, { onConflict: 'key,cliente_id' });

  return new Response(JSON.stringify(resultado), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
