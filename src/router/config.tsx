import { lazy, type ComponentType } from "react";
import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";

// La portada va en el paquete principal; el resto de páginas se descargan
// solo al entrar en ellas. Así quien abre la web no se baja el panel de
// gestión (gráficos, Excel, OCR…) ni las páginas legales.
//
// Si tras publicar una versión nueva el navegador pide un trozo que ya no
// existe (pestaña abierta desde antes), se recarga la página una vez para
// traer la versión actual en lugar de quedarse en blanco.
const RECARGA_KEY = "arrantza-recarga-por-version";

function lazyPage(importar: () => Promise<{ default: ComponentType }>) {
  return lazy(() =>
    importar()
      .then((mod) => {
        try { sessionStorage.removeItem(RECARGA_KEY); } catch { /* sin storage */ }
        return mod;
      })
      .catch((error: unknown) => {
        let yaRecargada = false;
        try {
          yaRecargada = sessionStorage.getItem(RECARGA_KEY) === "1";
          sessionStorage.setItem(RECARGA_KEY, "1");
        } catch { /* sin storage */ }
        if (!yaRecargada) {
          window.location.reload();
          return new Promise<never>(() => {});
        }
        throw error;
      }),
  );
}

const Productos = lazyPage(() => import("../pages/productos/page"));
const Reservas = lazyPage(() => import("../pages/reservas/page"));
const Hosteleria = lazyPage(() => import("../pages/hosteleria/page"));
const Admin = lazyPage(() => import("../pages/admin/page"));
const AdminResetPassword = lazyPage(() => import("../pages/admin/components/AdminResetPassword"));
const AvisoLegal = lazyPage(() => import("../pages/legal/AvisoLegal"));
const Cookies = lazyPage(() => import("../pages/legal/Cookies"));
const Privacidad = lazyPage(() => import("../pages/legal/Privacidad"));
const CondicionesContratacion = lazyPage(() => import("../pages/legal/CondicionesContratacion"));
const PedidoConfirmado = lazyPage(() => import("../pages/pedido/PedidoConfirmado"));

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/productos",
    element: <Productos />,
  },
  {
    path: "/reservas",
    element: <Reservas />,
  },
  {
    path: "/hosteleria",
    element: <Hosteleria />,
  },
  {
    path: "/admin",
    element: <Admin />,
  },
  {
    path: "/admin/restablecer-password",
    element: <AdminResetPassword />,
  },
  {
    path: "/aviso-legal",
    element: <AvisoLegal />,
  },
  {
    path: "/cookies",
    element: <Cookies />,
  },
  {
    path: "/privacidad",
    element: <Privacidad />,
  },
  {
    path: "/condiciones-contratacion",
    element: <CondicionesContratacion />,
  },
  {
    path: "/pedido/confirmado",
    element: <PedidoConfirmado />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
