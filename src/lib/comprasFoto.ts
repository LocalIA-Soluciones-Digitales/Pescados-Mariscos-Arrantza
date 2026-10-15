// Prepara en el móvil la foto de un albarán: la endereza, la reduce para el
// OCR y genera una copia JPEG ligera (300-500 KB) para guardarla.
import type { OcrCaja } from './comprasOcr';
import type { OcrPeticion, OcrRespuesta } from '@/workers/ocrAlbaran.worker';

const LADO_OCR = 2000;
const LADO_GUARDADO = 1600;

// createImageBitmap y no <img src="blob:…">: la CSP de la web (img-src)
// no admite blob:. 'from-image' respeta la orientación EXIF del móvil.
async function cargarImagen(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    try {
      return await createImageBitmap(file);
    } catch {
      throw new Error('No se pudo abrir la foto');
    }
  }
}

function lienzo(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// Ángulo (en grados) que deja las líneas de texto horizontales: el que hace
// que los bordes de las letras se concentren en menos filas.
function anguloTorcido(fuente: HTMLCanvasElement): number {
  const escala = 600 / Math.max(fuente.width, fuente.height);
  const c = lienzo(fuente.width * escala, fuente.height * escala);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(fuente, 0, 0, c.width, c.height);
  const { data, width: w, height: h } = ctx.getImageData(0, 0, c.width, c.height);
  const gris = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gris[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;

  const puntos: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (Math.abs(gris[i + 1] - gris[i - 1]) + Math.abs(gris[i + w] - gris[i - w]) > 60) puntos.push(x - w / 2, y - h / 2);
    }
  }
  if (puntos.length < 200) return 0;

  const diag = Math.ceil(Math.hypot(w, h));
  let mejor = 0;
  let mejorPuntuacion = -1;
  for (let a = -10; a <= 10; a += 0.5) {
    const rad = (a * Math.PI) / 180;
    const [s, co] = [Math.sin(rad), Math.cos(rad)];
    const filas = new Float32Array(diag * 2);
    for (let k = 0; k < puntos.length; k += 2) filas[Math.round(s * puntos[k] + co * puntos[k + 1]) + diag]++;
    let p = 0;
    for (const f of filas) p += f * f;
    if (p > mejorPuntuacion) {
      mejorPuntuacion = p;
      mejor = a;
    }
  }
  return mejor;
}

function colorFondo(c: HTMLCanvasElement): string {
  const ctx = c.getContext('2d')!;
  const muestras = [
    [0, 0],
    [c.width - 4, 0],
    [0, c.height - 4],
    [c.width - 4, c.height - 4],
  ].map(([x, y]) => ctx.getImageData(x, y, 4, 4).data);
  const media = [0, 1, 2].map((k) => Math.round(muestras.reduce((t, d) => t + d[k], 0) / muestras.length));
  return `rgb(${media.join(',')})`;
}

// Sin subir el contraste ni ampliar el lienzo al girar: en las pruebas las
// dos cosas hacían que el OCR perdiera números. También para las páginas de
// un PDF escaneado.
export function enderezar(original: HTMLCanvasElement): { canvas: HTMLCanvasElement; giro: number } {
  const giro = anguloTorcido(original);
  if (giro === 0) return { canvas: original, giro };
  const recto = lienzo(original.width, original.height);
  const ctx = recto.getContext('2d')!;
  ctx.fillStyle = colorFondo(original);
  ctx.fillRect(0, 0, recto.width, recto.height);
  ctx.translate(recto.width / 2, recto.height / 2);
  ctx.rotate((giro * Math.PI) / 180);
  ctx.drawImage(original, -original.width / 2, -original.height / 2);
  return { canvas: recto, giro };
}

export interface FotoPreparada {
  ocr: HTMLCanvasElement;
  jpeg: Blob;
  giro: number;
}

export async function prepararFoto(file: File): Promise<FotoPreparada> {
  const img = await cargarImagen(file);
  const escala = Math.min(1, LADO_OCR / Math.max(img.width, img.height));
  const original = lienzo(img.width * escala, img.height * escala);
  original.getContext('2d')!.drawImage(img, 0, 0, original.width, original.height);
  img.close();

  const { canvas: ocr, giro } = enderezar(original);

  const e = Math.min(1, LADO_GUARDADO / Math.max(ocr.width, ocr.height));
  const guardado = lienzo(ocr.width * e, ocr.height * e);
  guardado.getContext('2d')!.drawImage(ocr, 0, 0, guardado.width, guardado.height);
  const jpeg = await new Promise<Blob>((resolve, reject) =>
    guardado.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir la foto'))), 'image/jpeg', 0.72),
  );
  return { ocr, jpeg, giro };
}

// Un único worker por sesión: la primera lectura descarga los modelos
// (~25 MB) y las siguientes van directas.
let worker: Worker | null = null;
let siguienteId = 1;

export async function leerTextoFoto(canvas: HTMLCanvasElement): Promise<{ cajas: OcrCaja[]; ms: number }> {
  worker ??= new Worker(new URL('../workers/ocrAlbaran.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = siguienteId++;
  const imagen = await createImageBitmap(canvas);
  return new Promise((resolve, reject) => {
    const alRecibir = (e: MessageEvent<OcrRespuesta>) => {
      if (e.data.id !== id) return;
      w.removeEventListener('message', alRecibir);
      if (e.data.tipo === 'listo') resolve({ cajas: e.data.cajas, ms: e.data.ms });
      else reject(new Error(e.data.mensaje));
    };
    w.addEventListener('message', alRecibir);
    w.addEventListener(
      'error',
      (ev) => {
        worker = null;
        reject(new Error(ev.message || 'El lector de albaranes falló'));
      },
      { once: true },
    );
    const peticion: OcrPeticion = { id, imagen };
    w.postMessage(peticion, [imagen]);
  });
}
