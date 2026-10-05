// La pescadería cierra los domingos y los lunes: esos días las básculas
// suelen estar apagadas y que no respondan no es un fallo de comunicación.
// Se mira el día en Madrid, no el del dispositivo.
export function tiendaCerradaHoy(fecha = new Date()): boolean {
  const dia = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', weekday: 'short' }).format(fecha);
  return dia === 'Sun' || dia === 'Mon';
}
