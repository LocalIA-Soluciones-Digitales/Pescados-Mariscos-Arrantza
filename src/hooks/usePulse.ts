import { useEffect, useRef, useState } from 'react';

// Devuelve true durante `durationMs` cada vez que `value` sube respecto al
// render anterior — para resaltar visualmente (p.ej. animate-pulse en una
// insignia) que ha entrado algo nuevo sin que el pescadero tenga que fijarse
// en el número. No se dispara en el primer render (evita el parpadeo al
// cargar la página con pedidos ya pendientes).
export function usePulse(value: number, durationMs = 2500): boolean {
  const [pulsing, setPulsing] = useState(false);
  const prevRef = useRef(value);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current && value > prevRef.current) {
      setPulsing(true);
      const timer = setTimeout(() => setPulsing(false), durationMs);
      prevRef.current = value;
      return () => clearTimeout(timer);
    }
    prevRef.current = value;
    mountedRef.current = true;
  }, [value, durationMs]);

  return pulsing;
}
