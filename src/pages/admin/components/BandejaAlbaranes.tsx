// Bandeja de hojas antes de guardar: varias fotos o PDF de golpe, o una foto
// tras otra de un albarán de varias páginas. Cada hoja se lee por separado
// y se agrupan solas por número y proveedor (las páginas de un albarán
// juntas, cada albarán aparte); David puede unir o separar a mano.
import { useMemo, useState } from 'react';
import type { useCompras } from '@/hooks/useCompras';
import type { Producto } from '@/types/producto';
import { leerAlbaran, unificarProveedor, type AlbaranLeido } from '@/lib/comprasOcr';
import { lineasDeCompra, notaQuitadas } from '@/lib/comprasProductos';
import { contrastarListado, notaListado } from '@/lib/comprasListado';
import { calcularMarcas } from '@/lib/comprasMarcas';
import { agruparHojas } from '@/lib/comprasHojas';
import { buscarCoincidencia, confirmarCoincidencia, describirCoincidencia, describirNoCoincide } from '@/lib/comprasCoincidencias';
import { juntarHojas } from '@/lib/comprasBandeja';
import type { Bandeja, HojaBandeja as Hoja } from '@/hooks/useBandeja';

type ComprasDatos = ReturnType<typeof useCompras>;

const hoyISO = () => new Date().toLocaleDateString('sv-SE');
const formatEUR = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }));
function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function BandejaAlbaranes({
  bandeja,
  datos,
  productos,
  onGuardadas,
}: {
  bandeja: Bandeja;
  datos: ComprasDatos;
  productos: Producto[];
  onGuardadas: (ids: string[]) => void;
}) {
  const { hojas, setHojas, aviso, añadir } = bandeja;
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Albaranes repetidos que David quiere guardar igualmente (por la 1ª hoja).
  const [forzadas, setForzadas] = useState<Set<string>>(new Set());

  const conocidos = useMemo(() => datos.compras.map((c) => c.proveedor).filter((p): p is string => !!p), [datos.compras]);

  const grupos = useMemo(() => {
    const unidas = agruparHojas(
      hojas.map((h) => ({ proveedor: h.leido?.proveedor ?? null, numero: h.leido?.numero ?? null, total: h.leido?.total ?? null })),
      hojas.map((h) => h.unida),
    );
    const r: Hoja[][] = [];
    hojas.forEach((h, i) => (unidas[i] && r.length ? r.at(-1)!.push(h) : r.push([h])));
    return r.map((g) => {
      const leidos = g.map((h) => h.leido).filter((l): l is AlbaranLeido => !!l);
      // Listado del gremio: no se guarda (ni gasto ni stock), solo se contrasta.
      const listado = leidos.find((l) => l.clase === 'listado');
      if (listado) {
        const aviso = notaListado(contrastarListado(listado.recibos, datos.compras), listado.fecha);
        return { hojas: g, proveedor: listado.proveedor, numero: null, total: listado.total, lineas: 0, coincide: null, repetida: null, aviso, saltar: true, listado: true };
      }
      const proveedor = unificarProveedor(leidos.find((l) => l.proveedor)?.proveedor ?? null, conocidos);
      const numero = leidos.find((l) => l.numero)?.numero ?? null;
      const total = [...leidos].reverse().find((l) => l.total != null)?.total ?? null;
      // ¿Ya está guardado? El mismo albarán (papel + PDF del email) o dentro
      // de una factura que ya llegó por correo (albarán a mano).
      const coincide = buscarCoincidencia(
        {
          tipo: leidos.some((l) => l.tipo === 'factura') ? 'factura' : 'albaran',
          proveedor,
          numero,
          fecha: leidos.find((l) => l.fecha)?.fecha ?? hoyISO(),
          total,
          albaranes: [...new Set(leidos.flatMap((l) => l.albaranes))],
        },
        datos.compras,
      );
      // Repetida solo si además coinciden productos, precios y total; si
      // no, es otra compra y se guarda con una nota.
      const leido = { total, lineas: leidos.flatMap((l) => l.lineas) };
      const parecida = coincide && coincide.tipo !== 'parcial' && coincide.tipo !== 'posible' ? coincide : null;
      const repetida = parecida && confirmarCoincidencia(parecida, leido) ? parecida : null;
      const aviso = !coincide ? null : parecida && !repetida ? describirNoCoincide(parecida, leido, formatFecha) : describirCoincidencia(coincide, formatFecha);
      return {
        hojas: g,
        proveedor,
        numero,
        total,
        lineas: leidos.reduce((t, l) => t + l.lineas.length, 0),
        coincide,
        repetida,
        aviso,
        saltar: !!repetida && !forzadas.has(g[0].id),
        listado: false,
      };
    });
  }, [hojas, conocidos, datos.compras, forzadas]);

  const leyendo = hojas.filter((h) => !h.leida).length;
  const aGuardar = grupos.filter((g) => !g.saltar);

  const fijar = (id: string, unida: boolean) => setHojas((p) => p.map((h) => (h.id === id ? { ...h, unida } : h)));
  const quitar = (ids: string[]) => setHojas((p) => p.filter((h) => !ids.includes(h.id)));

  const guardar = async () => {
    setError(null);
    const ids: string[] = [];
    try {
      for (const [n, g] of aGuardar.entries()) {
        setGuardando(aGuardar.length > 1 ? `Guardando ${n + 1} de ${aGuardar.length}…` : 'Guardando…');
        const leidas = g.hojas.map((h) => h.leida!);
        const junto = await juntarHojas(leidas);
        const a = leerAlbaran(junto.cajas);
        const proveedor = unificarProveedor(a.proveedor, conocidos);
        const { lineas, quitadas } = lineasDeCompra(a.lineas, proveedor, datos.alias, productos, a.clase === 'gasto');
        const fallo = leidas.find((h) => h.fallo)?.fallo ?? null;
        const c = g.coincide && !g.saltar ? g.coincide : null;
        const compra = await datos.crearCompra({
          tipo: a.tipo,
          albaranes: a.albaranes,
          nota: [c ? g.aviso : null, notaQuitadas(quitadas)].filter(Boolean).join(' ') || null,
          fecha: a.fecha ?? hoyISO(),
          proveedor,
          numero: a.numero,
          total: c?.tipo === 'parcial' ? c.resto : a.total,
          lineas,
          ocr_texto: fallo && !junto.cajas.length ? `No se pudo leer: ${fallo}` : a.texto.join('\n'),
          ocr_marcas: junto.cajas.length ? calcularMarcas(junto.cajas, a, junto.ancho, junto.alto) : null,
          foto: junto.jpeg,
        });
        ids.push(compra.id);
        quitar(g.hojas.map((h) => h.id));
      }
      // Fuera también los repetidos que no se guardan; se quedan solo las
      // hojas añadidas mientras se guardaba.
      quitar(grupos.flatMap((g) => g.hojas.map((h) => h.id)));
      setForzadas(new Set());
      onGuardadas(ids);
    } catch (e) {
      // Lo ya guardado sale de la bandeja; el resto se queda para reintentar.
      setError(e instanceof Error ? e.message : String(e));
      if (ids.length) onGuardadas(ids);
    } finally {
      setGuardando(null);
    }
  };

  if (!hojas.length) return aviso ? <p className="text-xs text-amber-800 bg-amber-50 rounded-xl p-3">{aviso}</p> : null;

  const elegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length) añadir(files);
  };
  const botonCls =
    'inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-xs font-medium border bg-background-50 border-background-200/70 text-foreground-700 hover:bg-background-100 cursor-pointer flex-shrink-0';

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-2xl shadow-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground-950">
          {grupos.length === 1 ? '1 albarán' : `${grupos.length} albaranes`}
          <span className="ml-1.5 text-xs font-normal text-foreground-400">
            · {hojas.length} {hojas.length === 1 ? 'hoja' : 'hojas'}
          </span>
        </h2>
        <button
          type="button"
          disabled={!!guardando}
          onClick={() => confirm('¿Descartar estas hojas sin guardar?') && setHojas([])}
          className="text-xs font-medium text-foreground-400 hover:text-red-600 disabled:opacity-50"
        >
          Descartar
        </button>
      </div>

      {grupos.map((g, gi) => (
        <div key={g.hojas[0].id} className={`rounded-xl border p-3 ${g.saltar ? 'border-amber-300 bg-amber-50/60' : 'border-background-200/70'}`}>
          {gi > 0 && (
            <button
              type="button"
              onClick={() => fijar(g.hojas[0].id, true)}
              className="mb-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:underline"
            >
              <i className="ri-link"></i> Es otra página del albarán de arriba
            </button>
          )}
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground-950 truncate">
                {g.hojas.some((h) => !h.leida) && !g.proveedor ? 'Leyendo…' : g.proveedor || 'Proveedor sin leer'}
              </p>
              <p className="text-xs text-foreground-500">
                {g.numero ? `nº ${g.numero} · ` : ''}
                {g.lineas} {g.lineas === 1 ? 'línea' : 'líneas'} · {formatEUR(g.total)}
              </p>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto mt-2 pb-1">
            {g.hojas.map((h, hi) => (
              <div key={h.id} className="flex-shrink-0 w-[72px]">
                <div className="relative w-[72px] h-24 rounded-lg overflow-hidden border border-background-200/70 bg-background-100">
                  {h.leida?.miniatura && <img src={h.leida.miniatura} alt={`Hoja ${hi + 1}`} className="w-full h-full object-cover object-top" />}
                  {!h.leida && (
                    <span className="absolute inset-0 flex items-center justify-center text-primary-500">
                      <i className="ri-loader-4-line animate-spin text-xl"></i>
                    </span>
                  )}
                  {h.leida?.fallo && (
                    <span title={h.leida.fallo} className="absolute left-1 bottom-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center">
                      <i className="ri-error-warning-line text-xs"></i>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => quitar([h.id])}
                    disabled={!!guardando}
                    aria-label="Quitar hoja"
                    className="absolute right-1 top-1 w-6 h-6 rounded-full bg-foreground-950/60 text-background-50 flex items-center justify-center"
                  >
                    <i className="ri-close-line text-sm"></i>
                  </button>
                </div>
                {hi > 0 ? (
                  <button
                    type="button"
                    onClick={() => fijar(h.id, false)}
                    className="mt-1 w-full text-[10px] font-medium text-foreground-500 hover:text-primary-600"
                    title="Esta hoja es de otro albarán"
                  >
                    <i className="ri-scissors-cut-line"></i> Separar
                  </button>
                ) : (
                  <p className="mt-1 text-center text-[10px] text-foreground-400">Pág. 1</p>
                )}
              </div>
            ))}
          </div>
          {g.repetida && (
            <label className="mt-2 flex items-start gap-2 text-[11px] text-amber-800">
              <input
                type="checkbox"
                checked={!g.saltar}
                onChange={(e) =>
                  setForzadas((p) => {
                    const s = new Set(p);
                    if (e.target.checked) s.add(g.hojas[0].id);
                    else s.delete(g.hojas[0].id);
                    return s;
                  })
                }
                className="mt-0.5"
              />
              <span>
                {describirCoincidencia(g.repetida, formatFecha)} No se guardará otra vez salvo que marques esta casilla.
              </span>
            </label>
          )}
          {g.listado && (
            <p className="mt-2 flex items-start gap-2 text-[11px] text-sky-800">
              <i className="ri-scales-3-line mt-0.5"></i>
              <span>{g.aviso} No se guarda.</span>
            </p>
          )}
          {g.coincide && !g.repetida && (
            <p className="mt-2 flex items-start gap-2 text-[11px] text-amber-800">
              <i className="ri-error-warning-line mt-0.5"></i>
              <span>{g.aviso}</span>
            </p>
          )}
        </div>
      ))}

      {grupos.length === 1 && hojas.length === 1 && !leyendo && (
        <p className="text-[11px] text-foreground-400">¿Tiene más páginas? Haz otra foto y se juntará con esta.</p>
      )}
      {(leyendo > 0 || aviso) && (
        <p className="flex items-start gap-2 text-xs text-foreground-500">
          {leyendo > 0 && <i className="ri-loader-4-line animate-spin text-primary-500 mt-0.5"></i>}
          <span>
            {leyendo > 0 && `Leyendo ${hojas.length - leyendo + 1} de ${hojas.length}. `}
            {aviso}
          </span>
        </p>
      )}
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <label className={botonCls}>
          <i className="ri-camera-line text-sm"></i> Otra página
          <input type="file" accept="image/*" capture="environment" onChange={elegir} className="hidden" />
        </label>
        <label className={botonCls}>
          <i className="ri-attachment-2 text-sm"></i> Más fotos o PDF
          <input type="file" accept="image/*,application/pdf,.pdf" multiple onChange={elegir} className="hidden" />
        </label>
        <button
          type="button"
          disabled={leyendo > 0 || !!guardando || !aGuardar.length}
          onClick={guardar}
          className="flex-1 min-w-[160px] h-10 px-4 rounded-full text-sm font-semibold bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
        >
          <i className="ri-check-line text-base"></i>
          {guardando ?? (leyendo ? 'Leyendo…' : aGuardar.length === 1 ? 'Guardar y revisar' : `Guardar ${aGuardar.length} albaranes`)}
        </button>
      </div>
    </div>
  );
}
