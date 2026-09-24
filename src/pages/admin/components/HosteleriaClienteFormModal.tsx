import { useState } from 'react';
import type { HosteleriaCliente, HosteleriaListaPrecio } from '@/types/hosteleria';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function HosteleriaClienteFormModal({
  cliente,
  listas,
  prefillNombre,
  onClose,
  onCreate,
  onUpdate,
  onChangePin,
  onCreateLista,
}: {
  cliente: HosteleriaCliente | null;
  listas: HosteleriaListaPrecio[];
  prefillNombre?: string;
  onClose: () => void;
  onCreate: (input: { listaPrecioId: string; nombreNegocio: string; codigoAcceso: string; pin: string; notas: string }) => Promise<{ ok: boolean; error?: string }>;
  onUpdate: (id: string, patch: Partial<Pick<HosteleriaCliente, 'nombre_negocio' | 'lista_precio_id' | 'activo' | 'notas'>>) => Promise<boolean>;
  onChangePin: (id: string, pin: string) => Promise<boolean>;
  onCreateLista: (nombre: string) => Promise<HosteleriaListaPrecio | null>;
}) {
  const isNew = !cliente;
  const [nombreNegocio, setNombreNegocio] = useState(cliente?.nombre_negocio ?? prefillNombre ?? '');
  const [codigoAcceso, setCodigoAcceso] = useState(cliente?.codigo_acceso ?? '');
  const [codigoTocado, setCodigoTocado] = useState(false);
  const [listaPrecioId, setListaPrecioId] = useState(cliente?.lista_precio_id ?? listas[0]?.id ?? '');
  const [nuevaLista, setNuevaLista] = useState('');
  const [mostrarNuevaLista, setMostrarNuevaLista] = useState(listas.length === 0);
  const [pin, setPin] = useState('');
  const [notas, setNotas] = useState(cliente?.notas ?? '');
  const [activo, setActivo] = useState(cliente?.activo ?? true);
  const [cambiandoPin, setCambiandoPin] = useState(false);
  const [nuevoPin, setNuevoPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNombreChange = (value: string) => {
    setNombreNegocio(value);
    if (isNew && !codigoTocado) setCodigoAcceso(slugify(value));
  };

  const handleSave = async () => {
    setError(null);
    if (!nombreNegocio.trim()) {
      setError('Indica el nombre del negocio.');
      return;
    }

    setSaving(true);

    let finalListaId = listaPrecioId;
    if (mostrarNuevaLista) {
      if (!nuevaLista.trim()) {
        setError('Indica el nombre de la tarifa (por ejemplo, "Bares y restaurantes").');
        setSaving(false);
        return;
      }
      const creada = await onCreateLista(nuevaLista.trim());
      if (!creada) {
        setError('No se pudo crear la tarifa.');
        setSaving(false);
        return;
      }
      finalListaId = creada.id;
    }

    if (!finalListaId) {
      setError('Elige una tarifa de precios.');
      setSaving(false);
      return;
    }

    if (isNew) {
      if (!codigoAcceso.trim()) {
        setError('Indica un código de acceso.');
        setSaving(false);
        return;
      }
      if (!/^[0-9]{4,8}$/.test(pin)) {
        setError('El PIN debe tener entre 4 y 8 dígitos.');
        setSaving(false);
        return;
      }
      const result = await onCreate({
        listaPrecioId: finalListaId,
        nombreNegocio: nombreNegocio.trim(),
        codigoAcceso: codigoAcceso.trim(),
        pin,
        notas: notas.trim(),
      });
      setSaving(false);
      if (!result.ok) {
        setError(result.error?.includes('duplicate') ? 'Ese código de acceso ya está en uso, elige otro.' : result.error ?? 'No se pudo crear el cliente.');
        return;
      }
      onClose();
      return;
    }

    const ok = await onUpdate(cliente!.id, {
      nombre_negocio: nombreNegocio.trim(),
      lista_precio_id: finalListaId,
      activo,
      notas: notas.trim() || null,
    });
    setSaving(false);
    if (!ok) {
      setError('No se pudo guardar los cambios.');
      return;
    }
    onClose();
  };

  const handleGuardarPin = async () => {
    if (!cliente) return;
    if (!/^[0-9]{4,8}$/.test(nuevoPin)) {
      setError('El PIN debe tener entre 4 y 8 dígitos.');
      return;
    }
    setSaving(true);
    const ok = await onChangePin(cliente.id, nuevoPin);
    setSaving(false);
    if (!ok) {
      setError('No se pudo cambiar el PIN.');
      return;
    }
    setCambiandoPin(false);
    setNuevoPin('');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-foreground-950/40 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full sm:max-w-[480px] max-h-[92vh] sm:max-h-[90vh] bg-background-50 rounded-t-2xl sm:rounded-lg border border-background-200/70 shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-background-200/70 flex-shrink-0">
          <h2 className="text-base font-heading font-semibold text-foreground-950">
            {isNew ? 'Nuevo cliente de hostelería' : 'Editar cliente de hostelería'}
          </h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-100 hover:text-foreground-950">
            <i className="ri-close-line"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1.5">Nombre del negocio</label>
            <input
              type="text"
              value={nombreNegocio}
              onChange={(e) => handleNombreChange(e.target.value)}
              placeholder="Restaurante Orotela"
              className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
            />
          </div>

          {isNew && (
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1.5">Código de acceso</label>
              <input
                type="text"
                value={codigoAcceso}
                onChange={(e) => {
                  setCodigoTocado(true);
                  setCodigoAcceso(slugify(e.target.value));
                }}
                placeholder="orotela"
                className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
              />
              <p className="text-[11px] text-foreground-400 mt-1">Lo que el cliente escribirá para entrar, junto con su PIN. Solo letras, números y guiones.</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1.5">Tarifa de precios</label>
            {!mostrarNuevaLista ? (
              <>
                <select
                  value={listaPrecioId}
                  onChange={(e) => setListaPrecioId(e.target.value)}
                  className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
                >
                  {listas.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nombre}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setMostrarNuevaLista(true)}
                  className="text-xs text-primary-600 hover:text-primary-700 mt-1.5"
                >
                  + Crear una tarifa nueva
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={nuevaLista}
                  onChange={(e) => setNuevaLista(e.target.value)}
                  placeholder="Bares y restaurantes"
                  className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
                />
                {listas.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMostrarNuevaLista(false)}
                    className="text-xs text-foreground-500 hover:text-foreground-700 mt-1.5"
                  >
                    Usar una tarifa existente
                  </button>
                )}
              </>
            )}
            <p className="text-[11px] text-foreground-400 mt-1">
              Varios clientes pueden compartir la misma tarifa (p.ej. "Bares y restaurantes"), o tener cada uno la suya.
            </p>
          </div>

          {isNew ? (
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1.5">PIN de acceso (4 a 8 dígitos)</label>
              <input
                type="text"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="1234"
                className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1.5">PIN de acceso</label>
              {!cambiandoPin ? (
                <button
                  type="button"
                  onClick={() => setCambiandoPin(true)}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-background-100 text-foreground-600 hover:bg-background-200/70"
                >
                  Cambiar PIN
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={nuevoPin}
                    onChange={(e) => setNuevoPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Nuevo PIN"
                    className="flex-1 px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60"
                  />
                  <button
                    type="button"
                    onClick={handleGuardarPin}
                    disabled={saving}
                    className="px-3 py-2 rounded-lg text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-60"
                  >
                    Guardar
                  </button>
                </div>
              )}
              <p className="text-[11px] text-foreground-400 mt-1">Por seguridad, el PIN actual no se muestra — solo puedes fijar uno nuevo.</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1.5">Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-background-100 border border-background-200/70 rounded-lg text-sm focus:outline-none focus:border-foreground-300/60 resize-none"
            />
          </div>

          {!isNew && (
            <label className="flex items-center gap-3 cursor-pointer select-none py-1">
              <button
                type="button"
                role="switch"
                aria-checked={activo}
                onClick={() => setActivo((v) => !v)}
                className={`relative inline-flex flex-shrink-0 items-center w-11 h-6 rounded-full border transition-colors duration-200 ${
                  activo ? 'bg-primary-500 border-primary-500' : 'bg-background-200 border-background-300'
                }`}
              >
                <span
                  className={`inline-block w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
                    activo ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className="text-sm text-foreground-700 leading-snug">{activo ? 'Acceso activo' : 'Acceso desactivado (no puede entrar)'}</span>
            </label>
          )}

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
