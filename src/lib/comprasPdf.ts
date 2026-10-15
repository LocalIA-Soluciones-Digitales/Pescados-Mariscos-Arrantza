// Albaranes en PDF (los que mandan algunos proveedores por email). Si el PDF
// lleva texto, se lee directamente con su posición —exacto y al instante,
// sin OCR—; si es un escaneado (solo imagen), se pasa cada página a imagen
// para el OCR. En los dos casos se guarda una imagen de las páginas.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { OcrCaja } from './comprasOcr';

// Hasta 3 páginas: un albarán no suele tener más y el resto sería publicidad
// o condiciones generales.
const MAX_PAGINAS = 3;
const ANCHO_PAGINA = 1600;
const ANCHO_GUARDADO = 1400;

export interface PdfPreparado {
  // Texto del PDF con su posición en la imagen apilada; null si es un
  // escaneado y hay que pasar `paginas` por el OCR.
  cajas: OcrCaja[] | null;
  paginas: HTMLCanvasElement[];
  jpeg: Blob;
}

export function esPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export async function prepararPdf(file: File): Promise<PdfPreparado> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const carga = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    // La CSP de la web no admite fuentes cargadas al vuelo: las letras se
    // dibujan como trazos, que para leer el albarán basta.
    disableFontFace: true,
    useWasm: false,
  });
  const doc = await carga.promise;

  const paginas: HTMLCanvasElement[] = [];
  const cajas: OcrCaja[] = [];
  let desplazamiento = 0;
  try {
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGINAS); n++) {
      const pagina = await doc.getPage(n);
      const escala = ANCHO_PAGINA / pagina.getViewport({ scale: 1 }).width;
      const vista = pagina.getViewport({ scale: escala });
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(vista.width);
      lienzo.height = Math.round(vista.height);
      const ctx = lienzo.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, lienzo.width, lienzo.height);
      await pagina.render({ canvas: lienzo, canvasContext: ctx, viewport: vista }).promise;
      paginas.push(lienzo);

      const contenido = await pagina.getTextContent();
      for (const item of contenido.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const [x, yBase] = vista.convertToViewportPoint(item.transform[4], item.transform[5]);
        const alto = Math.max(Math.hypot(item.transform[2], item.transform[3]), item.height) * escala;
        cajas.push({ text: item.str, x, y: yBase - alto + desplazamiento, width: item.width * escala, height: alto });
      }
      desplazamiento += lienzo.height;
    }
  } finally {
    await carga.destroy();
  }

  // Imagen para guardar: las páginas una debajo de otra, a 1400 px de ancho.
  const e = ANCHO_GUARDADO / ANCHO_PAGINA;
  const total = document.createElement('canvas');
  total.width = ANCHO_GUARDADO;
  total.height = Math.round(paginas.reduce((t, p) => t + p.height, 0) * e);
  const ctx = total.getContext('2d')!;
  let y = 0;
  for (const p of paginas) {
    ctx.drawImage(p, 0, y, p.width * e, p.height * e);
    y += p.height * e;
  }
  const jpeg = await new Promise<Blob>((resolve, reject) =>
    total.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo convertir el PDF'))), 'image/jpeg', 0.72),
  );

  const letras = cajas.reduce((t, c) => t + c.text.replace(/\s/g, '').length, 0);
  return { cajas: letras >= 30 ? cajas : null, paginas, jpeg };
}
