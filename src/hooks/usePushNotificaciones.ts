import { useCallback, useEffect, useState } from 'react';
import { supabase, SITE_KEY } from '@/lib/supabaseClient';

// Clave pública VAPID (la privada solo vive en los secretos de la Edge
// Function push-notify). Es pública por diseño: el navegador la usa para
// comprobar que los avisos vienen de nuestro servidor.
const VAPID_PUBLIC_KEY = 'BBm9hTDmMZtrKirD_YlmHLaYRq1BW7dRbQShlyXEB-WgeXyX8kRQ1oq5zYGN1mtJILbzaaS0m5qb4kbXSBhj-l8';

export type PushEstado =
  | 'cargando'
  | 'no_soportado'
  // iPhone/iPad en Safari: Web Push solo existe con la web instalada en
  // la pantalla de inicio (iOS 16.4+).
  | 'instalar'
  | 'denegado'
  | 'desactivado'
  | 'activado';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function esIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function esAppInstalada(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// El service worker solo se registra en producción (ver main.tsx): en
// desarrollo no hay registro y los avisos quedan como "no soportado".
async function getRegistro(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return undefined;
  return navigator.serviceWorker.ready;
}

async function guardar(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await supabase.rpc('guardar_suscripcion_push', {
    p_site_key: SITE_KEY,
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
}

export function usePushNotificaciones() {
  const [estado, setEstado] = useState<PushEstado>('cargando');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) {
        setEstado(esIOS() && !esAppInstalada() ? 'instalar' : 'no_soportado');
        return;
      }
      if (Notification.permission === 'denied') {
        setEstado('denegado');
        return;
      }
      const reg = await getRegistro();
      if (cancelled) return;
      if (!reg) {
        setEstado('no_soportado');
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      if (cancelled) return;
      if (sub && Notification.permission === 'granted') {
        setEstado('activado');
        // Se vuelve a guardar en cada carga: si push-notify la borró por
        // caducada, o la fila se perdió, este dispositivo vuelve a recibir.
        guardar(sub).catch(() => {});
      } else {
        setEstado('desactivado');
      }
    })().catch(() => {
      if (!cancelled) setEstado('no_soportado');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const activar = useCallback(async () => {
    setError(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'denegado' : 'desactivado');
        return;
      }
      const reg = await getRegistro();
      if (!reg) {
        setEstado('no_soportado');
        return;
      }
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));
      await guardar(sub);
      setEstado('activado');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron activar los avisos');
    }
  }, []);

  const desactivar = useCallback(async () => {
    setError(null);
    try {
      const reg = await getRegistro();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_suscripciones').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado('desactivado');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron desactivar los avisos');
    }
  }, []);

  return { estado, error, activar, desactivar };
}
