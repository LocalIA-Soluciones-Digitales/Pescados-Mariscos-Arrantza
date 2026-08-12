import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import Productos from "../pages/productos/page";
import Profesionales from "../pages/profesionales/page";
import Admin from "../pages/admin/page";
import AdminResetPassword from "../pages/admin/components/AdminResetPassword";
import AvisoLegal from "../pages/legal/AvisoLegal";
import Cookies from "../pages/legal/Cookies";
import NewsletterAction from "../pages/newsletter/NewsletterAction";

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
    path: "/profesionales",
    element: <Profesionales />,
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
    path: "/newsletter/confirmar",
    element: <NewsletterAction mode="confirmar" />,
  },
  {
    path: "/newsletter/baja",
    element: <NewsletterAction mode="baja" />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;