import { useRef } from 'react';

function isoDeFecha(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Navegador de día reutilizado en Ventas > Online y Ventas > Tienda: flechas
// para ir día a día, botón "Hoy" para volver rápido, y un <input type="date">
// invisible superpuesto a la etiqueta para que un clic sobre la fecha abra el
// calendario nativo del navegador y se pueda saltar directamente a cualquier día.
export default function DiaNavigator({ value, onChange, label }: { value: Date; onChange: (d: Date) => void; label: string }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const mover = (delta: number) => {
    const d = new Date(value);
    d.setDate(d.getDate() + delta);
    onChange(d);
  };

  const esHoy = isoDeFecha(value) === isoDeFecha(new Date());

  const abrirCalendario = () => {
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.focus();
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => mover(-1)}
        className="w-7 h-7 flex items-center justify-center rounded-full border border-background-200/70 bg-background-50 text-foreground-500 hover:bg-background-100"
      >
        <i className="ri-arrow-left-s-line"></i>
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={abrirCalendario}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-medium text-foreground-950 hover:bg-background-100 min-w-[130px] justify-center capitalize"
        >
          <i className="ri-calendar-line text-xs text-foreground-400"></i>
          {label}
        </button>
        <input
          ref={inputRef}
          type="date"
          value={isoDeFecha(value)}
          onChange={(e) => {
            if (!e.target.value) return;
            const [y, m, d] = e.target.value.split('-').map(Number);
            onChange(new Date(y, m - 1, d));
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          tabIndex={-1}
        />
      </div>

      <button
        type="button"
        onClick={() => mover(1)}
        className="w-7 h-7 flex items-center justify-center rounded-full border border-background-200/70 bg-background-50 text-foreground-500 hover:bg-background-100"
      >
        <i className="ri-arrow-right-s-line"></i>
      </button>

      {!esHoy && (
        <button type="button" onClick={() => onChange(new Date())} className="ml-1 text-xs font-medium text-primary-600 hover:underline">
          Hoy
        </button>
      )}
    </div>
  );
}
