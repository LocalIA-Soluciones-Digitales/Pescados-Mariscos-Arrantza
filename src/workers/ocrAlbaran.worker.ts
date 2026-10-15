// Lee el texto de la foto de un albarán con PaddleOCR (modelo "latin": tildes,
// ñ y €) dentro de un Web Worker, para que el móvil no se congele mientras
// tanto. Todo ocurre en el propio móvil: la foto no se envía a ningún
// servicio de OCR. Los modelos se sirven desde /ocr/ (public/ocr) y el motor
// ONNX desde nuestros propios assets, sin depender de CDNs de terceros.
import * as ort from 'onnxruntime-web';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import type { PaddleOcrService } from 'ppu-paddle-ocr/web';
import type { OcrCaja } from '@/lib/comprasOcr';

export type OcrPeticion = { id: number; imagen: ImageBitmap };
export type OcrRespuesta =
  | { id: number; tipo: 'listo'; cajas: OcrCaja[]; ms: number }
  | { id: number; tipo: 'error'; mensaje: string };

ort.env.wasm.wasmPaths = { wasm: wasmUrl };
// Sin aislamiento entre orígenes el navegador solo permite un hilo.
ort.env.wasm.numThreads = 1;

const base = import.meta.env.BASE_URL;
let servicio: Promise<PaddleOcrService> | null = null;

async function cargarServicio(): Promise<PaddleOcrService> {
  const { PaddleOcrService } = await import('ppu-paddle-ocr/web');
  const s = new PaddleOcrService({
    model: {
      detection: `${base}ocr/PP-OCRv5_mobile_det_infer.onnx`,
      recognition: `${base}ocr/latin_PP-OCRv5_mobile_rec_infer.onnx`,
      charactersDictionary: `${base}ocr/ppocrv5_latin_dict.txt`,
    },
    session: { executionProviders: ['wasm'], graphOptimizationLevel: 'all' },
  });
  await s.initialize();
  return s;
}

const responder = (r: OcrRespuesta) => (self as unknown as { postMessage: (m: OcrRespuesta) => void }).postMessage(r);

self.addEventListener('message', async (e: MessageEvent<OcrPeticion>) => {
  const { id, imagen } = e.data;
  try {
    servicio ??= cargarServicio();
    const s = await servicio.catch((err) => {
      servicio = null; // que el siguiente intento vuelva a descargar
      throw err;
    });
    const t0 = performance.now();
    const lienzo = new OffscreenCanvas(imagen.width, imagen.height);
    lienzo.getContext('2d')!.drawImage(imagen, 0, 0);
    imagen.close();
    // Cada trozo por separado: las líneas las agrupa comprasOcr.ts con la
    // posición de cada uno, que aguanta mejor una foto algo torcida.
    const res = await s.recognize(lienzo, { flatten: true, strategy: 'per-box' });
    const cajas = res.results.map((r) => ({ text: r.text, ...r.box }));
    responder({ id, tipo: 'listo', cajas, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    responder({ id, tipo: 'error', mensaje: err instanceof Error ? err.message : String(err) });
  }
});
