import { useRef, useState, useEffect } from 'react';

interface RollingNumberProps {
  value: string;
  className?: string;
}

export default function RollingNumber({ value, className = '' }: RollingNumberProps) {
  const chars = value.split('');
  const prevRef = useRef(chars);
  const [animating, setAnimating] = useState<Set<number>>(new Set());

  useEffect(() => {
    const prev = prevRef.current;
    const changed = new Set<number>();

    chars.forEach((char, i) => {
      if (i >= prev.length || char !== prev[i]) {
        changed.add(i);
      }
    });

    // Also mark trailing positions that existed before but are now gone (number shortened)
    for (let i = chars.length; i < prev.length; i++) {
      changed.add(i);
    }

    if (changed.size > 0) {
      setAnimating(changed);
      const timer = setTimeout(() => setAnimating(new Set()), 350);
      prevRef.current = chars;
      return () => clearTimeout(timer);
    }

    prevRef.current = chars;
  }, [value]);

  return (
    <span className={`inline-flex ${className}`}>
      {chars.map((char, i) => (
        <span
          key={i}
          className={`inline-block tabular-nums ${
            animating.has(i) ? 'animate-number-roll' : ''
          }`}
          style={char === ' ' ? { width: '0.3em' } : undefined}
        >
          {char}
        </span>
      ))}
      {/* Render invisible placeholders for removed positions so they animate out */}
      {animating.size > 0 &&
        Array.from(animating)
          .filter(i => i >= chars.length)
          .map(i => (
            <span key={`ghost-${i}`} className="inline-block tabular-nums animate-number-roll opacity-0">
              {prevRef.current[i] || ''}
            </span>
          ))}
    </span>
  );
}