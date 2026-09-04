import { useEffect, useRef, useState } from 'react';

function isoDeFecha(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// Celdas del mes para la rejilla del calendario: null para los huecos antes
// del día 1 (la semana empieza en lunes, no en domingo).
function celdasDelMes(anio: number, mes: number): (Date | null)[] {
  const primero = new Date(anio, mes, 1);
  const offset = (primero.getDay() + 6) % 7;
  const totalDias = new Date(anio, mes + 1, 0).getDate();
  const celdas: (Date | null)[] = [];
  for (let i = 0; i < offset; i++) celdas.push(null);
  for (let d = 1; d <= totalDias; d++) celdas.push(new Date(anio, mes, d));
  return celdas;
}

// Navegador de día reutilizado en Ventas > Online y Ventas > Tienda: flechas
// para ir día a día, botón "Hoy" para volver rápido, y un calendario propio
// (no el <input type="date"> nativo, poco fiable dentro de webviews
// embebidas) que se abre al pulsar la fecha para saltar a cualquier día.
export default function DiaNavigator({ value, onChange, label }: { value: Date; onChange: (d: Date) => void; label: string }) {
  const [abierto, setAbierto] = useState(false);
  const [mesVisible, setMesVisible] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (abierto) setMesVisible(new Date(value.getFullYear(), value.getMonth(), 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const onClickFuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', onClickFuera);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickFuera);
      document.removeEventListener('keydown', onEscape);
    };
  }, [abierto]);

  const mover = (delta: number) => {
    const d = new Date(value);
    d.setDate(d.getDate() + delta);
    onChange(d);
  };

  const hoyIso = isoDeFecha(new Date());
  const valueIso = isoDeFecha(value);
  const esHoy = valueIso === hoyIso;
  const celdas = celdasDelMes(mesVisible.getFullYear(), mesVisible.getMonth());

  return (
    <div ref={contenedorRef} className="relative flex items-center gap-1.5 flex-shrink-0">
      <button
        type="button"
        onClick={() => mover(-1)}
        className="w-7 h-7 flex items-center justify-center rounded-full border border-background-200/70 bg-background-50 text-foreground-500 hover:bg-background-100"
      >
        <i className="ri-arrow-left-s-line"></i>
      </button>

      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-medium text-foreground-950 hover:bg-background-100 min-w-[130px] justify-center capitalize"
      >
        <i className="ri-calendar-line text-xs text-foreground-400"></i>
        {label}
      </button>

      <button
        type="button"
        onClick={() => mover(1)}
        className="w-7 h-7 flex items-center justify-center rounded-full border border-background-200/70 bg-background-50 text-foreground-500 hover:bg-background-100"
      >
        <i className="ri-arrow-right-s-line"></i>
      </button>

      {!esHoy && (
        <button type="button" onClick={() => onChange(new Date())} className="ml-1 text-xs font-medium text-primary-600 hover:underline whitespace-nowrap">
          Hoy
        </button>
      )}

      {abierto && (
        <div className="absolute z-20 top-full right-0 mt-2 w-64 bg-background-50 border border-background-200/70 rounded-xl shadow-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setMesVisible((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="w-6 h-6 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-100"
            >
              <i className="ri-arrow-left-s-line"></i>
            </button>
            <span className="text-xs font-medium text-foreground-950 capitalize">
              {MESES[mesVisible.getMonth()]} {mesVisible.getFullYear()}
            </span>
            <button
              type="button"
              onClick={() => setMesVisible((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="w-6 h-6 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-100"
            >
              <i className="ri-arrow-right-s-line"></i>
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DIAS_SEMANA.map((d) => (
              <span key={d} className="text-[10px] text-center text-foreground-400 font-medium">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celdas.map((fecha, i) => {
              if (!fecha) return <span key={`vacio-${i}`} />;
              const iso = isoDeFecha(fecha);
              const seleccionado = iso === valueIso;
              const hoyCelda = iso === hoyIso;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    onChange(fecha);
                    setAbierto(false);
                  }}
                  className={`w-7 h-7 flex items-center justify-center rounded-full text-xs transition-colors ${
                    seleccionado
                      ? 'bg-primary-500 text-background-50 font-semibold'
                      : hoyCelda
                        ? 'bg-primary-50 text-primary-600 font-semibold'
                        : 'text-foreground-700 hover:bg-background-100'
                  }`}
                >
                  {fecha.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
