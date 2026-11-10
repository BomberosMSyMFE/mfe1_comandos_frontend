export type NivelRiesgo = 'CRITICO' | 'ALERTA' | 'CONTROLADO';

export type EstadoIncidente = 'PENDIENTE' | 'DESPACHADO' | 'EN_COMBATE' | 'CONTROLADO' | 'CERRADO' | 'LIQUIDADO';

export type TipoIncidente = 'ESTRUCTURAL' | 'FORESTAL' | 'QUIMICO' | 'RESCATE' | 'VEHICULAR';

export interface Incidente {
  id: string;                  // Ej: "INC-101"
  codigo: string;              // Ej: "INC-101"
  codigoRadial?: string;       // Ej: "INC-2026-SCZ-105"
  titulo: string;              // Ej: "Incendio en Depósito Textil"
  descripcion: string;
  tipo: TipoIncidente | string;
  cuadrante: string;           // "PARQUE_INDUSTRIAL", "CENTRO_HISTORICO", "PLAN_3000"
  direccion: string;
  nivelRiesgo: NivelRiesgo;
  estado: EstadoIncidente;
  camionAsignado?: string;     // Placa ej: "B-04-SCZ"
  unidadesAsignadas?: number;
  litrosAguaEstimados: number;
  litrosEspumogenoEstimados?: number;
  latitud: number;
  longitud: number;
  horaReporte: string;
  oficialACargo?: string;
  denunciante?: {
    nombre: string;
    telefono: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface KpiCrisis {
  incidentesActivos: number;
  camionesEnCombate: number;
  hidrantesOperativos: number;
  litrosAguaDisponibles: number;
}

export interface HistorialTimelineItem {
  incidenteId: string;
  timestamp: number;
  eventoId: string;
  estadoAnterior: string | null;
  estadoNuevo: EstadoIncidente | string;
  operadorId: string;
  novedadTexto: string;
  nivelAguaActual?: number;
}

export interface InsumoDespachado {
  insumoId: string;
  nombre: string;
  cantidad: number;
}

export interface DespachoUnidadItem {
  despachoId: string;
  incidenteId: string;
  camionId: string;
  conductorId: string;
  operadorAutoriza: string;
  insumosAsociados: InsumoDespachado[];
  horaDespacho: string;
  estadoDespacho: 'EN_RUTA' | 'EN_ESCENA' | 'LIBERADO';
  horaArribo?: string;
  horaLiberacion?: string;
}

export interface TransaccionSagaItem {
  sagaId: string;
  incidenteId: string;
  camionId: string;
  operadorId: string;
  status: 'EXITO' | 'COMPENSACION_EJECUTADA' | 'FALLO_CRITICO' | 'FALLIDA';
  pasoMs2ReservaCamion: 'OK' | 'FALLO' | 'LIBERADO' | 'FALLO_SIN_DISPONIBILIDAD' | 'OK (ROLLBACK)';
  pasoMs3ReservaKit: 'OK' | 'RECHAZADO_SIN_STOCK' | 'OMITIDO';
  horaInicio: string;
  horaFin: string;
  duracionMs: number;
  detalleCompensacion?: string;
}
