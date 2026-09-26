export interface LoteBote {
  id: string;
  cliente_id: string;
  producto_id: string | null;
  producto_nombre: string;
  fecha_envasado: string;
  fecha_caducidad: string;
  lote: string;
  procedencia: string | null;
  cantidad: number;
  created_at: string;
}

export type NewLoteBoteInput = Pick<
  LoteBote,
  'producto_id' | 'producto_nombre' | 'fecha_envasado' | 'fecha_caducidad' | 'procedencia' | 'cantidad'
>;
