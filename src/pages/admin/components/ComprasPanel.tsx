import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { useCompras } from '@/hooks/useCompras';
import type { Compra, CompraCorreo, CompraLinea } from '@/types/compra';
import type { Producto } from '@/types/producto';
import { esProveedorGasto, normalizarCompra, sumaLineas } from '@/lib/comprasOcr';
import { leerNotaListado, MARCA_LISTADO } from '@/lib/comprasListado';
import { dudaLinea, leerDictado, NO_PRODUCTO, sugerirProducto } from '@/lib/comprasProductos';
import { esPdf } from '@/lib/comprasPdf';
import type { MarcasAlbaran } from '@/lib/comprasMarcas';
import { buscarCoincidencia, confirmarCoincidencia, describirCoincidencia, describirNoCoincide } from '@/lib/comprasCoincidencias';
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

// Una línea de solo importe («Agua 126,03», «Basuras 137,57») también vale.
const lineaCuadra = (l: { kg: number | null; precio: number | null; importe: number | null }) =>
  (l.kg == null && l.precio == null && l.importe != null) ||
  (l.kg != null && l.precio != null && l.importe != null && Math.abs(l.kg * l.precio - l.importe) <= 0.06);

// «+ IVA y recargo 11,4 %», o nada si el total ya es la suma (agua y basuras).
const textoImpuestos = (pct: number) => (pct < 0.05 ? '' : ` + IVA y recargo ${pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`);

// Cómo está un albarán de un vistazo: lo que hay que hacer con él.
type Situacion = { etiqueta: string; icono: string; clase: string };
// `dudas`: líneas sin producto nuestro o elegido solo por parecido (ver
// dudaLinea); con alguna, nunca está «Lista para confirmar».
function situacion(c: Compra, dudas: number): Situacion {
  if (c.estado === 'confirmada') return { etiqueta: 'Confirmado', icono: 'ri-checkbox-circle-fill', clase: 'bg-emerald-50 text-emerald-700 ring-emerald-200' };
  if (c.estado === 'anulada') return { etiqueta: 'Anulado', icono: 'ri-close-circle-line', clase: 'bg-background-100 text-foreground-500 ring-background-200' };
  if (!c.lineas.length) return { etiqueta: 'Sin productos', icono: 'ri-edit-line', clase: 'bg-amber-50 text-amber-700 ring-amber-200' };
  if (dudas) return { etiqueta: 'Elegir productos', icono: 'ri-question-line', clase: 'bg-amber-50 text-amber-700 ring-amber-200' };
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
    <div className="bg-background-50 border border-background-200/70 rounded-2xl shadow-card p-3">
      {/* Móvil: la cámara manda. */}
      <label className="lg:hidden flex items-center justify-center gap-3 w-full h-[72px] rounded-xl text-base font-semibold bg-primary-500 text-background-50 active:bg-primary-600 cursor-pointer">
        <i className="ri-camera-fill text-[28px]"></i>
        Foto del albarán
        <input type="file" accept="image/*" capture="environment" onChange={elegir} className="hidden" />
      </label>
      {/* Ordenador: arrastrar y soltar o elegir el archivo. Compacto para que
          el correo y el resumen quepan en la misma pantalla. */}
      <label
        title="PDF con texto: se lee al instante. Fotos y escaneados: entre 10 s y 1 min."
        className="hidden lg:flex items-center gap-3 w-full rounded-xl border-2 border-dashed border-background-200 hover:border-primary-500/50 hover:bg-primary-500/[0.03] px-3 py-2.5 cursor-pointer transition-colors"
      >
        <span className="w-9 h-9 flex-shrink-0 rounded-full bg-primary-500 text-background-50 flex items-center justify-center">
          <i className="ri-upload-cloud-2-line text-lg"></i>
        </span>
        <span className="min-w-0 flex flex-col">
          <span className="text-sm font-semibold text-foreground-950 leading-tight">Subir fotos o PDF</span>
          <span className="text-[11px] text-foreground-400 leading-snug">Arrástralos aquí o haz clic · varios a la vez</span>
        </span>
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Resumen (columna izquierda en el ordenador; dos cifras en el móvil) */
/* ------------------------------------------------------------------ */
function Resumen({ compras, dudasDe, onVerPendientes }: { compras: Compra[]; dudasDe: (c: Compra) => number; onVerPendientes: () => void }) {
  const pendientes = compras.filter((c) => c.estado === 'pendiente');
  const etiquetas = pendientes.map((c) => situacion(c, dudasDe(c)).etiqueta);
  const listas = etiquetas.filter((e) => e === 'Lista para confirmar').length;
  const porElegir = etiquetas.filter((e) => e === 'Elegir productos').length;
  const mes = hoyISO().slice(0, 7);
  const confirmadasMes = compras.filter((c) => c.estado === 'confirmada' && c.fecha.startsWith(mes));
  const cifra = (valor: string, texto: string, detalle?: string, textoCorto = texto) => (
    <>
      <p className="text-[11px] font-medium text-foreground-400 truncate">
        <span className="lg:hidden">{textoCorto}</span>
        <span className="hidden lg:inline">{texto}</span>
      </p>
      <p className="text-lg font-semibold text-foreground-950 tabular-nums leading-tight mt-0.5">{valor}</p>
      {detalle && <p className="text-[11px] text-foreground-500 mt-0.5">{detalle}</p>}
    </>
  );
  // Qué falta en lo pendiente, en palabras: «1 listo para confirmar · 1 con productos por elegir».
  const queFalta = [
    listas ? `${listas} ${listas === 1 ? 'listo' : 'listos'} para confirmar` : null,
    porElegir ? `${porElegir} con productos por elegir` : null,
    pendientes.length - listas - porElegir ? `${pendientes.length - listas - porElegir} por repasar` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="grid grid-cols-2 lg:grid-cols-1 bg-background-50 border border-background-200/70 rounded-2xl shadow-card divide-x lg:divide-x-0 lg:divide-y divide-background-200/70 overflow-hidden">
      {pendientes.length ? (
        <button type="button" onClick={onVerPendientes} title="Ver los que faltan por revisar" className="group px-4 py-3 min-w-0 text-left bg-amber-50/50 hover:bg-amber-50">
          {cifra(String(pendientes.length), 'Por revisar', `${formatEUR(pendientes.reduce((t, c) => t + (c.total ?? 0), 0))} · ${queFalta}`)}
          <span className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-semibold text-amber-800">
            Verlos <i className="ri-arrow-right-s-line transition-transform group-hover:translate-x-0.5"></i>
          </span>
        </button>
      ) : (
        <div className="px-4 py-3 min-w-0">{cifra('0', 'Por revisar', 'Todo al día')}</div>
      )}
      <div className="px-4 py-3 min-w-0">
      {cifra(
        formatEUR(confirmadasMes.reduce((t, c) => t + (c.total ?? 0), 0)),
        'Compras confirmadas este mes',
        `${confirmadasMes.length} ${confirmadasMes.length === 1 ? 'albarán' : 'albaranes'}`,
        'Confirmado este mes',
      )}
      </div>
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

function FilaCompra({ compra, dudas, onAbrir }: { compra: Compra; dudas: number; onAbrir: () => void }) {
  const s = situacion(compra, dudas);
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
// `elegida`: David ha tocado el desplegable de esta línea (ya no es duda).
type LineaForm = { texto: string; kg: string; precio: string; importe: string; producto_id: string; sumar_stock: boolean; elegida?: boolean };

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
  // Líneas leídas sin producto que David ha quitado (ver botonQuitar).
  const [quitadas, setQuitadas] = useState<string[]>([]);
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

  // Limpieza, agua…: solo gasto, nunca se propone un producto ni stock.
  const esGasto = esProveedorGasto(proveedor);
  const sugerir = (texto: string) => (esGasto ? null : sugerirProducto(texto, proveedor, datos.alias, productos));

  // Al escribir o corregir el nombre de una línea sin producto, se propone uno.
  const cambiarTexto = (i: number, texto: string) => {
    const actual = lineas[i];
    const antes = sugerir(actual.texto);
    const libre = !actual.producto_id || actual.producto_id === antes?.id;
    cambiarLinea(i, libre ? { texto, producto_id: sugerir(texto)?.id ?? '', elegida: false } : { texto });
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
  // Repetida solo si además coinciden productos, precios y total.
  const parecida = coincide && coincide.tipo !== 'parcial' && coincide.tipo !== 'posible' ? coincide : null;
  const repetida = parecida && confirmarCoincidencia(parecida, { total: totalNum, lineas: lineasDatos }) ? parecida : null;
  const noCoincide = parecida && !repetida ? describirNoCoincide(parecida, { total: totalNum, lineas: lineasDatos }, formatFecha) : null;

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
      (sinProducto
        ? `\n\nOjo: ${sinProducto === 1 ? 'una línea va' : `${sinProducto} líneas van`} sin producto nuestro (en naranja): no ${sinProducto === 1 ? 'sumará' : 'sumarán'} al stock.`
        : '') +
      (merluzas
        ? `\n\nOjo: ${merluzas === 1 ? 'una línea de merluza va' : `${merluzas} líneas de merluza van`} sin elegir si es merluza o pescadilla: no ${merluzas === 1 ? 'sumará' : 'sumarán'} al stock.`
        : '') +
      (sugeridos ? `\n\n${sugeridos === 1 ? 'Un producto está elegido' : `${sugeridos} productos están elegidos`} por parecido de nombre: ¿los has comprobado?` : '') +
      (repetida ? `\n\nOjo: ${describirCoincidencia(repetida, formatFecha)} No lo confirmes dos veces.` : '');
    if (!confirm(msg)) return;
    const d = datosCompra();
    ejecutar(async () => {
      await datos.confirmarCompra(compra.id, d);
      // Si ha vuelto a escribir la misma línea, no se olvida.
      const olvidar = quitadas.filter((t) => !d.lineas.some((l) => normalizarCompra(l.texto) === normalizarCompra(t)));
      // La compra ya está confirmada: si esto falla, solo se pierde el recuerdo.
      await datos.recordarQuitadas(d.proveedor, olvidar).catch((e) => console.warn('No se recordaron las líneas quitadas', e));
    });
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

  // Piezas de cada línea, compartidas por la tarjeta (móvil) y la fila (ordenador).
  const infoLinea = (i: number) => {
    const d = lineasDatos[i];
    const completa = d.kg != null && d.precio != null && d.importe != null;
    const s = d.producto_id ? sugerir(lineas[i].texto) : null;
    const duda = lineas[i].elegida ? null : dudaLinea(d, proveedor, datos.alias, productos);
    return { completa, ok: lineaCuadra(d), motivo: s && s.id === d.producto_id ? s.motivo : null, duda };
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
    const { motivo, duda } = infoLinea(i);
    // Ya confirmado o anulado: un desplegable bloqueado corta el nombre y no se
    // puede abrir, así que se enseña el nombre entero como texto.
    if (!editable) {
      const nombre = productosOrdenados.find((p) => p.id === lineas[i].producto_id)?.nombre_es;
      return (
        <p className={`flex-1 min-w-0 text-sm leading-snug break-words ${nombre ? 'text-foreground-950' : 'text-foreground-400'} ${compacto ? 'px-2 py-1.5' : 'py-1'}`}>
          {!compacto && <i className="ri-store-2-line text-foreground-400 mr-1.5"></i>}
          {nombre ?? 'Sin producto'}
        </p>
      );
    }
    return (
    <div className="relative flex-1 min-w-0">
      {!compacto && <i className="ri-store-2-line absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-400 text-sm pointer-events-none"></i>}
      <select
        value={lineas[i].producto_id}
        onChange={(e) => cambiarLinea(i, { producto_id: e.target.value, elegida: true })}
        disabled={!editable}
        aria-label="Producto nuestro"
        title={
          duda === 'sin_producto'
            ? 'No se ha sabido a qué producto nuestro va: elígelo'
            : duda === 'merluza'
            ? 'La factura no dice si es merluza o pescadilla: elígelo'
            : duda === 'parecido'
            ? 'Sugerido por el nombre: compruébalo esta primera vez'
            : motivo === 'recordado'
              ? 'Recordado de otras compras a este proveedor'
              : undefined
        }
        className={`w-full bg-background-100 border rounded-lg text-sm focus:outline-none focus:border-foreground-300/60 ${
          compacto ? 'h-9 px-2' : 'pl-8 pr-2 py-2'
        } ${lineas[i].producto_id ? 'text-foreground-950' : 'text-foreground-400'} ${
          duda ? 'border-amber-400 ring-2 ring-amber-200/70' : motivo === 'recordado' ? 'border-emerald-300' : 'border-background-200/70'
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
        onClick={() => {
          const l = lineas[i];
          // Una línea leída y sin producto que se quita es basura (p. ej.
          // «Forma de pago…»): al confirmar se recuerda para este proveedor.
          if (l.texto.trim() && !l.producto_id && compra.lineas.some((o) => !o.producto_id && normalizarCompra(o.texto) === normalizarCompra(l.texto)))
            setQuitadas((q) => [...q, l.texto]);
          setLineas((p) => p.filter((_, k) => k !== i));
        }}
        aria-label="Quitar línea"
        title={lineas[i]?.producto_id ? 'Quitar línea' : 'Quitar línea (no volverá a salir en los albaranes de este proveedor)'}
        className="w-8 h-8 flex items-center justify-center rounded-full text-foreground-300 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
      >
        <i className="ri-delete-bin-line"></i>
      </button>
    ) : (
      <span />
    );
  const dudas = lineas.map((_, i) => infoLinea(i).duda);
  const sugeridos = dudas.filter((d) => d === 'parecido').length;
  const sinProducto = dudas.filter((d) => d === 'sin_producto').length;
  const merluzas = dudas.filter((d) => d === 'merluza').length;
  const porRevisar = sugeridos + sinProducto + merluzas;
  // Solo se pinta en verde si cuadra y no queda ningún producto por mirar.
  const todoBien = cuadra && !porRevisar;
  const textoDuda = {
    sin_producto: 'No se ha sabido a qué producto nuestro va: elígelo (o quita la línea si no es género).',
    parecido: 'Elegido por parecido de nombre: comprueba que es este.',
    merluza: 'La factura no dice si es merluza o pescadilla (solo cambia el precio): elige cuál es.',
  };
  const sit = editable ? situacion({ ...compra, lineas: lineasDatos, total: totalNum }, porRevisar) : situacion(compra, 0);

  // Esc cierra (si la foto a pantalla completa está abierta, la cierra ella).
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && !visor && onClose();
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [visor, onClose]);

  const tituloCuadre = porRevisar
    ? porRevisar === 1
      ? 'Falta elegir 1 producto'
      : `Faltan por elegir ${porRevisar} productos`
    : cuadra
      ? 'Cuadra'
      : totalNum == null
        ? 'Falta el total'
        : lineas.length === 0
          ? 'Sin productos'
          : 'No cuadra';
  const resumenCuadre = (
    <>
      <span className="font-semibold">{tituloCuadre}</span>
      <span className="opacity-90">
        {' · '}Productos {formatEUR(suma)}
        {cuadra ? textoImpuestos(impuestos) : lineas.length === 0 ? ' · solo se apuntará el gasto' : ''}
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

          {esGasto && (
            <div className="flex items-start gap-2 rounded-xl p-3 text-xs bg-sky-50 text-sky-800">
              <i className="ri-receipt-line text-base leading-none"></i>
              <p>No es género: solo se apunta el gasto en Contabilidad, no se suma nada al stock.</p>
            </div>
          )}
          {(repetida || noCoincide || compra.nota || compra.origen === 'email') && (
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
                {noCoincide && noCoincide !== compra.nota && <p>{noCoincide}</p>}
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
            {editable && porRevisar > 0 && (
              <div className="flex items-start gap-2 mb-2.5 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                <i className="ri-lightbulb-line text-sm leading-none mt-px"></i>
                <div className="space-y-1">
                  {sinProducto > 0 && (
                    <p>
                      {sinProducto === 1 ? 'Una línea no se ha sabido ligar' : `${sinProducto} líneas no se han sabido ligar`} a un producto nuestro (borde
                      naranja): elígelo en el desplegable, o quita la línea si no es género.
                    </p>
                  )}
                  {merluzas > 0 && (
                    <p>
                      {merluzas === 1 ? 'Una línea de merluza' : `${merluzas} líneas de merluza`}: la factura no dice si es merluza o pescadilla
                      (solo cambia el precio). Elige cuál es en el desplegable.
                    </p>
                  )}
                  {sugeridos > 0 && (
                    <p>
                      {sugeridos === 1 ? 'Un producto está elegido' : `${sugeridos} productos están elegidos`} por parecido de nombre (borde naranja):
                      compruébalos esta primera vez.
                    </p>
                  )}
                  {sinProducto + sugeridos > 0 && <p>Al confirmar se recuerdan y la próxima vez salen solos.</p>}
                </div>
              </div>
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
                const { ok, completa, duda } = infoLinea(i);
                return (
                  <div key={i} className={`rounded-2xl border p-3 ${ok && !duda ? 'border-background-200/70 bg-background-50' : 'border-amber-300 bg-amber-50/60'}`}>
                    <div className="flex items-center gap-2">
                      {iconoEstado(ok && !duda)}
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
                    {editable && duda && <p className="text-[11px] text-amber-700 mt-1.5">{textoDuda[duda]}</p>}
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
                  const { ok, completa, duda } = infoLinea(i);
                  return (
                    <div key={i} className={`border-t border-background-200/70 px-3 py-2 ${ok && !duda ? '' : 'bg-amber-50/60'}`}>
                      <div className="grid grid-cols-[22px_minmax(0,1.25fr)_76px_12px_80px_12px_88px_minmax(0,1fr)_36px_32px] items-center gap-2">
                        {iconoEstado(ok && !duda)}
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
                      {editable && duda && <p className="pl-[30px] mt-0.5 text-[11px] text-amber-700">{textoDuda[duda]}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Total y cuadre */}
          <div className={`rounded-2xl p-4 md:flex md:items-center md:gap-4 ${todoBien ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
            <div className="flex items-center gap-3 md:flex-1 md:min-w-0">
              <span
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  todoBien ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                }`}
              >
                <i className={`${todoBien ? 'ri-check-double-line' : porRevisar ? 'ri-question-line' : 'ri-scales-3-line'} text-xl`}></i>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{tituloCuadre}</p>
                <p className="text-xs opacity-90">
                  Productos {formatEUR(suma)}
                  {porRevisar
                    ? `${cuadra ? textoImpuestos(impuestos) : ''} · elige los productos en naranja`
                    : cuadra
                    ? textoImpuestos(impuestos)
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
          <p className={`md:hidden flex-shrink-0 border-t px-4 py-2 text-xs truncate ${todoBien ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
            <i className={`${todoBien ? 'ri-check-double-line' : porRevisar ? 'ri-question-line' : 'ri-scales-3-line'} mr-1`}></i>
            {resumenCuadre}
          </p>
        )}
        <div className="flex items-center gap-2 px-4 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-background-200/70 flex-shrink-0">
          {editable ? (
            <>
              <p className={`hidden md:block flex-1 min-w-0 truncate text-xs ${todoBien ? 'text-emerald-700' : 'text-amber-700'}`}>{resumenCuadre}</p>
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
// «Pescados Arraiza <noresponder@…>» → «Pescados Arraiza».
const quien = (c: CompraCorreo) => (c.remitente_original ?? c.remitente ?? '').replace(/\s*<[^>]*>\s*/g, '').trim() || c.nombre;

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

// Qué es el documento, en palabras: el tipo de la compra que creó o, si no,
// lo que dice el nombre del archivo (ADELAIDA_CLIFAC_… → Factura).
const esListado = (c: CompraCorreo) => !!c.nota?.startsWith(MARCA_LISTADO);

function tipoDocumento(c: CompraCorreo, compra: Compra | undefined): string {
  if (esListado(c)) return 'Listado del gremio';
  if (compra && c.estado === 'metido') return compra.tipo === 'factura' ? 'Factura' : 'Albarán';
  if (/fac|fra/i.test(c.nombre)) return 'Factura';
  if (/alb/i.test(c.nombre)) return 'Albarán';
  return c.tipo_mime.startsWith('image/') ? 'Foto' : 'Documento';
}

const ICONO_CORREO: Partial<Record<CompraCorreo['estado'], { icono: string; clase: string; caja: string }>> = {
  repetido: { icono: 'ri-file-copy-2-line', clase: 'bg-amber-100 text-amber-700', caja: 'border-amber-200 bg-amber-50/50' },
  error: { icono: 'ri-error-warning-line', clase: 'bg-red-100 text-red-600', caja: 'border-red-200 bg-red-50/50' },
  leyendo: { icono: 'ri-loader-4-line animate-spin', clase: 'bg-sky-100 text-sky-600', caja: 'border-background-200/70' },
  nuevo: { icono: 'ri-time-line', clase: 'bg-background-100 text-foreground-500', caja: 'border-background-200/70' },
};

// «ARRAINKO ANAIAK» → «Arrainko Anaiak».
const titulo = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
const fechaDia = (dia: string) => {
  const [d, m] = dia.split('-').map(Number);
  return new Date(2000, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

// Listado del gremio: qué facturas del gremio faltan en Gastos, cuáles tienen
// otro importe y qué hay en Gastos que el gremio no trae.
function ListadoGremio({
  item,
  documento,
  compras,
  abierto,
  onAbrir,
}: {
  item: CompraCorreo;
  documento: React.ReactNode;
  compras: Compra[];
  abierto: boolean;
  onAbrir: (id: string) => void;
}) {
  const [ver, setVer] = useState(abierto);
  const l = leerNotaListado(item.nota);
  // Los listados viejos solo guardaron «no cuenta como gasto».
  if (!l || l.recibos == null)
    return (
      <li className="flex items-center gap-2.5 rounded-xl border border-background-200 bg-background-50 p-3">
        <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-sky-100 text-sky-700">
          <i className="ri-scales-3-line"></i>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground-950 truncate leading-tight">Listado del gremio</p>
          {documento}
        </div>
      </li>
    );

  const completo = l.estan === l.recibos && !l.faltan.length && !l.distintos.length && !l.sobran.length;
  const sumaFaltan = l.faltan.reduce((t, f) => t + (f.importe ?? 0), 0);
  const pct = l.recibos ? Math.round(((l.estan ?? 0) / l.recibos) * 100) : 0;
  // La compra de Gastos que el listado no trae, para poder abrirla.
  const compraDe = (s: { proveedor: string; dia: string; total: number | null }) =>
    compras.find(
      (c) =>
        c.estado !== 'anulada' &&
        c.proveedor === s.proveedor &&
        `${c.fecha.slice(8, 10)}-${c.fecha.slice(5, 7)}` === s.dia &&
        (s.total == null ? c.total == null : c.total != null && Math.abs(c.total - s.total) <= 0.01),
    );
  const cabecera = (texto: string, n: number, clase: string, icono: string, ayuda?: string) => (
    <div className="flex items-center gap-1.5 px-3 pt-3 pb-1">
      <i className={`${icono} ${clase} text-xs`}></i>
      <span className={`text-[11px] font-semibold uppercase tracking-wide ${clase}`}>{texto}</span>
      <span className="text-[11px] font-semibold text-foreground-400 tabular-nums">{n}</span>
      {ayuda && <span className="ml-auto text-[10px] text-foreground-400 truncate">{ayuda}</span>}
    </div>
  );
  const fila = 'flex items-center gap-2 px-3 py-1.5';

  return (
    <li className="rounded-xl border border-background-200 bg-background-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        aria-expanded={ver}
        className="w-full flex items-center gap-2.5 p-3 text-left hover:bg-background-100/50 transition-colors"
      >
        <span
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            completo ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          <i className={completo ? 'ri-check-double-line' : 'ri-scales-3-line'}></i>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground-950 truncate leading-tight">
            Listado del gremio
            {l.al && <span className="font-normal text-foreground-500"> · al {fechaDia(l.al)}</span>}
          </p>
          <p className="text-[11px] text-foreground-500 leading-tight truncate">
            {completo
              ? `Todo en Gastos · ${l.recibos} facturas`
              : `${l.estan ?? 0} de ${l.recibos} en Gastos${l.faltan.length ? ` · faltan ${l.faltan.length}` : ''}`}
          </p>
        </div>
        <i className={`ri-arrow-down-s-line text-base text-foreground-400 transition-transform ${ver ? 'rotate-180' : ''}`}></i>
      </button>

      {ver && (
        <div className="border-t border-background-200/70">
          <div className="px-3 pt-2.5">
            <div className="flex items-baseline justify-between text-[11px] text-foreground-500">
              <span>
                <span className="font-semibold text-foreground-900 tabular-nums">{l.estan ?? 0}</span> de{' '}
                <span className="tabular-nums">{l.recibos}</span> facturas en Gastos
              </span>
              <span className="tabular-nums">{formatEUR(l.total)}</span>
            </div>
            <div
              className="mt-1.5 h-1.5 rounded-full bg-background-200 overflow-hidden"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className={`h-full rounded-full ${completo ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }}></div>
            </div>
          </div>

          {l.faltan.length > 0 && (
            <div>
              {cabecera('Faltan en Gastos', l.faltan.length, 'text-amber-700', 'ri-error-warning-line', 'hay que subirlas')}
              <ul className="divide-y divide-background-200/60">
                {l.faltan.map((f, i) => (
                  <li key={i} className={fila}>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground-900 truncate">{titulo(f.proveedor)}</p>
                      <p className="text-[11px] text-foreground-500 tabular-nums truncate">
                        {fechaDia(f.dia)} · nº {f.factura}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-foreground-900 tabular-nums whitespace-nowrap">{formatEUR(f.importe)}</span>
                  </li>
                ))}
              </ul>
              {l.faltan.length > 1 && (
                <div className="flex justify-between px-3 py-1.5 bg-amber-50/70 text-[11px] text-amber-800">
                  <span>Total que falta</span>
                  <span className="font-semibold tabular-nums">{formatEUR(sumaFaltan)}</span>
                </div>
              )}
            </div>
          )}

          {l.distintos.length > 0 && (
            <div>
              {cabecera('Otro importe', l.distintos.length, 'text-sky-700', 'ri-arrow-left-right-line')}
              <ul className="divide-y divide-background-200/60">
                {l.distintos.map((d, i) => (
                  <li key={i} className={fila}>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground-900 truncate">{titulo(d.proveedor)}</p>
                      <p className="text-[11px] text-foreground-500 tabular-nums truncate">
                        nº {d.factura} · en Gastos {formatEUR(d.guardado)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-foreground-900 tabular-nums whitespace-nowrap">{formatEUR(d.importe)}</p>
                      {d.importe != null && d.guardado != null && (
                        <p className="text-[10px] text-sky-700 tabular-nums whitespace-nowrap">
                          {d.importe > d.guardado ? '+' : ''}
                          {formatEUR(Math.round((d.importe - d.guardado) * 100) / 100)}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {l.sobran.length > 0 && (
            <div>
              {cabecera('No están en el listado', l.sobran.length, 'text-foreground-600', 'ri-question-line', '¿repetida o mal leída?')}
              <ul className="divide-y divide-background-200/60">
                {l.sobran.map((s, i) => {
                  const compra = compraDe(s);
                  const contenido = (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground-900 truncate">{s.proveedor}</p>
                        <p className="text-[11px] text-foreground-500 tabular-nums">{fechaDia(s.dia)}</p>
                      </div>
                      <span className="text-xs font-semibold text-foreground-900 tabular-nums whitespace-nowrap">{formatEUR(s.total)}</span>
                      {compra && <i className="ri-arrow-right-s-line text-foreground-400"></i>}
                    </>
                  );
                  return (
                    <li key={i}>
                      {compra ? (
                        <button
                          type="button"
                          onClick={() => onAbrir(compra.id)}
                          title="Abrir en Gastos"
                          className={`${fila} w-full text-left hover:bg-background-100/60 transition-colors`}
                        >
                          {contenido}
                        </button>
                      ) : (
                        <div className={fila}>{contenido}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between gap-2 px-3 py-2 border-t border-background-200/70 bg-background-100/40">
            <span className="text-[10px] text-foreground-400 whitespace-nowrap">No cuenta como gasto</span>
            <div className="min-w-0">{documento}</div>
          </div>
        </div>
      )}
    </li>
  );
}

function Correo({ correo, compras, onAbrir }: { correo: CorreoCompras; compras: Compra[]; onAbrir: (id: string) => void }) {
  const [verGuardados, setVerGuardados] = useState(false);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  if (!correo.correo.length) return null;

  const compraDe = (c: CompraCorreo) => (c.compra_id ? compras.find((x) => x.id === c.compra_id) : undefined);
  // El proveedor que sacó el lector antes que la dirección de correo.
  const nombre = (c: CompraCorreo) => compraDe(c)?.proveedor || quien(c);
  const verArchivo = async (c: CompraCorreo) => {
    const url = await correo.urlArchivo(c.archivo_path);
    if (url) window.open(url, '_blank', 'noopener');
  };
  const accion = async (c: CompraCorreo, fn: () => Promise<unknown>) => {
    setTrabajando(c.id);
    try {
      await fn();
    } finally {
      setTrabajando(null);
    }
  };

  // Arriba solo lo que pide hacer algo; lo guardado solo y los repetidos ya
  // revisados quedan plegados.
  const resuelto = (c: CompraCorreo) => c.estado === 'metido' || c.estado === 'descartado';
  const atencion = correo.correo.filter((c) => !resuelto(c));
  // Listados del gremio: no se guardan, solo se enseña el contraste.
  const listados = correo.correo.filter(esListado);
  const guardados = correo.correo.filter((c) => resuelto(c) && !esListado(c));
  const nRepetidos = guardados.filter((c) => c.estado === 'descartado').length;
  const avisos = atencion.filter((c) => c.estado === 'repetido' || c.estado === 'error').length;

  const documento = (c: CompraCorreo) => (
    <button
      type="button"
      onClick={() => verArchivo(c)}
      title={`Abrir ${c.nombre}`}
      className="inline-flex items-center gap-1 max-w-full text-[11px] text-foreground-500 hover:text-foreground-900"
    >
      <i className={`${c.tipo_mime.startsWith('image/') ? 'ri-image-line' : 'ri-file-pdf-2-line'} text-xs`}></i>
      <span className="truncate">
        {tipoDocumento(c, compraDe(c))} · {fechaCorta(c.recibido ?? c.created_at)}
      </span>
    </button>
  );
  const boton = 'h-9 lg:h-8 px-3 rounded-full text-xs font-medium inline-flex items-center justify-center gap-1 whitespace-nowrap disabled:opacity-50 transition-colors';

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-2xl shadow-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-3">
        <span className="w-8 h-8 rounded-full bg-primary-500/10 text-primary-600 flex items-center justify-center flex-shrink-0">
          <i className="ri-mail-line"></i>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground-950 leading-tight">Del correo</h2>
          <p className="text-[11px] text-foreground-400 leading-tight truncate">
            {correo.leyendo ? 'Leyendo un documento nuevo…' : 'Facturas y albaranes que llegan solos'}
          </p>
        </div>
        {avisos > 0 && (
          <span
            title={`${avisos} por mirar`}
            className="h-6 min-w-[24px] px-2 rounded-full bg-amber-100 text-amber-800 text-[11px] font-semibold inline-flex items-center justify-center tabular-nums"
          >
            {avisos}
          </span>
        )}
      </div>

      {correo.desfasado && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <i className="ri-refresh-line text-base"></i>
          <span className="flex-1">La web se ha actualizado: recarga para leer lo nuevo del correo.</span>
          <button type="button" onClick={() => window.location.reload()} className="font-semibold hover:underline">
            Recargar
          </button>
        </div>
      )}

      {atencion.length === 0 ? (
        <div className="mx-3 mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
          <i className="ri-checkbox-circle-fill text-base text-emerald-500"></i>
          Todo lo del correo está guardado.
        </div>
      ) : (
        <ul className="px-3 pb-3 space-y-2">
          {atencion.map((c) => {
            const ic = ICONO_CORREO[c.estado] ?? ICONO_CORREO.nuevo!;
            const ya = compraDe(c);
            const ocupado = trabajando === c.id;
            return (
              <li key={c.id} className={`rounded-xl border p-3 ${ic.caja}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${ic.clase}`}>
                    <i className={ic.icono}></i>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground-950 truncate leading-tight">{nombre(c)}</p>
                    {documento(c)}
                  </div>
                </div>
                {c.estado === 'repetido' && (
                  <>
                    <p className="mt-2 text-xs text-foreground-600 leading-snug">
                      <span className="font-medium text-amber-800">Parece repetido.</span> {c.nota}
                    </p>
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                      {ya && (
                        <button
                          type="button"
                          onClick={() => onAbrir(ya.id)}
                          title="Abrir el que ya está guardado"
                          className={`${boton} px-2 bg-background-50 border border-background-200 text-foreground-800 hover:bg-background-100`}
                        >
                          <i className="ri-eye-line"></i>
                          Ver el guardado
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => accion(c, () => correo.guardarIgualmente(c))}
                        title="No es el mismo: guardarlo como nuevo"
                        className={`${boton} px-2 border border-amber-300 text-amber-800 hover:bg-amber-100 ${ya ? '' : 'col-span-2'}`}
                      >
                        <i className={ocupado ? 'ri-loader-4-line animate-spin' : 'ri-add-line'}></i>
                        Es otro, guardarlo
                      </button>
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => accion(c, () => correo.descartar(c.id))}
                        title="Ya está guardado: quitar el aviso"
                        className={`${boton} col-span-2 text-emerald-700 hover:bg-emerald-50`}
                      >
                        <i className="ri-check-line"></i>
                        Sí, es el mismo: quitar aviso
                      </button>
                    </div>
                  </>
                )}
                {c.estado === 'error' && (
                  <>
                    <p className="mt-2 text-xs text-red-700 leading-snug line-clamp-2" title={c.nota ?? undefined}>
                      No se pudo leer. {c.nota}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => accion(c, () => correo.reintentar(c.id))}
                        className={`${boton} bg-background-50 border border-background-200 text-foreground-800 hover:bg-background-100`}
                      >
                        <i className={`ri-refresh-line ${ocupado ? 'animate-spin' : ''}`}></i>
                        Reintentar
                      </button>
                    </div>
                  </>
                )}
                {(c.estado === 'leyendo' || c.estado === 'nuevo') && (
                  <p className="mt-1.5 text-[11px] text-foreground-500">{c.estado === 'leyendo' ? 'Leyendo…' : 'En cola para leer'}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {listados.length > 0 && (
        <ul className="px-3 pb-3 space-y-2">
          {listados.slice(0, 2).map((c, i) => (
            <ListadoGremio key={c.id} item={c} documento={documento(c)} compras={compras} abierto={i === 0} onAbrir={onAbrir} />
          ))}
        </ul>
      )}

      {guardados.length > 0 && (
        <div className="border-t border-background-200/70">
          <button
            type="button"
            onClick={() => setVerGuardados((v) => !v)}
            aria-expanded={verGuardados}
            className="w-full flex items-center gap-2 px-4 h-11 lg:h-10 text-xs text-foreground-600 hover:bg-background-100/60 transition-colors"
          >
            <i className="ri-check-double-line text-emerald-600 text-sm"></i>
            <span className="flex-1 text-left">
              {guardados.length > nRepetidos && (
                <>
                  <span className="font-semibold text-foreground-900 tabular-nums">{guardados.length - nRepetidos}</span>{' '}
                  {guardados.length - nRepetidos === 1 ? 'guardado solo' : 'guardados solos'}
                </>
              )}
              {nRepetidos > 0 && (
                <span className={guardados.length > nRepetidos ? 'text-foreground-400' : ''}>
                  {guardados.length > nRepetidos ? ' · ' : ''}
                  {nRepetidos} {nRepetidos === 1 ? 'repetido revisado' : 'repetidos revisados'}
                </span>
              )}
            </span>
            <i className={`ri-arrow-down-s-line text-base transition-transform ${verGuardados ? 'rotate-180' : ''}`}></i>
          </button>
          {verGuardados && (
            <ul className="pb-2 max-h-80 overflow-y-auto">
              {guardados.map((c) => {
                const compra = compraDe(c);
                return (
                  <li key={c.id} className="flex items-center gap-2 px-4 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground-900 truncate">{nombre(c)}</p>
                      {documento(c)}
                    </div>
                    {compra && (
                      <button
                        type="button"
                        onClick={() => onAbrir(compra.id)}
                        title={c.estado === 'descartado' ? 'Abrir el que ya estaba guardado' : 'Abrir el albarán'}
                        className="h-8 pl-2.5 pr-1.5 rounded-full text-xs font-medium tabular-nums text-foreground-700 hover:bg-background-100 inline-flex items-center gap-0.5 flex-shrink-0"
                      >
                        {c.estado === 'descartado' ? (
                          <span className="inline-flex items-center gap-1 text-foreground-500">
                            <i className="ri-file-copy-2-line"></i>
                            Ya estaba
                          </span>
                        ) : (
                          formatEUR(compra.total)
                        )}
                        <i className="ri-arrow-right-s-line text-foreground-400"></i>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Periodo: un día, una semana (lunes a domingo), un mes o todo       */
/* ------------------------------------------------------------------ */
type ModoPeriodo = 'dia' | 'semana' | 'mes' | 'todo';
// `ref`: un día cualquiera del periodo (YYYY-MM-DD).
type Periodo = { modo: ModoPeriodo; ref: string };

function sumarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d + n).toLocaleDateString('sv-SE');
}

function inicioSemana(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return sumarDias(fecha, -((new Date(y, m - 1, d).getDay() + 6) % 7));
}

// Desde y hasta (incluidos); null = todos los días.
function rangoPeriodo(p: Periodo): [string, string] | null {
  if (p.modo === 'todo') return null;
  if (p.modo === 'dia') return [p.ref, p.ref];
  if (p.modo === 'semana') {
    const lunes = inicioSemana(p.ref);
    return [lunes, sumarDias(lunes, 6)];
  }
  const [y, m] = p.ref.split('-').map(Number);
  return [`${p.ref.slice(0, 7)}-01`, new Date(y, m, 0).toLocaleDateString('sv-SE')];
}

function moverPeriodo(p: Periodo, n: number): Periodo {
  if (p.modo === 'dia') return { ...p, ref: sumarDias(p.ref, n) };
  if (p.modo === 'semana') return { ...p, ref: sumarDias(inicioSemana(p.ref), 7 * n) };
  const [y, m] = p.ref.split('-').map(Number);
  return { ...p, ref: new Date(y, m - 1 + n, 1).toLocaleDateString('sv-SE') };
}

const enPeriodo = (fecha: string, r: [string, string] | null) => !r || (fecha >= r[0] && fecha <= r[1]);

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

function nombrePeriodo(p: Periodo): string {
  const rango = rangoPeriodo(p);
  if (!rango) return 'Todos los días';
  if (p.modo === 'dia') return nombreDia(p.ref);
  const [desde, hasta] = rango;
  const hoy = hoyISO();
  const año = Number(desde.slice(0, 4));
  const conAño = año !== new Date().getFullYear() ? ` ${año}` : '';
  if (p.modo === 'mes') {
    const t = new Date(año, Number(desde.slice(5, 7)) - 1, 1).toLocaleDateString('es-ES', { month: 'long' });
    return `${t.charAt(0).toUpperCase()}${t.slice(1)}${conAño}`;
  }
  if (desde <= hoy && hoy <= hasta) return 'Esta semana';
  const corto = (f: string) => {
    const [y, m, d] = f.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };
  return `Del ${corto(desde)} al ${corto(hasta)}${conAño}`;
}

const MODOS: { valor: ModoPeriodo; texto: string }[] = [
  { valor: 'dia', texto: 'Día' },
  { valor: 'semana', texto: 'Semana' },
  { valor: 'mes', texto: 'Mes' },
  { valor: 'todo', texto: 'Todo' },
];

function SelectorPeriodo({ periodo, onPeriodo, total, n }: { periodo: Periodo; onPeriodo: (p: Periodo) => void; total: number; n: number }) {
  const calendario = useRef<HTMLInputElement>(null);
  const hoy = hoyISO();
  const rango = rangoPeriodo(periodo);
  const conFlechas = periodo.modo !== 'todo';
  const puedeSiguiente = !!rango && rango[1] < hoy;
  const esActual = !!rango && rango[0] <= hoy && hoy <= rango[1];

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
  const unidad = periodo.modo === 'dia' ? 'Día' : periodo.modo === 'semana' ? 'Semana' : 'Mes';
  const resumen = `${n} ${n === 1 ? 'albarán' : 'albaranes'} · ${formatEUR(total)}`;

  return (
    <div className="mb-3 p-1 rounded-2xl bg-background-50 border border-background-200/70 shadow-card">
      <div className="flex items-center gap-1">
        {conFlechas && (
          <button type="button" onClick={() => onPeriodo(moverPeriodo(periodo, -1))} aria-label={`${unidad} anterior`} title={`${unidad} anterior`} className={flecha}>
            <i className="ri-arrow-left-s-line text-lg"></i>
          </button>
        )}
        <div className="relative min-w-0 flex-1 sm:flex-none">
          <button
            type="button"
            onClick={conFlechas ? abrirCalendario : undefined}
            className={`w-full sm:w-auto inline-flex items-center gap-2 min-h-9 md:h-8 px-2 sm:px-3 py-0.5 rounded-xl sm:rounded-full text-left ${conFlechas ? 'hover:bg-background-100' : 'cursor-default'}`}
            title={conFlechas ? 'Elegir en el calendario' : undefined}
          >
            <i className="ri-calendar-line text-foreground-500 flex-shrink-0"></i>
            <span className="min-w-0 flex flex-col">
              <span className="text-sm font-semibold text-foreground-950 truncate leading-tight">{nombrePeriodo(periodo)}</span>
              {/* Móvil: el total va debajo del nombre para que la barra quepa. */}
              <span className="sm:hidden text-[11px] text-foreground-500 tabular-nums truncate leading-tight">{resumen}</span>
            </span>
          </button>
          {conFlechas && (
            <input
              ref={calendario}
              type={periodo.modo === 'mes' ? 'month' : 'date'}
              value={periodo.modo === 'mes' ? periodo.ref.slice(0, 7) : periodo.ref}
              max={periodo.modo === 'mes' ? hoy.slice(0, 7) : hoy}
              onChange={(e) => e.target.value && onPeriodo({ ...periodo, ref: periodo.modo === 'mes' ? `${e.target.value}-01` : e.target.value })}
              tabIndex={-1}
              aria-label="Elegir en el calendario"
              // Táctil (iPhone sobre todo): showPicker() no abre nada, el calendario
              // solo sale si el dedo toca el propio campo; por eso ahí el campo
              // invisible tapa el botón. Con ratón lo abre el botón (showPicker).
              // text-base: con letra < 16px el iPhone hace zoom al tocarlo.
              className="absolute inset-0 z-10 block w-full h-full opacity-0 appearance-none text-base cursor-pointer pointer-events-none [@media(pointer:coarse)]:pointer-events-auto"
            />
          )}
        </div>
        {conFlechas && (
          <button
            type="button"
            onClick={() => onPeriodo(moverPeriodo(periodo, 1))}
            disabled={!puedeSiguiente}
            aria-label={`${unidad} siguiente`}
            title={`${unidad} siguiente`}
            className={flecha}
          >
            <i className="ri-arrow-right-s-line text-lg"></i>
          </button>
        )}
        <div className="sm:ml-auto flex items-center gap-1 sm:gap-2 pr-1 flex-shrink-0">
          <span className="hidden sm:inline text-xs text-foreground-500 tabular-nums whitespace-nowrap">{resumen}</span>
          {conFlechas && !esActual && (
            <button
              type="button"
              onClick={() => onPeriodo({ ...periodo, ref: hoy })}
              className="h-9 md:h-8 px-2.5 sm:px-3 rounded-full text-xs font-medium text-foreground-600 hover:bg-background-100 hover:text-foreground-950 whitespace-nowrap"
            >
              {periodo.modo === 'dia' ? 'Hoy' : periodo.modo === 'semana' ? 'Esta semana' : 'Este mes'}
            </button>
          )}
        </div>
      </div>
      <div className="mt-1 flex gap-0.5 p-0.5 rounded-xl bg-background-100/80" role="group" aria-label="Ver por">
        {MODOS.map((m) => (
          <button
            key={m.valor}
            type="button"
            // Al cambiar de modo se queda en el mismo sitio: el día visto pasa a su semana o su mes.
            onClick={() => onPeriodo({ modo: m.valor, ref: periodo.modo === 'todo' ? hoy : periodo.ref })}
            aria-pressed={periodo.modo === m.valor}
            className={`flex-1 h-8 md:h-7 rounded-lg text-xs font-medium transition-colors ${
              periodo.modo === m.valor ? 'bg-background-50 text-foreground-950 shadow-card' : 'text-foreground-500 hover:text-foreground-950'
            }`}
          >
            {m.texto}
          </button>
        ))}
      </div>
    </div>
  );
}

// Separador de cada día cuando se ve una semana, un mes o todo.
function CabeceraDia({ fecha, n, total, primera }: { fecha: string; n: number; total: number; primera: boolean }) {
  return (
    <div className={`flex items-baseline gap-2 px-1 pb-1 ${primera ? 'pt-0' : 'pt-4'} md:px-4 md:py-2 md:bg-background-100 md:border-b md:border-background-200/70`}>
      <span className="text-sm font-semibold text-foreground-950">{nombreDia(fecha)}</span>
      <span className="text-xs text-foreground-400 tabular-nums">
        {fecha.slice(8, 10)}/{fecha.slice(5, 7)}
      </span>
      <span className="ml-auto text-xs text-foreground-500 tabular-nums whitespace-nowrap">
        {n} {n === 1 ? 'albarán' : 'albaranes'} · <span className="font-semibold text-foreground-800">{formatEUR(total)}</span>
      </span>
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
  const [filtro, setFiltro] = useState<'pendientes' | 'confirmadas' | 'anuladas' | 'todas'>('confirmadas');
  const [busqueda, setBusqueda] = useState('');
  // Al buscar se ve todo (cualquier fecha y estado); luego se afina con las
  // pestañas o por proveedor. Al borrar la búsqueda vuelve la pestaña de antes.
  const [proveedorSel, setProveedorSel] = useState<string | null>(null);
  const filtroAntes = useRef<typeof filtro | null>(null);
  const buscar = (texto: string) => {
    const antes = normalizarCompra(busqueda);
    const ahora = normalizarCompra(texto);
    if (!antes && ahora) {
      filtroAntes.current = filtro;
      setFiltro('todas');
    } else if (antes && !ahora && filtroAntes.current) {
      setFiltro(filtroAntes.current);
      filtroAntes.current = null;
    }
    if (antes !== ahora) setProveedorSel(null);
    setBusqueda(texto);
  };
  // Periodo que se está viendo (día, semana, mes o todo). Se entra en hoy.
  const [periodo, setPeriodo] = useState<Periodo>(() => ({ modo: 'dia', ref: hoyISO() }));
  // Con el panel abierto de un día para otro, «Hoy» pasa al día nuevo.
  const hoyVisto = useRef(hoyISO());
  useEffect(() => {
    const alVolver = () => {
      const hoy = hoyISO();
      if (hoy === hoyVisto.current) return;
      setPeriodo((p) => (p.ref === hoyVisto.current ? { ...p, ref: hoy } : p));
      hoyVisto.current = hoy;
    };
    const t = setInterval(alVolver, 60_000);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, []);

  const pendientes = datos.compras.filter((c) => c.estado === 'pendiente');
  // Líneas por mirar a mano de un albarán pendiente (sin producto o por parecido).
  const dudasDe = (c: Compra) =>
    c.estado === 'pendiente' ? c.lineas.filter((l) => dudaLinea(l, c.proveedor, datos.alias, productos)).length : 0;
  const abierta = datos.compras.find((c) => c.id === abiertaId) ?? null;

  const alGuardar = (ids: string[]) => {
    if (ids.length === 1) {
      setAbiertaId(ids[0]);
    } else if (ids.length > 1) {
      setFiltro('pendientes');
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

  // Se entra en «Por revisar» si queda algo pendiente (de cualquier fecha).
  const entrada = useRef(false);
  useEffect(() => {
    if (entrada.current || datos.loading) return;
    entrada.current = true;
    if (datos.compras.some((c) => c.estado === 'pendiente')) setFiltro('pendientes');
  }, [datos.loading, datos.compras]);

  const rango = rangoPeriodo(periodo);
  const delDia = datos.compras.filter((c) => enPeriodo(c.fecha, rango));
  const totalDia = delDia.filter((c) => c.estado !== 'anulada').reduce((s, c) => s + (c.total ?? 0), 0);
  const q = normalizarCompra(busqueda);
  // «Por revisar» y la búsqueda no miran el periodo: salen todos, de
  // cualquier fecha, agrupados por día.
  const sinPeriodo = !!q || filtro === 'pendientes';
  // Elegir un día, semana o mes desde «Por revisar» es querer ver ese periodo.
  const elegirPeriodo = (p: Periodo) => {
    setPeriodo(p);
    if (filtro === 'pendientes' && !q) setFiltro('todas');
  };
  // Se busca en proveedor, nº, fecha, lo leído en cada línea y el producto
  // nuestro elegido («pescadilla» encuentra la «MERLUZA» de Bizkaimar).
  const nombreProducto = useMemo(() => new Map(productos.map((p) => [p.id, p.nombre_es])), [productos]);
  const coincide = (c: Compra) =>
    normalizarCompra(
      [
        c.proveedor,
        c.numero,
        `${c.fecha.slice(8, 10)}/${c.fecha.slice(5, 7)}`,
        ...c.lineas.flatMap((l) => [l.texto, l.producto_id ? nombreProducto.get(l.producto_id) : null]),
      ].join(' '),
    ).includes(q);
  const encontradas = q ? datos.compras.filter(coincide) : filtro === 'pendientes' ? pendientes : delDia;
  const cuentas = {
    pendientes: q ? encontradas.filter((c) => c.estado === 'pendiente').length : pendientes.length,
    confirmadas: encontradas.filter((c) => c.estado === 'confirmada').length,
    anuladas: encontradas.filter((c) => c.estado === 'anulada').length,
    todas: encontradas.length,
  };
  // Proveedores de lo encontrado, para quedarse con uno.
  const proveedoresEncontrados = q
    ? [...encontradas.reduce((m, c) => m.set(c.proveedor ?? 'Sin proveedor', (m.get(c.proveedor ?? 'Sin proveedor') ?? 0) + 1), new Map<string, number>())].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )
    : [];
  // Semana, mes, todo, «Por revisar» o búsqueda: la lista va por días, cada
  // uno con su cabecera.
  const porDias = periodo.modo !== 'dia' || sinPeriodo;
  const visibles = encontradas
    .filter((c) => !proveedorSel || (c.proveedor ?? 'Sin proveedor') === proveedorSel)
    .filter((c) =>
      filtro === 'todas'
        ? true
        : filtro === 'pendientes'
          ? c.estado === 'pendiente'
          : filtro === 'confirmadas'
            ? c.estado === 'confirmada'
            : c.estado === 'anulada',
    )
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at));
  const mostradas = visibles.slice(0, porDias ? 300 : 100);
  // Albaranes y total de cada día (sin los anulados en el total).
  const resumenDias = new Map<string, { n: number; total: number }>();
  for (const c of mostradas) {
    const r = resumenDias.get(c.fecha) ?? { n: 0, total: 0 };
    r.n++;
    if (c.estado !== 'anulada') r.total += c.total ?? 0;
    resumenDias.set(c.fecha, r);
  }
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

      {/* Móvil: la columna lateral se deshace (contents) para ordenar las piezas:
          subir y resumen arriba, la lista de albaranes en medio y el correo al final. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6 lg:items-start">
        <aside className="contents lg:block lg:space-y-4 lg:sticky" style={{ top: 'calc(var(--admin-header-height, 0px) + 1.5rem)' }}>
          <div className="order-1 space-y-4 empty:hidden">
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
          </div>
          <div className="order-4 empty:hidden">
            <Correo correo={correo} compras={datos.compras} onAbrir={setAbiertaId} />
          </div>
          <div className="order-2">
            <Resumen
              compras={datos.compras}
              dudasDe={dudasDe}
              onVerPendientes={() => {
                buscar('');
                setFiltro('pendientes');
              }}
            />
          </div>
        </aside>

        <section className="order-3 min-w-0">
          {/* Con «Por revisar» o buscando, el periodo no cuenta: se ve apagado. */}
          <div className={`transition-opacity ${sinPeriodo ? 'opacity-50 hover:opacity-100' : ''}`}>
            <SelectorPeriodo periodo={periodo} onPeriodo={elegirPeriodo} total={totalDia} n={delDia.filter((c) => c.estado !== 'anulada').length} />
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 mb-3">
            <div className="flex gap-0.5 md:gap-1 p-1 rounded-full bg-background-100 border border-background-200/70 overflow-x-auto scrollbar-hide w-full md:w-auto md:self-start">
              {PESTANAS.map((t) => {
                // «Por revisar» en amarillo mientras quede algo pendiente
                // (de cualquier fecha), para que no pase desapercibido.
                const avisar = t.valor === 'pendientes' && pendientes.length > 0;
                const activa = filtro === t.valor;
                return (
                  <button
                    key={t.valor}
                    type="button"
                    onClick={() => setFiltro(t.valor)}
                    aria-pressed={activa}
                    title={t.valor === 'pendientes' ? 'Todos los que faltan por revisar, de cualquier fecha' : undefined}
                    className={`flex-1 md:flex-none inline-flex items-center justify-center gap-1 md:gap-1.5 h-9 md:h-8 px-2 md:px-3 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      avisar
                        ? activa
                          ? 'bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-300 shadow-card'
                          : 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-300 hover:bg-amber-100'
                        : activa
                          ? 'bg-background-50 text-foreground-950 shadow-card'
                          : 'text-foreground-500 hover:text-foreground-950'
                    }`}
                  >
                    {avisar && <i className="ri-error-warning-fill text-amber-500"></i>}
                    {t.texto}
                    <span className={`tabular-nums text-[11px] ${avisar ? 'font-semibold text-amber-700' : activa ? 'text-foreground-500' : 'text-foreground-400'}`}>
                      {t.n}
                    </span>
                  </button>
                );
              })}
            </div>
            <label className="relative md:ml-auto md:w-72">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-400 text-sm pointer-events-none"></i>
              <input
                value={busqueda}
                onChange={(e) => buscar(e.target.value)}
                placeholder="Buscar proveedor, nº o producto"
                aria-label="Buscar albaranes"
                className="w-full h-10 md:h-9 pl-9 pr-9 rounded-full bg-background-50 border border-background-200/70 text-sm focus:outline-none focus:border-foreground-300/60"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => buscar('')}
                  aria-label="Borrar búsqueda"
                  title="Borrar búsqueda"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-foreground-400 hover:text-foreground-950 hover:bg-background-100"
                >
                  <i className="ri-close-line"></i>
                </button>
              )}
            </label>
          </div>
          {!q && filtro === 'pendientes' && pendientes.length > 0 && (
            <p className="mb-3 px-1 text-xs text-foreground-500">
              {pendientes.length === 1 ? 'Falta por revisar 1 albarán' : `Faltan por revisar ${pendientes.length} albaranes`}, de{' '}
              <span className="font-medium text-foreground-800">cualquier fecha</span> ·{' '}
              {formatEUR(pendientes.reduce((t, c) => t + (c.total ?? 0), 0))}. Ábrelos para confirmarlos.
            </p>
          )}
          {q && (
            <div className="mb-3 space-y-2">
              <p className="text-xs text-foreground-500 px-1">
                Buscando en <span className="font-medium text-foreground-800">todas las fechas</span>: {cuentas.todas}{' '}
                {cuentas.todas === 1 ? 'albarán' : 'albaranes'}. Afina con las pestañas o por proveedor.
              </p>
              {proveedoresEncontrados.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {[['', cuentas.todas] as [string, number], ...proveedoresEncontrados].map(([nombre, n]) => {
                    const activa = (proveedorSel ?? '') === nombre;
                    return (
                      <button
                        key={nombre || 'todos'}
                        type="button"
                        onClick={() => setProveedorSel(nombre || null)}
                        aria-pressed={activa}
                        className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium border transition-colors ${
                          activa
                            ? 'bg-foreground-950 text-background-50 border-foreground-950'
                            : 'bg-background-50 text-foreground-700 border-background-200/70 hover:border-foreground-300/60'
                        }`}
                      >
                        {nombre ? nombre.replace(/,?\s*S\.?\s?[LA]\.?\s?U?\.?$/i, '') : 'Todos los proveedores'}
                        <span className={`tabular-nums text-[11px] ${activa ? 'text-background-200' : 'text-foreground-400'}`}>{n}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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
                  : filtro === 'pendientes'
                    ? 'Todo revisado: no queda ningún albarán por confirmar'
                    : periodo.modo === 'dia'
                      ? `No hay albaranes con fecha ${nombreDia(periodo.ref).toLowerCase()}`
                      : periodo.modo !== 'todo'
                        ? `No hay albaranes ${periodo.modo === 'semana' ? 'esa semana' : 'ese mes'}`
                        : 'Todavía no hay albaranes aquí'}
              </p>
              <p className="text-xs text-foreground-500 max-w-xs">
                {q
                  ? 'Prueba con otro proveedor, número o producto.'
                  : filtro === 'pendientes'
                    ? 'Haz la foto del albarán (o sube el PDF) y aparecerá aquí, ya leído, para revisarlo y confirmarlo.'
                    : periodo.modo !== 'todo'
                      ? 'Muévete con las flechas, elige otra fecha en el calendario o pulsa «Todo».'
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
              {mostradas.map((c, i) => (
                <Fragment key={c.id}>
                  {porDias && c.fecha !== mostradas[i - 1]?.fecha && (
                    <CabeceraDia fecha={c.fecha} n={resumenDias.get(c.fecha)!.n} total={resumenDias.get(c.fecha)!.total} primera={i === 0} />
                  )}
                  <FilaCompra compra={c} dudas={dudasDe(c)} onAbrir={() => setAbiertaId(c.id)} />
                </Fragment>
              ))}
            </div>
          )}
        </section>
      </div>

      {abierta && <CompraEditor key={abierta.id} compra={abierta} datos={datos} productos={productos} onClose={() => setAbiertaId(null)} />}
    </div>
  );
}
