import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

interface InfoHintItem {
  icon: string;
  text: string;
}

interface InfoHintProps {
  items: InfoHintItem[];
  className?: string;
  align?: 'left' | 'right';
  /** 'sm' = insignia compacta de 18px, pensada para ir junto a un badge de aviso (pestañas de navegación). */
  size?: 'sm' | 'md';
  /** 'onPrimary' = variante para fondos oscuros (p. ej. la pestaña activa), con blanco translúcido en vez del gris habitual. */
  tone?: 'neutral' | 'onPrimary';
  /** Título del popup (p. ej. el nombre de la pestaña), para dejar claro a qué se refiere cuando el popup queda lejos de su icono. */
  title?: string;
  /** Selector del ancestro (p. ej. la pastilla completa de una pestaña) al que anclar el popup, en vez de al propio icono. Así el popup sale "del campo" de la pestaña entera, no solo del iconito. */
  anchorSelector?: string;
}

export default function InfoHint({ items, className = '', align = 'left', size = 'md', tone = 'neutral', title, anchorSelector }: InfoHintProps) {
  const [open, setOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});
  const [arrowLeft, setArrowLeft] = useState(0);
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
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

  // Posiciona el popup con position:fixed (coordenadas de viewport) en vez de
  // absolute/top-full: así no lo recorta un ancestro con overflow (como la
  // barra de pestañas, que necesita overflow-x-auto para el scroll horizontal
  // y por spec CSS eso también activa el recorte vertical). De paso se
  // reajusta para que siempre quepa dentro de la ventana.
  useLayoutEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const popup = popupRef.current;
    if (!container || !popup) return;

    const margin = 12;
    const gap = 5;
    const reposition = () => {
      // Ancla el popup al campo completo de la pestaña (p. ej. la pastilla
      // "Hoy" entera), no solo al iconito, para que visualmente salga "de"
      // esa pestaña en vez de aparecer como una tarjeta suelta a un lado.
      const anchorEl = (anchorSelector ? container.closest(anchorSelector) : null) as HTMLElement | null;
      const iconRect = container.getBoundingClientRect();
      const anchorRect = anchorEl ? anchorEl.getBoundingClientRect() : iconRect;
      const width = popup.offsetWidth;
      const height = popup.offsetHeight;

      let left = align === 'right' ? anchorRect.right - width : anchorRect.left;
      left = Math.min(left, window.innerWidth - margin - width);
      left = Math.max(left, margin);

      let top = anchorRect.bottom + gap;
      let placement: 'bottom' | 'top' = 'bottom';
      if (top + height > window.innerHeight - margin) {
        top = anchorRect.top - height - gap;
        placement = 'top';
      }

      setPopupStyle({ position: 'fixed', top: `${top}px`, left: `${left}px` });
      setPlacement(placement);
      const iconCenter = iconRect.left + iconRect.width / 2;
      setArrowLeft(Math.min(Math.max(iconCenter - left, 16), width - 16));
    };

    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, align, anchorSelector]);

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Cómo funciona"
        className={`flex items-center justify-center rounded-full transition-colors flex-shrink-0 ${
          size === 'sm' ? 'w-[18px] h-[18px] text-xs' : 'w-6 h-6 text-base'
        } ${
          tone === 'onPrimary'
            ? open
              ? 'bg-background-50/25 text-background-50'
              : 'text-background-50/55 hover:text-background-50 hover:bg-background-50/15'
            : open
              ? 'bg-primary-50 text-primary-600'
              : 'text-foreground-400 hover:text-foreground-700 hover:bg-background-200/70'
        }`}
      >
        <i className="ri-information-line"></i>
      </button>

      {open && (
        <>
          {/* pointer-events-none: es solo un velo visual — el cierre al hacer clic fuera ya lo gestiona
              el listener de pointerdown de arriba, y así no bloquea el clic directo sobre otro icono. */}
          <div className="fixed inset-0 z-40 bg-foreground-950/40 backdrop-blur-[2px] pointer-events-none"></div>
          <div
            ref={popupRef}
            style={popupStyle}
            className="z-50 w-max min-w-[220px] max-w-[min(460px,90vw)] rounded-xl border border-background-200/70 bg-background-50 shadow-xl p-3 animate-fadeIn"
          >
            <span
              style={{ left: arrowLeft }}
              className={`absolute w-3.5 h-3.5 -translate-x-1/2 rotate-45 bg-background-50 ${
                placement === 'bottom' ? '-top-[7px] border-l border-t border-background-200/70' : '-bottom-[7px] border-r border-b border-background-200/70'
              }`}
            ></span>
            {title && <p className="relative text-xs font-semibold text-foreground-950 mb-2 pb-2 border-b border-background-200/70">{title}</p>}
            <ul className="relative space-y-2.5">
              {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-primary-50 text-primary-500 text-sm">
                    <i className={item.icon}></i>
                  </span>
                  <span className="flex-1 min-w-0 text-xs text-foreground-600 leading-snug pt-0.5">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
