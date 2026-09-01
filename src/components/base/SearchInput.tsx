import { useEffect, useMemo, useRef, useState } from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
}

export default function SearchInput({ value, onChange, suggestions = [], placeholder, className = '' }: SearchInputProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const s of suggestions) {
      const norm = s.trim();
      if (!norm) continue;
      const key = norm.toLowerCase();
      if (key === q || seen.has(key) || !key.includes(q)) continue;
      seen.add(key);
      result.push(norm);
      if (result.length >= 6) break;
    }
    return result;
  }, [value, suggestions]);

  useEffect(() => {
    setHighlighted(0);
  }, [matches.length, value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const showDropdown = open && matches.length > 0;

  const selectSuggestion = (s: string) => {
    onChange(s);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm pointer-events-none"></i>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            return;
          }
          if (!showDropdown) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlighted((h) => (h + 1) % matches.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlighted((h) => (h - 1 + matches.length) % matches.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            selectSuggestion(matches[highlighted]);
          }
        }}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2 bg-background-50 border border-background-200/70 rounded-full text-sm focus:outline-none focus:border-foreground-300/60"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          aria-label="Borrar búsqueda"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-foreground-400 hover:text-foreground-700 hover:bg-background-200/70 transition-colors"
        >
          <i className="ri-close-line text-sm"></i>
        </button>
      )}
      {showDropdown && (
        <ul className="absolute z-20 top-full left-0 right-0 mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-background-200/70 bg-background-50 shadow-card-hover py-1 animate-fadeIn">
          {matches.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(s)}
                onMouseEnter={() => setHighlighted(i)}
                className={`w-full text-left px-3 py-1.5 text-sm truncate ${
                  i === highlighted ? 'bg-primary-50 text-primary-700' : 'text-foreground-700 hover:bg-background-100'
                }`}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
