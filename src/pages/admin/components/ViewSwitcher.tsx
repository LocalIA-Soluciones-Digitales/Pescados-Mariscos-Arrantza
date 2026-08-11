import { useEffect, useRef, useState } from 'react';

type ViewSwitch = { label: string; onClick: () => void };

export default function ViewSwitcher({ current, viewSwitch }: { current: string; viewSwitch: ViewSwitch }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 rounded-full text-xs font-medium bg-background-100 border border-background-200/70 text-foreground-600 hover:bg-background-200/70 transition-colors whitespace-nowrap"
      >
        {current}
        <i className={`ri-arrow-down-s-line text-sm transition-transform ${open ? 'rotate-180' : ''}`}></i>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-48 bg-background-50 border border-background-200/70 rounded-lg shadow-lg py-1 z-30">
          <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground-950">
            <i className="ri-check-line text-primary-500 text-sm"></i>
            {current}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              viewSwitch.onClick();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground-500 hover:bg-background-100 hover:text-foreground-950 transition-colors"
          >
            <span className="w-3.5 flex-shrink-0"></span>
            {viewSwitch.label}
          </button>
        </div>
      )}
    </div>
  );
}
