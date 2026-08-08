import { useState, useEffect, useCallback } from 'react';

interface UseScrollAnimationOptions {
  threshold?: number;
  rootMargin?: string;
}

export function useScrollAnimation(options: UseScrollAnimationOptions = {}) {
  const { threshold = 0.15, rootMargin = '0px 0px -60px 0px' } = options;
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Callback ref en vez de useRef: si el componente monta el nodo más tarde
  // (p.ej. tras esperar a que carguen datos y renderizar null mientras tanto),
  // useRef + useEffect con deps fijas nunca vuelve a ejecutarse y el observer
  // no llega a crearse. Con callback ref, cada cambio de nodo dispara el efecto.
  const ref = useCallback((node: HTMLDivElement | null) => {
    setElement(node);
  }, []);

  useEffect(() => {
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(element);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [element, threshold, rootMargin]);

  return { ref, isVisible };
}