import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import Productos from "../pages/productos/page";
import Admin from "../pages/admin/page";
import AvisoLegal from "../pages/legal/AvisoLegal";
import Cookies from "../pages/legal/Cookies";

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
    path: "/admin",
    element: <Admin />,
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
    path: "*",
    element: <NotFound />,
  },
];

export default routes;