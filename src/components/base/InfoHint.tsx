import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

interface InfoHintItem {
  icon: string;
  text: string;
}

interface InfoHintProps {
  items: InfoHintItem[];
  className?: string;
  align?: 'left' | 'right';
}

export default function InfoHint({ items, className = '', align = 'left' }: InfoHintProps) {
  const [open, setOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Reposiciona el popup para que siempre quepa dentro de la ventana,
  // en vez de fiarse solo de left-0/right-0 (que se corta cuando el botón
  // está cerca del borde de una pantalla ancha de ordenador).
  useLayoutEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const popup = popupRef.current;
    if (!container || !popup) return;

    const margin = 12;
    const reposition = () => {
      const containerRect = container.getBoundingClientRect();
      const width = popup.offsetWidth;
      let left = align === 'right' ? containerRect.width - width : 0;
      const viewportRight = containerRect.left + left + width;
      if (viewportRight > window.innerWidth - margin) {
        left -= viewportRight - (window.innerWidth - margin);
      }
      const viewportLeft = containerRect.left + left;
      if (viewportLeft < margin) {
        left += margin - viewportLeft;
      }
      setPopupStyle({ left: `${left}px`, right: 'auto' });
    };

    reposition();
    window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
  }, [open, align]);

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Cómo funciona"
        className={`w-6 h-6 flex items-center justify-center rounded-full text-sm transition-colors flex-shrink-0 ${
          open ? 'bg-primary-500 text-background-50' : 'bg-background-200/70 text-foreground-400 hover:bg-background-200'
        }`}
      >
        <i className="ri-information-line"></i>
      </button>

      {open && (
        <div
          ref={popupRef}
          style={popupStyle}
          className="absolute z-20 top-full mt-2 w-72 max-w-[85vw] rounded-xl border border-background-200/70 bg-background-50 shadow-card-hover p-3 animate-fadeIn"
        >
          <ul className="space-y-2.5">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-primary-50 text-primary-500 text-sm">
                  <i className={item.icon}></i>
                </span>
                <span className="text-xs text-foreground-600 leading-snug pt-0.5">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
