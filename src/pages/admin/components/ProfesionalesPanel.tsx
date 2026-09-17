import { useState } from 'react';
import type { Producto } from '@/types/producto';
import type { ProfesionalCliente, ProfesionalSolicitud, ProfesionalSolicitudEstado } from '@/types/profesional';
import { useProfesionalesSolicitudes } from '@/hooks/useProfesionalesSolicitudes';
import { useProfesionalesListasPrecio } from '@/hooks/useProfesionalesListasPrecio';
import { useProfesionalesClientes } from '@/hooks/useProfesionalesClientes';
import ProfesionalClienteFormModal from './ProfesionalClienteFormModal';
import ListaPrecioModal from './ListaPrecioModal';

type Vista = 'solicitudes' | 'clientes';

const SOLICITUD_ESTADO_LABELS: Record<ProfesionalSolicitudEstado, string> = {
  pendiente: 'Pendiente',
  contactado: 'Contactado',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

const SOLICITUD_ESTADO_STYLES: Record<ProfesionalSolicitudEstado, string> = {
  pendiente: 'bg-sky-100/80 text-sky-700',
  contactado: 'bg-amber-100/80 text-amber-700',
  aprobada: 'bg-emerald-100/80 text-emerald-700',
  rechazada: 'bg-foreground-200/70 text-foreground-500',
};

const TIPO_NEGOCIO_LABELS: Record<string, string> = {
  restaurante: 'Restaurante',
  hotel: 'Hotel',
  catering: 'Catering',
  comercio: 'Comercio',
  otro: 'Otro',
};

function SolicitudCard({
  solicitud,
  onSetEstado,
  onEliminar,
  onDarDeAlta,
}: {
  solicitud: ProfesionalSolicitud;
  onSetEstado: (estado: ProfesionalSolicitudEstado) => void;
  onEliminar: () => void;
  onDarDeAlta: () => void;
}) {
  const telefono = solicitud.telefono.replace(/\D/g, '');

  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl shadow-card p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${SOLICITUD_ESTADO_STYLES[solicitud.estado]}`}>
              {SOLICITUD_ESTADO_LABELS[solicitud.estado]}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-background-100 text-foreground-500">
              {TIPO_NEGOCIO_LABELS[solicitud.tipo_negocio] ?? solicitud.tipo_negocio}
            </span>
            <span className="text-[10px] text-foreground-400">{new Date(solicitud.created_at).toLocaleString('es-ES')}</span>
          </div>
          <p className="text-sm font-medium text-foreground-950 mt-1">{solicitud.nombre_negocio}</p>
          <p className="text-xs text-foreground-500">{solicitud.persona_contacto}</p>
        </div>
      </div>

      <p className="text-xs text-foreground-600 bg-background-100 rounded-lg p-2.5 mb-2">{solicitud.necesidades}</p>
      {solicitud.email && <p className="text-xs text-foreground-500 mb-2">{solicitud.email}</p>}

      <div className="flex items-center gap-1.5 flex-wrap">
        <a href={`tel:+34${telefono.replace(/^34/, '')}`} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-background-100 text-foreground-600 hover:bg-background-200/70">
          Llamar
        </a>
        <a href={`https://wa.me/34${telefono.replace(/^34/, '')}`} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
          WhatsApp
        </a>
        {solicitud.estado === 'pendiente' && (
          <button type="button" onClick={() => onSetEstado('contactado')} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-background-100 text-foreground-600 hover:bg-background-200/70">
            Marcar contactado
          </button>
        )}
        {solicitud.estado !== 'aprobada' && (
          <button type="button" onClick={onDarDeAlta} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-primary-500 text-background-50 hover:bg-primary-600">
            Dar de alta
          </button>
        )}
        {solicitud.estado !== 'rechazada' && solicitud.estado !== 'aprobada' && (
          <button
            type="button"
            onClick={() => {
              if (confirm('¿Rechazar esta solicitud?')) onSetEstado('rechazada');
            }}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-50 text-red-600 hover:bg-red-100"
          >
            Rechazar
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (confirm('¿Eliminar esta solicitud del historial?')) onEliminar();
          }}
          className="ml-auto px-2 py-1 rounded-full text-[11px] font-medium text-foreground-400 hover:text-red-600"
        >
          <i className="ri-delete-bin-line"></i>
        </button>
      </div>
    </div>
  );
}

function ClienteCard({
  cliente,
  nombreLista,
  onEditar,
  onEliminar,
}: {
  cliente: ProfesionalCliente;
  nombreLista: string;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  return (
    <div className="bg-background-50 border border-background-200/70 rounded-xl shadow-card p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground-950 truncate">{cliente.nombre_negocio}</p>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${cliente.activo ? 'bg-emerald-100/80 text-emerald-700' : 'bg-background-200/70 text-foreground-500'}`}>
            {cliente.activo ? 'Activo' : 'Desactivado'}
          </span>
        </div>
        <p className="text-xs text-foreground-400 mt-0.5">
          Código: <span className="font-mono">{cliente.codigo_acceso}</span> · Tarifa: {nombreLista}
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button type="button" onClick={onEditar} className="w-8 h-8 flex items-center justify-center rounded-full bg-background-100 text-foreground-600 hover:bg-background-200/70">
          <i className="ri-pencil-line text-sm"></i>
        </button>
        <button type="button" onClick={onEliminar} className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100">
          <i className="ri-delete-bin-line text-sm"></i>
        </button>
      </div>
    </div>
  );
}

export default function ProfesionalesPanel({ productos }: { productos: Producto[] }) {
  const { solicitudes, loading: loadingSolicitudes, setEstado, eliminar: eliminarSolicitud } = useProfesionalesSolicitudes();
  const { listas, precios, crearLista, renombrarLista, eliminarLista, guardarPrecio } = useProfesionalesListasPrecio();
  const { clientes, loading: loadingClientes, crear, actualizar, cambiarPin, eliminar: eliminarCliente } = useProfesionalesClientes();

  const [vista, setVista] = useState<Vista>('solicitudes');
  const [modalCliente, setModalCliente] = useState<'new' | ProfesionalCliente | null>(null);
  const [prefillNombre, setPrefillNombre] = useState<string | undefined>(undefined);
  const [solicitudEnAlta, setSolicitudEnAlta] = useState<string | null>(null);
  const [listaAbierta, setListaAbierta] = useState<string | null>(null);
  const [nuevaTarifaNombre, setNuevaTarifaNombre] = useState('');
  const [creandoTarifa, setCreandoTarifa] = useState(false);

  const pendientesCount = solicitudes.filter((s) => s.estado === 'pendiente').length;
  const listaActiva = listas.find((l) => l.id === listaAbierta) ?? null;

  const handleDarDeAlta = (solicitud: ProfesionalSolicitud) => {
    setPrefillNombre(solicitud.nombre_negocio);
    setSolicitudEnAlta(solicitud.id);
    setModalCliente('new');
  };

  const handleCrearTarifaRapida = async () => {
    if (!nuevaTarifaNombre.trim()) return;
    await crearLista(nuevaTarifaNombre.trim());
    setNuevaTarifaNombre('');
    setCreandoTarifa(false);
  };

  return (
    <div className="px-4 md:px-8 py-6 pb-28">
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <button
          type="button"
          onClick={() => setVista('solicitudes')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${vista === 'solicitudes' ? 'bg-foreground-950 text-background-50' : 'bg-background-100 text-foreground-500 hover:bg-background-200/70'}`}
        >
          Solicitudes
          {pendientesCount > 0 && (
            <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] ${vista === 'solicitudes' ? 'bg-background-50/20' : 'bg-red-500 text-background-50'}`}>
              {pendientesCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setVista('clientes')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium ${vista === 'clientes' ? 'bg-foreground-950 text-background-50' : 'bg-background-100 text-foreground-500 hover:bg-background-200/70'}`}
        >
          Clientes y tarifas ({clientes.length})
        </button>
      </div>

      {vista === 'solicitudes' ? (
        loadingSolicitudes ? (
          <p className="text-sm text-foreground-400">Cargando…</p>
        ) : solicitudes.length === 0 ? (
          <div className="text-center py-16">
            <span className="w-14 h-14 flex items-center justify-center mx-auto mb-4 rounded-full bg-background-100 text-foreground-400 text-2xl">
              <i className="ri-inbox-line"></i>
            </span>
            <p className="text-sm font-medium text-foreground-700 mb-1">Todavía no hay solicitudes</p>
            <p className="text-xs text-foreground-400">Aparecerán aquí cuando alguien rellene el formulario de "/profesionales".</p>
          </div>
        ) : (
          <div className="space-y-2 max-w-[700px]">
            {solicitudes.map((s) => (
              <SolicitudCard
                key={s.id}
                solicitud={s}
                onSetEstado={(estado) => setEstado(s.id, estado)}
                onEliminar={() => eliminarSolicitud(s.id)}
                onDarDeAlta={() => handleDarDeAlta(s)}
              />
            ))}
          </div>
        )
      ) : (
        <>
          <div className="mb-5">
            <p className="text-xs font-medium text-foreground-500 mb-2">Tarifas de precios</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {listas.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setListaAbierta(l.id)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-background-100 text-foreground-600 hover:bg-background-200/70 inline-flex items-center gap-1.5"
                >
                  <i className="ri-price-tag-3-line"></i>
                  {l.nombre}
                </button>
              ))}
              {creandoTarifa ? (
                <div className="inline-flex items-center gap-1.5">
                  <input
                    autoFocus
                    type="text"
                    value={nuevaTarifaNombre}
                    onChange={(e) => setNuevaTarifaNombre(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCrearTarifaRapida()}
                    placeholder="Nombre de la tarifa"
                    className="px-3 py-1.5 bg-background-100 border border-background-200/70 rounded-full text-xs focus:outline-none focus:border-foreground-300/60"
                  />
                  <button type="button" onClick={handleCrearTarifaRapida} className="px-2.5 py-1.5 rounded-full text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600">
                    Crear
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreandoTarifa(true)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-background-300 text-foreground-500 hover:bg-background-100 inline-flex items-center gap-1.5"
                >
                  <i className="ri-add-line"></i>
                  Nueva tarifa
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-foreground-500">Clientes profesionales</p>
            <button
              type="button"
              onClick={() => {
                setPrefillNombre(undefined);
                setSolicitudEnAlta(null);
                setModalCliente('new');
              }}
              disabled={listas.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-add-line"></i>
              Nuevo cliente
            </button>
          </div>

          {loadingClientes ? (
            <p className="text-sm text-foreground-400">Cargando…</p>
          ) : clientes.length === 0 ? (
            <p className="text-sm text-foreground-400">
              {listas.length === 0 ? 'Crea primero una tarifa de precios para poder dar de alta clientes.' : 'Todavía no hay ningún cliente profesional.'}
            </p>
          ) : (
            <div className="space-y-2 max-w-[700px]">
              {clientes.map((c) => (
                <ClienteCard
                  key={c.id}
                  cliente={c}
                  nombreLista={listas.find((l) => l.id === c.lista_precio_id)?.nombre ?? '—'}
                  onEditar={() => setModalCliente(c)}
                  onEliminar={() => {
                    if (confirm(`¿Eliminar el acceso de "${c.nombre_negocio}"? Dejará de poder entrar a su catálogo.`)) eliminarCliente(c.id);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {modalCliente !== null && (
        <ProfesionalClienteFormModal
          cliente={modalCliente === 'new' ? null : modalCliente}
          listas={listas}
          prefillNombre={prefillNombre}
          onClose={() => setModalCliente(null)}
          onCreate={async (input) => {
            const result = await crear(input);
            if (result.ok && solicitudEnAlta) await setEstado(solicitudEnAlta, 'aprobada');
            return result;
          }}
          onUpdate={actualizar}
          onChangePin={cambiarPin}
          onCreateLista={crearLista}
        />
      )}

      {listaActiva && (
        <ListaPrecioModal
          lista={listaActiva}
          productos={productos}
          precios={precios}
          onClose={() => setListaAbierta(null)}
          onGuardarPrecio={guardarPrecio}
          onRenombrar={renombrarLista}
          onEliminar={eliminarLista}
        />
      )}
    </div>
  );
}
