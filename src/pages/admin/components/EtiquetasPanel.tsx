import { useEffect, useMemo, useState } from 'react';
import { useLotesBotes } from '@/hooks/useLotesBotes';
import type { LoteBote } from '@/types/loteBote';
import type { Producto } from '@/types/producto';
import SearchInput from '@/components/base/SearchInput';

type Formato = 'rollo62' | 'a4';

const FORMATO_LABELS: Record<Formato, string> = {
  rollo62: 'Rollo 62 mm (impresora de etiquetas)',
  a4: 'Hoja A4 (para recortar)',
};

const FORMATO_KEY = 'arrantza.etiquetas.formato';

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Las fechas vienen como 'AAAA-MM-DD'; se tratan como fecha local, sin
// pasar por Date, para que no se desplacen un día por la zona horaria.
function formatFecha(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d + dias);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split('-').map(Number);
  const [a2, m2, d2] = hasta.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

function escapeHtml(str: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}

function leerFormato(): Formato {
  try {
    const v = localStorage.getItem(FORMATO_KEY);
    return v === 'a4' ? 'a4' : 'rollo62';
  } catch {
    return 'rollo62';
  }
}

// Abre una ventana aparte con las pegatinas (logo + QR arriba, los 4 datos
// abajo) y lanza el diálogo de impresión en cuanto ha cargado la imagen.
// En rollo, cada pegatina es una página de 62 mm; en A4 van en rejilla.
function imprimirEtiquetas(lote: LoteBote, copias: number, formato: Formato) {
  const img = `${window.location.origin}/etiquetas/pegatina-bote-base.png`;
  const campo = (etiqueta: string, valor: string) =>
    `<div class="campo"><span class="lab">${etiqueta}</span><span class="val">${escapeHtml(valor)}</span></div>`;
  const etiqueta = `
<div class="et">
  <img src="${img}" alt="">
  <div class="campos">
    ${campo('Fecha de envasado', formatFecha(lote.fecha_envasado))}
    ${campo('Fecha de caducidad', formatFecha(lote.fecha_caducidad))}
    ${campo('Nº lote', lote.lote)}
    ${campo('Procedencia', lote.procedencia || '—')}
  </div>
</div>`;

  const pagina =
    formato === 'rollo62'
      ? '@page { size: 62mm 54mm; margin: 0; } body { margin: 0; } .et { page-break-after: always; break-after: page; }'
      : '@page { size: A4; margin: 10mm; } body { margin: 0; } .hoja { display: flex; flex-wrap: wrap; gap: 3mm; } .et { break-inside: avoid; }';

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Etiquetas · ${escapeHtml(lote.producto_nombre)} · Lote ${escapeHtml(lote.lote)}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${pagina}
  .et {
    width: 62mm; height: 54mm; overflow: hidden;
    background: #f5f0ea; border: 0.35mm solid #192d48; padding: 1.2mm 1.2mm 1.4mm;
    display: flex; flex-direction: column; font-family: Georgia, 'Times New Roman', serif; color: #192d48;
  }
  .et img { display: block; width: 100%; height: auto; }
  .campos {
    flex: 1; margin-top: 0.6mm; padding-top: 1mm; border-top: 0.25mm solid #ac8e5c;
    display: grid; grid-template-columns: 1fr 1fr; column-gap: 2mm; row-gap: 0.6mm; align-content: center;
  }
  .campo { display: flex; flex-direction: column; min-width: 0; }
  .lab { font-size: 1.75mm; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1mm; opacity: 0.8; }
  .val { font-size: 2.7mm; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
</head>
<body onload="setTimeout(function(){ window.print(); }, 200)">
<div class="hoja">${Array.from({ length: copias }, () => etiqueta).join('')}</div>
</body>
</html>`;

  const ventana = window.open('', '_blank', 'width=800,height=900');
  if (!ventana) {
    alert('El navegador ha bloqueado la ventana de impresión. Permite las ventanas emergentes para este sitio.');
    return;
  }
  ventana.document.open();
  ventana.document.write(html);
  ventana.document.close();
  ventana.focus();
}

/* ------------------------------------------------------------------ */
/*  Tarjeta de un lote ya envasado                                     */
/* ------------------------------------------------------------------ */
function LoteCard({ lote, onReimprimir, onDelete }: { lote: LoteBote; onReimprimir: () => void; onDelete: () => void }) {
  const caducado = lote.fecha_caducidad < hoyISO();
  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl shadow-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-100/70 text-primary-700 tabular-nums">
              Lote {lote.lote}
            </span>
            {caducado && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600">Caducado</span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground-950 mt-1 truncate">{lote.producto_nombre}</p>
          <p className="text-xs text-foreground-500 mt-0.5">
            Envasado {formatFecha(lote.fecha_envasado)} · Caduca {formatFecha(lote.fecha_caducidad)}
            {lote.procedencia && <> · {lote.procedencia}</>}
            {' '}· {lote.cantidad} bote{lote.cantidad === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onReimprimir}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-background-100 text-foreground-600 hover:bg-background-200/70"
          >
            <i className="ri-printer-line"></i>
            Reimprimir
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Eliminar lote"
            className="px-2 py-1 rounded-full text-[11px] font-medium text-foreground-400 hover:text-red-600"
          >
            <i className="ri-delete-bin-line"></i>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel principal                                                    */
/* ------------------------------------------------------------------ */
export default function EtiquetasPanel({ productos }: { productos: Producto[] }) {
  const { lotes, loading, crearLote, eliminarLote } = useLotesBotes();
  const [producto, setProducto] = useState('');
  const [fechaEnvasado, setFechaEnvasado] = useState(hoyISO);
  const [dias, setDias] = useState('');
  const [fechaCaducidad, setFechaCaducidad] = useState('');
  const [procedencia, setProcedencia] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [formato, setFormato] = useState<Formato>(leerFormato);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(FORMATO_KEY, formato);
    } catch {
      /* localStorage no disponible */
    }
  }, [formato]);

  const productoSeleccionado = useMemo(
    () => productos.find((p) => p.nombre_es.trim().toLowerCase() === producto.trim().toLowerCase()) ?? null,
    [productos, producto],
  );

  const nombresProductos = useMemo(() => {
    const nombres = new Set<string>(productos.map((p) => p.nombre_es));
    lotes.forEach((l) => nombres.add(l.producto_nombre));
    return Array.from(nombres).sort((a, b) => a.localeCompare(b, 'es'));
  }, [productos, lotes]);

  const procedencias = useMemo(
    () => Array.from(new Set(lotes.map((l) => l.procedencia).filter((p): p is string => !!p))),
    [lotes],
  );

  // Al elegir un producto se copian los días de caducidad y la procedencia
  // del último lote que se envasó de él; si es la primera vez, la
  // procedencia sale del origen de la ficha del producto.
  const elegirProducto = (nombre: string) => {
    setProducto(nombre);
    const clave = nombre.trim().toLowerCase();
    if (!clave) return;
    const anterior = lotes.find((l) => l.producto_nombre.trim().toLowerCase() === clave);
    if (anterior) {
      const d = diasEntre(anterior.fecha_envasado, anterior.fecha_caducidad);
      setDias(String(d));
      setFechaCaducidad(sumarDias(fechaEnvasado, d));
      setProcedencia(anterior.procedencia ?? '');
      return;
    }
    const ficha = productos.find((p) => p.nombre_es.trim().toLowerCase() === clave);
    if (ficha?.origen_es) setProcedencia(ficha.origen_es);
  };

  const cambiarEnvasado = (fecha: string) => {
    setFechaEnvasado(fecha);
    const d = Number(dias);
    if (fecha && dias !== '' && Number.isFinite(d)) setFechaCaducidad(sumarDias(fecha, d));
  };

  const cambiarDias = (valor: string) => {
    setDias(valor);
    const d = Number(valor);
    if (fechaEnvasado && valor !== '' && Number.isFinite(d) && d >= 0) setFechaCaducidad(sumarDias(fechaEnvasado, d));
  };

  const cambiarCaducidad = (fecha: string) => {
    setFechaCaducidad(fecha);
    if (fecha && fechaEnvasado) setDias(String(diasEntre(fechaEnvasado, fecha)));
  };

  const numBotes = Math.floor(Number(cantidad));
  const valido =
    producto.trim() !== '' &&
    fechaEnvasado !== '' &&
    fechaCaducidad !== '' &&
    fechaCaducidad >= fechaEnvasado &&
    Number.isFinite(numBotes) &&
    numBotes > 0;

  const guardar = async () => {
    if (!valido) return;
    setSaving(true);
    const creado = await crearLote({
      producto_id: productoSeleccionado?.id ?? null,
      producto_nombre: productoSeleccionado?.nombre_es ?? producto.trim(),
      fecha_envasado: fechaEnvasado,
      fecha_caducidad: fechaCaducidad,
      procedencia: procedencia.trim() || null,
      cantidad: numBotes,
    });
    setSaving(false);
    if (!creado) {
      alert('No se pudo guardar el lote.');
      return;
    }
    imprimirEtiquetas(creado, creado.cantidad, formato);
    setProducto('');
    setDias('');
    setFechaCaducidad('');
    setProcedencia('');
    setCantidad('1');
  };

  const reimprimir = (lote: LoteBote) => {
    const respuesta = prompt(`¿Cuántas pegatinas del lote ${lote.lote}?`, String(lote.cantidad));
    if (respuesta === null) return;
    const n = Math.floor(Number(respuesta));
    if (!Number.isFinite(n) || n <= 0) return;
    imprimirEtiquetas(lote, n, formato);
  };

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lotes;
    return lotes.filter(
      (l) =>
        l.producto_nombre.toLowerCase().includes(q) ||
        l.lote.toLowerCase().includes(q) ||
        (l.procedencia ?? '').toLowerCase().includes(q),
    );
  }, [lotes, search]);

  const campo = 'h-11 w-full px-2.5 bg-background-100 border border-background-200/70 rounded-md text-sm';

  return (
    <div className="px-4 md:px-8 py-6 pb-28">
      <div className="bg-background-50 border border-background-200/70 rounded-xl p-3 shadow-card mb-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 sm:items-end">
          <div className="flex flex-col gap-1 col-span-2 sm:col-span-3">
            <label className="text-[11px] text-foreground-400">Producto</label>
            <input
              type="text"
              list="etiquetas-productos"
              value={producto}
              onChange={(e) => elegirProducto(e.target.value)}
              placeholder="Ej.: Bonito en aceite"
              className={campo}
            />
            <datalist id="etiquetas-productos">
              {nombresProductos.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>

          <div className="flex flex-col gap-1 col-span-2 sm:col-span-3">
            <label className="text-[11px] text-foreground-400">Procedencia</label>
            <input
              type="text"
              list="etiquetas-procedencias"
              value={procedencia}
              onChange={(e) => setProcedencia(e.target.value)}
              placeholder="Ej.: Cantábrico"
              className={campo}
            />
            <datalist id="etiquetas-procedencias">
              {procedencias.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-[11px] text-foreground-400">Fecha de envasado</label>
            <input type="date" value={fechaEnvasado} onChange={(e) => cambiarEnvasado(e.target.value)} className={campo} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-foreground-400">Dura (días)</label>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={dias}
              onChange={(e) => cambiarDias(e.target.value)}
              placeholder="—"
              className={`${campo} text-right`}
            />
          </div>

          <div className="flex flex-col gap-1 col-span-2 sm:col-span-2">
            <label className="text-[11px] text-foreground-400">Fecha de caducidad</label>
            <input
              type="date"
              value={fechaCaducidad}
              min={fechaEnvasado}
              onChange={(e) => cambiarCaducidad(e.target.value)}
              className={campo}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-foreground-400">Nº de botes</label>
            <input
              type="number"
              min="1"
              inputMode="numeric"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className={`${campo} text-right`}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <select value={formato} onChange={(e) => setFormato(e.target.value as Formato)} className={`${campo} sm:w-auto`}>
            {(Object.keys(FORMATO_LABELS) as Formato[]).map((f) => (
              <option key={f} value={f}>{FORMATO_LABELS[f]}</option>
            ))}
          </select>
          <div className="flex items-center gap-3">
            <p className="text-[11px] text-foreground-400 hidden sm:block">El nº de lote se pone solo al guardar.</p>
            <button
              type="button"
              onClick={guardar}
              disabled={!valido || saving}
              className="inline-flex items-center justify-center gap-1.5 h-11 px-4 w-full sm:w-auto rounded-md text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-printer-line"></i>
              {saving ? 'Guardando…' : `Guardar e imprimir ${Number.isFinite(numBotes) && numBotes > 0 ? numBotes : ''}`.trim()}
            </button>
          </div>
        </div>
      </div>

      <SearchInput
        value={search}
        onChange={setSearch}
        suggestions={nombresProductos}
        placeholder="Buscar por producto, lote o procedencia…"
        className="mb-3 sm:max-w-[280px] md:max-w-md"
      />

      {loading && lotes.length === 0 ? (
        <p className="text-sm text-foreground-400">Cargando…</p>
      ) : visibles.length === 0 ? (
        <div className="text-center py-16">
          <span className="w-14 h-14 flex items-center justify-center mx-auto mb-4 rounded-full bg-background-100 text-foreground-400 text-2xl">
            <i className="ri-price-tag-3-line"></i>
          </span>
          <p className="text-sm font-medium text-foreground-700 mb-1">
            {lotes.length === 0 ? 'Todavía no hay lotes envasados' : 'No hay lotes que coincidan con la búsqueda'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map((lote) => (
            <LoteCard
              key={lote.id}
              lote={lote}
              onReimprimir={() => reimprimir(lote)}
              onDelete={() => {
                if (confirm(`¿Eliminar el lote ${lote.lote} del historial?`)) eliminarLote(lote.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
