// Contenido de los popups ⓘ de cada pestaña de navegación (ver AdminDashboard.tsx).
// Centralizado aquí (en vez de en cada panel) para que exportar estas constantes
// no rompa el fast refresh de los componentes de cada panel.

export const HOY_INFO_ITEMS = [
  { icon: 'ri-dashboard-3-line', text: 'Resumen del día: pedidos nuevos, reservas pendientes, reseñas por moderar y productos bajo mínimo.' },
  { icon: 'ri-bar-chart-2-line', text: '"Para preparar" suma todo lo pendiente de entregar, para saber qué comprar en la lonja.' },
  { icon: 'ri-alarm-warning-line', text: 'Abajo se listan los pedidos y reservas que necesitan confirmación, y los productos bajo mínimo, con acceso rápido a llamar o escribir por WhatsApp.' },
];

export const PEDIDOS_INFO_ITEMS = [
  { icon: 'ri-shopping-bag-3-line', text: 'Pedidos hechos desde la web, para recoger en tienda o entrega a domicilio.' },
  { icon: 'ri-calendar-check-line', text: 'Agrupados por fecha de recogida, para ver de un vistazo qué preparar cada día.' },
  { icon: 'ri-arrow-right-circle-line', text: 'Marca "Confirmado" y luego "Completado" a medida que avanza el pedido.' },
  { icon: 'ri-whatsapp-line', text: 'Al confirmar, se abre WhatsApp con un mensaje ya escrito para el cliente — solo hay que enviarlo.' },
  { icon: 'ri-bank-card-line', text: 'Si el pago es por Bizum, márcalo pagado a mano cuando lo recibas.' },
];

export const VENTAS_TIENDA_INFO_ITEMS = [
  {
    icon: 'ri-scales-3-line',
    text: 'Ventas cobradas en el mostrador de ambas pescaderías, sincronizadas automáticamente desde sus básculas (Factura Simplificada y Factura).',
  },
  { icon: 'ri-file-list-3-line', text: 'No incluye los Albaranes, que se facturan a fin de mes junto con la Factura correspondiente.' },
  { icon: 'ri-store-2-line', text: 'Filtra por tienda para ver solo los datos de una pescadería, o deja "Todas" para ver el total combinado.' },
  { icon: 'ri-cursor-line', text: 'Pincha un día para ver el detalle de cada venta.' },
];

export const VENTAS_INFO_ITEMS = [
  { icon: 'ri-shopping-bag-3-line', text: 'Online: pedidos hechos desde la web, agrupados por fecha de recogida, con WhatsApp automático al confirmar.' },
  { icon: 'ri-scales-3-line', text: 'Tienda: ventas cobradas en el mostrador de ambas pescaderías, sincronizadas automáticamente desde sus básculas.' },
  { icon: 'ri-file-list-3-line', text: 'Tienda no incluye los Albaranes, que se facturan a fin de mes junto con la Factura correspondiente.' },
];

export const CAJA_INFO_ITEMS = [
  { icon: 'ri-scales-3-line', text: 'Los ingresos se calculan solos desde las ventas de la báscula — normalmente no hay que tocar nada.' },
  { icon: 'ri-add-circle-line', text: 'Si un día falla la báscula o se escapa una venta, añade un ingreso a mano y se sumará al automático.' },
  { icon: 'ri-store-2-line', text: 'Los ingresos se desglosan por pescadería; los gastos (facturas y extras) son generales para el negocio conjunto.' },
  { icon: 'ri-file-list-3-line', text: 'Los gastos siempre se registran a mano.' },
  { icon: 'ri-delete-bin-line', text: 'Si una venta de báscula está mal, bórrala directamente desde su lista.' },
  { icon: 'ri-calculator-line', text: 'El total de día, mes y año se calcula solo.' },
];

export const RESERVAS_INFO_ITEMS = [
  { icon: 'ri-calendar-event-line', text: 'Crea una campaña por cada fecha especial (Navidad, Nochevieja...).' },
  { icon: 'ri-shopping-bag-line', text: 'Los clientes reservan productos, cantidades y su día de recogida desde la web.' },
  { icon: 'ri-list-check-2', text: 'Aquí se ve agrupado por día, para saber qué comprar en la lonja cada jornada.' },
  { icon: 'ri-check-double-line', text: 'Al marcar una reserva como "Entregada" se descuenta sola del pendiente de ese día.' },
];

export const SOLICITUDES_INFO_ITEMS = [
  { icon: 'ri-notification-3-line', text: 'Aparece cuando un cliente pide en la web que le avisen de un producto agotado.' },
  { icon: 'ri-check-line', text: 'Marca "Atendida" al reponerlo o contactar con el cliente.' },
  { icon: 'ri-close-line', text: 'O "Descartar" si no procede.' },
];

export const PRODUCTOS_INFO_ITEMS = [
  { icon: 'ri-toggle-line', text: 'Marca "Disponible"/"Agotado" para que se refleje al instante en la web.' },
  { icon: 'ri-star-line', text: 'La estrella añade el producto a la Selección del día en la portada.' },
  { icon: 'ri-price-tag-3-line', text: 'La etiqueta (Novedad, Especialidad, Temporada) se muestra como distintivo en la web.' },
  { icon: 'ri-alert-line', text: 'Si el stock baja del mínimo, aquí se avisa con un icono de alerta.' },
];

export const STOCK_INFO_ITEMS = [
  { icon: 'ri-add-circle-line', text: '"Entrada de hoy" suma los kg recibidos al stock actual — no hace falta calcular el total.' },
  { icon: 'ri-subtract-line', text: 'Usa un valor negativo para descontar kg, por ejemplo si llega producto en mal estado.' },
  { icon: 'ri-shopping-basket-line', text: 'El stock también baja solo con cada pedido y con cada venta pesada en cualquiera de las dos básculas.' },
  { icon: 'ri-mail-line', text: 'Si baja del aviso mínimo, se envía un correo automáticamente.' },
  { icon: 'ri-barcode-line', text: 'Cada báscula tiene su propio catálogo de códigos: indica el código de cada terminal donde se venda este producto.' },
];

export const CLIENTES_INFO_ITEMS = [
  { icon: 'ri-database-2-line', text: 'Se construye solo a partir del histórico de pedidos y reservas.' },
  { icon: 'ri-phone-line', text: 'Se agrupa por teléfono, para juntar todo bajo el mismo cliente.' },
  { icon: 'ri-star-fill', text: 'Con 3 o más pedidos/reservas, el cliente lleva la insignia "Habitual".' },
];

export const RESENAS_INFO_ITEMS = [
  { icon: 'ri-chat-3-line', text: 'Las reseñas las escriben los clientes desde la web.' },
  { icon: 'ri-shield-check-line', text: 'Apruébalas para que aparezcan en público — nada se publica solo.' },
  { icon: 'ri-delete-bin-line', text: 'Puedes rechazarlas o eliminarlas si no proceden.' },
];
