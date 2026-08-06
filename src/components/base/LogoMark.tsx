interface LogoMarkProps {
  className?: string;
}

// Fish-and-anchor emblem — the Arrantza brand mark, redrawn as a single-color
// line icon so it can inherit `currentColor` for the navbar's light/dark states.
export default function LogoMark({ className }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 100 120"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        {/* Rope ring */}
        <circle cx="50" cy="12" r="6" />
        <line x1="50" y1="18" x2="50" y2="28" />

        {/* Fish */}
        <path d="M14 54 C21 36, 42 27, 58 29 C74 31, 82 39, 87 45 L99 52 L87 61 C81 68, 60 78, 39 78 C25 78, 17 68, 14 54 Z" />
        <circle cx="25" cy="48" r="2.5" fill="currentColor" stroke="none" />
        <path d="M13 57 Q7 60 12 64" />

        {/* Anchor */}
        <line x1="50" y1="78" x2="50" y2="104" />
        <line x1="34" y1="90" x2="66" y2="90" />
        <path d="M50 104 C34 104, 22 96, 20 82" />
        <path d="M50 104 C66 104, 78 96, 80 82" />
      </g>
    </svg>
  );
}
