// Normaliza un teléfono a solo dígitos sin prefijo de país (España, +34),
// igual que hacían PedidoCard/ReservaCard antes de tener este helper — se
// centraliza aquí porque ahora también se usa para agrupar clientes.
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '').replace(/^34/, '');
  return digits || null;
}

export function telHref(phone: string): string {
  return `tel:+34${phone}`;
}

export function whatsappHref(phone: string): string {
  return `https://wa.me/34${phone}`;
}
