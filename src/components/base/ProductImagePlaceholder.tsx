// Placeholder mostrado en vez de la <img> cuando un producto aún no tiene foto subida.
// El contenedor padre debe aportar tamaño, bg y overflow (mismo patrón que la <img> real).
export default function ProductImagePlaceholder({ className = '', label = 'Foto próximamente' }: { className?: string; label?: string }) {
  return (
    <div className={`w-full h-full flex flex-col items-center justify-center gap-1 text-foreground-300 ${className}`}>
      <i className="ri-image-line text-2xl"></i>
      <span className="text-[10px] font-medium text-foreground-400">{label}</span>
    </div>
  );
}
