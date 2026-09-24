// Edge Function invocada por public.enviar_push() (ver supabase/schema.sql)
// cuando entra un pedido, una reserva o una solicitud de hostelería. Envía
// una notificación Web Push a todos los dispositivos del pescadero que
// activaron los avisos desde el panel (tabla push_suscripciones), y borra
// las suscripciones que el navegador ya ha dado de baja.
//
// Secretos requeridos (supabase secrets set ...):
//   VAPID_PUBLIC_KEY       — clave pública VAPID (la misma que VAPID_PUBLIC_KEY del frontend)
//   VAPID_PRIVATE_KEY      — clave privada VAPID
//   VAPID_SUBJECT          — opcional, contacto del emisor (mailto:...)
//   PUSH_NOTIFY_SECRET     — mismo valor guardado en public.settings ('push_notify_secret')
//   SUPABASE_URL            — inyectado automáticamente por Supabase
//   SUPABASE_SERVICE_ROLE_KEY — inyectado automáticamente por Supabase

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// Comparación en tiempo constante: evita filtrar por temporización cuántos
// caracteres iniciales del secreto coinciden (timing side-channel).
function safeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

interface PushPayload {
  cliente_id: string;
  titulo: string;
  cuerpo: string;
  url: string;
  tag: string;
}

interface Suscripcion {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const secret = req.headers.get('x-webhook-secret') ?? '';
  const expected = Deno.env.get('PUSH_NOTIFY_SECRET') ?? '';
  if (!secret || !expected || !safeEqual(secret, expected)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  if (!publicKey || !privateKey) {
    return new Response('VAPID no configurado', { status: 500 });
  }
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:info@pescaderiaarrantza.com',
    publicKey,
    privateKey,
  );

  const payload = (await req.json()) as PushPayload;
  if (!payload.cliente_id || !payload.titulo) {
    return new Response('Payload incompleto', { status: 400 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await supabase
    .from('push_suscripciones')
    .select('id, endpoint, p256dh, auth')
    .eq('cliente_id', payload.cliente_id);
  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const suscripciones = (data ?? []) as Suscripcion[];
  const body = JSON.stringify({
    title: payload.titulo,
    body: payload.cuerpo,
    url: payload.url,
    tag: payload.tag,
  });

  const caducadas: string[] = [];
  let enviadas = 0;
  await Promise.all(
    suscripciones.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          // urgency high: que el móvil lo entregue al momento aunque esté
          // en reposo; TTL de 1 h, pasado eso el aviso ya no sirve.
          { TTL: 3600, urgency: 'high' },
        );
        enviadas += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          caducadas.push(s.id);
        } else {
          console.error('push-notify: fallo al enviar', status, (err as Error).message);
        }
      }
    }),
  );

  if (caducadas.length > 0) {
    await supabase.from('push_suscripciones').delete().in('id', caducadas);
  }

  return new Response(JSON.stringify({ enviadas, caducadas: caducadas.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
