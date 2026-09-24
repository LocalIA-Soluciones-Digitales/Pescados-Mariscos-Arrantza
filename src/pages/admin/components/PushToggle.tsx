import { useEffect } from 'react';
import { usePushNotificaciones } from '@/hooks/usePushNotificaciones';

// Campana de la cabecera del panel: activa/desactiva en ESTE dispositivo
// los avisos al móvil cuando entra un pedido, una reserva o una solicitud
// de hostelería. Apagada lleva un punto de aviso para que se vea que falta
// activarla.
export default function PushToggle() {
  const { estado, error, activar, desactivar } = usePushNotificaciones();

  useEffect(() => {
    if (error) window.alert(`No se pudieron cambiar los avisos: ${error}`);
  }, [error]);

  if (estado === 'cargando' || estado === 'no_soportado') return null;

  const activado = estado === 'activado';
  const title = activado ? 'Avisos de pedidos activados en este dispositivo' : 'Activar avisos de pedidos en este dispositivo';

  const handleClick = () => {
    if (estado === 'instalar') {
      window.alert(
        'Para recibir avisos en el iPhone, añade la web a la pantalla de inicio (Compartir → Añadir a pantalla de inicio), ábrela desde ese icono y vuelve a pulsar la campana.',
      );
    } else if (estado === 'denegado') {
      window.alert(
        'Las notificaciones están bloqueadas para esta app. Actívalas en los ajustes del móvil (Ajustes → Notificaciones → Arrantza) y vuelve a pulsar la campana.',
      );
    } else if (activado) {
      if (window.confirm('¿Dejar de recibir avisos de pedidos en este dispositivo?')) void desactivar();
    } else {
      void activar();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={title}
      title={title}
      className={`relative w-9 h-9 flex items-center justify-center rounded-full border transition-colors flex-shrink-0 ${
        activado
          ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
          : 'bg-background-100 border-background-200/70 text-foreground-500 hover:text-foreground-950 hover:border-foreground-300/60'
      }`}
    >
      <i className={`${activado ? 'ri-notification-3-fill' : 'ri-notification-off-line'} text-base`}></i>
      {!activado && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500"></span>}
    </button>
  );
}
