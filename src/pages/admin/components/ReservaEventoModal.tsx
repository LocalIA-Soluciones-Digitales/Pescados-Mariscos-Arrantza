import { useState } from 'react';
import type { ReservaEvento } from '@/types/reserva';
import type { NewReservaEventoInput } from '@/hooks/useReservasEventos';

type FormState = {
  nombre_es: string;
  nombre_eu: string;
  fecha_entrega: string;
  fecha_limite: string;
  activo: boolean;
};

function toFormState(e: ReservaEvento | null): FormState {
  if (!e) {
    return { nombre_es: '', nombre_eu: '', fecha_entrega: '', fecha_limite: '', activo: true };
  }
  return {
    nombre_es: e.nombre_es,
    nombre_eu: e.nombre_eu ?? '',
    fecha_entrega: e.fecha_entrega,
    fecha_limite: e.fecha_limite ?? '',
    activo: e.activo,
  };
}

export default function ReservaEventoModal({
  evento,
  onClose,
  onSave,
}: {
  evento: ReservaEvento | null;
  onClose: () => void;
  onSave: (input: NewReservaEventoInput & { activo: boolean }) => Promise<boolean>;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(evento));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!form.nombre_es.trim()) {
      setError('Indica un nombre para la campaña (por ejemplo, "Navidad 2026").');
      return;
    }
    if (!form.fecha_entrega) {
      setError('Indica la fecha de entrega.');
      return;
    }
    setSaving(true);
    setError(null);
    const ok = await onSave({
      nombre_es: form.nombre_es.trim(),
      nombre_eu: form.nombre_eu.trim() || null,
      fecha_entrega: form.fecha_entrega,
      fecha_limite: form.fecha_limite || null,
      activo: form.activo,
    });
    setSaving(false);
    if (!ok) {
      setError('No se pudo guardar la campaña. Inténtalo de nuevo.');
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-foreground-950/40 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full sm:max-w-[480px] max-h-[92vh] sm:max-h-[90vh] bg-background-50 rounded-t-2xl sm:rounded-lg border border-background-200/70 shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-background-200/70 flex-shrink-0">
          <h2 className="text-base font-heading font-semibold text-foreground-950">
            {evento ? 'Editar campaña de reservas' : 'Nueva campaña de reservas'}
          </h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-100 hover:text-foreground-950">
            <i className="ri-close-line"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1.5">Nombre (castellano)</label>
            <input
              type="text"
              value={form.nombre_es}
              onChange={(e) => setForm((f) => ({ ...f, nombre_es: e.target.value }))}
              placeholder="Navidad 2026"
              className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1.5">Nombre (euskera) — opcional</label>
            <input
              type="text"
              value={form.nombre_eu}
              onChange={(e) => setForm((f) => ({ ...f, nombre_eu: e.target.value }))}
              placeholder="Eguberriak 2026"
              className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1.5">Fecha de entrega</label>
              <input
                type="date"
                value={form.fecha_entrega}
                onChange={(e) => setForm((f) => ({ ...f, fecha_entrega: e.target.value }))}
                className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1.5">Fecha límite de pedido</label>
              <input
                type="date"
                value={form.fecha_limite}
                onChange={(e) => setForm((f) => ({ ...f, fecha_limite: e.target.value }))}
                className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
              />
            </div>
          </div>
          <p className="text-[11px] text-foreground-400 -mt-2">
            La fecha límite es opcional: si la indicas, la web dejará de aceptar reservas para esta campaña a partir de ese día.
          </p>

          <label className="flex items-center gap-2.5 cursor-pointer select-none pt-1">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, activo: !f.activo }))}
              className={`w-10 h-6 rounded-full relative transition-colors flex-shrink-0 ${form.activo ? 'bg-primary-500' : 'bg-background-300'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.activo ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-foreground-700">
              {form.activo ? 'Abierta a reservas en la web' : 'Cerrada (no visible para clientes)'}
            </span>
          </label>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-background-200/70 flex-shrink-0">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium bg-background-100 text-foreground-600 hover:bg-background-200/70">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
