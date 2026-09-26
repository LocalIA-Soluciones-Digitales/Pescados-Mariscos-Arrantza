// Escaneo diario del catálogo de una báscula BM5 (tabla ETWS /year/artigos)
// para mantener los precios de la web al día y avisar de cambios.
//
//   POST /bascula-precios-diario   { "origen": "pescaderia_1" }
//   Opcional: "forzar": true   — ejecuta ya, sin mirar la hora ni si hoy ya se hizo
//             "simular": true  — calcula y devuelve los cambios sin escribir nada
//   Header: x-webhook-secret: <BASCULA_SYNC_SECRET>
//
// Lo dispara un cron cada media hora de 09:00 a 12:30 UTC (ver
// supabase/schema.sql). La función solo trabaja a partir de las 11:00 de
// Madrid y una vez al día: así el mismo cron vale en horario de verano e
// invierno, y si la báscula da 502 (pasa a menudo, ver bascula-sync) se
// reintenta en la siguiente media hora. Si a las 13:30 sigue sin poder
// leerla, avisa por push una sola vez ese día.
//
// Cada ejecución:
//   1. Lee todos los artículos de la báscula.
//   2. Los compara con la foto anterior (public.bascula_catalogo) y apunta
//      cada diferencia en public.bascula_catalogo_cambios: artículo nuevo,
//      eliminado, renombrado (mismo código con otro producto), o cambio de
//      precio, familia o unidades.
//   3. Copia el precio a la web: productos con código mapeado en
//      productos_codigos_bascula para ese origen, y artículos de hostelería
//      importados de esa báscula y familia. Si un código ha cambiado de
//      producto, NO se toca el precio del producto web enlazado (sería el
//      precio de otro artículo) — solo se avisa.
//      La categoría web sigue a la familia (1 Pescado, 2 Pescado de carta,
//      3 Marisco, 4 Congelado, 5 Varios); si un artículo pasa a otra familia
//      (Navidad, hostelería) se oculta de la tienda.
//   4. Guarda la foto nueva y manda un push al pescadero con el resumen.
//
// La primera ejecución solo guarda la foto de partida (no hay con qué
// comparar) y actualiza precios, sin avisar de "nuevos".
//
// Reutiliza los secretos de bascula-sync (credenciales ETWS por origen,
// BASCULA_CLIENTE_ID y BASCULA_SYNC_SECRET). El push sale por
// public.enviar_push, igual que los avisos de pedidos y reservas.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ETPROXY_BASE = 'https://etproxy.etpos.pt';
const LOTE_MAX = 100;
const MAX_PAGINAS = 50;
const ORIGENES_VALIDOS = ['pescaderia_1', 'pescaderia_2'];
const NOMBRE_ORIGEN: Record<string, string> = { pescaderia_1: 'báscula 1', pescaderia_2: 'báscula 2' };
const HORA_INICIO_MIN = 11 * 60; // 11:00 Madrid
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

const euros = (n: number) => `${n.toFixed(2).replace('.', ',')}€`;

// Texto corto para la notificación: primero lo que cambia de producto
// (movidos, renombrados, eliminados, nuevos) y al final el recuento de
// precios. Un producto que desaparece de un código y aparece con el mismo
// nombre en otro se cuenta como "movido", no como baja + alta.
function resumenAviso(cambios: Cambio[], preciosWeb: number, sinActualizar: string[]): string {
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
  if (preciosWeb > 0) partes.push(`${preciosWeb} actualizados en la web`);
  if (sinActualizar.length > 0) partes.push(`Revisar en la web (código cambiado): ${sinActualizar.slice(0, 3).join(', ')}`);

  const texto = partes.join(' · ');
  return texto.length > 300 ? `${texto.slice(0, 297)}…` : texto;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
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
  const forzar = body.forzar === true;
  const simular = body.simular === true;

  const cfg = leerCfgOrigen(origen);
  const clienteId = Deno.env.get('BASCULA_CLIENTE_ID') ?? '';
  if (!cfg.proxyId || !cfg.publicKey || !cfg.privateKey || !clienteId) {
    return new Response(`Faltan secretos de configuración de la báscula para el origen "${origen}"`, { status: 500 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const claveOk = `bascula_catalogo_ok_${origen}`;
  const claveFallo = `bascula_catalogo_fallo_avisado_${origen}`;
  const { fecha, minutos } = horaMadrid();

  const leerSetting = async (key: string) => {
    const { data } = await supabase.from('settings').select('value').eq('cliente_id', clienteId).eq('key', key).maybeSingle();
    return data?.value as unknown;
  };
  const guardarSetting = (key: string, value: unknown) =>
    supabase.from('settings').upsert({ cliente_id: clienteId, key, value }, { onConflict: 'key,cliente_id' });
  const avisar = async (titulo: string, cuerpo: string, tag: string) => {
    const { error } = await supabase.rpc('enviar_push', {
      p_cliente_id: clienteId, p_titulo: titulo, p_cuerpo: cuerpo, p_tab: 'productos', p_tag: tag,
    });
    if (error) console.error('bascula-precios-diario: fallo al avisar', error.message);
  };

  if (!forzar && !simular) {
    if (minutos < HORA_INICIO_MIN) return json({ omitido: 'antes de las 11:00' });
    if ((await leerSetting(claveOk)) === fecha) return json({ omitido: 'ya se hizo hoy' });
  }

  let articulos: Articulo[];
  try {
    articulos = await leerArticulos(cfg);
    if (articulos.length === 0) throw new Error('La báscula no devolvió ningún artículo');
  } catch (err) {
    const mensaje = (err as Error).message;
    if (!forzar && !simular && minutos >= HORA_AVISO_FALLO_MIN && (await leerSetting(claveFallo)) !== fecha) {
      await avisar(
        `⚠️ No se pudo leer la ${NOMBRE_ORIGEN[origen]}`,
        `Hoy no se han podido revisar los precios de la web (${mensaje}). Mañana se vuelve a intentar.`,
        `bascula-catalogo-fallo-${origen}-${fecha}`,
      );
      await guardarSetting(claveFallo, fecha);
    }
    return json({ error: mensaje }, 502);
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
    return json({ error: `Lectura incompleta: ${actual.size} artículos frente a ${anterior.size} de la foto anterior` }, 502);
  }

  const cambios = primeraVez ? [] : compararCatalogos(anterior, actual);
  const codigosRenombrados = new Set(cambios.filter((c) => c.tipo === 'renombrado').map((c) => c.codigo));
  const codigosEliminados = new Set(cambios.filter((c) => c.tipo === 'eliminado').map((c) => c.codigo));
  const codigosCambioFamilia = new Set(cambios.filter((c) => c.tipo === 'familia').map((c) => c.codigo));

  // Precios de la tienda online: productos con código de esta báscula.
  const { data: mapeos, error: errMapeos } = await supabase
    .from('productos_codigos_bascula')
    .select('codigo_bascula, productos (id, nombre_es, precio, categoria, visible_web)')
    .eq('cliente_id', clienteId)
    .eq('origen', origen);
  if (errMapeos) return json({ error: errMapeos.message }, 500);

  const preciosProductos: { id: string; nombre: string; antes: string; despues: string }[] = [];
  const sinActualizar: string[] = [];
  const categoriasProductos: { id: string; nombre: string; categoria: string | null; visible_web: boolean }[] = [];
  for (const m of mapeos ?? []) {
    const p = m.productos as unknown as { id: string; nombre_es: string; precio: string; categoria: string; visible_web: boolean } | null;
    const a = actual.get(m.codigo_bascula as string);
    if (!p) continue;
    // Solo se avisa el día en que el código desaparece o cambia de
    // producto; los días siguientes el producto web se queda como está.
    if (!a || codigosRenombrados.has(a.codigo)) {
      if (codigosEliminados.has(m.codigo_bascula as string) || codigosRenombrados.has(m.codigo_bascula as string)) {
        sinActualizar.push(p.nombre_es);
      }
      continue;
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
    .select('id, bascula_familia, hosteleria_articulos (id, codigo_bascula, nombre, precio, unidad)')
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

  const resultado = {
    origen, fecha, primeraVez, simulado: simular,
    articulos: actual.size,
    cambios: cambios.map((c) => ({ codigo: c.codigo, tipo: c.tipo, antes: c.antes, despues: c.despues })),
    preciosProductos, categoriasProductos, preciosHosteleria, sinActualizar,
  };
  if (simular) return json(resultado);

  for (const p of preciosProductos) {
    const { error } = await supabase.from('productos').update({ precio: p.despues }).eq('id', p.id);
    if (error) return json({ error: `Actualizando ${p.nombre}: ${error.message}` }, 500);
  }
  for (const c of categoriasProductos) {
    const datos = c.categoria ? { categoria: c.categoria, subcategoria: null, visible_web: c.visible_web } : { visible_web: c.visible_web };
    const { error } = await supabase.from('productos').update(datos).eq('id', c.id);
    if (error) return json({ error: `Actualizando la categoría de ${c.nombre}: ${error.message}` }, 500);
  }
  for (const h of preciosHosteleria) {
    const { error } = await supabase.from('hosteleria_articulos').update({ precio: h.despues, unidad: h.unidad }).eq('id', h.id);
    if (error) return json({ error: `Actualizando ${h.nombre} (hostelería): ${error.message}` }, 500);
  }

  if (cambios.length > 0) {
    const { error } = await supabase.from('bascula_catalogo_cambios').insert(
      cambios.map((c) => ({ cliente_id: clienteId, origen, codigo: c.codigo, tipo: c.tipo, antes: c.antes, despues: c.despues })),
    );
    if (error) return json({ error: error.message }, 500);
  }

  const { error: errFoto } = await supabase
    .from('bascula_catalogo')
    .upsert(articulos.map((a) => ({ cliente_id: clienteId, origen, ...a })), { onConflict: 'cliente_id,origen,codigo' });
  if (errFoto) return json({ error: errFoto.message }, 500);
  if (codigosEliminados.size > 0) {
    await supabase.from('bascula_catalogo').delete().eq('cliente_id', clienteId).eq('origen', origen).in('codigo', [...codigosEliminados]);
  }

  const preciosWeb = preciosProductos.length + preciosHosteleria.length;
  if (cambios.length > 0 || preciosWeb > 0 || sinActualizar.length > 0) {
    const estructurales = cambios.some((c) => c.tipo !== 'precio');
    await avisar(
      estructurales ? `⚖️ Cambios en la ${NOMBRE_ORIGEN[origen]}` : `⚖️ Precios nuevos (${NOMBRE_ORIGEN[origen]})`,
      resumenAviso(cambios, preciosWeb, sinActualizar),
      `bascula-catalogo-${origen}-${fecha}`,
    );
  }

  await guardarSetting(claveOk, fecha);
  return json(resultado);
});
