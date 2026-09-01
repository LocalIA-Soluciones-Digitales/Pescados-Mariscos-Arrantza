import { useEffect, useRef, useState } from 'react';
import type { CategoriaFiltro } from '@/types/producto';

interface CategoryFilterOption {
  value: CategoriaFiltro;
  label: string;
  tipo: 'categoria' | 'subcategoria';
}

interface CategoryFilterDropdownProps {
  categorias: CategoryFilterOption[];
  counts: Record<string, number>;
  value: CategoriaFiltro;
  onChange: (value: CategoriaFiltro) => void;
  className?: string;
}

function Pill({
  option,
  active,
  count,
  onClick,
}: {
  option: CategoryFilterOption;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
        active ? 'bg-primary-500 text-background-50' : 'bg-background-100 text-foreground-600 hover:bg-background-200/70'
      }`}
    >
      {option.label}
      <span
        className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] leading-none ${
          active ? 'bg-background-50/20 text-background-50' : 'bg-background-200/60 text-foreground-400'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export default function CategoryFilterDropdown({ categorias, counts, value, onChange, className = '' }: CategoryFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const seleccionado = categorias.find((c) => c.value === value);
  const principales = categorias.filter((c) => c.tipo === 'categoria');
  const subcategorias = categorias.filter((c) => c.tipo === 'subcategoria');

  const elegir = (v: CategoriaFiltro) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative flex-shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 pl-3.5 pr-2.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
          open
            ? 'bg-primary-500 text-background-50 border-primary-500'
            : 'bg-background-50 text-foreground-700 border-background-200/70 hover:bg-background-200/70'
        }`}
      >
        {seleccionado?.label ?? 'Todos'}
        <span
          className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] leading-none ${
            open ? 'bg-background-50/20 text-background-50' : 'bg-background-200/60 text-foreground-400'
          }`}
        >
          {counts[value] ?? 0}
        </span>
        <i className={`ri-arrow-down-s-line text-sm transition-transform ${open ? 'rotate-180' : ''}`}></i>
      </button>

      {open && (
        <div className="absolute z-20 top-full left-0 mt-2 w-[min(90vw,26rem)] rounded-xl border border-background-200/70 bg-background-50 shadow-card-hover p-3 animate-fadeIn">
          <div className="flex flex-wrap gap-1.5">
            {principales.map((c) => (
              <Pill key={c.value} option={c} active={value === c.value} count={counts[c.value] ?? 0} onClick={() => elegir(c.value)} />
            ))}
          </div>

          {subcategorias.length > 0 && (
            <>
              <div className="h-px bg-background-200/70 my-2.5" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-400 mb-1.5">Pescado</p>
              <div className="flex flex-wrap gap-1.5">
                {subcategorias.map((c) => (
                  <Pill key={c.value} option={c} active={value === c.value} count={counts[c.value] ?? 0} onClick={() => elegir(c.value)} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
