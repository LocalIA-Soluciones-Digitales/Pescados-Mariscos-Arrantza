// Edge Function que recibe los PDF (o fotos) de facturas y albaranes que
// llegan por email. La llama el Apps Script de soporte.localia@gmail.com
// (scripts/gmail-compras-correo.gs) cada 5 minutos con cada adjunto nuevo.
// Guarda el archivo en el bucket privado 'compras' y lo apunta en
// compras_correo como 'nuevo'; el panel lo lee con el mismo lector que las
// fotos y decide si ya estaba guardado (src/hooks/useCorreoCompras.ts).
// Repetir un envío no duplica nada: (mensaje_id, adjunto) es único.
//
// Secretos requeridos (supabase secrets set ...):
//   COMPRAS_CORREO_SECRET     — mismo valor que CLAVE en el Apps Script
//   BASCULA_CLIENTE_ID        — el cliente de la pescadería (ya existe)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — inyectados por Supabase

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MAX_BYTES = 10 * 1024 * 1024;
const TIPOS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function safeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

interface Adjunto {
  mensaje_id: string;
  adjunto: number;
  nombre: string;
  tipo_mime: string;
  datos: string; // base64
  remitente?: string;
  asunto?: string;
  recibido?: string;
  cuerpo?: string;
}

// Outlook reenvía con «From: Pescados Arraiza <noresponder@…>» en el cuerpo.
function remitenteOriginal(cuerpo: string | undefined): string | null {
  const m = cuerpo?.match(/^\s*(?:From|De):\s*(.+?)\s*$/im);
  return m ? m[1].replace(/\s+/g, ' ').slice(0, 200) : null;
}

// Gmail a veces da «application/octet-stream» a un PDF (Gaizka).
function tipoReal(a: Adjunto): string {
  if (TIPOS[a.tipo_mime]) return a.tipo_mime;
  if (/\.pdf$/i.test(a.nombre)) return 'application/pdf';
  if (/\.jpe?g$/i.test(a.nombre)) return 'image/jpeg';
  if (/\.png$/i.test(a.nombre)) return 'image/png';
  return a.tipo_mime;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = req.headers.get('x-webhook-secret') ?? '';
  const expected = Deno.env.get('COMPRAS_CORREO_SECRET') ?? '';
  if (!secret || !expected || !safeEqual(secret, expected)) return new Response('Unauthorized', { status: 401 });

  const clienteId = Deno.env.get('BASCULA_CLIENTE_ID') ?? '';
  if (!clienteId) return json({ error: 'Falta BASCULA_CLIENTE_ID' }, 500);

  let a: Adjunto;
  try {
    a = await req.json();
  } catch {
    return json({ error: 'JSON no válido' }, 400);
  }
  if (!a?.mensaje_id || typeof a.datos !== 'string' || !a.nombre) return json({ error: 'Faltan datos' }, 400);

  const mime = tipoReal(a);
  const ext = TIPOS[mime];
  // Logos de firmas, .xml de TicketBAI…: se ignoran sin error, para que el
  // script marque el correo como recogido.
  if (!ext) return json({ ok: true, ignorado: `tipo ${a.tipo_mime}` });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: ya } = await supabase
    .from('compras_correo')
    .select('id')
    .eq('cliente_id', clienteId)
    .eq('mensaje_id', a.mensaje_id)
    .eq('adjunto', a.adjunto ?? 0)
    .maybeSingle();
  if (ya) return json({ ok: true, ya_estaba: ya.id });

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(a.datos), (c) => c.charCodeAt(0));
  } catch {
    return json({ error: 'Adjunto mal codificado' }, 400);
  }
  if (bytes.length > MAX_BYTES) return json({ ok: true, ignorado: 'demasiado grande' });
  // Imágenes pequeñas = logos de la firma del correo.
  if (ext !== 'pdf' && bytes.length < 30_000) return json({ ok: true, ignorado: 'imagen pequeña' });

  const anio = (a.recibido ?? new Date().toISOString()).slice(0, 4);
  const seguro = a.mensaje_id.replace(/[^A-Za-z0-9_-]/g, '');
  const archivo_path = `${clienteId}/correo/${anio}/${seguro}-${a.adjunto ?? 0}.${ext}`;

  const { error: errSubida } = await supabase.storage.from('compras').upload(archivo_path, bytes, { contentType: mime, upsert: true });
  if (errSubida) return json({ error: `Subida: ${errSubida.message}` }, 500);

  const { data, error } = await supabase
    .from('compras_correo')
    .insert({
      cliente_id: clienteId,
      mensaje_id: a.mensaje_id,
      adjunto: a.adjunto ?? 0,
      nombre: a.nombre.slice(0, 200),
      tipo_mime: mime,
      remitente: a.remitente?.slice(0, 200) ?? null,
      remitente_original: remitenteOriginal(a.cuerpo),
      asunto: a.asunto?.slice(0, 300) ?? null,
      recibido: a.recibido ?? null,
      archivo_path,
    })
    .select('id')
    .single();
  if (error) {
    // Dos envíos a la vez del mismo adjunto: el otro ya lo apuntó.
    if (error.code === '23505') return json({ ok: true, ya_estaba: true });
    return json({ error: error.message }, 500);
  }
  return json({ ok: true, id: data.id });
});
