const DISMISSED_KEY = 'arrantza_reservas_popup_dismissed';

// Recuerda qué campañas de reservas (por id de evento) ya ha cerrado el
// cliente, para no volver a mostrarle el aviso de esa misma campaña en
// futuras visitas. Si se abre una campaña nueva, el aviso vuelve a salir.
function getDismissedIds(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isReservasPopupDismissed(eventoId: string): boolean {
  return getDismissedIds().includes(eventoId);
}

export function dismissReservasPopup(eventoId: string): void {
  try {
    const ids = getDismissedIds();
    if (!ids.includes(eventoId)) {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids, eventoId]));
    }
  } catch {
    // localStorage no disponible — el aviso podrá volver a salir en la próxima visita
  }
}
