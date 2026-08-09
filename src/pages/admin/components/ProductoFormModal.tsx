import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { optimizeImageFile } from '@/lib/imageOptimize';
import type { Producto, ProductoCategoria, ProductoEstado } from '@/types/producto';

const FAMILIAS_ELIMINADAS_KEY = 'pm_familias_eliminadas';

const CATEGORIAS: { value: ProductoCategoria; label: string }[] = [
  { value: 'pescado', label: 'Pescado' },
  { value: 'especial', label: 'Especial' },
  { value: 'raciones', label: 'Raciones' },
  { value: 'marisco', label: 'Marisco' },
];

const SUBCATEGORIAS: { value: string; label: string }[] = [
  { value: '', label: '(ninguna)' },
  { value: 'azul', label: 'Pescado azul' },
  { value: 'semigraso', label: 'Semigraso' },
  { value: 'filetes_lomos', label: 'Filetes / lomos' },
  { value: 'merluza_bakalao', label: 'Merluza / bacalao' },
  { value: 'roca', label: 'Pescado de roca' },
  { value: 'blanco', label: 'Pescado blanco' },
  { value: 'cefalopodos', label: 'Cefalópodos' },
  { value: 'bivalvos', label: 'Bivalvos' },
  { value: 'crustaceos_grandes', label: 'Crustáceos grandes' },
  { value: 'gambas_langostinos', label: 'Gambas / langostinos' },
  { value: 'raciones_porcion', label: 'Raciones (porción)' },
  { value: 'raciones_entero', label: 'Raciones (entero)' },
];

const ESTADOS: { value: ProductoEstado; label: string }[] = [
  { value: 'available', label: 'Disponible hoy' },
  { value: 'new', label: 'Novedad' },
  { value: 'premium', label: 'Especialidad' },
  { value: 'seasonal', label: 'De temporada' },
];

type FormState = {
  nombre_es: string;
  nombre_eu: string;
  descripcion_es: string;
  descripcion_eu: string;
  origen_es: string;
  origen_eu: string;
  precio: string;
  categoria: ProductoCategoria;
  subcategoria: string;
  estado: ProductoEstado;
  disponible: boolean;
  destacado: boolean;
  imagen_url: string;
};

function toFormState(p: Producto | null): FormState {
  if (!p) {
    return {
      nombre_es: '', nombre_eu: '', descripcion_es: '', descripcion_eu: '',
      origen_es: '', origen_eu: '', precio: '', categoria: 'pescado', subcategoria: '',
      estado: 'available', disponible: true, destacado: false, imagen_url: '',
    };
  }
  return {
    nombre_es: p.nombre_es, nombre_eu: p.nombre_eu ?? '',
    descripcion_es: p.descripcion_es ?? '', descripcion_eu: p.descripcion_eu ?? '',
    origen_es: p.origen_es ?? '', origen_eu: p.origen_eu ?? '',
    precio: p.precio, categoria: p.categoria, subcategoria: p.subcategoria ?? '',
    estado: p.estado, disponible: p.disponible, destacado: p.destacado, imagen_url: p.imagen_url ?? '',
  };
}

export default function ProductoFormModal({
  producto,
  onClose,
  onSaved,
}: {
  producto: Producto | null;
  onClose: () => void;
  onSaved: (producto: Producto) => void;
}) {
  const [initialForm] = useState<FormState>(() => toFormState(producto));
  const [form, setForm] = useState<FormState>(initialForm);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [familiasExtra, setFamiliasExtra] = useState<string[]>([]);
  const [addingFamilia, setAddingFamilia] = useState(false);
  const [nuevaFamilia, setNuevaFamilia] = useState('');
  const [managingFamilias, setManagingFamilias] = useState(false);
  const [familiasEliminadas, setFamiliasEliminadas] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(FAMILIAS_ELIMINADAS_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const requestClose = () => {
    if (isDirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  useEffect(() => {
    supabase
      .from('productos')
      .select('subcategoria')
      .not('subcategoria', 'is', null)
      .then(({ data }) => {
        if (!data) return;
        const known = new Set(SUBCATEGORIAS.map((s) => s.value));
        const extra = Array.from(
          new Set(
            data
              .map((row) => row.subcategoria as string)
              .filter((value) => value && !known.has(value))
          )
        ).sort((a, b) => a.localeCompare(b));
        setFamiliasExtra(extra);
      });
  }, []);

  const subcategoriaOptions = [
    ...SUBCATEGORIAS,
    ...familiasExtra.map((value) => ({ value, label: value })),
  ].filter((o) => !o.value || o.value === form.subcategoria || !familiasEliminadas.has(o.value));

  const update = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const confirmNuevaFamilia = () => {
    const value = nuevaFamilia.trim();
    if (!value) {
      setAddingFamilia(false);
      return;
    }
    if (!subcategoriaOptions.some((o) => o.value === value)) {
      setFamiliasExtra((prev) => [...prev, value]);
    }
    update('subcategoria', value);
    setNuevaFamilia('');
    setAddingFamilia(false);
  };

  const eliminarFamilia = (value: string) => {
    setFamiliasEliminadas((prev) => {
      const next = new Set(prev);
      next.add(value);
      try {
        localStorage.setItem(FAMILIAS_ELIMINADAS_KEY, JSON.stringify(Array.from(next)));
      } catch {
        /* localStorage no disponible */
      }
      return next;
    });
    if (form.subcategoria === value) update('subcategoria', '');
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const optimized = await optimizeImageFile(file);
      const path = `${Date.now()}-${optimized.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from('productos').upload(path, optimized, {
        cacheControl: '31536000',
        contentType: optimized.type || file.type,
      });
      if (uploadError) {
        setError('No se pudo subir la foto: ' + uploadError.message);
        return;
      }
      const { data } = supabase.storage.from('productos').getPublicUrl(path);
      update('imagen_url', data.publicUrl);
    } catch {
      setError('No se pudo procesar la imagen. Prueba con otra foto.');
    } finally {
      setUploading(false);
    }
  };

  const handleImageRemove = () => {
    update('imagen_url', '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre_es.trim() || !form.precio.trim()) {
      setError('Nombre y precio son obligatorios');
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      nombre_es: form.nombre_es.trim(),
      nombre_eu: form.nombre_eu.trim() || null,
      descripcion_es: form.descripcion_es.trim() || null,
      descripcion_eu: form.descripcion_eu.trim() || null,
      origen_es: form.origen_es.trim() || null,
      origen_eu: form.origen_eu.trim() || null,
      precio: form.precio.trim(),
      categoria: form.categoria,
      subcategoria: form.subcategoria || null,
      estado: form.estado,
      disponible: form.disponible,
      destacado: form.destacado,
      imagen_url: form.imagen_url || null,
    };

    const result = producto
      ? await supabase.from('productos').update(payload).eq('id', producto.id).select().single()
      : await supabase.from('productos').insert(payload).select().single();

    setSaving(false);

    if (result.error || !result.data) {
      setError(result.error?.message ?? 'No se pudo guardar el producto');
      return;
    }
    onSaved(result.data as Producto);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-foreground-950/40 sm:p-4" onClick={requestClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full sm:max-w-[560px] max-h-[92vh] sm:max-h-[90vh] bg-background-50 rounded-t-2xl sm:rounded-lg border border-background-200/70 shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-background-200/70 flex-shrink-0">
          <h2 className="text-base font-heading font-semibold text-foreground-950">
            {producto ? 'Editar producto' : 'Nuevo producto'}
          </h2>
          <button type="button" onClick={requestClose} className="w-8 h-8 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-200/70">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        {confirmDiscard && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-foreground-950/50 rounded-t-2xl sm:rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-[85%] max-w-[320px] bg-background-50 border border-background-200/70 rounded-lg shadow-xl p-5">
              <p className="text-sm font-medium text-foreground-950 mb-1">¿Descartar cambios?</p>
              <p className="text-xs text-foreground-500 mb-4">Los datos que has rellenado se perderán.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDiscard(false)}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-background-100 text-foreground-600 hover:bg-background-200/70"
                >
                  Seguir editando
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-red-600 text-background-50 hover:bg-red-700"
                >
                  Descartar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-y-auto px-5 sm:px-6 py-5">
          {/* Imagen */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-foreground-500 mb-2">Foto</label>
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-background-100 border border-background-200/70 flex-shrink-0">
                {form.imagen_url ? (
                  <>
                    <img src={form.imagen_url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={handleImageRemove}
                      aria-label="Eliminar foto"
                      className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-foreground-950/70 text-background-50 hover:bg-red-600"
                    >
                      <i className="ri-delete-bin-line text-xs"></i>
                    </button>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-foreground-300">
                    <i className="ri-image-line text-2xl"></i>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-start gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-background-100 border border-background-200/70 text-xs font-medium text-foreground-600 cursor-pointer hover:bg-background-200/70">
                  <i className="ri-upload-2-line"></i>
                  {form.imagen_url ? 'Cambiar foto' : 'Seleccionar archivo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
                {form.imagen_url && (
                  <button
                    type="button"
                    onClick={handleImageRemove}
                    className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                  >
                    <i className="ri-close-circle-line"></i>
                    Eliminar foto
                  </button>
                )}
                {uploading && <span className="text-xs text-foreground-400">Subiendo…</span>}
              </div>
            </div>
          </div>

          {/* Nombre ES/EU */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1">Nombre (castellano) *</label>
              <input value={form.nombre_es} onChange={(e) => update('nombre_es', e.target.value)} className="w-full px-3 py-2.5 bg-background-100 border border-background-200/70 rounded-lg text-base sm:text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1">Izena (euskera)</label>
              <input value={form.nombre_eu} onChange={(e) => update('nombre_eu', e.target.value)} className="w-full px-3 py-2.5 bg-background-100 border border-background-200/70 rounded-lg text-base sm:text-sm" />
            </div>
          </div>

          {/* Descripcion ES/EU */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1">Descripción (castellano)</label>
              <textarea value={form.descripcion_es} onChange={(e) => update('descripcion_es', e.target.value)} rows={2} className="w-full px-3 py-2.5 bg-background-100 border border-background-200/70 rounded-lg text-base sm:text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1">Deskribapena (euskera)</label>
              <textarea value={form.descripcion_eu} onChange={(e) => update('descripcion_eu', e.target.value)} rows={2} className="w-full px-3 py-2.5 bg-background-100 border border-background-200/70 rounded-lg text-base sm:text-sm" />
            </div>
          </div>

          {/* Origen ES/EU */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1">Origen (castellano)</label>
              <input value={form.origen_es} onChange={(e) => update('origen_es', e.target.value)} className="w-full px-3 py-2.5 bg-background-100 border border-background-200/70 rounded-lg text-base sm:text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1">Jatorria (euskera)</label>
              <input value={form.origen_eu} onChange={(e) => update('origen_eu', e.target.value)} className="w-full px-3 py-2.5 bg-background-100 border border-background-200/70 rounded-lg text-base sm:text-sm" />
            </div>
          </div>

          {/* Precio + categoria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1">Precio *</label>
              <input value={form.precio} onChange={(e) => update('precio', e.target.value)} placeholder="Desde 10€/kg" className="w-full px-3 py-2.5 bg-background-100 border border-background-200/70 rounded-lg text-base sm:text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1">Categoría</label>
              <select value={form.categoria} onChange={(e) => update('categoria', e.target.value as ProductoCategoria)} className="w-full px-3 py-2.5 bg-background-100 border border-background-200/70 rounded-lg text-base sm:text-sm">
                {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {/* Familia + etiqueta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-foreground-500">Familia (subcategoría)</label>
                {!addingFamilia && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setAddingFamilia(true); setManagingFamilias(false); setNuevaFamilia(''); }}
                      className="inline-flex items-center gap-0.5 text-xs font-medium text-primary-600 hover:text-primary-700"
                    >
                      <i className="ri-add-line"></i> Añadir
                    </button>
                    <button
                      type="button"
                      onClick={() => setManagingFamilias((v) => !v)}
                      className="inline-flex items-center gap-0.5 text-xs font-medium text-foreground-400 hover:text-foreground-600"
                    >
                      <i className="ri-settings-4-line"></i> Gestionar
                    </button>
                  </div>
                )}
              </div>

              {addingFamilia ? (
                <div className="flex gap-1">
                  <input
                    autoFocus
                    value={nuevaFamilia}
                    onChange={(e) => setNuevaFamilia(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); confirmNuevaFamilia(); }
                      if (e.key === 'Escape') { e.preventDefault(); setAddingFamilia(false); setNuevaFamilia(''); }
                    }}
                    placeholder="Nombre de la nueva familia"
                    className="w-full px-3 py-2.5 bg-background-100 border border-background-200/70 rounded-lg text-base sm:text-sm"
                  />
                  <button type="button" onClick={confirmNuevaFamilia} className="px-2 rounded-lg bg-primary-500 text-background-50 text-xs">
                    <i className="ri-check-line"></i>
                  </button>
                  <button type="button" onClick={() => { setAddingFamilia(false); setNuevaFamilia(''); }} className="px-2 rounded-lg bg-background-100 border border-background-200/70 text-xs">
                    <i className="ri-close-line"></i>
                  </button>
                </div>
              ) : managingFamilias ? (
                <div className="border border-background-200/70 rounded-lg overflow-hidden">
                  <div className="divide-y divide-background-200/70 max-h-40 overflow-y-auto">
                    {subcategoriaOptions.filter((o) => o.value).map((o) => (
                      <div key={o.value} className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm text-foreground-700">{o.label}</span>
                        <button
                          type="button"
                          onClick={() => eliminarFamilia(o.value)}
                          aria-label={`Eliminar familia ${o.label}`}
                          className="w-6 h-6 flex items-center justify-center rounded-full text-foreground-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <i className="ri-delete-bin-line text-xs"></i>
                        </button>
                      </div>
                    ))}
                    {subcategoriaOptions.filter((o) => o.value).length === 0 && (
                      <p className="px-3 py-3 text-xs text-foreground-400">No hay familias todavía.</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setManagingFamilias(false)}
                    className="w-full px-3 py-2 text-xs font-medium text-center text-foreground-500 bg-background-100 hover:bg-background-200/70"
                  >
                    Cerrar
                  </button>
                </div>
              ) : (
                <select
                  value={form.subcategoria}
                  onChange={(e) => update('subcategoria', e.target.value)}
                  className="w-full px-3 py-2.5 bg-background-100 border border-background-200/70 rounded-lg text-base sm:text-sm"
                >
                  {subcategoriaOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1">Etiqueta</label>
              <select value={form.estado} onChange={(e) => update('estado', e.target.value as ProductoEstado)} className="w-full px-3 py-2.5 bg-background-100 border border-background-200/70 rounded-lg text-base sm:text-sm">
                {ESTADOS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Disponible toggle */}
          <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
            <input type="checkbox" checked={form.disponible} onChange={(e) => update('disponible', e.target.checked)} className="w-4 h-4" />
            <span className="text-sm text-foreground-700">Disponible (desmarca para poner "Agotado")</span>
          </label>

          {/* Destacado toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={form.destacado} onChange={(e) => update('destacado', e.target.checked)} className="w-4 h-4" />
            <span className="text-sm text-foreground-700">Destacado (aparece en la "Selección del día" de portada y profesionales)</span>
          </label>

          {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
        </div>

        <div className="flex gap-2 px-5 sm:px-6 py-4 border-t border-background-200/70 flex-shrink-0">
          <button type="button" onClick={requestClose} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-background-100 text-foreground-600 hover:bg-background-200/70">
            Cancelar
          </button>
          <button type="submit" disabled={saving || uploading} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}
