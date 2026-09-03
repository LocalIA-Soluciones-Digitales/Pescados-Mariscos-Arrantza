import { useState } from 'react';
import type { Producto } from '@/types/producto';
import type { PromoOtorgada, PromoRegla } from '@/types/promo';
import type { NewPromoReglaInput } from '@/hooks/usePromoReglas';
import { whatsappHref } from '@/lib/phone';
import PromoReglaFormModal from './PromoReglaFormModal';

function condicionTexto(r: PromoRegla): string {
  if (r.tipo_condicion === 'gasto_total') return `Gasto total ≥ ${r.umbral.toFixed(2)} €`;
  return `${r.umbral} pedidos ≥ ${r.importe_min_pedido?.toFixed(2)} € cada uno`;
}

function recompensaTexto(r: PromoRegla, productos: Producto[]): string {
  if (r.tipo_recompensa === 'producto_gratis') {
    const producto = productos.find((p) => p.id === r.producto_id);
    return `${producto?.nombre_es ?? 'Producto'} gratis`;
  }
  if (r.tipo_recompensa === 'descuento_eur') return `${r.valor_recompensa?.toFixed(2)} € de descuento`;
  return `${r.valor_recompensa}% de descuento`;
}

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
  const [editing, setEditing] = useState<PromoRegla | null | 'new'>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendientes = otorgadas.filter((o) => o.estado !== 'canjeada');

  const eliminar = async (regla: PromoRegla) => {
    if (!confirm(`¿Borrar la regla "${regla.nombre}"? Si ya se ha concedido a algún cliente, no se podrá borrar — desactívala en su lugar.`)) return;
    setBusyId(regla.id);
    const ok = await onEliminarRegla(regla.id);
    setBusyId(null);
    if (!ok) alert('No se pudo borrar la regla. Si ya se ha concedido a algún cliente, desactívala en vez de borrarla.');
  };

  const handleWhatsapp = (o: PromoOtorgada) => {
    onPatchOtorgada(o.id, { whatsapp_enviado_at: new Date().toISOString() });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-foreground-950/40 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full sm:max-w-[640px] max-h-[92vh] sm:max-h-[88vh] bg-background-50 rounded-t-2xl sm:rounded-lg border border-background-200/70 shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-background-200/70 flex-shrink-0">
          <h2 className="text-base font-heading font-semibold text-foreground-950">Reglas de promociones</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-foreground-400 hover:bg-background-100 hover:text-foreground-950">
            <i className="ri-close-line"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-sm font-heading font-semibold text-foreground-950">Reglas</h3>
              <button
                type="button"
                onClick={() => setEditing('new')}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600"
              >
                <i className="ri-add-line"></i> Nueva regla
              </button>
            </div>
            {reglas.length === 0 ? (
              <p className="text-xs text-foreground-400">Todavía no hay reglas de promoción.</p>
            ) : (
              <div className="space-y-2">
                {reglas.map((r) => (
                  <div key={r.id} className="bg-background-100 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground-950">{r.nombre}</p>
                          {!r.activo && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-background-200 text-foreground-500">Desactivada</span>
                          )}
                        </div>
                        <p className="text-xs text-foreground-500 mt-0.5">{condicionTexto(r)} → {recompensaTexto(r, productos)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => onPatchRegla(r.id, { activo: !r.activo })}
                          className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-background-50 text-foreground-600 hover:bg-background-200/70"
                        >
                          {r.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(r)}
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-background-50 text-foreground-500 hover:text-foreground-950"
                        >
                          <i className="ri-pencil-line text-sm"></i>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => eliminar(r)}
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-60"
                        >
                          <i className="ri-delete-bin-line text-sm"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-heading font-semibold text-foreground-950 mb-2.5">
              Promociones pendientes {pendientes.length > 0 && `(${pendientes.length})`}
            </h3>
            {pendientes.length === 0 ? (
              <p className="text-xs text-foreground-400">No hay promociones concedidas pendientes de gestionar.</p>
            ) : (
              <div className="space-y-2">
                {pendientes.map((o) => {
                  const regla = reglas.find((r) => r.id === o.regla_id);
                  return (
                    <div key={o.id} className="bg-background-100 rounded-xl p-3">
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
                              onClick={() => handleWhatsapp(o)}
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
                            Marcar canjeada
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
      </div>

      {editing && (
        <PromoReglaFormModal
          regla={editing === 'new' ? null : editing}
          productos={productos}
          onClose={() => setEditing(null)}
          onSave={(input) => (editing === 'new' ? onCrearRegla(input).then(Boolean) : onPatchRegla((editing as PromoRegla).id, input))}
        />
      )}
    </div>
  );
}
