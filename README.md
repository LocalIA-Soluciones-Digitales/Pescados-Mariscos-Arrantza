# Pescados y Mariscos Arrantza

Web premium para una pescadería familiar tradicional en Erandio, Bizkaia. Diseño editorial-minimalista inspirado en la cultura marítima vasca, dirigida a clientes locales, restaurantes que buscan suministro al por mayor y visitantes de la zona.

Multilingüe: Español (por defecto) y Euskera, con arquitectura preparada para inglés y francés.

## Stack

- [React 19](https://react.dev/) + [Vite](https://vite.dev/) + TypeScript
- [Tailwind CSS](https://tailwindcss.com/)
- [react-router-dom](https://reactrouter.com/) — enrutado
- [i18next](https://www.i18next.com/) / [react-i18next](https://react.i18next.com/) — traducciones ES/EU
- [Recharts](https://recharts.org/) — visualización de datos
- [Lucide](https://lucide.dev/) — iconos
- [Supabase](https://supabase.com/) — base de datos, auth y Edge Functions
- Stripe, Cloudflare Turnstile — integraciones preparadas para fases futuras (pagos, verificación de formularios)

## Estructura

```
src/
├── components/
│   ├── base/          # Componentes genéricos (RollingNumber, ErrorBoundary...)
│   └── feature/        # Componentes de feature (Navbar, TurnstileWidget)
├── config/            # Configuración (Turnstile, emails de desarrollo)
├── hooks/             # useAdminAuth, useCart, useLanguage, useProductos, useNewsletter, usePedidos, useResenas...
├── i18n/              # Configuración y traducciones (es, eu)
├── lib/               # Clientes de servicios externos y logs (Supabase, newsletter, pedidos, reseñas, visitas)
├── mocks/             # Datos de ejemplo de productos
├── pages/
│   ├── admin/          # Panel de administración (login, hoy, pedidos, reservas, reseñas, clientes, newsletter, stock, informes)
│   ├── home/           # Página principal (Hero, About, Gallery, FAQ, Contact...)
│   ├── legal/           # Aviso legal y política de cookies
│   ├── newsletter/       # Confirmación y baja de suscripción por token
│   ├── productos/       # Catálogo de productos + carrito
│   ├── profesionales/    # Página para clientes profesionales (suministro al por mayor)
│   └── NotFound.tsx
├── router/            # Configuración de rutas
└── types/             # Tipos compartidos (Producto, Pedido, Reseña...)

supabase/
├── functions/          # Edge Functions (newsletter-confirm, pedido-estado, stock-alert)
├── schema.sql          # Esquema de la base de datos
└── seed.sql            # Datos de siembra
```

## Desarrollo

```bash
cp .env.example .env.local   # rellena VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Las credenciales de Supabase nunca se escriben en el código: se leen de variables de entorno con prefijo `VITE_` (ver `.env.example`). Los secretos de las Edge Functions (`RESEND_API_KEY`, `STOCK_ALERT_SECRET`, `PEDIDO_ESTADO_SECRET`, etc.) se configuran aparte con `supabase secrets set` — ver los `.env.example` de cada función en `supabase/functions/{newsletter-confirm,pedido-estado,stock-alert}/`.

El panel de gestión (`/admin`) se refresca solo cuando cambian pedidos, reservas, reseñas, stock o suscriptores (Supabase Realtime / Postgres Changes) y es instalable como app (PWA) — pensado para usarlo desde el móvil o tablet del mostrador. **Importante:** el bloque `do $$ ... alter publication supabase_realtime add table ...` al final de `supabase/schema.sql` hay que ejecutarlo a mano en el SQL Editor de Supabase; sin él, Postgres Changes no emite ningún evento y el panel deja de refrescarse solo (sigue funcionando, solo que como antes: hay que recargar).

## Scripts

| Comando             | Descripción                          |
| -------------------- | ------------------------------------- |
| `npm run dev`         | Servidor de desarrollo                |
| `npm run build`       | Build de producción (salida en `out/`) |
| `npm run preview`     | Sirve el build de producción localmente |
| `npm run lint`        | Linter (ESLint)                       |
| `npm run type-check`  | Comprobación de tipos (TypeScript)    |
| `npm run test`        | Tests unitarios (Vitest)              |

## Despliegue

Proyecto de tipo sitio estático (Vite). En Vercel:

- **Build Command:** `npm run build`
- **Output Directory:** `out`
- **Install Command:** `npm install`
