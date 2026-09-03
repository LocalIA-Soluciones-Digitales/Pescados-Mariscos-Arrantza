import { useState } from 'react';
import type { Producto } from '@/types/producto';
import type { PromoRegla, PromoTipoCondicion, PromoTipoRecompensa } from '@/types/promo';
import type { NewPromoReglaInput } from '@/hooks/usePromoReglas';

type FormState = {
  nombre: string;
  tipo_condicion: PromoTipoCondicion;
  umbral: string;
  importe_min_pedido: string;
  tipo_recompensa: PromoTipoRecompensa;
  producto_id: string;
  valor_recompensa: string;
  mensaje_plantilla: string;
  activo: boolean;
};

const MENSAJE_POR_DEFECTO =
  'Hola {{cliente_nombre}}, ¡enhorabuena! Como agradecimiento por tu confianza en {{negocio}} has conseguido: {{recompensa}}. ¡Gracias por confiar en nosotros!';

function toFormState(r: PromoRegla | null): FormState {
  if (!r) {
    return {
      nombre: '',
      tipo_condicion: 'gasto_total',
      umbral: '',
      importe_min_pedido: '',
      tipo_recompensa: 'producto_gratis',
      producto_id: '',
      valor_recompensa: '',
      mensaje_plantilla: MENSAJE_POR_DEFECTO,
      activo: true,
    };
  }
  return {
    nombre: r.nombre,
    tipo_condicion: r.tipo_condicion,
    umbral: String(r.umbral),
    importe_min_pedido: r.importe_min_pedido != null ? String(r.importe_min_pedido) : '',
    tipo_recompensa: r.tipo_recompensa,
    producto_id: r.producto_id ?? '',
    valor_recompensa: r.valor_recompensa != null ? String(r.valor_recompensa) : '',
    mensaje_plantilla: r.mensaje_plantilla,
    activo: r.activo,
  };
}

export default function PromoReglaFormModal({
  regla,
  productos,
  onClose,
  onSave,
}: {
  regla: PromoRegla | null;
  productos: Producto[];
  onClose: () => void;
  onSave: (input: NewPromoReglaInput & { activo: boolean }) => Promise<boolean>;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(regla));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      setError('Indica un nombre para la regla (por ejemplo, "Cliente VIP 1000€").');
      return;
    }
    const umbral = Number(form.umbral);
    if (!umbral || umbral <= 0) {
      setError(form.tipo_condicion === 'gasto_total' ? 'Indica el gasto total a partir del cual se concede.' : 'Indica el número de pedidos necesarios.');
      return;
    }
    let importeMin: number | null = null;
    if (form.tipo_condicion === 'num_pedidos') {
      importeMin = Number(form.importe_min_pedido);
      if (!importeMin || importeMin <= 0) {
        setError('Indica el importe mínimo que debe tener cada pedido para contar.');
        return;
      }
    }
    let productoId: string | null = null;
    let valorRecompensa: number | null = null;
    if (form.tipo_recompensa === 'producto_gratis') {
      if (!form.producto_id) {
        setError('Elige el producto que se regala.');
        return;
      }
      productoId = form.producto_id;
    } else {
      valorRecompensa = Number(form.valor_recompensa);
      if (!valorRecompensa || valorRecompensa <= 0) {
        setError(form.tipo_recompensa === 'descuento_eur' ? 'Indica el importe del descuento en euros.' : 'Indica el porcentaje de descuento.');
        return;
      }
    }
    if (!form.mensaje_plantilla.trim()) {
      setError('Escribe el mensaje que recibirá el cliente.');
      return;
    }

    setSaving(true);
    setError(null);
    const ok = await onSave({
      nombre: form.nombre.trim(),
      tipo_condicion: form.tipo_condicion,
      umbral,
      importe_min_pedido: importeMin,
      tipo_recompensa: form.tipo_recompensa,
      producto_id: productoId,
      valor_recompensa: valorRecompensa,
      mensaje_plantilla: form.mensaje_plantilla.trim(),
      activo: form.activo,
    });
    setSaving(false);
    if (!ok) {
      setError('No se pudo guardar la regla. Inténtalo de nuevo.');
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-foreground-950/40 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full sm:max-w-[520px] max-h-[92vh] sm:max-h-[90vh] bg-background-50 rounded-t-2xl sm:rounded-lg border border-background-200/70 shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-background-200/70 flex-shrink-0">
          <h2 className="text-base font-heading font-semibold text-foreground-950">{regla ? 'Editar regla de promoción' : 'Nueva regla de promoción'}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-100 hover:text-foreground-950">
            <i className="ri-close-line"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1.5">Nombre de la regla</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Cliente VIP 1000€"
              className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1.5">Condición</label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, tipo_condicion: 'gasto_total' }))}
                className={`flex-1 px-3 py-2 rounded-full text-xs font-medium transition-colors ${
                  form.tipo_condicion === 'gasto_total' ? 'bg-primary-500 text-background-50' : 'bg-background-100 text-foreground-500 hover:bg-background-200/70'
                }`}
              >
                Gasto total acumulado
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, tipo_condicion: 'num_pedidos' }))}
                className={`flex-1 px-3 py-2 rounded-full text-xs font-medium transition-colors ${
                  form.tipo_condicion === 'num_pedidos' ? 'bg-primary-500 text-background-50' : 'bg-background-100 text-foreground-500 hover:bg-background-200/70'
                }`}
              >
                Nº de pedidos
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1.5">
                {form.tipo_condicion === 'gasto_total' ? 'Gasto total (€)' : 'Nº de pedidos'}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.umbral}
                onChange={(e) => setForm((f) => ({ ...f, umbral: e.target.value }))}
                placeholder={form.tipo_condicion === 'gasto_total' ? '1000' : '10'}
                className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
              />
            </div>
            {form.tipo_condicion === 'num_pedidos' && (
              <div>
                <label className="block text-xs font-medium text-foreground-500 mb-1.5">Importe mínimo por pedido (€)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.importe_min_pedido}
                  onChange={(e) => setForm((f) => ({ ...f, importe_min_pedido: e.target.value }))}
                  placeholder="50"
                  className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1.5">Recompensa</label>
            <select
              value={form.tipo_recompensa}
              onChange={(e) => setForm((f) => ({ ...f, tipo_recompensa: e.target.value as PromoTipoRecompensa }))}
              className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
            >
              <option value="producto_gratis">Producto gratis</option>
              <option value="descuento_eur">Descuento en €</option>
              <option value="descuento_pct">Descuento en %</option>
            </select>
          </div>

          {form.tipo_recompensa === 'producto_gratis' ? (
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1.5">Producto a regalar</label>
              <select
                value={form.producto_id}
                onChange={(e) => setForm((f) => ({ ...f, producto_id: e.target.value }))}
                className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
              >
                <option value="">Selecciona un producto…</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre_es}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1.5">
                {form.tipo_recompensa === 'descuento_eur' ? 'Descuento (€)' : 'Descuento (%)'}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.valor_recompensa}
                onChange={(e) => setForm((f) => ({ ...f, valor_recompensa: e.target.value }))}
                placeholder={form.tipo_recompensa === 'descuento_eur' ? '20' : '10'}
                className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1.5">Mensaje para el cliente</label>
            <textarea
              value={form.mensaje_plantilla}
              onChange={(e) => setForm((f) => ({ ...f, mensaje_plantilla: e.target.value }))}
              rows={4}
              className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60 resize-none"
            />
            <p className="text-[11px] text-foreground-400 mt-1.5">
              Puedes usar <code>{'{{cliente_nombre}}'}</code>, <code>{'{{recompensa}}'}</code> y <code>{'{{negocio}}'}</code> — se sustituyen solos al conceder la promoción.
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none py-1">
            <button
              type="button"
              role="switch"
              aria-checked={form.activo}
              onClick={() => setForm((f) => ({ ...f, activo: !f.activo }))}
              className={`relative inline-flex flex-shrink-0 items-center w-11 h-6 rounded-full border transition-colors duration-200 ${
                form.activo ? 'bg-primary-500 border-primary-500' : 'bg-background-200 border-background-300'
              }`}
            >
              <span
                className={`inline-block w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
                  form.activo ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="text-sm text-foreground-700 leading-snug">{form.activo ? 'Activa' : 'Desactivada (no se evalúa)'}</span>
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
