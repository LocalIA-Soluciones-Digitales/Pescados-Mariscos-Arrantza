import { ORIGEN_COLORS, ORIGEN_LABELS, type Origen } from '@/types/origen';

// Etiqueta de color consistente para distinguir Pescadería I / II de un
// vistazo, reutilizada en Ventas y en Caja.
export default function OrigenBadge({ origen, className = '' }: { origen: Origen; className?: string }) {
  const c = ORIGEN_COLORS[origen];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${c.bg} ${c.text} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></span>
      {ORIGEN_LABELS[origen]}
    </span>
  );
}
