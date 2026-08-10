const DEVICE_ID_KEY = 'arrantza_device_id';

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

// Identificador anónimo persistente por dispositivo/navegador, para poder
// mostrar el historial de pedidos sin pedir login. Vive solo en localStorage:
// si el cliente borra los datos del sitio o cambia de dispositivo, se genera
// uno nuevo y pierde el vínculo con sus pedidos anteriores.
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = generateId();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return generateId();
  }
}
