import { useEffect, useMemo, useRef, useState } from 'react';
import type { useCompras } from '@/hooks/useCompras';
import type { Compra, CompraCorreo, CompraLinea } from '@/types/compra';
import type { Producto } from '@/types/producto';
import { normalizarCompra, sumaLineas } from '@/lib/comprasOcr';
import { leerDictado, NO_PRODUCTO, sugerirProducto } from '@/lib/comprasProductos';
import { esPdf } from '@/lib/comprasPdf';
import type { MarcasAlbaran } from '@/lib/comprasMarcas';
import { buscarCoincidencia, describirCoincidencia } from '@/lib/comprasCoincidencias';
import type { CorreoCompras } from '@/hooks/useCorreoCompras';
import { useBandeja } from '@/hooks/useBandeja';
import { BandejaAlbaranes } from './BandejaAlbaranes';
import { FotoMarcada, PuntoColor, VisorAlbaran } from './AlbaranLeido';

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

const lineaCuadra = (l: { kg: number | null; precio: number | null; importe: number | null }) =>
  l.kg != null && l.precio != null && l.importe != null && Math.abs(l.kg * l.precio - l.importe) <= 0.06;

// Cómo está un albarán de un vistazo: lo que hay que hacer con él.
type Situacion = { etiqueta: string; icono: string; clase: string };
function situacion(c: Compra): Situacion {
  if (c.estado === 'confirmada') return { etiqueta: 'Confirmado', icono: 'ri-checkbox-circle-fill', clase: 'bg-emerald-50 text-emerald-700 ring-emerald-200' };
  if (c.estado === 'anulada') return { etiqueta: 'Anulado', icono: 'ri-close-circle-line', clase: 'bg-background-100 text-foreground-500 ring-background-200' };
  if (!c.lineas.length) return { etiqueta: 'Sin productos', icono: 'ri-edit-line', clase: 'bg-amber-50 text-amber-700 ring-amber-200' };
  const lista = c.lineas.every(lineaCuadra) && impuestosTotal(sumaLineas(c.lineas), c.total) != null;
  return lista
    ? { etiqueta: 'Lista para confirmar', icono: 'ri-check-double-line', clase: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }
    : { etiqueta: 'Revisar', icono: 'ri-error-warning-line', clase: 'bg-amber-50 text-amber-700 ring-amber-200' };
}

function resumenProductos(c: Compra): string {
  const nombres = c.lineas.map((l) => l.texto).filter(Boolean);
  if (!nombres.length) return c.lineas.length ? `${c.lineas.length} líneas sin nombre` : 'Sin productos leídos';
  const vistos = nombres.slice(0, 3).map((n) => n.charAt(0) + n.slice(1).toLowerCase());
  return vistos.join(', ') + (nombres.length > 3 ? ` y ${nombres.length - 3} más` : '');
}

function fechaRelativa(fecha: string): string {
  const hoy = hoyISO();
  const ayer = new Date(Date.now() - 864e5).toLocaleDateString('sv-SE');
  return fecha === hoy ? 'Hoy' : fecha === ayer ? 'Ayer' : formatFecha(fecha);
}

/* ------------------------------------------------------------------ */
/*  Subir la foto o el PDF                                             */
/* ------------------------------------------------------------------ */
// Varias a la vez: páginas de un mismo albarán o albaranes distintos; la
// bandeja las agrupa.
function Captura({ onFotos }: { onFotos: (f: File[]) => void }) {
  const elegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length) onFotos(files);
  };
  return (
    <div className="bg-background-50 border border-background-200/70 rounded-2xl shadow-card p-3 lg:p-4">
      {/* Móvil: la cámara manda. */}
      <label className="lg:hidden flex items-center justify-center gap-3 w-full h-[72px] rounded-xl text-base font-semibold bg-primary-500 text-background-50 active:bg-primary-600 cursor-pointer">
        <i className="ri-camera-fill text-[28px]"></i>
        Foto del albarán
        <input type="file" accept="image/*" capture="environment" onChange={elegir} className="hidden" />
      </label>
      {/* Ordenador: arrastrar y soltar o elegir el archivo. */}
      <label className="hidden lg:flex flex-col items-center justify-center text-center gap-2 w-full rounded-xl border-2 border-dashed border-background-200 hover:border-primary-500/50 hover:bg-primary-500/[0.03] px-4 py-6 cursor-pointer transition-colors">
        <span className="w-11 h-11 rounded-full bg-primary-500 text-background-50 flex items-center justify-center">
          <i className="ri-upload-cloud-2-line text-xl"></i>
        </span>
        <span className="text-sm font-semibold text-foreground-950">Sube las fotos o PDF de los albaranes</span>
        <span className="text-xs text-foreground-400">Arrástralos aquí o haz clic para elegirlos (varios a la vez)</span>
        <input type="file" accept="image/*,application/pdf,.pdf" multiple onChange={elegir} className="hidden" />
      </label>
      <div className="lg:hidden flex items-center justify-between gap-3 mt-2.5 px-1">
        <p className="text-[11px] text-foreground-400 leading-snug">Plano, entero y sin flash.</p>
        <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-medium border border-background-200/70 text-foreground-600 active:bg-background-100 cursor-pointer flex-shrink-0">
          <i className="ri-attachment-2"></i>
          Galería o PDF
          <input type="file" accept="image/*,application/pdf,.pdf" multiple onChange={elegir} className="hidden" />
        </label>
      </div>
      <p className="hidden lg:block text-[11px] text-foreground-400 text-center mt-2.5">
        PDF con texto: se lee al instante. Fotos y escaneados: entre 10 s y 1 min.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Resumen (columna izquierda en el ordenador)                        */
/* ------------------------------------------------------------------ */
function Resumen({ compras }: { compras: Compra[] }) {
  const pendientes = compras.filter((c) => c.estado === 'pendiente');
  const listas = pendientes.filter((c) => situacion(c).etiqueta === 'Lista para confirmar').length;
  const mes = hoyISO().slice(0, 7);
  const confirmadasMes = compras.filter((c) => c.estado === 'confirmada' && c.fecha.startsWith(mes));
  const cifra = (valor: string, texto: string, detalle?: string) => (
    <div className="px-4 py-3">
      <p className="text-[11px] font-medium text-foreground-400">{texto}</p>
      <p className="text-lg font-semibold text-foreground-950 tabular-nums leading-tight mt-0.5">{valor}</p>
      {detalle && <p className="text-[11px] text-foreground-500 mt-0.5">{detalle}</p>}
    </div>
  );
  return (
    <div className="hidden lg:block bg-background-50 border border-background-200/70 rounded-2xl shadow-card divide-y divide-background-200/70">
      {cifra(
        String(pendientes.length),
        'Por revisar',
        pendientes.length ? `${formatEUR(pendientes.reduce((t, c) => t + (c.total ?? 0), 0))} · ${listas} listos para confirmar` : 'Todo al día',
      )}
      {cifra(
        formatEUR(confirmadasMes.reduce((t, c) => t + (c.total ?? 0), 0)),
        'Compras confirmadas este mes',
        `${confirmadasMes.length} ${confirmadasMes.length === 1 ? 'albarán' : 'albaranes'}`,
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Fila de la lista                                                   */
/* ------------------------------------------------------------------ */
function Marcas({ compra }: { compra: Compra }) {
  return (
    <>
      {compra.tipo === 'factura' && (
        <span className="ml-1.5 inline-flex items-center h-5 px-1.5 rounded-md bg-sky-50 text-sky-700 text-[10px] font-semibold align-middle">FACTURA</span>
      )}
      {compra.origen === 'email' && <i title="Llegó por correo" className="ri-mail-line ml-1.5 text-xs text-foreground-400 align-middle"></i>}
    </>
  );
}

function FilaCompra({ compra, onAbrir }: { compra: Compra; onAbrir: () => void }) {
  const s = situacion(compra);
  const chip = (
    <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium ring-1 ring-inset whitespace-nowrap ${s.clase}`}>
      <i className={`${s.icono} text-xs`}></i>
      {s.etiqueta}
    </span>
  );
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="group w-full text-left bg-background-50 hover:bg-background-100/60 border border-background-200/70 md:border-0 md:border-b md:last:border-b-0 rounded-xl md:rounded-none p-3 md:px-4 md:py-3 transition-colors"
    >
      {/* Móvil */}
      <div className="md:hidden">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-foreground-950 truncate">
              {compra.proveedor || 'Proveedor sin leer'}
              <Marcas compra={compra} />
            </p>
            <p className="text-xs text-foreground-500 truncate mt-0.5">{resumenProductos(compra)}</p>
          </div>
          <p className="text-[15px] font-semibold text-foreground-950 tabular-nums flex-shrink-0">{formatEUR(compra.total)}</p>
        </div>
        <div className="flex items-center gap-2 mt-2">
          {chip}
          <span className="text-[11px] text-foreground-400 truncate">
            {fechaRelativa(compra.fecha)}
            {compra.numero && <> · nº {compra.numero}</>}
          </span>
        </div>
      </div>
      {/* Ordenador */}
      <div className="hidden md:grid grid-cols-[88px_minmax(0,1fr)_170px_110px_20px] items-center gap-4">
        <span className="text-xs text-foreground-500 tabular-nums">{fechaRelativa(compra.fecha)}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground-950 truncate">
            {compra.proveedor || 'Proveedor sin leer'}
            {compra.numero && <span className="ml-2 text-xs font-normal text-foreground-400">nº {compra.numero}</span>}
            <Marcas compra={compra} />
          </p>
          <p className="text-xs text-foreground-500 truncate">{resumenProductos(compra)}</p>
        </div>
        <span>{chip}</span>
        <span className="text-sm font-semibold text-foreground-950 tabular-nums text-right">{formatEUR(compra.total)}</span>
        <i className="ri-arrow-right-s-line text-foreground-300 group-hover:text-foreground-500"></i>
      </div>
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

  const [marcas, setMarcas] = useState<MarcasAlbaran | null>(null);
  const [visor, setVisor] = useState(false);

  const { urlFoto, cargarMarcas } = datos;
  useEffect(() => {
    if (!compra.foto_path) return;
    urlFoto(compra.foto_path).then(setFoto);
    cargarMarcas(compra.id).then(setMarcas);
  }, [compra.foto_path, compra.id, urlFoto, cargarMarcas]);

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

  // ¿Ya está contado? Solo frente a lo que entró antes (cuenta el primero):
  // la factura que llega después ya descontó este albarán al guardarse.
  const coincide = editable
    ? buscarCoincidencia(
        { tipo: compra.tipo, proveedor: proveedor.trim() || null, numero: numero.trim() || null, fecha, total: totalNum, albaranes: compra.albaranes },
        datos.compras.filter((c) => c.created_at < compra.created_at),
        compra.id,
      )
    : null;
  const repetida = coincide && coincide.tipo !== 'parcial' && coincide.tipo !== 'posible' ? coincide : null;

  const confirmar = () => {
    if (!totalNum || totalNum <= 0) {
      setError('Falta el total del albarán (lo que se ha pagado).');
      return;
    }
    const kg = alStock.reduce((t, l) => t + (l.kg ?? 0), 0);
    const msg =
      `Se apuntará un gasto de ${formatEUR(totalNum)} en Contabilidad` +
      (alStock.length ? ` y se sumarán ${aTexto(Math.round(kg * 100) / 100)} kg al stock de ${alStock.length} producto(s).` : '.') +
      (cuadra ? '' : '\n\nOjo: la suma de las líneas no cuadra con el total.') +
      (repetida ? `\n\nOjo: ${describirCoincidencia(repetida, formatFecha)} No lo confirmes dos veces.` : '');
    if (!confirm(msg)) return;
    ejecutar(() => datos.confirmarCompra(compra.id, datosCompra()));
  };

  const doc = compra.tipo === 'factura' ? 'factura' : 'albarán';
  const titulo = editable
    ? `Revisar ${doc}`
    : compra.estado === 'confirmada'
      ? compra.tipo === 'factura'
        ? 'Factura confirmada'
        : 'Albarán confirmado'
      : compra.tipo === 'factura'
        ? 'Factura anulada'
        : 'Albarán anulado';
  const textoLeido = compra.ocr_texto && !compra.ocr_texto.startsWith('No se pudo leer') ? compra.ocr_texto : null;
  const sit = situacion(compra);

  // Piezas de cada línea, compartidas por la tarjeta (móvil) y la fila (ordenador).
  const infoLinea = (i: number) => {
    const d = lineasDatos[i];
    const completa = d.kg != null && d.precio != null && d.importe != null;
    const s = d.producto_id ? sugerir(lineas[i].texto) : null;
    return { completa, ok: lineaCuadra(d), motivo: s && s.id === d.producto_id ? s.motivo : null };
  };
  const iconoEstado = (ok: boolean) => (
    <span
      title={ok ? 'Kg × €/kg = importe' : 'Revisar'}
      className={`w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0 ${ok ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}
    >
      <i className={`${ok ? 'ri-check-line' : 'ri-error-warning-line'} text-xs`}></i>
    </span>
  );
  const campoNum = (i: number, campo: 'kg' | 'precio' | 'importe', etiqueta: string, op: { compacto?: boolean; negrita?: boolean } = {}) => {
    const input = (
      <input
        value={lineas[i][campo]}
        onChange={(e) => cambiarLinea(i, { [campo]: e.target.value })}
        inputMode="decimal"
        disabled={!editable}
        aria-label={etiqueta}
        className={`w-full min-w-0 bg-background-100 border border-background-200/70 rounded-lg text-right tabular-nums focus:outline-none focus:border-foreground-300/60 focus:bg-background-50 ${
          op.compacto ? 'h-9 px-2 text-sm' : 'px-2 py-2 text-base'
        } ${op.negrita ? 'font-semibold' : ''}`}
      />
    );
    if (op.compacto) return input;
    return (
      <label className="block min-w-0">
        <span className="flex items-center gap-1 text-[10px] font-medium text-foreground-400 mb-0.5">
          <PuntoColor tipo={campo} /> {etiqueta}
        </span>
        {input}
      </label>
    );
  };
  const selectProducto = (i: number, compacto = false) => {
    const motivo = infoLinea(i).motivo;
    return (
    <div className="relative flex-1 min-w-0">
      {!compacto && <i className="ri-store-2-line absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-400 text-sm pointer-events-none"></i>}
      <select
        value={lineas[i].producto_id}
        onChange={(e) => cambiarLinea(i, { producto_id: e.target.value })}
        disabled={!editable}
        aria-label="Producto nuestro"
        title={
          motivo === 'parecido'
            ? 'Sugerido por el nombre: compruébalo esta primera vez'
            : motivo === 'recordado'
              ? 'Recordado de otras compras a este proveedor'
              : undefined
        }
        className={`w-full bg-background-100 border rounded-lg text-sm focus:outline-none focus:border-foreground-300/60 ${
          compacto ? 'h-9 px-2' : 'pl-8 pr-2 py-2'
        } ${lineas[i].producto_id ? 'text-foreground-950' : 'text-foreground-400'} ${
          motivo === 'parecido' ? 'border-amber-400 ring-2 ring-amber-200/70' : motivo === 'recordado' ? 'border-emerald-300' : 'border-background-200/70'
        }`}
      >
        <option value="">Sin producto</option>
        {productosOrdenados.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre_es}
          </option>
        ))}
      </select>
    </div>
    );
  };
  const botonStock = (i: number, compacto = false) => {
    const l = lineas[i];
    const activo = !!l.producto_id && l.sumar_stock;
    return (
      <button
        type="button"
        onClick={() => cambiarLinea(i, { sumar_stock: !l.sumar_stock })}
        disabled={!editable || !l.producto_id}
        aria-pressed={activo}
        title={l.producto_id ? (activo ? 'Sumará estos kg al stock al confirmar' : 'No suma al stock') : 'Elige un producto para poder sumarlo al stock'}
        className={`inline-flex items-center justify-center gap-1 rounded-full text-xs font-medium border flex-shrink-0 disabled:opacity-40 ${
          compacto ? 'w-9 h-9' : 'h-9 px-3'
        } ${activo ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-background-50 border-background-200/70 text-foreground-400'}`}
      >
        <i className={activo ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'}></i>
        {!compacto && 'Stock'}
      </button>
    );
  };
  const botonQuitar = (i: number) =>
    editable ? (
      <button
        type="button"
        onClick={() => setLineas((p) => p.filter((_, k) => k !== i))}
        aria-label="Quitar línea"
        title="Quitar línea"
        className="w-8 h-8 flex items-center justify-center rounded-full text-foreground-300 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
      >
        <i className="ri-delete-bin-line"></i>
      </button>
    ) : (
      <span />
    );
  const sugeridos = lineas.filter((_, i) => infoLinea(i).motivo === 'parecido').length;

  // Esc cierra (si la foto a pantalla completa está abierta, la cierra ella).
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && !visor && onClose();
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [visor, onClose]);

  const resumenCuadre = (
    <>
      <span className="font-semibold">{cuadra ? 'Cuadra' : totalNum == null ? 'Falta el total' : lineas.length === 0 ? 'Sin productos' : 'No cuadra'}</span>
      <span className="opacity-90">
        {' · '}Productos {formatEUR(suma)}
        {cuadra ? ` + IVA y recargo ${impuestos.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %` : lineas.length === 0 ? ' · solo se apuntará el gasto' : ''}
      </span>
    </>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-foreground-950/40 sm:p-4 lg:p-6" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="relative flex flex-col w-full sm:max-w-[640px] md:max-w-3xl xl:max-w-[1360px] max-h-[94vh] sm:max-h-[92vh] xl:h-[92vh] bg-background-50 rounded-t-2xl sm:rounded-2xl border border-background-200/70 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-background-200/70 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-heading font-semibold text-foreground-950 truncate">{titulo}</h2>
              <span className={`hidden sm:inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium ring-1 ring-inset ${sit.clase}`}>
                <i className={`${sit.icono} text-xs`}></i>
                {sit.etiqueta}
              </span>
            </div>
            <p className="text-[11px] text-foreground-400 truncate">
              {proveedor || 'Proveedor sin leer'} · {formatFecha(fecha)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            title="Cerrar (Esc)"
            className="w-9 h-9 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-100 hover:text-foreground-950"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <div className="flex-1 min-h-0 flex">
        {/* Ordenador ancho: la foto siempre a la vista, al lado del formulario. */}
        {(foto || compra.foto_path) && (
          <aside className="hidden xl:flex flex-col w-[440px] flex-shrink-0 border-r border-background-200/70 bg-background-100/70">
            <div className="flex-1 overflow-y-auto p-4">
              {foto ? (
                <button
                  type="button"
                  onClick={() => setVisor(true)}
                  title="Ver a pantalla completa"
                  className="block w-full overflow-hidden rounded-xl border border-background-200/70 bg-background-50 shadow-card cursor-zoom-in"
                >
                  <FotoMarcada src={foto} marcas={marcas} resto={false} />
                </button>
              ) : (
                <div className="h-[60vh] rounded-xl bg-background-200/60 animate-pulse" />
              )}
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 border-t border-background-200/70 text-xs text-foreground-500">
              <span className="flex-1">{marcas ? 'Los colores marcan de dónde sale cada dato.' : 'Foto del albarán'}</span>
              <button type="button" onClick={() => setVisor(true)} className="inline-flex items-center gap-1 font-medium text-foreground-700 hover:text-foreground-950">
                <i className="ri-fullscreen-line"></i> Ampliar
              </button>
            </div>
          </aside>
        )}

        <div className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-5 xl:px-6 py-4 space-y-5">
          {/* Foto con lo leído: se toca para verla entera (móvil y tablet). */}
          {foto ? (
            <button
              type="button"
              onClick={() => setVisor(true)}
              className="xl:hidden relative block w-full h-40 md:h-48 overflow-hidden rounded-2xl border border-background-200/70 bg-background-100 text-left"
            >
              <FotoMarcada src={foto} marcas={marcas} resto={false} />
              <span className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-foreground-950/75 to-transparent" />
              <span className="absolute left-3 right-3 bottom-2.5 flex items-center gap-2 text-background-50">
                <i className="ri-scan-2-line text-lg"></i>
                <span className="flex-1 text-sm font-semibold">{marcas ? 'Ver lo que ha leído' : 'Ver la foto'}</span>
                <i className="ri-fullscreen-line"></i>
              </span>
            </button>
          ) : compra.foto_path ? (
            <div className="xl:hidden h-40 rounded-2xl bg-background-100 animate-pulse" />
          ) : null}

          {(repetida || compra.nota || compra.origen === 'email') && (
            <div className={`flex items-start gap-2 rounded-xl p-3 text-xs ${repetida ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>
              <i className={`${compra.origen === 'email' ? 'ri-mail-line' : 'ri-error-warning-line'} text-base leading-none`}></i>
              <div className="space-y-1">
                {compra.origen === 'email' && (
                  <p>
                    Ha llegado por correo
                    {compra.tipo === 'factura' && compra.albaranes.length ? ` · factura de los albaranes ${compra.albaranes.join(', ')}` : ''}.
                  </p>
                )}
                {compra.nota && <p>{compra.nota}</p>}
                {repetida && <p className="font-semibold">{describirCoincidencia(repetida, formatFecha)} No lo confirmes dos veces.</p>}
              </div>
            </div>
          )}

          {/* Datos del albarán */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-2 md:gap-x-3 gap-y-3">
            <label className="col-span-2 block">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground-500 mb-1">
                <PuntoColor tipo="proveedor" /> Proveedor
              </span>
              <input
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                list="compras-proveedores"
                placeholder="¿De quién es?"
                disabled={!editable}
                className={`${inputCls} text-base font-semibold`}
              />
              <datalist id="compras-proveedores">
                {proveedores.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground-500 mb-1">
                <PuntoColor tipo="fecha" /> Fecha
              </span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={!editable} className={inputCls} />
            </label>
            <label className="block">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground-500 mb-1">
                <PuntoColor tipo="numero" /> Nº {doc}
              </span>
              <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Opcional" disabled={!editable} className={inputCls} />
            </label>
          </div>

          {/* Productos */}
          <section>
            <div className="flex flex-wrap items-center gap-2 mb-2.5">
              <h3 className="text-sm font-semibold text-foreground-950 mr-auto">
                Productos <span className="ml-1 text-xs font-medium text-foreground-400">{lineas.length}</span>
              </h3>
              {editable && (
                <div className="flex gap-2 overflow-x-auto -mx-1 px-1 w-full md:w-auto">
                  {ReconocedorVoz && (
                    <button
                      type="button"
                      onClick={dictar}
                      disabled={escuchando}
                      className={`inline-flex items-center gap-1.5 h-10 md:h-9 px-4 rounded-full text-xs font-semibold flex-shrink-0 ${
                        escuchando ? 'bg-red-500 text-white animate-pulse' : 'bg-foreground-950 text-background-50 hover:bg-foreground-800'
                      }`}
                    >
                      <i className="ri-mic-fill text-sm"></i>
                      {escuchando ? 'Escuchando… «rape 4,64 a 21,50»' : 'Dictar'}
                    </button>
                  )}
                  {anterior && (
                    <button
                      type="button"
                      onClick={copiarAnterior}
                      className="inline-flex items-center gap-1.5 h-10 md:h-9 px-4 rounded-full text-xs font-medium border bg-background-50 border-background-200/70 text-foreground-700 hover:bg-background-100 flex-shrink-0"
                    >
                      <i className="ri-history-line text-sm"></i>
                      Igual que el {formatFecha(anterior.fecha)}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setLineas((p) => [...p, { texto: '', kg: '', precio: '', importe: '', producto_id: '', sumar_stock: true }])}
                    className="inline-flex items-center gap-1.5 h-10 md:h-9 px-4 rounded-full text-xs font-medium border bg-background-50 border-background-200/70 text-foreground-700 hover:bg-background-100 flex-shrink-0"
                  >
                    <i className="ri-add-line text-sm"></i>
                    Añadir línea
                  </button>
                </div>
              )}
            </div>
            {editable && sugeridos > 0 && (
              <p className="flex items-start gap-2 mb-2.5 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                <i className="ri-lightbulb-line text-sm leading-none mt-px"></i>
                <span>
                  {sugeridos === 1 ? 'Un producto está elegido' : `${sugeridos} productos están elegidos`} por parecido de nombre (borde naranja):
                  compruébalos esta primera vez. Al confirmar se recuerdan y la próxima vez salen solos.
                </span>
              </p>
            )}
            {lineas.length === 0 && (
              <div className="flex flex-col items-center text-center gap-1 rounded-2xl border border-dashed border-background-200 p-5 text-foreground-400">
                <i className="ri-file-search-line text-2xl"></i>
                <p className="text-xs leading-snug">
                  No se ha leído ningún producto (¿escrito a mano?).
                  <br />
                  Díctalos, cópialos de la última compra o añádelos a mano. También puedes confirmar solo el gasto.
                </p>
              </div>
            )}

            {/* Móvil: una tarjeta por línea, con números grandes para el dedo. */}
            <div className="md:hidden space-y-2.5">
              {lineas.map((l, i) => {
                const { ok, completa } = infoLinea(i);
                return (
                  <div key={i} className={`rounded-2xl border p-3 ${ok ? 'border-background-200/70 bg-background-50' : 'border-amber-300 bg-amber-50/60'}`}>
                    <div className="flex items-center gap-2">
                      {iconoEstado(ok)}
                      <PuntoColor tipo="producto" />
                      <input
                        value={l.texto}
                        onChange={(e) => cambiarTexto(i, e.target.value)}
                        placeholder="Producto (como viene en el albarán)"
                        disabled={!editable}
                        className="flex-1 min-w-0 bg-transparent text-base font-semibold text-foreground-950 focus:outline-none"
                      />
                      {botonQuitar(i)}
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-end gap-1.5 mt-2.5">
                      {campoNum(i, 'kg', 'Kg')}
                      <span className="pb-2.5 text-foreground-300 text-sm">×</span>
                      {campoNum(i, 'precio', '€/kg')}
                      <span className="pb-2.5 text-foreground-300 text-sm">=</span>
                      {campoNum(i, 'importe', 'Importe €', { negrita: true })}
                    </div>
                    {!ok && (
                      <p className="text-[11px] text-amber-700 mt-1.5">
                        {completa ? 'Kg × €/kg no da el importe: revisa los números.' : 'Falta algún número.'}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2.5">
                      {selectProducto(i)}
                      {botonStock(i)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Ordenador: tabla compacta, una fila por línea. */}
            {lineas.length > 0 && (
              <div className="hidden md:block rounded-xl border border-background-200/70 overflow-hidden">
                <div className="grid grid-cols-[22px_minmax(0,1.25fr)_76px_12px_80px_12px_88px_minmax(0,1fr)_36px_32px] items-center gap-2 px-3 py-2 bg-background-100/70 text-[10px] font-semibold uppercase tracking-wide text-foreground-400">
                  <span></span>
                  <span className="flex items-center gap-1.5"><PuntoColor tipo="producto" /> En el albarán</span>
                  <span className="flex items-center gap-1 justify-end"><PuntoColor tipo="kg" /> Kg</span>
                  <span></span>
                  <span className="flex items-center gap-1 justify-end"><PuntoColor tipo="precio" /> €/kg</span>
                  <span></span>
                  <span className="flex items-center gap-1 justify-end"><PuntoColor tipo="importe" /> Importe</span>
                  <span>Producto nuestro</span>
                  <span className="text-center" title="Sumar al stock al confirmar">Stock</span>
                  <span></span>
                </div>
                {lineas.map((l, i) => {
                  const { ok, completa } = infoLinea(i);
                  return (
                    <div key={i} className={`border-t border-background-200/70 px-3 py-2 ${ok ? '' : 'bg-amber-50/60'}`}>
                      <div className="grid grid-cols-[22px_minmax(0,1.25fr)_76px_12px_80px_12px_88px_minmax(0,1fr)_36px_32px] items-center gap-2">
                        {iconoEstado(ok)}
                        <input
                          value={l.texto}
                          onChange={(e) => cambiarTexto(i, e.target.value)}
                          placeholder="Producto"
                          disabled={!editable}
                          title={l.texto}
                          className="w-full min-w-0 h-9 px-2 bg-transparent hover:bg-background-100 focus:bg-background-100 rounded-md text-sm font-medium text-foreground-950 focus:outline-none"
                        />
                        {campoNum(i, 'kg', 'Kg', { compacto: true })}
                        <span className="text-center text-foreground-300 text-xs">×</span>
                        {campoNum(i, 'precio', '€/kg', { compacto: true })}
                        <span className="text-center text-foreground-300 text-xs">=</span>
                        {campoNum(i, 'importe', 'Importe €', { compacto: true, negrita: true })}
                        {selectProducto(i, true)}
                        {botonStock(i, true)}
                        {botonQuitar(i)}
                      </div>
                      {!ok && (
                        <p className="pl-[30px] mt-0.5 text-[11px] text-amber-700">
                          {completa ? 'Kg × €/kg no da el importe: revisa los números.' : 'Falta algún número.'}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Total y cuadre */}
          <div className={`rounded-2xl p-4 md:flex md:items-center md:gap-4 ${cuadra ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
            <div className="flex items-center gap-3 md:flex-1 md:min-w-0">
              <span
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  cuadra ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                }`}
              >
                <i className={`${cuadra ? 'ri-check-double-line' : 'ri-scales-3-line'} text-xl`}></i>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{cuadra ? 'Cuadra' : totalNum == null ? 'Falta el total' : lineas.length === 0 ? 'Sin productos' : 'No cuadra'}</p>
                <p className="text-xs opacity-90">
                  Productos {formatEUR(suma)}
                  {cuadra
                    ? ` + IVA y recargo ${impuestos.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`
                    : totalNum == null
                      ? ' · escribe lo que pone el albarán'
                      : lineas.length === 0
                        ? ' · solo se apuntará el gasto'
                        : ' · revisa los productos en naranja o el total'}
                </p>
              </div>
            </div>
            <label className="mt-3 md:mt-0 md:w-80 flex items-center gap-2 rounded-xl bg-background-50/80 px-3 py-2 ring-1 ring-inset ring-current/10">
              <PuntoColor tipo="total" />
              <span className="text-xs font-medium text-foreground-600 flex-shrink-0">Total pagado</span>
              <input
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                disabled={!editable}
                className="flex-1 min-w-0 bg-transparent text-right text-xl font-bold text-foreground-950 tabular-nums focus:outline-none"
              />
              <span className="text-base font-semibold text-foreground-500">€</span>
            </label>
          </div>

          {!compra.foto_path && textoLeido && (
            <details className="text-xs text-foreground-500">
              <summary className="cursor-pointer select-none">Ver el texto leído</summary>
              <pre className="mt-2 p-2 bg-background-100 rounded-lg whitespace-pre-wrap font-mono text-[11px] leading-snug">{textoLeido}</pre>
            </details>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}
        </div>
        </div>

        {editable && (
          <p className={`md:hidden flex-shrink-0 border-t px-4 py-2 text-xs truncate ${cuadra ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
            <i className={`${cuadra ? 'ri-check-double-line' : 'ri-scales-3-line'} mr-1`}></i>
            {resumenCuadre}
          </p>
        )}
        <div className="flex items-center gap-2 px-4 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-background-200/70 flex-shrink-0">
          {editable ? (
            <>
              <p className={`hidden md:block flex-1 min-w-0 truncate text-xs ${cuadra ? 'text-emerald-700' : 'text-amber-700'}`}>{resumenCuadre}</p>
              <button
                type="button"
                disabled={trabajando}
                onClick={() => confirm('¿Borrar este albarán y su foto?') && ejecutar(() => datos.borrarCompra(compra))}
                aria-label="Borrar albarán"
                title="Borrar albarán"
                className="w-11 h-11 flex items-center justify-center rounded-full text-red-600 hover:bg-red-50 disabled:opacity-50 flex-shrink-0"
              >
                <i className="ri-delete-bin-line text-lg"></i>
              </button>
              <button
                type="button"
                disabled={trabajando}
                onClick={() => ejecutar(() => datos.guardarCompra(compra.id, datosCompra()))}
                className="h-11 px-4 rounded-full text-sm font-medium bg-background-100 border border-background-200/70 text-foreground-700 hover:bg-background-200/70 disabled:opacity-50"
              >
                Guardar<span className="hidden md:inline"> para luego</span>
              </button>
              <button
                type="button"
                disabled={trabajando}
                onClick={confirmar}
                className="flex-1 md:flex-none md:min-w-[200px] h-11 px-5 rounded-full text-sm font-semibold bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                <i className="ri-check-line text-base"></i>
                {trabajando ? 'Guardando…' : 'Confirmar'}
              </button>
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

      {visor && foto && <VisorAlbaran src={foto} marcas={marcas} texto={textoLeido} onClose={() => setVisor(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Lo que llega por correo                                            */
/* ------------------------------------------------------------------ */
const ESTADO_CORREO: Record<CompraCorreo['estado'], { texto: string; clase: string }> = {
  nuevo: { texto: 'En cola', clase: 'bg-background-100 text-foreground-500' },
  leyendo: { texto: 'Leyendo…', clase: 'bg-sky-50 text-sky-700' },
  metido: { texto: 'Guardado', clase: 'bg-emerald-50 text-emerald-700' },
  repetido: { texto: 'Ya estaba', clase: 'bg-background-100 text-foreground-600' },
  error: { texto: 'Error', clase: 'bg-red-50 text-red-700' },
};

// «Pescados Arraiza <noresponder@…>» → «Pescados Arraiza».
const quien = (c: CompraCorreo) => (c.remitente_original ?? c.remitente ?? '').replace(/\s*<[^>]*>\s*/g, '').trim() || c.nombre;

function Correo({ correo, compras, onAbrir }: { correo: CorreoCompras; compras: Compra[]; onAbrir: (id: string) => void }) {
  const [todos, setTodos] = useState(false);
  if (!correo.correo.length) return null;
  const lista = todos ? correo.correo : correo.correo.slice(0, 6);
  const existe = (id: string | null) => !!id && compras.some((c) => c.id === id);
  const verArchivo = async (c: CompraCorreo) => {
    const url = await correo.urlArchivo(c.archivo_path);
    if (url) window.open(url, '_blank', 'noopener');
  };
  return (
    <div className="bg-background-50 border border-background-200/70 rounded-2xl shadow-card p-4 space-y-2.5">
      <div className="flex items-center gap-2">
        <i className="ri-mail-line text-foreground-400"></i>
        <h2 className="text-sm font-semibold text-foreground-950 flex-1">Del correo</h2>
        {correo.leyendo && <i className="ri-loader-4-line animate-spin text-primary-500" title={`Leyendo ${correo.leyendo}`}></i>}
      </div>
      <ul className="divide-y divide-background-200/70">
        {lista.map((c) => {
          const e = ESTADO_CORREO[c.estado];
          return (
            <li key={c.id} className="py-2 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => verArchivo(c)} title={`Ver ${c.nombre}`} className="min-w-0 flex-1 text-left">
                  <p className="text-xs font-medium text-foreground-900 truncate">{quien(c)}</p>
                  <p className="text-[11px] text-foreground-400 truncate">
                    {c.nombre} · {new Date(c.recibido ?? c.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  </p>
                </button>
                {existe(c.compra_id) && (c.estado === 'metido' || c.estado === 'repetido') ? (
                  <button
                    type="button"
                    onClick={() => onAbrir(c.compra_id!)}
                    className={`h-6 px-2 rounded-full text-[11px] font-medium whitespace-nowrap ${e.clase} hover:brightness-95`}
                  >
                    {e.texto} <i className="ri-arrow-right-s-line"></i>
                  </button>
                ) : (
                  <span className={`h-6 px-2 inline-flex items-center rounded-full text-[11px] font-medium whitespace-nowrap ${e.clase}`}>{e.texto}</span>
                )}
              </div>
              {(c.estado === 'repetido' || c.estado === 'error') && (
                <div className="mt-1 text-[11px] text-foreground-500">
                  {c.nota}{' '}
                  {c.estado === 'repetido' ? (
                    <button type="button" onClick={() => correo.guardarIgualmente(c)} className="font-medium text-primary-600 hover:underline">
                      No es el mismo: guardarlo
                    </button>
                  ) : (
                    <button type="button" onClick={() => correo.reintentar(c.id)} className="font-medium text-primary-600 hover:underline">
                      Reintentar
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {correo.correo.length > 6 && (
        <button type="button" onClick={() => setTodos((v) => !v)} className="text-[11px] font-medium text-foreground-500 hover:text-foreground-900">
          {todos ? 'Ver menos' : `Ver los ${correo.correo.length}`}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Día: flechas para ir día a día o elegirlo en el calendario         */
/* ------------------------------------------------------------------ */
function sumarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d + n).toLocaleDateString('sv-SE');
}

function nombreDia(fecha: string): string {
  const hoy = hoyISO();
  if (fecha === hoy) return 'Hoy';
  if (fecha === sumarDias(hoy, -1)) return 'Ayer';
  const [y, m, d] = fecha.split('-').map(Number);
  const f = new Date(y, m - 1, d);
  const texto = f.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    ...(y !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function SelectorDia({ dia, onDia, total, n }: { dia: string | null; onDia: (d: string | null) => void; total: number; n: number }) {
  const calendario = useRef<HTMLInputElement>(null);
  const hoy = hoyISO();
  const base = dia ?? hoy;
  const anterior = dia ? sumarDias(base, -1) : sumarDias(hoy, -1);
  const siguiente = dia ? sumarDias(base, 1) : hoy;
  const puedeSiguiente = !dia || dia < hoy;

  const abrirCalendario = () => {
    const el = calendario.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };

  const flecha = 'w-9 h-9 md:w-8 md:h-8 flex-shrink-0 rounded-full flex items-center justify-center text-foreground-600 hover:bg-background-100 hover:text-foreground-950 disabled:opacity-30 disabled:hover:bg-transparent transition-colors';

  return (
    <div className="flex items-center gap-1 mb-3 p-1 rounded-2xl bg-background-50 border border-background-200/70 shadow-card">
      <button type="button" onClick={() => onDia(anterior)} aria-label="Día anterior" title="Día anterior" className={flecha}>
        <i className="ri-arrow-left-s-line text-lg"></i>
      </button>
      <div className="relative min-w-0">
        <button
          type="button"
          onClick={abrirCalendario}
          className="inline-flex items-center gap-2 h-9 md:h-8 px-3 rounded-full hover:bg-background-100 text-sm font-semibold text-foreground-950 whitespace-nowrap"
          title="Elegir día en el calendario"
        >
          <i className="ri-calendar-line text-foreground-500"></i>
          {dia ? nombreDia(dia) : 'Todos los días'}
        </button>
        <input
          ref={calendario}
          type="date"
          value={dia ?? ''}
          max={hoy}
          onChange={(e) => e.target.value && onDia(e.target.value)}
          tabIndex={-1}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
        />
      </div>
      <button
        type="button"
        onClick={() => onDia(siguiente)}
        disabled={!puedeSiguiente}
        aria-label="Día siguiente"
        title="Día siguiente"
        className={flecha}
      >
        <i className="ri-arrow-right-s-line text-lg"></i>
      </button>
      <div className="ml-auto flex items-center gap-2 pr-1 min-w-0">
        {dia && (
          <span className="hidden sm:inline text-xs text-foreground-500 tabular-nums whitespace-nowrap">
            {n} {n === 1 ? 'albarán' : 'albaranes'} · {formatEUR(total)}
          </span>
        )}
        {dia && dia !== hoy && (
          <button type="button" onClick={() => onDia(hoy)} className="h-8 px-3 rounded-full text-xs font-medium text-foreground-600 hover:bg-background-100 hover:text-foreground-950">
            Hoy
          </button>
        )}
        {dia && (
          <button
            type="button"
            onClick={() => onDia(null)}
            className="h-8 px-3 rounded-full text-xs font-medium text-foreground-600 hover:bg-background-100 hover:text-foreground-950 whitespace-nowrap"
          >
            Todos
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel                                                              */
/* ------------------------------------------------------------------ */
export default function ComprasPanel({ datos, productos, correo }: { datos: ComprasDatos; productos: Producto[]; correo: CorreoCompras }) {
  const bandeja = useBandeja();
  const [aviso, setAviso] = useState<string | null>(null);
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'pendientes' | 'confirmadas' | 'anuladas' | 'todas'>('pendientes');
  const [busqueda, setBusqueda] = useState('');
  // Día del albarán que se está viendo (null = todos los días). Se entra en hoy.
  const [dia, setDia] = useState<string | null>(() => hoyISO());

  const pendientes = datos.compras.filter((c) => c.estado === 'pendiente');
  const abierta = datos.compras.find((c) => c.id === abiertaId) ?? null;

  const alGuardar = (ids: string[]) => {
    if (ids.length === 1) {
      setAbiertaId(ids[0]);
    } else if (ids.length > 1) {
      setFiltro('pendientes');
      setDia(null);
      setAviso(`Guardados ${ids.length} albaranes: los tienes en «Por revisar».`);
    }
  };

  // Arrastrar y soltar la foto o el PDF en cualquier parte del panel (ordenador).
  const [arrastrando, setArrastrando] = useState(false);
  const soltar = (e: React.DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    const files = Array.from(e.dataTransfer.files ?? []).filter((f) => f.type.startsWith('image/') || esPdf(f));
    if (files.length) bandeja.añadir(files);
  };

  const delDia = dia ? datos.compras.filter((c) => c.fecha === dia) : datos.compras;
  const cuentas = {
    pendientes: delDia.filter((c) => c.estado === 'pendiente').length,
    confirmadas: delDia.filter((c) => c.estado === 'confirmada').length,
    anuladas: delDia.filter((c) => c.estado === 'anulada').length,
    todas: delDia.length,
  };
  const totalDia = delDia.filter((c) => c.estado !== 'anulada').reduce((s, c) => s + (c.total ?? 0), 0);
  // Que no se olvide lo pendiente de otros días aunque se esté viendo uno.
  const pendientesOtrosDias = dia ? pendientes.filter((c) => c.fecha !== dia).length : 0;
  const q = normalizarCompra(busqueda);
  const visibles = delDia
    .filter((c) =>
      filtro === 'todas'
        ? true
        : filtro === 'pendientes'
          ? c.estado === 'pendiente'
          : filtro === 'confirmadas'
            ? c.estado === 'confirmada'
            : c.estado === 'anulada',
    )
    .filter((c) => !q || normalizarCompra([c.proveedor, c.numero, ...c.lineas.map((l) => l.texto)].join(' ')).includes(q))
    .sort((a, b) =>
      filtro === 'pendientes' ? b.created_at.localeCompare(a.created_at) : b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at),
    );
  const PESTANAS: { valor: typeof filtro; texto: string; n: number }[] = [
    { valor: 'pendientes', texto: 'Por revisar', n: cuentas.pendientes },
    { valor: 'confirmadas', texto: 'Confirmados', n: cuentas.confirmadas },
    { valor: 'anuladas', texto: 'Anulados', n: cuentas.anuladas },
    { valor: 'todas', texto: 'Todos', n: cuentas.todas },
  ];

  return (
    <div
      className="relative px-4 md:px-6 lg:px-8 py-4 lg:py-6 max-w-[1400px] mx-auto"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setArrastrando(false);
      }}
      onDrop={soltar}
    >
      {arrastrando && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary-500/10 backdrop-blur-[1px]">
          <div className="rounded-2xl border-2 border-dashed border-primary-500 bg-background-50 px-8 py-6 text-center shadow-2xl">
            <i className="ri-upload-cloud-2-line text-3xl text-primary-500"></i>
            <p className="mt-1 text-sm font-semibold text-foreground-950">Suelta para leer los albaranes</p>
          </div>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6 lg:items-start space-y-4 lg:space-y-0">
        <aside className="space-y-4 lg:sticky" style={{ top: 'calc(var(--admin-header-height, 0px) + 1.5rem)' }}>
          {bandeja.hojas.length === 0 && <Captura onFotos={bandeja.añadir} />}
          <BandejaAlbaranes bandeja={bandeja} datos={datos} productos={productos} onGuardadas={alGuardar} />
          {aviso && (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <i className="ri-error-warning-line text-base leading-none"></i>
              <p className="flex-1">{aviso}</p>
              <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="text-amber-700 hover:text-amber-900">
                <i className="ri-close-line"></i>
              </button>
            </div>
          )}
          <Correo correo={correo} compras={datos.compras} onAbrir={setAbiertaId} />
          <Resumen compras={datos.compras} />
        </aside>

        <section className="min-w-0">
          <SelectorDia dia={dia} onDia={setDia} total={totalDia} n={cuentas.todas - cuentas.anuladas} />
          {pendientesOtrosDias > 0 && (
            <button
              type="button"
              onClick={() => {
                setDia(null);
                setFiltro('pendientes');
              }}
              className="w-full mb-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-left text-xs text-amber-800 hover:bg-amber-100"
            >
              <i className="ri-error-warning-line text-base leading-none"></i>
              <span className="flex-1">
                {pendientesOtrosDias === 1 ? 'Hay 1 albarán por revisar' : `Hay ${pendientesOtrosDias} albaranes por revisar`} de otros días.
              </span>
              <span className="font-semibold whitespace-nowrap">
                Ver {pendientesOtrosDias === 1 ? 'lo' : 'los'} <i className="ri-arrow-right-s-line"></i>
              </span>
            </button>
          )}
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 mb-3">
            <div className="flex gap-1 p-1 rounded-full bg-background-100 border border-background-200/70 overflow-x-auto scrollbar-hide self-start max-w-full">
              {PESTANAS.map((t) => (
                <button
                  key={t.valor}
                  type="button"
                  onClick={() => setFiltro(t.valor)}
                  aria-pressed={filtro === t.valor}
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    filtro === t.valor ? 'bg-background-50 text-foreground-950 shadow-card' : 'text-foreground-500 hover:text-foreground-950'
                  }`}
                >
                  {t.texto}
                  <span className={`tabular-nums text-[11px] ${filtro === t.valor ? 'text-foreground-500' : 'text-foreground-400'}`}>{t.n}</span>
                </button>
              ))}
            </div>
            <label className="relative md:ml-auto md:w-72">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm pointer-events-none"></i>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar proveedor, nº o producto"
                aria-label="Buscar albaranes"
                className="w-full h-10 md:h-9 pl-9 pr-3 rounded-full bg-background-50 border border-background-200/70 text-sm focus:outline-none focus:border-foreground-300/60"
              />
            </label>
          </div>

          {datos.loading ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((k) => (
                <div key={k} className="h-[68px] rounded-xl bg-background-50 border border-background-200/70 animate-pulse" />
              ))}
            </div>
          ) : visibles.length === 0 ? (
            <div className="flex flex-col items-center text-center gap-2 rounded-2xl border border-dashed border-background-200 bg-background-50/60 px-6 py-12">
              <span className="w-12 h-12 rounded-full bg-background-100 text-foreground-400 flex items-center justify-center">
                <i className={`${q ? 'ri-search-line' : filtro === 'pendientes' ? 'ri-inbox-2-line' : 'ri-file-list-3-line'} text-xl`}></i>
              </span>
              <p className="text-sm font-semibold text-foreground-950">
                {q
                  ? 'Nada coincide con la búsqueda'
                  : dia
                    ? `No hay albaranes ${filtro === 'pendientes' ? 'por revisar ' : ''}con fecha ${nombreDia(dia).toLowerCase()}`
                    : filtro === 'pendientes'
                      ? 'No hay albaranes por revisar'
                      : 'Todavía no hay albaranes aquí'}
              </p>
              <p className="text-xs text-foreground-500 max-w-xs">
                {q
                  ? 'Prueba con otro proveedor, número o producto.'
                  : dia
                    ? 'Muévete con las flechas, elige otro día en el calendario o pulsa «Todos».'
                    : filtro === 'pendientes'
                    ? 'Haz la foto del albarán (o sube el PDF) y aparecerá aquí, ya leído, para revisarlo y confirmarlo.'
                    : 'Los albaranes confirmados y anulados se quedan aquí, con su foto.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 md:space-y-0 md:rounded-2xl md:border md:border-background-200/70 md:bg-background-50 md:shadow-card md:overflow-hidden">
              <div className="hidden md:grid grid-cols-[88px_minmax(0,1fr)_170px_110px_20px] gap-4 px-4 py-2 bg-background-100/70 border-b border-background-200/70 text-[10px] font-semibold uppercase tracking-wide text-foreground-400">
                <span>Fecha</span>
                <span>Proveedor y productos</span>
                <span>Estado</span>
                <span className="text-right">Total</span>
                <span></span>
              </div>
              {visibles.slice(0, 100).map((c) => (
                <FilaCompra key={c.id} compra={c} onAbrir={() => setAbiertaId(c.id)} />
              ))}
            </div>
          )}
        </section>
      </div>

      {abierta && <CompraEditor key={abierta.id} compra={abierta} datos={datos} productos={productos} onClose={() => setAbiertaId(null)} />}
    </div>
  );
}
