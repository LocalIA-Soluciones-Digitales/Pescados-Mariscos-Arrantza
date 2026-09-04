import { useState } from 'react';
import type { Producto } from '@/types/producto';
import type { PromoOtorgada, PromoRegla } from '@/types/promo';
import type { NewPromoReglaInput } from '@/hooks/usePromoReglas';
import { whatsappHref } from '@/lib/phone';
import { promoCondicionTexto, promoRecompensaTexto } from '@/lib/promo';
import PromoReglaFormModal from './PromoReglaFormModal';

export default function PromoReglasPanel({
  reglas,
  otorgadas,
  productos,
  onClose,
  onCrearRegla,
  onPatchRegla,
  onEliminarRegla,
  onPatchOtorgada,
}: {
  reglas: PromoRegla[];
  otorgadas: PromoOtorgada[];
  productos: Producto[];
  onClose: () => void;
  onCrearRegla: (input: NewPromoReglaInput & { activo: boolean }) => Promise<boolean>;
  onPatchRegla: (id: string, patch: Partial<NewPromoReglaInput> & { activo?: boolean }) => Promise<boolean>;
  onEliminarRegla: (id: string) => Promise<boolean>;
  onPatchOtorgada: (id: string, patch: Partial<PromoOtorgada>) => Promise<boolean>;
}) {
  const [tab, setTab] = useState<'reglas' | 'pendientes'>('reglas');
  const [editing, setEditing] = useState<PromoRegla | null | 'new'>(null);

  const pendientes = otorgadas.filter((o) => o.estado !== 'canjeada');

  const eliminar = async (regla: PromoRegla) => {
    if (!confirm(`¿Borrar la regla "${regla.nombre}"? Si ya se ha concedido a algún cliente, no se podrá borrar — desactívala en su lugar.`)) return;
    const ok = await onEliminarRegla(regla.id);
    if (!ok) {
      alert('No se pudo borrar la regla. Si ya se ha concedido a algún cliente, desactívala en vez de borrarla.');
      return;
    }
    setEditing(null);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-foreground-950/40 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full sm:max-w-[560px] max-h-[92vh] sm:max-h-[88vh] bg-background-50 rounded-t-2xl sm:rounded-lg border border-background-200/70 shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-background-200/70 flex-shrink-0">
          <h2 className="text-base font-heading font-semibold text-foreground-950">Promociones</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-100 hover:text-foreground-950">
            <i className="ri-close-line"></i>
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-5 pt-3.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => setTab('reglas')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              tab === 'reglas' ? 'bg-primary-500 text-background-50' : 'bg-background-100 text-foreground-500 hover:bg-background-200/70'
            }`}
          >
            Reglas
          </button>
          <button
            type="button"
            onClick={() => setTab('pendientes')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              tab === 'pendientes' ? 'bg-primary-500 text-background-50' : 'bg-background-100 text-foreground-500 hover:bg-background-200/70'
            }`}
          >
            Pendientes
            {pendientes.length > 0 && (
              <span
                className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold ${
                  tab === 'pendientes' ? 'bg-background-50/25' : 'bg-red-500 text-background-50'
                }`}
              >
                {pendientes.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'reglas' ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setEditing('new')}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium border border-dashed border-background-300 text-foreground-500 hover:border-primary-300 hover:text-primary-600"
              >
                <i className="ri-add-line"></i> Nueva regla
              </button>

              {reglas.length === 0 ? (
                <p className="text-sm text-foreground-400 text-center py-6">
                  Todavía no hay reglas. Crea una para premiar automáticamente a tus mejores clientes.
                </p>
              ) : (
                reglas.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setEditing(r)}
                    className={`w-full text-left bg-background-100 rounded-xl p-3.5 hover:bg-background-200/50 transition-colors ${!r.activo ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground-950 truncate">{r.nombre}</p>
                        <p className="text-xs text-foreground-500 mt-1">
                          {promoCondicionTexto(r)} <span className="text-foreground-400">→</span> {promoRecompensaTexto(r, productos)}
                        </p>
                      </div>
                      <span
                        className={`flex-shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          r.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-background-200 text-foreground-500'
                        }`}
                      >
                        {r.activo ? 'Activa' : 'Desactivada'}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : pendientes.length === 0 ? (
            <p className="text-sm text-foreground-400 text-center py-6">No hay promociones pendientes de gestionar.</p>
          ) : (
            <div className="space-y-2">
              {pendientes.map((o) => {
                const regla = reglas.find((r) => r.id === o.regla_id);
                return (
                  <div key={o.id} className="bg-background-100 rounded-xl p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground-950 truncate">{o.cliente_nombre}</p>
                        <p className="text-xs text-foreground-500 mt-0.5">{regla?.nombre ?? 'Regla eliminada'}</p>
                        {o.email_enviado_at && (
                          <p className="text-[11px] text-emerald-600 mt-1">
                            <i className="ri-mail-check-line"></i> Correo enviado
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {o.cliente_telefono && (
                          <a
                            href={whatsappHref(o.cliente_telefono, o.mensaje)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => onPatchOtorgada(o.id, { whatsapp_enviado_at: new Date().toISOString() })}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${
                              o.whatsapp_enviado_at ? 'bg-background-50 text-foreground-500' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            <i className="ri-whatsapp-line"></i> {o.whatsapp_enviado_at ? 'Reenviar' : 'WhatsApp'}
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => onPatchOtorgada(o.id, { estado: 'canjeada', canjeada_at: new Date().toISOString() })}
                          className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-background-50 text-foreground-600 hover:bg-background-200/70"
                        >
                          Canjeada
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <PromoReglaFormModal
          regla={editing === 'new' ? null : editing}
          productos={productos}
          onClose={() => setEditing(null)}
          onSave={(input) => (editing === 'new' ? onCrearRegla(input).then(Boolean) : onPatchRegla((editing as PromoRegla).id, input))}
          onDelete={editing !== 'new' ? () => eliminar(editing as PromoRegla) : undefined}
        />
      )}
    </div>
  );
}
