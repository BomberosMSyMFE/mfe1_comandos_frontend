export interface DespachoRequest {
  incidenteId: string;
  camionId: string;
  tipoIncidente: string;
  litrosEspumogeno: number;
  observaciones?: string;
  direccion?: string;
  ubicacion?: string;
  cuadrante?: string;
  latitud?: number;
  longitud?: number;
}

export interface DespachoResponse {
  exito: boolean;
  transaccionId: string;
  incidenteId: string;
  camionAsignado: string;
  materialesReservados: string[];
  mensaje: string;
  codigoError?: string;
}

export interface CamionOption {
  id: string;
  placa: string;
  tipo: string;
  capacidadAguaL: number;
  capacidadEspumogenoL: number;
  estacion: string;
  estado: 'DISPONIBLE' | 'EN_TRANSITO' | 'EN_COMBATE' | 'MANTENIMIENTO';
}
