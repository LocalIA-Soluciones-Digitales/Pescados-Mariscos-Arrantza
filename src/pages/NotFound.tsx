import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

export default function NotFound() {
  const location = useLocation();

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, follow";
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  return (
    <div className="relative flex flex-col items-center justify-center h-screen text-center px-4">
      <span className="absolute bottom-0 text-9xl md:text-[12rem] font-black text-gray-50 select-none pointer-events-none z-0" aria-hidden="true">
        404
      </span>
      <div className="relative z-10">
        <h1 className="text-xl md:text-2xl font-semibold mt-6">Página no encontrada</h1>
        <p className="mt-2 text-base text-gray-400 font-mono">{location.pathname}</p>
        <p className="mt-4 text-lg md:text-xl text-gray-500">
          Esta página no existe o se ha movido.{" "}
          <Link to="/" className="underline hover:text-gray-700">Volver al inicio</Link>
        </p>
      </div>
    </div>
  );
}