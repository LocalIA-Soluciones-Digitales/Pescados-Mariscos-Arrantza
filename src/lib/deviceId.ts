const DEVICE_ID_KEY = 'arrantza_device_id';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 año

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback para navegadores sin crypto.randomUUID (contextos no seguros/antiguos).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${COOKIE_MAX_AGE_SECONDS}; path=/; SameSite=Lax`;
}

// Identificador anónimo persistente por dispositivo/navegador, para poder
// mostrar el historial de pedidos sin pedir login. Se guarda en cookie Y en
// localStorage: en algunas versiones de Safari/WebKit cada pestaña puede
// quedarse con una copia en caché de localStorage no sincronizada con las
// demás, mientras que las cookies pasan por la pila de red del sistema y se
// comparten de forma más fiable entre pestañas del mismo navegador. Si el
// cliente borra los datos del sitio o cambia de dispositivo, se genera uno
// nuevo y pierde el vínculo con sus pedidos anteriores.
export function getDeviceId(): string {
  let cookieValue: string | null = null;
  try {
    cookieValue = readCookie(DEVICE_ID_KEY);
  } catch {
    // document.cookie no disponible — seguimos con localStorage
  }

  let storageValue: string | null = null;
  try {
    storageValue = localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    // localStorage no disponible — seguimos con la cookie
  }

  const existing = cookieValue || storageValue;
  const id = existing || generateId();

  try {
    writeCookie(DEVICE_ID_KEY, id);
  } catch {
    // ignorar si no se puede escribir la cookie
  }
  try {
    localStorage.setItem(DEVICE_ID_KEY, id);
  } catch {
    // ignorar si no se puede escribir en localStorage
  }

  return id;
}
