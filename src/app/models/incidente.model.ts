export type NivelRiesgo = 'CRITICO' | 'ALERTA' | 'CONTROLADO' | 'DESPACHADO';

export type EstadoIncidente = 'REPORTADO' | 'EN_EVALUACION' | 'DESPACHADO' | 'EN_COMBATE' | 'CONTROLADO' | 'EXTINGUIDO';

export interface Incidente {
  id: string;                  // Ej: "INC-101"
  codigo: string;              // Ej: "INC-101"
  titulo: string;              // Ej: "Incendio en Depósito Textil"
  descripcion: string;
  tipo: string;                // "INCENDIO_ESTRUCTURAL", "ACCIDENTE_VEHICULAR", "FUGA_GAS"
  cuadrante: string;           // "PARQUE_INDUSTRIAL", "CENTRO_HISTORICO", "PLAN_3000"
  direccion: string;
  nivelRiesgo: NivelRiesgo;
  estado: EstadoIncidente;
  camionAsignado?: string;     // Placa ej: "B-04-SCZ"
  litrosAguaEstimados: number;
  litrosEspumogenoEstimados?: number;
  latitud: number;
  longitud: number;
  horaReporte: string;
  oficialACargo?: string;
}

export interface KpiCrisis {
  incidentesActivos: number;
  camionesEnCombate: number;
  hidrantesOperativos: number;
  litrosAguaDisponibles: number;
}
