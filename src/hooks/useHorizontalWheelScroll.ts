import { useRef, type WheelEvent } from 'react';

/**
 * Barras de filtros con overflow-x solo responden al scroll horizontal nativo
 * (swipe táctil, trackpad). Un ratón normal solo emite deltaY, así que en
 * escritorio la barra parece "no moverse". Este hook traduce ese deltaY a
 * scrollLeft cuando el contenido realmente desborda horizontalmente.
 */
export function useHorizontalWheelScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  const onWheel = (e: WheelEvent<T>) => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  };

  return { ref, onWheel };
}
