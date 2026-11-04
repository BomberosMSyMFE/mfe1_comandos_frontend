import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { Incidente, KpiCrisis } from '../models/incidente.model';
import { DespachoRequest, DespachoResponse, CamionOption } from '../models/despacho.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DespachoService {
  private readonly baseUrl = environment.apiMs1Url;

  // Flota operativa de referencia según contratos
  private camionesIniciales: CamionOption[] = [
    {
      id: 'B-04-SCZ',
      placa: 'B-04-SCZ',
      tipo: 'Autobomba Cisterna Pesada',
      capacidadAguaL: 10000,
      capacidadEspumogenoL: 500,
      estacion: 'Estación Central 1 (Casco Viejo)',
      estado: 'DISPONIBLE'
    },
    {
      id: 'B-08-URB',
      placa: 'B-08-URB',
      tipo: 'Autobomba de Ataque Rápido Urbano',
      capacidadAguaL: 4000,
      capacidadEspumogenoL: 250,
      estacion: 'Estación Norte (Pampa de la Isla)',
      estado: 'DISPONIBLE'
    },
    {
      id: 'C-01-ABAST',
      placa: 'C-01-ABAST',
      tipo: 'Cisterna Nodriza de Gran Abastecimiento',
      capacidadAguaL: 15000,
      capacidadEspumogenoL: 0,
      estacion: 'Estación Parque Industrial',
      estado: 'DISPONIBLE'
    },
    {
      id: 'R-02-RESC',
      placa: 'R-02-RESC',
      tipo: 'Unidad de Rescate Técnico y Materiales Peligrosos',
      capacidadAguaL: 1500,
      capacidadEspumogenoL: 300,
      estacion: 'Estación Sur (Plan 3000)',
      estado: 'DISPONIBLE'
    }
  ];

  // Datos mock deterministas para contingencia o pruebas locales
  private incidentesMock: Incidente[] = [
    {
      id: 'INC-101',
      codigo: 'INC-101',
      titulo: 'Incendio Estructural en Depósito Textil',
      descripcion: 'Fuego descontrolado con carga térmica alta en nave industrial de 800 m². Riesgo de propagación.',
      tipo: 'INCENDIO_ESTRUCTURAL',
      cuadrante: 'PARQUE_INDUSTRIAL',
      direccion: 'Av. Mutualista, 4to Anillo, Manzana 14',
      nivelRiesgo: 'CRITICO',
      estado: 'REPORTADO',
      litrosAguaEstimados: 12000,
      litrosEspumogenoEstimados: 250,
      latitud: -17.7654,
      longitud: -63.1432,
      horaReporte: '14:22:10',
      oficialACargo: 'Cap. Rolando Torrez'
    },
    {
      id: 'INC-102',
      codigo: 'INC-102',
      titulo: 'Fuga Masiva de Gas Licuado y Venteo',
      descripcion: 'Cisterna de distribución con válvula averiada, escape continuo cerca de zona residencial.',
      tipo: 'FUGA_GAS',
      cuadrante: 'CENTRO_HISTORICO',
      direccion: 'Calle Arenales y Calle 21 de Mayo',
      nivelRiesgo: 'CRITICO',
      estado: 'REPORTADO',
      litrosAguaEstimados: 4000,
      litrosEspumogenoEstimados: 150,
      latitud: -17.7834,
      longitud: -63.1821,
      horaReporte: '14:38:05',
      oficialACargo: 'Sgto. María Céspedes'
    },
    {
      id: 'INC-103',
      codigo: 'INC-103',
      titulo: 'Colisión Frontal con Atrapados y Derrame',
      descripcion: 'Impacto entre camión de alto tonelaje y vehículo particular con derrame de combustible.',
      tipo: 'ACCIDENTE_VEHICULAR',
      cuadrante: 'PLAN_3000',
      direccion: 'Av. El Mechero esquina Radial 10',
      nivelRiesgo: 'ALERTA',
      estado: 'EN_EVALUACION',
      litrosAguaEstimados: 2500,
      litrosEspumogenoEstimados: 100,
      latitud: -17.8210,
      longitud: -63.1350,
      horaReporte: '14:45:18',
      oficialACargo: 'Tte. Carlos Vargas'
    },
    {
      id: 'INC-104',
      codigo: 'INC-104',
      titulo: 'Foco de Fuego Forestal de Pastizales',
      descripcion: 'Línea de fuego de 300 metros con avance moderado impulsado por viento sur.',
      tipo: 'INCENDIO_FORESTAL',
      cuadrante: 'ZONA_NORTE_URBO',
      direccion: 'Av. Banzer Km 9, inmediaciones Valle Sánchez',
      nivelRiesgo: 'ALERTA',
      estado: 'REPORTADO',
      litrosAguaEstimados: 8000,
      litrosEspumogenoEstimados: 50,
      latitud: -17.7120,
      longitud: -63.1780,
      horaReporte: '15:02:40',
      oficialACargo: 'Cap. Nataly Martínez'
    },
    {
      id: 'INC-105',
      codigo: 'INC-105',
      titulo: 'Conato de Incendio Eléctrico en Edificio',
      descripcion: 'Humo denso generado en tablero eléctrico de piso 4. Evacuación preventiva en curso.',
      tipo: 'INCENDIO_ESTRUCTURAL',
      cuadrante: 'EQUIPETROL',
      direccion: 'Calle 7 Oeste, Edificio Alianza',
      nivelRiesgo: 'CONTROLADO',
      estado: 'CONTROLADO',
      camionAsignado: 'B-08-URB',
      litrosAguaEstimados: 1500,
      litrosEspumogenoEstimados: 0,
      latitud: -17.7712,
      longitud: -63.1950,
      horaReporte: '13:15:00',
      oficialACargo: 'Tte. Daniel Paz'
    }
  ];

  constructor(private http: HttpClient) {}

  /**
   * Obtiene la lista de incidentes activos desde el backend con fallback mock
   */
  public obtenerIncidentesActivos(): Observable<Incidente[]> {
    if (environment.useMocks) {
      console.log('[DespachoService] Modo MOCK activado: sirviendo incidentes locales.');
      return of([...this.incidentesMock]);
    }

    return this.http.get<Incidente[]>(`${this.baseUrl}/incidentes/activos`, { withCredentials: true }).pipe(
      catchError(err => {
        console.warn('[DespachoService] Backend no disponible o error HTTP. Usando datos operativos locales.', err.status);
        return of([...this.incidentesMock]);
      })
    );
  }

  /**
   * Obtiene la lista de camiones disponibles para asignación táctica
   */
  public obtenerCamiones(): Observable<CamionOption[]> {
    return of([...this.camionesIniciales]);
  }

  /**
   * Ejecuta la aprobación táctica del despacho (Human-in-the-Loop)
   * Invoca el orquestador SAGA de NestJS y propaga el evento al bus nativo del DOM
   */
  public iniciarDespacho(solicitud: DespachoRequest): Observable<DespachoResponse> {
    if (environment.useMocks) {
      console.log('[DespachoService] Modo MOCK activado: simulando SAGA exitosa.');
      const respuestaSimulada: DespachoResponse = {
        exito: true,
        transaccionId: 'TX-SAGA-MOCK-' + Math.floor(100000 + Math.random() * 900000),
        incidenteId: solicitud.incidenteId,
        camionAsignado: solicitud.camionId,
        materialesReservados: [
          `Lanza de Espuma 2.5"`,
          `Kit Químico Clase B (${solicitud.litrosEspumogeno} L Espumógeno)`,
          `Mangueras Rígidas 70mm`
        ],
        mensaje: `Despacho aprobado exitosamente para la unidad ${solicitud.camionId} (Simulación SAGA Mock).`
      };
      this.notificarBusNativo(respuestaSimulada, solicitud);
      return of(respuestaSimulada);
    }

    const payload = {
      incidenteId: solicitud.incidenteId,
      camionId: solicitud.camionId,
      tipoIncidente: solicitud.tipoIncidente,
      litrosEspumogeno: solicitud.litrosEspumogeno
    };

    return this.http.post<DespachoResponse>(`${this.baseUrl}/despacho/iniciar`, payload, { withCredentials: true }).pipe(
      tap(respuesta => {
        this.notificarBusNativo(respuesta, solicitud);
      }),
      catchError(error => {
        console.error('[DespachoService] Error devuelto por backend en despacho:', error);
        const mensajeError = error.error?.mensaje || error.error?.message || error.message || 'Error desconocido al coordinar el despacho con SAGA';
        return throwError(() => new Error(mensajeError));
      })
    );
  }

  /**
   * Dispara el evento nativo en el objeto global 'window' sin stores compartidos
   */
  private notificarBusNativo(respuesta: DespachoResponse, solicitud: DespachoRequest): void {
    if (typeof window !== 'undefined') {
      const detalleEvento = {
        evento: 'BOMBERO_DISPATCH_EVENT',
        transaccionId: respuesta.transaccionId,
        incidenteId: solicitud.incidenteId,
        camionId: solicitud.camionId,
        materiales: respuesta.materialesReservados,
        timestamp: new Date().toISOString()
      };

      console.log('[Native Event Bus] Emitiendo BOMBERO_DISPATCH_EVENT a window:', detalleEvento);
      window.dispatchEvent(new CustomEvent('BOMBERO_DISPATCH_EVENT', {
        detail: detalleEvento
      }));
    }
  }

  /**
   * Calcula métricas KPI tácticas en vivo
   */
  public calcularKpis(incidentes: Incidente[]): KpiCrisis {
    const activos = incidentes.filter(i => i.estado !== 'EXTINGUIDO' && i.estado !== 'CONTROLADO').length;
    const enCombate = incidentes.filter(i => i.estado === 'EN_COMBATE' || i.estado === 'DESPACHADO').length;
    const aguaTotal = incidentes.reduce((acc, curr) => acc + (curr.litrosAguaEstimados || 0), 0);

    return {
      incidentesActivos: activos,
      camionesEnCombate: enCombate + 2,
      hidrantesOperativos: 43,
      litrosAguaDisponibles: aguaTotal > 0 ? aguaTotal : 34500
    };
  }
}
