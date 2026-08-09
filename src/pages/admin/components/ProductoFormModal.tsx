import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Producto, ProductoCategoria, ProductoEstado } from '@/types/producto';

const NUEVA_FAMILIA_VALUE = '__nueva_familia__';

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
  const [form, setForm] = useState<FormState>(() => toFormState(producto));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [familiasExtra, setFamiliasExtra] = useState<string[]>([]);
  const [addingFamilia, setAddingFamilia] = useState(false);
  const [nuevaFamilia, setNuevaFamilia] = useState('');

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
  ];

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

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: uploadError } = await supabase.storage.from('productos').upload(path, file);
    if (uploadError) {
      setError('No se pudo subir la foto: ' + uploadError.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from('productos').getPublicUrl(path);
    update('imagen_url', data.publicUrl);
    setUploading(false);
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground-950/40 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto bg-background-50 rounded-lg border border-background-200/70 shadow-2xl p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-heading font-semibold text-foreground-950">
            {producto ? 'Editar producto' : 'Nuevo producto'}
          </h2>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-200/70">
            <i className="ri-close-line"></i>
          </button>
        </div>

        {/* Imagen */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-foreground-500 mb-2">Foto</label>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-md overflow-hidden bg-background-100 border border-background-200/70 flex-shrink-0">
              {form.imagen_url && <img src={form.imagen_url} alt="" className="w-full h-full object-cover" />}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(file);
              }}
              className="text-xs text-foreground-500"
            />
            {uploading && <span className="text-xs text-foreground-400">Subiendo…</span>}
          </div>
        </div>

        {/* Nombre ES/EU */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">Nombre (castellano) *</label>
            <input value={form.nombre_es} onChange={(e) => update('nombre_es', e.target.value)} className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">Izena (euskera)</label>
            <input value={form.nombre_eu} onChange={(e) => update('nombre_eu', e.target.value)} className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm" />
          </div>
        </div>

        {/* Descripcion ES/EU */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">Descripción (castellano)</label>
            <textarea value={form.descripcion_es} onChange={(e) => update('descripcion_es', e.target.value)} rows={2} className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">Deskribapena (euskera)</label>
            <textarea value={form.descripcion_eu} onChange={(e) => update('descripcion_eu', e.target.value)} rows={2} className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm" />
          </div>
        </div>

        {/* Origen ES/EU */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">Origen (castellano)</label>
            <input value={form.origen_es} onChange={(e) => update('origen_es', e.target.value)} className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">Jatorria (euskera)</label>
            <input value={form.origen_eu} onChange={(e) => update('origen_eu', e.target.value)} className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm" />
          </div>
        </div>

        {/* Precio + categoria + subcategoria */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">Precio *</label>
            <input value={form.precio} onChange={(e) => update('precio', e.target.value)} placeholder="Desde 10€/kg" className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">Categoría</label>
            <select value={form.categoria} onChange={(e) => update('categoria', e.target.value as ProductoCategoria)} className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm">
              {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">Familia (subcategoría)</label>
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
                  className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm"
                />
                <button type="button" onClick={confirmNuevaFamilia} className="px-2 rounded-lg bg-primary-500 text-background-50 text-xs">
                  <i className="ri-check-line"></i>
                </button>
                <button type="button" onClick={() => { setAddingFamilia(false); setNuevaFamilia(''); }} className="px-2 rounded-lg bg-background-100 border border-background-200/70 text-xs">
                  <i className="ri-close-line"></i>
                </button>
              </div>
            ) : (
              <select
                value={form.subcategoria}
                onChange={(e) => {
                  if (e.target.value === NUEVA_FAMILIA_VALUE) { setAddingFamilia(true); return; }
                  update('subcategoria', e.target.value);
                }}
                className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm"
              >
                {subcategoriaOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                <option value={NUEVA_FAMILIA_VALUE}>+ Nueva familia…</option>
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">Etiqueta</label>
            <select value={form.estado} onChange={(e) => update('estado', e.target.value as ProductoEstado)} className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm">
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
        <label className="flex items-center gap-2 mb-5 cursor-pointer select-none">
          <input type="checkbox" checked={form.destacado} onChange={(e) => update('destacado', e.target.checked)} className="w-4 h-4" />
          <span className="text-sm text-foreground-700">Destacado (aparece en la "Selección del día" de portada y profesionales)</span>
        </label>

        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-background-100 text-foreground-600 hover:bg-background-200/70">
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
