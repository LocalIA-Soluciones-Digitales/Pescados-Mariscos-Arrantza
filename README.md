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
- Firebase, Supabase, Stripe, Cloudflare Turnstile — integraciones preparadas para fases futuras (pedidos, pagos, verificación de formularios)

## Estructura

```
src/
├── components/
│   ├── base/          # Componentes genéricos (RollingNumber...)
│   └── feature/        # Componentes de feature (Navbar, TurnstileWidget)
├── config/            # Configuración (Turnstile)
├── hooks/             # useAdminAuth, useCart, useLanguage, useProductos, useScrollAnimation, useTurnstile
├── i18n/              # Configuración y traducciones (es, eu)
├── lib/               # Clientes de servicios externos (Supabase)
├── mocks/             # Datos de ejemplo de productos
├── pages/
│   ├── admin/          # Panel de administración (login, dashboard, alta/edición de productos)
│   ├── home/           # Página principal (Hero, About, Gallery, FAQ, Contact...)
│   ├── productos/       # Catálogo de productos + carrito
│   └── NotFound.tsx
├── router/            # Configuración de rutas
└── types/             # Tipos compartidos (Producto...)

supabase/              # Esquema y datos de siembra (schema.sql, seed.sql)
```

## Desarrollo

```bash
npm install
npm run dev
```

## Scripts

| Comando             | Descripción                          |
| -------------------- | ------------------------------------- |
| `npm run dev`         | Servidor de desarrollo                |
| `npm run build`       | Build de producción (salida en `out/`) |
| `npm run preview`     | Sirve el build de producción localmente |
| `npm run lint`        | Linter (ESLint)                       |
| `npm run type-check`  | Comprobación de tipos (TypeScript)    |

## Despliegue

Proyecto de tipo sitio estático (Vite). En Vercel:

- **Build Command:** `npm run build`
- **Output Directory:** `out`
- **Install Command:** `npm install`
