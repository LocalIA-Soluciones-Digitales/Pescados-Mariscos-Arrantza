import { useEffect, useMemo, useState } from 'react';
import type { MarcasAlbaran, TipoMarca } from '@/lib/comprasMarcas';

// Un color por cada dato: el mismo en la foto y junto a su casilla del
// formulario, para ver de un vistazo de dónde ha salido cada cosa.
const COLOR_MARCA: Record<TipoMarca, string> = {
  proveedor: '#8b5cf6',
  fecha: '#0ea5e9',
  numero: '#84cc16',
  total: '#dc2626',
  producto: '#f59e0b',
  kg: '#3b82f6',
  precio: '#ec4899',
  importe: '#14b8a6',
  texto: '#94a3b8',
};

const NOMBRE_MARCA: Record<TipoMarca, string> = {
  proveedor: 'Proveedor',
  fecha: 'Fecha',
  numero: 'Nº albarán',
  total: 'Total',
  producto: 'Producto',
  kg: 'Kg',
  precio: '€/kg',
  importe: 'Importe',
  texto: 'Resto del texto',
};

const ORDEN: TipoMarca[] = ['proveedor', 'fecha', 'numero', 'producto', 'kg', 'precio', 'importe', 'total', 'texto'];

export function PuntoColor({ tipo }: { tipo: TipoMarca }) {
  return <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLOR_MARCA[tipo] }} />;
}

// La foto con los recuadros encima. Un único SVG escalado con la imagen:
// unos cientos de rectángulos, sin coste apreciable.
export function FotoMarcada({
  src,
  marcas,
  resto = true,
  foco = null,
}: {
  src: string;
  marcas: MarcasAlbaran | null;
  resto?: boolean;
  foco?: TipoMarca | null;
}) {
  const rects = useMemo(
    () =>
      (marcas?.m ?? [])
        .filter(([k]) => resto || k !== 'texto')
        .map(([k, x, y, w, h], i) => {
          const apagado = foco != null && k !== foco;
          const gris = k === 'texto';
          return (
            <rect
              key={i}
              x={x - 2}
              y={y - 2}
              width={w + 4}
              height={h + 4}
              fill={gris ? 'none' : COLOR_MARCA[k]}
              fillOpacity={apagado ? 0.04 : 0.2}
              stroke={COLOR_MARCA[k]}
              strokeOpacity={apagado ? 0.15 : gris ? 0.6 : 1}
              strokeWidth={gris ? 1 : 2}
              vectorEffect="non-scaling-stroke"
            />
          );
        }),
    [marcas, resto, foco],
  );
  return (
    <div className="relative w-full">
      <img src={src} alt="Foto del albarán" className="block w-full h-auto" />
      {rects.length > 0 && (
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
          {rects}
        </svg>
      )}
    </div>
  );
}

// Pantalla completa: foto ampliable, leyenda que resalta cada dato y, para
// los albaranes antiguos (sin recuadros), el texto leído.
export function VisorAlbaran({
  src,
  marcas,
  texto,
  onClose,
}: {
  src: string;
  marcas: MarcasAlbaran | null;
  texto: string | null;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(false);
  const [resto, setResto] = useState(true);
  const [foco, setFoco] = useState<TipoMarca | null>(null);
  const [verTexto, setVerTexto] = useState(false);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [onClose]);

  const presentes = useMemo(() => new Set(marcas?.m.map(([k]) => k)), [marcas]);
  const chips = ORDEN.filter((k) => k !== 'texto' && presentes.has(k));

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-foreground-950" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 px-4 py-3 text-background-50 flex-shrink-0">
        <h3 className="flex-1 text-sm font-semibold">{marcas ? 'Lo que ha leído' : 'Foto del albarán'}</h3>
        <button
          type="button"
          onClick={() => setZoom((z) => !z)}
          className="h-9 px-3 rounded-full text-xs font-medium bg-background-50/10 hover:bg-background-50/20 inline-flex items-center gap-1.5"
        >
          <i className={zoom ? 'ri-zoom-out-line' : 'ri-zoom-in-line'}></i>
          {zoom ? 'Ajustar' : 'Ampliar'}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="w-9 h-9 rounded-full bg-background-50/10 hover:bg-background-50/20 flex items-center justify-center"
        >
          <i className="ri-close-line text-lg"></i>
        </button>
      </div>

      <div className="flex-1 overflow-auto overscroll-contain">
        {verTexto && texto ? (
          <pre className="m-4 p-3 rounded-xl bg-background-50 text-foreground-700 whitespace-pre-wrap font-mono text-[11px] leading-snug">{texto}</pre>
        ) : (
          <div className={zoom ? 'w-[220%] sm:w-[160%]' : 'w-full max-w-3xl mx-auto'}>
            <FotoMarcada src={src} marcas={marcas} resto={resto} foco={foco} />
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-foreground-950 border-t border-background-50/10">
        {chips.length > 0 && !verTexto && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {chips.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFoco((f) => (f === k ? null : k))}
                className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs font-medium border transition-colors ${
                  foco === k ? 'bg-background-50 text-foreground-950 border-background-50' : 'text-background-50/90 border-background-50/20'
                } ${foco && foco !== k ? 'opacity-50' : ''}`}
              >
                <PuntoColor tipo={k} />
                {NOMBRE_MARCA[k]}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-4 text-xs text-background-50/70">
          {marcas && !verTexto && (
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={resto} onChange={(e) => setResto(e.target.checked)} />
              Ver el resto del texto (gris)
            </label>
          )}
          {texto && (
            <button type="button" onClick={() => setVerTexto((v) => !v)} className="ml-auto underline underline-offset-2">
              {verTexto ? 'Volver a la foto' : 'Ver como texto'}
            </button>
          )}
        </div>
        {!marcas && !verTexto && (
          <p className="text-[11px] text-background-50/50 mt-1">Este albarán se leyó antes de que existieran los recuadros de colores.</p>
        )}
      </div>
    </div>
  );
}
