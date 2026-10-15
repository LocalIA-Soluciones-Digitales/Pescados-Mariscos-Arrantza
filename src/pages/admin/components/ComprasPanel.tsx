import { useEffect, useMemo, useState } from 'react';
import type { useCompras } from '@/hooks/useCompras';
import type { Compra, CompraLinea } from '@/types/compra';
import type { Producto } from '@/types/producto';
import { leerAlbaran, normalizarCompra, sumaLineas, unificarProveedor, type OcrCaja } from '@/lib/comprasOcr';
import { leerDictado, NO_PRODUCTO, sugerirProducto } from '@/lib/comprasProductos';
import { enderezar, leerTextoFoto, prepararFoto } from '@/lib/comprasFoto';
import { esPdf, prepararPdf } from '@/lib/comprasPdf';

type ComprasDatos = ReturnType<typeof useCompras>;

const inputCls =
  'w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60';

function hoyISO(): string {
  return new Date().toLocaleDateString('sv-SE');
}

function formatEUR(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

const aTexto = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));
const aNum = (s: string): number | null => {
  const n = Number(s.trim().replace(/\s/g, '').replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(n) ? null : n;
};

// Reconocimiento de voz del propio navegador (Chrome/Android, Safari/iOS):
// gratis, sin instalar nada. El audio lo procesa Google o Apple, no se
// guarda en ningún sitio nuestro.
interface Reconocedor {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
}
const ReconocedorVoz = (
  window as unknown as { SpeechRecognition?: new () => Reconocedor; webkitSpeechRecognition?: new () => Reconocedor }
).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Reconocedor }).webkitSpeechRecognition;

const MICRO_BLOQUEADO =
  'El micrófono está bloqueado para esta web. Actívalo y vuelve a pulsar «Dictar»: en el iPhone, Ajustes › Safari › Micrófono › Preguntar (o «aA» en la barra de dirección › Ajustes del sitio web › Micrófono); en Chrome, el candado junto a la dirección › Micrófono › Permitir.';

// Si el permiso se rechazó antes, el reconocedor falla sin volver a
// preguntar. Pedir el micrófono a mano hace que el navegador lo pregunte
// otra vez siempre que pueda; si sigue bloqueado, se explica cómo activarlo.
async function pedirMicrofono(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch (e) {
    const nombre = e instanceof DOMException ? e.name : '';
    if (nombre === 'NotAllowedError' || nombre === 'SecurityError') throw new Error(MICRO_BLOQUEADO);
    if (nombre === 'NotFoundError') throw new Error('No se encuentra ningún micrófono.');
    throw e;
  }
}

async function escucharFrase(): Promise<string> {
  if (!ReconocedorVoz) throw new Error('Este navegador no permite dictar.');
  await pedirMicrofono();
  return new Promise((resolve, reject) => {
    if (!ReconocedorVoz) return reject(new Error('Este navegador no permite dictar.'));
    const r = new ReconocedorVoz();
    r.lang = 'es-ES';
    r.interimResults = false;
    r.maxAlternatives = 1;
    let texto = '';
    r.onresult = (e) => {
      texto = e.results[0]?.[0]?.transcript ?? '';
    };
    r.onerror = (e) =>
      reject(
        new Error(
          e.error === 'not-allowed' || e.error === 'service-not-allowed'
            ? MICRO_BLOQUEADO
            : e.error === 'no-speech'
              ? 'No se ha oído nada, prueba otra vez.'
              : e.error === 'network'
                ? 'Sin conexión para dictar, prueba otra vez.'
                : 'No se ha entendido, prueba otra vez.',
        ),
      );
    r.onend = () => (texto ? resolve(texto) : reject(new Error('No se ha oído nada, prueba otra vez.')));
    r.start();
  });
}

// El total del albarán lleva IVA y recargo de equivalencia (10 % + 1,4 %
// en pescado, 21 % + 5,2 % en transporte…) y la suma de líneas no: se da
// por bueno si el total queda entre la suma y la suma + 27 %.
function impuestosTotal(suma: number, total: number | null): number | null {
  if (total == null || suma <= 0) return null;
  const pct = (total / suma - 1) * 100;
  return pct >= -0.1 && pct <= 27 ? Math.max(0, pct) : null;
}

/* ------------------------------------------------------------------ */
/*  Botón de cámara                                                    */
/* ------------------------------------------------------------------ */
function Camara({ onFoto, ocupado }: { onFoto: (f: File) => void; ocupado: boolean }) {
  const elegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onFoto(file);
  };
  return (
    <div className="bg-background-50 border border-background-200/70 rounded-2xl shadow-card p-4">
      <label
        className={`flex items-center justify-center gap-3 w-full h-20 rounded-xl text-base font-semibold transition-colors ${
          ocupado ? 'bg-background-200 text-foreground-400 pointer-events-none' : 'bg-primary-500 text-background-50 hover:bg-primary-600 cursor-pointer'
        }`}
      >
        <i className="ri-camera-fill text-3xl"></i>
        Foto del albarán
        <input type="file" accept="image/*" capture="environment" onChange={elegir} disabled={ocupado} className="hidden" />
      </label>
      <div className="flex items-center justify-between gap-3 mt-3">
        <p className="text-[11px] text-foreground-400 leading-snug">
          Apoyado en algo plano, entero y ocupando casi toda la pantalla. Sin flash.
        </p>
        <label
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border flex-shrink-0 ${
            ocupado ? 'text-foreground-300 border-background-200 pointer-events-none' : 'text-foreground-600 border-background-200/70 hover:bg-background-100 cursor-pointer'
          }`}
        >
          <i className="ri-attachment-2"></i>
          Galería o PDF
          <input type="file" accept="image/*,application/pdf,.pdf" onChange={elegir} disabled={ocupado} className="hidden" />
        </label>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tarjeta de la lista                                                */
/* ------------------------------------------------------------------ */
function CompraCard({ compra, onAbrir }: { compra: Compra; onAbrir: () => void }) {
  const estilo =
    compra.estado === 'pendiente'
      ? 'bg-amber-100/80 text-amber-700'
      : compra.estado === 'confirmada'
        ? 'bg-emerald-100/80 text-emerald-700'
        : 'bg-foreground-200/70 text-foreground-500';
  const etiqueta = compra.estado === 'pendiente' ? 'Por revisar' : compra.estado === 'confirmada' ? 'Confirmado' : 'Anulado';
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="w-full text-left bg-background-50 border border-background-200/70 rounded-xl shadow-card hover:shadow-card-hover transition-shadow p-3 flex items-center gap-3"
    >
      <div className="w-10 h-10 rounded-lg bg-background-100 flex items-center justify-center flex-shrink-0 text-foreground-400">
        <i className="ri-file-list-3-line text-xl"></i>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${estilo}`}>{etiqueta}</span>
          <span className="text-[11px] text-foreground-400">{formatFecha(compra.fecha)}</span>
        </div>
        <p className="text-sm font-semibold text-foreground-950 truncate mt-0.5">{compra.proveedor || 'Proveedor sin leer'}</p>
        <p className="text-xs text-foreground-500">
          {compra.lineas.length} {compra.lineas.length === 1 ? 'línea' : 'líneas'}
          {compra.numero && <> · nº {compra.numero}</>}
        </p>
      </div>
      <span className="text-sm font-semibold text-foreground-950 flex-shrink-0">{formatEUR(compra.total)}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Revisión de un albarán                                             */
/* ------------------------------------------------------------------ */
type LineaForm = { texto: string; kg: string; precio: string; importe: string; producto_id: string; sumar_stock: boolean };

function CompraEditor({
  compra,
  datos,
  productos,
  onClose,
}: {
  compra: Compra;
  datos: ComprasDatos;
  productos: Producto[];
  onClose: () => void;
}) {
  const editable = compra.estado === 'pendiente';
  const [proveedor, setProveedor] = useState(compra.proveedor ?? '');
  const [fecha, setFecha] = useState(compra.fecha);
  const [numero, setNumero] = useState(compra.numero ?? '');
  const [total, setTotal] = useState(aTexto(compra.total));
  const [lineas, setLineas] = useState<LineaForm[]>(() =>
    compra.lineas.map((l) => ({
      texto: l.texto,
      kg: aTexto(l.kg),
      precio: aTexto(l.precio),
      importe: aTexto(l.importe),
      producto_id: l.producto_id ?? '',
      sumar_stock: l.sumar_stock,
    })),
  );
  const [foto, setFoto] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { urlFoto } = datos;
  useEffect(() => {
    if (compra.foto_path) urlFoto(compra.foto_path).then(setFoto);
  }, [compra.foto_path, urlFoto]);

  const productosOrdenados = useMemo(
    () => [...productos].sort((a, b) => a.nombre_es.localeCompare(b.nombre_es, 'es')),
    [productos],
  );
  const proveedores = useMemo(
    () => Array.from(new Set(datos.compras.map((c) => c.proveedor).filter((p): p is string => !!p))),
    [datos.compras],
  );

  const lineasDatos: CompraLinea[] = lineas.map((l) => ({
    texto: l.texto.trim(),
    kg: aNum(l.kg),
    precio: aNum(l.precio),
    importe: aNum(l.importe),
    producto_id: l.producto_id || null,
    sumar_stock: l.sumar_stock,
  }));
  const suma = sumaLineas(lineasDatos);
  const totalNum = aNum(total);
  const impuestos = impuestosTotal(suma, totalNum);
  const cuadra = impuestos != null;
  const alStock = lineasDatos.filter((l) => l.producto_id && l.sumar_stock && (l.kg ?? 0) > 0);

  const cambiarLinea = (i: number, patch: Partial<LineaForm>) =>
    setLineas((prev) =>
      prev.map((l, k) => {
        if (k !== i) return l;
        const nueva = { ...l, ...patch };
        // Al tocar kg o €/kg se recalcula el importe; al tocar el importe, el €/kg.
        const [kg, precio, importe] = [aNum(nueva.kg), aNum(nueva.precio), aNum(nueva.importe)];
        if (('kg' in patch || 'precio' in patch) && kg != null && precio != null) nueva.importe = aTexto(Math.round(kg * precio * 100) / 100);
        else if ('importe' in patch && kg && importe != null) nueva.precio = aTexto(Math.round((importe / kg) * 100) / 100);
        return nueva;
      }),
    );

  const sugerir = (texto: string) => sugerirProducto(texto, proveedor, datos.alias, productos);

  // Al escribir o corregir el nombre de una línea sin producto, se propone uno.
  const cambiarTexto = (i: number, texto: string) => {
    const actual = lineas[i];
    const antes = sugerir(actual.texto);
    const libre = !actual.producto_id || actual.producto_id === antes?.id;
    cambiarLinea(i, libre ? { texto, producto_id: sugerir(texto)?.id ?? '' } : { texto });
  };

  // Para los albaranes escritos a mano: «rape 4,64 a 21,50» → una línea.
  const [escuchando, setEscuchando] = useState(false);
  const dictar = async () => {
    setError(null);
    setEscuchando(true);
    try {
      const d = leerDictado(await escucharFrase());
      const productoId = sugerir(d.texto)?.id ?? '';
      setLineas((p) => {
        // Si ese producto ya está sin kg (copiado de la última compra), se
        // rellena esa línea en vez de añadir otra; si no se dijo el precio,
        // se queda el de la última vez.
        const i = p.findIndex(
          (l) => !l.kg.trim() && ((productoId && l.producto_id === productoId) || normalizarCompra(l.texto) === normalizarCompra(d.texto)),
        );
        const previa = i >= 0 ? p[i] : null;
        const precio = d.precio ?? aNum(previa?.precio ?? '');
        const importe = d.kg != null && precio != null ? Math.round(d.kg * precio * 100) / 100 : null;
        const nueva: LineaForm = {
          texto: previa?.texto || d.texto,
          kg: aTexto(d.kg),
          precio: aTexto(precio),
          importe: aTexto(importe),
          producto_id: previa?.producto_id || productoId,
          sumar_stock: previa?.sumar_stock ?? !NO_PRODUCTO.test(d.texto),
        };
        return previa ? p.map((l, k) => (k === i ? nueva : l)) : [...p, nueva];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEscuchando(false);
    }
  };

  // Los proveedores de siempre suelen traer lo mismo: se copian los
  // productos de su última compra confirmada y solo hay que poner kg y precio.
  const anterior = useMemo(() => {
    const p = normalizarCompra(proveedor);
    if (!p) return null;
    return (
      datos.compras
        .filter((c) => c.id !== compra.id && c.estado === 'confirmada' && normalizarCompra(c.proveedor) === p && c.lineas.length)
        .sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null
    );
  }, [datos.compras, proveedor, compra.id]);
  const copiarAnterior = () => {
    if (!anterior) return;
    const ya = new Set(lineas.map((l) => l.producto_id).filter(Boolean));
    setLineas((p) => [
      ...p,
      ...anterior.lineas
        .filter((l) => !l.producto_id || !ya.has(l.producto_id))
        .map((l) => ({ texto: l.texto, kg: '', precio: aTexto(l.precio), importe: '', producto_id: l.producto_id ?? '', sumar_stock: l.sumar_stock })),
    ]);
  };

  const datosCompra = () => ({
    fecha,
    proveedor: proveedor.trim() || null,
    numero: numero.trim() || null,
    total: totalNum,
    lineas: lineasDatos,
  });

  const ejecutar = async (accion: () => Promise<void>) => {
    setTrabajando(true);
    setError(null);
    try {
      await accion();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrabajando(false);
    }
  };

  const confirmar = () => {
    if (!totalNum || totalNum <= 0) {
      setError('Falta el total del albarán (lo que se ha pagado).');
      return;
    }
    const kg = alStock.reduce((t, l) => t + (l.kg ?? 0), 0);
    const msg =
      `Se apuntará un gasto de ${formatEUR(totalNum)} en Contabilidad` +
      (alStock.length ? ` y se sumarán ${aTexto(Math.round(kg * 100) / 100)} kg al stock de ${alStock.length} producto(s).` : '.') +
      (cuadra ? '' : '\n\nOjo: la suma de las líneas no cuadra con el total.');
    if (!confirm(msg)) return;
    ejecutar(() => datos.confirmarCompra(compra.id, datosCompra()));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-foreground-950/40 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full sm:max-w-[640px] max-h-[94vh] sm:max-h-[90vh] bg-background-50 rounded-t-2xl sm:rounded-lg border border-background-200/70 shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-background-200/70 flex-shrink-0">
          <h2 className="text-base font-heading font-semibold text-foreground-950">
            {editable ? 'Revisar albarán' : compra.estado === 'confirmada' ? 'Albarán confirmado' : 'Albarán anulado'}
          </h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-100 hover:text-foreground-950">
            <i className="ri-close-line"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex gap-4">
            <a
              href={foto ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="w-24 h-32 rounded-lg overflow-hidden bg-background-100 border border-background-200/70 flex-shrink-0 flex items-center justify-center text-foreground-300"
              title="Ver la foto entera"
            >
              {foto ? <img src={foto} alt="Foto del albarán" className="w-full h-full object-cover" /> : <i className="ri-image-line text-2xl"></i>}
            </a>
            <div className="flex-1 min-w-0 space-y-2">
              <input
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                list="compras-proveedores"
                placeholder="Proveedor"
                disabled={!editable}
                className={inputCls}
              />
              <datalist id="compras-proveedores">
                {proveedores.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={!editable} className={inputCls} />
                <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Nº albarán" disabled={!editable} className={inputCls} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-foreground-500 flex-shrink-0">Total pagado</label>
                <input
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  disabled={!editable}
                  className={`${inputCls} text-right font-semibold`}
                />
                <span className="text-sm text-foreground-500">€</span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-400">Líneas del albarán</h3>
              {editable && (
                <button
                  type="button"
                  onClick={() => setLineas((p) => [...p, { texto: '', kg: '', precio: '', importe: '', producto_id: '', sumar_stock: true }])}
                  className="text-xs font-medium text-primary-600 hover:text-primary-700"
                >
                  <i className="ri-add-line"></i> Añadir línea
                </button>
              )}
            </div>
            {editable && (ReconocedorVoz || anterior) && (
              <div className="flex flex-wrap gap-2 mb-2">
                {ReconocedorVoz && (
                  <button
                    type="button"
                    onClick={dictar}
                    disabled={escuchando}
                    className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-medium border ${
                      escuchando ? 'bg-red-50 border-red-200 text-red-600 animate-pulse' : 'bg-background-50 border-background-200/70 text-foreground-600 hover:bg-background-100'
                    }`}
                  >
                    <i className="ri-mic-fill"></i>
                    {escuchando ? 'Escuchando… di «rape 4,64 a 21,50»' : 'Dictar línea'}
                  </button>
                )}
                {anterior && (
                  <button
                    type="button"
                    onClick={copiarAnterior}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-medium border bg-background-50 border-background-200/70 text-foreground-600 hover:bg-background-100"
                  >
                    <i className="ri-history-line"></i>
                    Igual que el {formatFecha(anterior.fecha)}
                  </button>
                )}
              </div>
            )}
            {lineas.length === 0 && (
              <p className="text-xs text-foreground-400 bg-background-100 rounded-lg p-3">
                No se ha leído ninguna línea de producto (¿escrito a mano?). Díctalas con el micrófono, cópialas de la última compra
                a este proveedor o añádelas a mano. También puedes confirmar solo el gasto.
              </p>
            )}
            <div className="space-y-2">
              {lineas.map((l, i) => {
                const d = lineasDatos[i];
                const ok = d.kg != null && d.precio != null && d.importe != null && Math.abs(d.kg * d.precio - d.importe) <= 0.06;
                const s = d.producto_id ? sugerir(l.texto) : null;
                const motivo = s && s.id === d.producto_id ? s.motivo : null;
                return (
                  <div key={i} className={`rounded-xl border p-2.5 ${ok ? 'border-background-200/70' : 'border-amber-300 bg-amber-50/50'}`}>
                    <div className="flex items-center gap-2">
                      <i className={`${ok ? 'ri-checkbox-circle-fill text-emerald-600' : 'ri-error-warning-fill text-amber-500'} text-base flex-shrink-0`}></i>
                      <input
                        value={l.texto}
                        onChange={(e) => cambiarTexto(i, e.target.value)}
                        placeholder="Producto (como viene en el albarán)"
                        disabled={!editable}
                        className="flex-1 min-w-0 bg-transparent text-sm font-medium text-foreground-950 focus:outline-none"
                      />
                      {editable && (
                        <button
                          type="button"
                          onClick={() => setLineas((p) => p.filter((_, k) => k !== i))}
                          aria-label="Quitar línea"
                          className="w-7 h-7 flex items-center justify-center rounded-full text-foreground-300 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                        >
                          <i className="ri-delete-bin-line text-sm"></i>
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {(
                        [
                          ['kg', 'Kg'],
                          ['precio', '€/kg'],
                          ['importe', 'Importe €'],
                        ] as const
                      ).map(([campo, etiqueta]) => (
                        <label key={campo} className="block">
                          <span className="block text-[10px] text-foreground-400 mb-0.5">{etiqueta}</span>
                          <input
                            value={l[campo]}
                            onChange={(e) => cambiarLinea(i, { [campo]: e.target.value })}
                            inputMode="decimal"
                            disabled={!editable}
                            className="w-full px-2 py-1.5 bg-background-100 border border-background-200/70 rounded-lg text-sm text-right focus:outline-none focus:border-foreground-300/60"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <select
                        value={l.producto_id}
                        onChange={(e) => cambiarLinea(i, { producto_id: e.target.value })}
                        disabled={!editable}
                        className="flex-1 min-w-0 px-2 py-1.5 bg-background-100 border border-background-200/70 rounded-lg text-xs focus:outline-none"
                      >
                        <option value="">— Sin producto (no suma stock) —</option>
                        {productosOrdenados.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre_es}
                          </option>
                        ))}
                      </select>
                      {motivo === 'recordado' && <span className="text-[10px] text-emerald-700 flex-shrink-0">recordado</span>}
                      {motivo === 'parecido' && (
                        <span className="text-[10px] text-amber-700 flex-shrink-0" title="Elegido por el nombre: compruébalo la primera vez">
                          sugerido
                        </span>
                      )}
                      <label className="inline-flex items-center gap-1 text-[11px] text-foreground-500 flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={l.sumar_stock}
                          onChange={(e) => cambiarLinea(i, { sumar_stock: e.target.checked })}
                          disabled={!editable || !l.producto_id}
                        />
                        Stock
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`rounded-xl p-3 text-sm ${cuadra ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
            <p className="font-semibold">
              Suma de líneas {formatEUR(suma)} · Total {formatEUR(totalNum)}
            </p>
            <p className="text-xs mt-0.5">
              {cuadra
                ? `Cuadra con el total: IVA y recargo ${impuestos.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %.`
                : totalNum == null
                  ? 'Escribe el total que pone el albarán.'
                  : 'No cuadra: revisa las líneas marcadas en naranja o el total.'}
            </p>
          </div>

          {compra.ocr_texto && (
            <details className="text-xs text-foreground-500">
              <summary className="cursor-pointer select-none">Ver el texto leído de la foto</summary>
              <pre className="mt-2 p-2 bg-background-100 rounded-lg whitespace-pre-wrap font-mono text-[11px] leading-snug">{compra.ocr_texto}</pre>
            </details>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-background-200/70 flex-shrink-0">
          {editable ? (
            <>
              <button
                type="button"
                disabled={trabajando}
                onClick={() => confirm('¿Borrar este albarán y su foto?') && ejecutar(() => datos.borrarCompra(compra))}
                className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                Borrar
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={trabajando}
                  onClick={() => ejecutar(() => datos.guardarCompra(compra.id, datosCompra()))}
                  className="h-10 px-4 rounded-full text-xs font-medium bg-background-100 border border-background-200/70 text-foreground-600 hover:bg-background-200/70 disabled:opacity-50"
                >
                  Guardar para luego
                </button>
                <button
                  type="button"
                  disabled={trabajando}
                  onClick={confirmar}
                  className="h-10 px-4 rounded-full text-xs font-semibold bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-50"
                >
                  {trabajando ? 'Guardando…' : 'Confirmar'}
                </button>
              </div>
            </>
          ) : compra.estado === 'confirmada' ? (
            <button
              type="button"
              disabled={trabajando}
              onClick={() =>
                confirm('¿Anular este albarán? Se borrará su gasto de Contabilidad y se restarán del stock los kg que sumó.') &&
                ejecutar(() => datos.anularCompra(compra.id))
              }
              className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              Anular (deshacer gasto y stock)
            </button>
          ) : (
            <button
              type="button"
              disabled={trabajando}
              onClick={() => confirm('¿Borrar definitivamente este albarán anulado y su foto?') && ejecutar(() => datos.borrarCompra(compra))}
              className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              Borrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel                                                              */
/* ------------------------------------------------------------------ */
export default function ComprasPanel({ datos, productos }: { datos: ComprasDatos; productos: Producto[] }) {
  const [progreso, setProgreso] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abiertaId, setAbiertaId] = useState<string | null>(null);

  const pendientes = datos.compras.filter((c) => c.estado === 'pendiente');
  const historial = datos.compras.filter((c) => c.estado !== 'pendiente');
  const abierta = datos.compras.find((c) => c.id === abiertaId) ?? null;

  const procesarFoto = async (file: File) => {
    setAviso(null);
    try {
      const lento = 'Leyendo el albarán… Tarda entre 10 segundos y un minuto; la primera vez descarga además el lector (unos 25 MB).';
      let cajas: OcrCaja[] = [];
      let jpeg: Blob;
      let fallo: string | null = null;
      if (esPdf(file)) {
        setProgreso('Abriendo el PDF…');
        const pdf = await prepararPdf(file);
        jpeg = pdf.jpeg;
        if (pdf.cajas) {
          cajas = pdf.cajas; // PDF con texto: no hace falta OCR
        } else {
          // PDF escaneado: cada página por el OCR, una debajo de otra.
          try {
            setProgreso(lento);
            let y = 0;
            for (const pagina of pdf.paginas) {
              const r = await leerTextoFoto(enderezar(pagina).canvas);
              cajas.push(...r.cajas.map((c) => ({ ...c, y: c.y + y })));
              y += pagina.height;
            }
          } catch (e) {
            fallo = e instanceof Error ? e.message : String(e);
          }
        }
      } else {
        setProgreso('Preparando la foto…');
        const foto = await prepararFoto(file);
        jpeg = foto.jpeg;
        try {
          setProgreso(lento);
          ({ cajas } = await leerTextoFoto(foto.ocr));
        } catch (e) {
          // La foto se guarda igual para no perderla: se rellena a mano.
          fallo = e instanceof Error ? e.message : String(e);
        }
      }

      const a = leerAlbaran(cajas);
      const proveedor = unificarProveedor(
        a.proveedor,
        datos.compras.map((c) => c.proveedor).filter((p): p is string => !!p),
      );
      const lineas: CompraLinea[] = a.lineas.map((l) => ({
        texto: l.texto,
        kg: l.kg,
        precio: l.precio,
        importe: l.importe,
        producto_id: sugerirProducto(l.texto, proveedor, datos.alias, productos)?.id ?? null,
        sumar_stock: !NO_PRODUCTO.test(l.texto),
      }));

      setProgreso('Guardando…');
      const compra = await datos.crearCompra({
        fecha: a.fecha ?? hoyISO(),
        proveedor,
        numero: a.numero,
        total: a.total,
        lineas,
        ocr_texto: fallo ? `No se pudo leer: ${fallo}` : a.texto.join('\n'),
        foto: jpeg,
      });
      if (fallo) setAviso('La foto se ha guardado, pero no se ha podido leer. Rellena los datos a mano.');
      setAbiertaId(compra.id);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e));
    } finally {
      setProgreso(null);
    }
  };

  return (
    <div className="px-4 md:px-8 py-4 max-w-3xl mx-auto space-y-5">
      <Camara onFoto={procesarFoto} ocupado={!!progreso} />

      {progreso && (
        <div className="flex items-center gap-3 bg-background-50 border border-background-200/70 rounded-xl p-3 text-sm text-foreground-600">
          <i className="ri-loader-4-line animate-spin text-xl text-primary-500 flex-shrink-0"></i>
          {progreso}
        </div>
      )}
      {aviso && <p className="text-xs text-amber-800 bg-amber-50 rounded-xl p-3">{aviso}</p>}

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-400 mb-2">
          Por revisar {pendientes.length > 0 && `(${pendientes.length})`}
        </h2>
        {datos.loading ? (
          <p className="text-xs text-foreground-400">Cargando…</p>
        ) : pendientes.length === 0 ? (
          <p className="text-xs text-foreground-400">No hay albaranes pendientes.</p>
        ) : (
          <div className="space-y-2">
            {pendientes.map((c) => (
              <CompraCard key={c.id} compra={c} onAbrir={() => setAbiertaId(c.id)} />
            ))}
          </div>
        )}
      </section>

      {historial.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-400 mb-2">Últimos albaranes</h2>
          <div className="space-y-2">
            {historial.slice(0, 40).map((c) => (
              <CompraCard key={c.id} compra={c} onAbrir={() => setAbiertaId(c.id)} />
            ))}
          </div>
        </section>
      )}

      {abierta && <CompraEditor key={abierta.id} compra={abierta} datos={datos} productos={productos} onClose={() => setAbiertaId(null)} />}
    </div>
  );
}
