// Lee cada foto o PDF por separado (una «hoja») y junta las hojas de un
// mismo albarán en una sola imagen, con lo leído en su sitio, para guardarlo
// como un único albarán.
import type { OcrCaja } from './comprasOcr';
import { enderezar, leerTextoFoto, prepararFoto } from './comprasFoto';
import { esPdf, prepararPdf } from './comprasPdf';

export interface HojaLeida {
  // Páginas una debajo de otra, todas del mismo ancho (`ancho`); `cajas`
  // va en las coordenadas de ese montón.
  paginas: HTMLCanvasElement[];
  cajas: OcrCaja[];
  ancho: number;
  alto: number;
  fallo: string | null;
  miniatura: string;
}

function miniatura(c: HTMLCanvasElement): string {
  const e = 160 / Math.max(c.width, c.height);
  const m = document.createElement('canvas');
  m.width = Math.max(1, Math.round(c.width * e));
  m.height = Math.max(1, Math.round(c.height * e));
  m.getContext('2d')!.drawImage(c, 0, 0, m.width, m.height);
  // data: y no blob:, que la CSP no admite en img-src.
  return m.toDataURL('image/jpeg', 0.7);
}

export async function leerArchivo(file: File, aviso: (texto: string) => void): Promise<HojaLeida> {
  const lento = 'Tarda entre 10 segundos y un minuto por hoja; la primera vez descarga además el lector (unos 25 MB).';
  if (esPdf(file)) {
    aviso('Abriendo el PDF…');
    const pdf = await prepararPdf(file);
    const ancho = pdf.paginas[0]?.width ?? 1;
    const alto = pdf.paginas.reduce((t, p) => t + p.height, 0) || 1;
    const base = { paginas: pdf.paginas, ancho, alto, miniatura: pdf.paginas[0] ? miniatura(pdf.paginas[0]) : '' };
    if (pdf.cajas) return { ...base, cajas: pdf.cajas, fallo: null }; // PDF con texto: sin OCR
    // PDF escaneado: cada página por el OCR, una debajo de otra.
    const cajas: OcrCaja[] = [];
    try {
      aviso(lento);
      let y = 0;
      for (const pagina of pdf.paginas) {
        const r = await leerTextoFoto(enderezar(pagina).canvas);
        cajas.push(...r.cajas.map((c) => ({ ...c, y: c.y + y })));
        y += pagina.height;
      }
      return { ...base, cajas, fallo: null };
    } catch (e) {
      return { ...base, cajas, fallo: e instanceof Error ? e.message : String(e) };
    }
  }
  aviso('Preparando la foto…');
  const foto = await prepararFoto(file);
  const base = { paginas: [foto.ocr], ancho: foto.ocr.width, alto: foto.ocr.height, miniatura: miniatura(foto.ocr) };
  try {
    aviso(lento);
    const { cajas } = await leerTextoFoto(foto.ocr);
    return { ...base, cajas, fallo: null };
  } catch (e) {
    // La foto se guarda igual para no perderla: se rellena a mano.
    return { ...base, cajas: [], fallo: e instanceof Error ? e.message : String(e) };
  }
}

// Tope de píxeles de la imagen juntada: Safari en iPhone no dibuja lienzos
// de más de ~16 millones.
const MAX_PIXELES = 12_000_000;

export async function juntarHojas(hojas: HojaLeida[]): Promise<{ cajas: OcrCaja[]; ancho: number; alto: number; jpeg: Blob }> {
  const paginas = hojas.reduce((t, h) => t + h.paginas.length, 0);
  let ancho = Math.min(paginas > 1 ? 1400 : 1600, hojas[0].ancho);
  let alto = hojas.reduce((t, h) => t + h.alto * (ancho / h.ancho), 0);
  if (ancho * alto > MAX_PIXELES) {
    const k = Math.sqrt(MAX_PIXELES / (ancho * alto));
    ancho *= k;
    alto *= k;
  }
  ancho = Math.round(ancho);

  const cajas: OcrCaja[] = [];
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = Math.max(1, Math.round(alto));
  const ctx = lienzo.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  let y = 0;
  for (const h of hojas) {
    const s = ancho / h.ancho;
    cajas.push(...h.cajas.map((c) => ({ ...c, x: c.x * s, y: c.y * s + y, width: c.width * s, height: c.height * s })));
    let yp = y;
    for (const p of h.paginas) {
      ctx.drawImage(p, 0, yp, p.width * s, p.height * s);
      yp += p.height * s;
    }
    y += h.alto * s;
  }
  const jpeg = await new Promise<Blob>((resolve, reject) =>
    lienzo.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo preparar la imagen del albarán'))), 'image/jpeg', 0.72),
  );
  return { cajas, ancho, alto: lienzo.height, jpeg };
}
