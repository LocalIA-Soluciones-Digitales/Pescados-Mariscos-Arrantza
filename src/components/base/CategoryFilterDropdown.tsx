import { useEffect, useRef, useState } from 'react';
import type { CategoriaFiltro, ProductoCategoria } from '@/types/producto';

interface CategoryFilterOption {
  value: CategoriaFiltro;
  label: string;
  tipo: 'categoria' | 'subcategoria';
  parent?: ProductoCategoria;
}

interface CategoryFilterDropdownProps {
  categorias: CategoryFilterOption[];
  counts: Record<string, number>;
  value: CategoriaFiltro;
  onChange: (value: CategoriaFiltro) => void;
  className?: string;
}

function Chip({
  label,
  count,
  active,
  small,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  small?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors ${
        small ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-1.5 text-xs'
      } ${active ? 'bg-primary-500 text-background-50' : 'bg-background-100 text-foreground-500 hover:text-foreground-950 hover:bg-background-200/70'}`}
    >
      {label}
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
  const todos = categorias.find((c) => c.value === 'todos');
  const pescado = categorias.find((c) => c.value === 'pescado');
  const marisco = categorias.find((c) => c.value === 'marisco');
  const otras = categorias.filter((c) => c.tipo === 'categoria' && !['todos', 'pescado', 'marisco'].includes(c.value as string));
  const subPescado = categorias.filter((c) => c.tipo === 'subcategoria' && c.parent === 'pescado');
  const subMarisco = categorias.filter((c) => c.tipo === 'subcategoria' && c.parent === 'marisco');

  const elegir = (v: CategoriaFiltro) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative flex-shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
          open || value !== 'todos'
            ? 'bg-primary-500 text-background-50'
            : 'bg-background-50 text-foreground-500 border border-background-200/70 hover:bg-background-200/70'
        }`}
      >
        <i className="ri-filter-3-line text-sm"></i>
        {seleccionado?.label ?? 'Todos'}
        <span
          className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] leading-none ${
            open || value !== 'todos' ? 'bg-background-50/20 text-background-50' : 'bg-background-200/60 text-foreground-400'
          }`}
        >
          {counts[value] ?? 0}
        </span>
        <i className={`ri-arrow-down-s-line text-sm transition-transform ${open ? 'rotate-180' : ''}`}></i>
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 mt-2 w-[min(90vw,26rem)] max-h-[70vh] overflow-y-auto rounded-2xl border border-background-200/70 bg-background-50 shadow-[0_12px_32px_rgba(0,0,0,0.14)] p-3 animate-fadeIn">
          <div className="flex items-center justify-between mb-2 px-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground-400">Categorías</span>
            {value !== 'todos' && (
              <button
                type="button"
                onClick={() => elegir('todos')}
                className="text-[11px] font-medium text-accent-600 hover:text-accent-700"
              >
                Quitar filtro
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {todos && <Chip label={todos.label} count={counts[todos.value] ?? 0} active={value === todos.value} onClick={() => elegir(todos.value)} />}
            {otras.map((c) => (
              <Chip key={c.value} label={c.label} count={counts[c.value] ?? 0} active={value === c.value} onClick={() => elegir(c.value)} />
            ))}
          </div>

          {pescado && (
            <div className="mt-2.5 pl-0.5 border-l-2 border-background-200/70">
              <div className="pl-2.5 flex flex-wrap gap-1.5">
                <Chip
                  label={pescado.label}
                  count={counts[pescado.value] ?? 0}
                  active={value === pescado.value}
                  onClick={() => elegir(pescado.value)}
                />
              </div>
              {subPescado.length > 0 && (
                <div className="pl-6 mt-1.5 flex flex-wrap gap-1.5">
                  {subPescado.map((c) => (
                    <Chip key={c.value} label={c.label} count={counts[c.value] ?? 0} active={value === c.value} small onClick={() => elegir(c.value)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {marisco && (
            <div className="mt-2.5 pl-0.5 border-l-2 border-background-200/70">
              <div className="pl-2.5 flex flex-wrap gap-1.5">
                <Chip
                  label={marisco.label}
                  count={counts[marisco.value] ?? 0}
                  active={value === marisco.value}
                  onClick={() => elegir(marisco.value)}
                />
              </div>
              {subMarisco.length > 0 && (
                <div className="pl-6 mt-1.5 flex flex-wrap gap-1.5">
                  {subMarisco.map((c) => (
                    <Chip key={c.value} label={c.label} count={counts[c.value] ?? 0} active={value === c.value} small onClick={() => elegir(c.value)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
