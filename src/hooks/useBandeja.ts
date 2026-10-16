// Hojas pendientes de guardar en Compras (ver BandejaAlbaranes).
import { useCallback, useRef, useState } from 'react';
import { leerAlbaran, type AlbaranLeido } from '@/lib/comprasOcr';
import { leerArchivo, type HojaLeida } from '@/lib/comprasBandeja';

export interface HojaBandeja {
  id: string;
  nombre: string;
  leida: HojaLeida | null;
  leido: AlbaranLeido | null;
  // Unida o separada a mano de la anterior; null = automático.
  unida: boolean | null;
}

export function useBandeja() {
  const [hojas, setHojas] = useState<HojaBandeja[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  // Las hojas se leen de una en una (el OCR ya usa todo el móvil); mientras,
  // se pueden ir añadiendo más.
  const cola = useRef<Promise<void>>(Promise.resolve());

  const añadir = useCallback((files: File[]) => {
    const nuevas: HojaBandeja[] = files.map((f) => ({ id: crypto.randomUUID(), nombre: f.name, leida: null, leido: null, unida: null }));
    setHojas((p) => [...p, ...nuevas]);
    nuevas.forEach((h, i) => {
      cola.current = cola.current.then(async () => {
        let leida: HojaLeida;
        try {
          leida = await leerArchivo(files[i], setAviso);
        } catch (e) {
          // No se pudo ni abrir (foto rota, PDF protegido…): fuera de la bandeja.
          setHojas((p) => p.filter((k) => k.id !== h.id));
          setAviso(`«${files[i].name}»: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
        setHojas((p) => p.map((k) => (k.id === h.id ? { ...k, leida, leido: leerAlbaran(leida.cajas) } : k)));
        setAviso(null);
      });
    });
  }, []);

  return { hojas, setHojas, aviso, setAviso, añadir };
}

export type Bandeja = ReturnType<typeof useBandeja>;
