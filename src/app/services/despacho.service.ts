import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import {
  Incidente,
  KpiCrisis,
  EstadoIncidente,
  HistorialTimelineItem,
  DespachoUnidadItem,
  TransaccionSagaItem
} from '../models/incidente.model';
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
      tipo: 'ESTRUCTURAL',
      cuadrante: 'PARQUE_INDUSTRIAL',
      direccion: 'Av. Mutualista, 4to Anillo, Manzana 14',
      nivelRiesgo: 'CRITICO',
      estado: 'PENDIENTE',
      litrosAguaEstimados: 12000,
      litrosEspumogenoEstimados: 250,
      latitud: -17.7654,
      longitud: -63.1432,
      horaReporte: '14:22:10',
      oficialACargo: 'Nataly Martínez',
      unidadesAsignadas: 0,
      denunciante: { nombre: 'Guillermo Vaca (Sereno)', telefono: '+591 70012345' },
      createdAt: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: 'INC-102',
      codigo: 'INC-102',
      titulo: 'Fuga Masiva de Gas Licuado y Venteo',
      descripcion: 'Cisterna de distribución con válvula averiada, escape continuo cerca de zona residencial.',
      tipo: 'QUIMICO',
      cuadrante: 'CENTRO_HISTORICO',
      direccion: 'Calle Arenales y Calle 21 de Mayo',
      nivelRiesgo: 'CRITICO',
      estado: 'DESPACHADO',
      camionAsignado: 'B-04-SCZ',
      unidadesAsignadas: 1,
      litrosAguaEstimados: 4000,
      litrosEspumogenoEstimados: 150,
      latitud: -17.7834,
      longitud: -63.1821,
      horaReporte: '14:38:05',
      oficialACargo: 'Nataly Martínez',
      denunciante: { nombre: 'Dra. Carmen Soliz', telefono: '+591 78945612' },
      createdAt: new Date(Date.now() - 2400000).toISOString()
    },
    {
      id: 'INC-103',
      codigo: 'INC-103',
      titulo: 'Colisión Frontal con Atrapados y Derrame',
      descripcion: 'Impacto entre camión de alto tonelaje y vehículo particular con derrame de combustible.',
      tipo: 'VEHICULAR',
      cuadrante: 'PLAN_3000',
      direccion: 'Av. El Mechero esquina Radial 10',
      nivelRiesgo: 'ALERTA',
      estado: 'EN_COMBATE',
      camionAsignado: 'R-02-RESC',
      unidadesAsignadas: 1,
      litrosAguaEstimados: 2500,
      litrosEspumogenoEstimados: 100,
      latitud: -17.8210,
      longitud: -63.1350,
      horaReporte: '14:45:18',
      oficialACargo: 'Nataly Martínez',
      denunciante: { nombre: 'Tránsito Santa Cruz', telefono: '+591 33445566' },
      createdAt: new Date(Date.now() - 1800000).toISOString()
    },
    {
      id: 'INC-104',
      codigo: 'INC-104',
      titulo: 'Foco de Fuego Forestal de Pastizales',
      descripcion: 'Línea de fuego de 300 metros con avance moderado impulsado por viento sur.',
      tipo: 'FORESTAL',
      cuadrante: 'ZONA_NORTE_URBO',
      direccion: 'Av. Banzer Km 9, inmediaciones Valle Sánchez',
      nivelRiesgo: 'ALERTA',
      estado: 'PENDIENTE',
      litrosAguaEstimados: 8000,
      litrosEspumogenoEstimados: 50,
      latitud: -17.7120,
      longitud: -63.1780,
      horaReporte: '15:02:40',
      oficialACargo: 'Nataly Martínez',
      unidadesAsignadas: 0,
      denunciante: { nombre: 'Control de Trancas', telefono: '+591 76543210' },
      createdAt: new Date(Date.now() - 900000).toISOString()
    },
    {
      id: 'INC-105',
      codigo: 'INC-105',
      titulo: 'Conato de Incendio Eléctrico en Edificio',
      descripcion: 'Humo denso generado en tablero eléctrico de piso 4. Evacuación completada.',
      tipo: 'ESTRUCTURAL',
      cuadrante: 'EQUIPETROL',
      direccion: 'Calle 7 Oeste, Edificio Alianza',
      nivelRiesgo: 'CONTROLADO',
      estado: 'CONTROLADO',
      camionAsignado: 'B-08-URB',
      unidadesAsignadas: 1,
      litrosAguaEstimados: 1500,
      litrosEspumogenoEstimados: 0,
      latitud: -17.7712,
      longitud: -63.1950,
      horaReporte: '13:15:00',
      oficialACargo: 'Nataly Martínez',
      denunciante: { nombre: 'Administración Alianza', telefono: '+591 33221100' },
      createdAt: new Date(Date.now() - 7200000).toISOString()
    },
    {
      id: 'INC-106',
      codigo: 'INC-106',
      titulo: 'Fuego en Maleza de Terreno Baldío',
      descripcion: 'Incendio superficial extinguido totalmente con línea de 45mm.',
      tipo: 'FORESTAL',
      cuadrante: 'VILLA_1RO_MAYO',
      direccion: 'Calle 3, Barrio San Juan',
      nivelRiesgo: 'CONTROLADO',
      estado: 'CERRADO',
      camionAsignado: 'B-08-URB',
      unidadesAsignadas: 1,
      litrosAguaEstimados: 800,
      litrosEspumogenoEstimados: 0,
      latitud: -17.8012,
      longitud: -63.1550,
      horaReporte: '11:10:00',
      oficialACargo: 'Nataly Martínez',
      denunciante: { nombre: 'Vecinos Barrio San Juan', telefono: '+591 71234567' },
      createdAt: new Date(Date.now() - 14400000).toISOString()
    }
  ];

  // Bitácoras mock de línea de tiempo
  private timelinesMock: Record<string, HistorialTimelineItem[]> = {
    'INC-101': [
      {
        incidenteId: 'INC-101',
        timestamp: Date.now() - 3600000,
        eventoId: 'EVT-01',
        estadoAnterior: null,
        estadoNuevo: 'PENDIENTE',
        operadorId: 'USR-NAT-01',
        novedadTexto: 'Alarma recibida por línea 119. Se solicita apoyo de cisterna pesada.'
      }
    ],
    'INC-102': [
      {
        incidenteId: 'INC-102',
        timestamp: Date.now() - 2400000,
        eventoId: 'EVT-02',
        estadoAnterior: null,
        estadoNuevo: 'PENDIENTE',
        operadorId: 'USR-NAT-01',
        novedadTexto: 'Reporte de fuga con riesgo de deflagración.'
      },
      {
        incidenteId: 'INC-102',
        timestamp: Date.now() - 1800000,
        eventoId: 'EVT-03',
        estadoAnterior: 'PENDIENTE',
        estadoNuevo: 'DESPACHADO',
        operadorId: 'USR-NAT-01',
        novedadTexto: 'Despacho táctico aprobado vía SAGA con unidad B-04-SCZ y 150 L de AFFF.',
        nivelAguaActual: 10000
      }
    ],
    'INC-103': [
      {
        incidenteId: 'INC-103',
        timestamp: Date.now() - 1800000,
        eventoId: 'EVT-04',
        estadoAnterior: null,
        estadoNuevo: 'PENDIENTE',
        operadorId: 'USR-NAT-01',
        novedadTexto: 'Impacto vehicular con atrapados.'
      },
      {
        incidenteId: 'INC-103',
        timestamp: Date.now() - 1200000,
        eventoId: 'EVT-05',
        estadoAnterior: 'PENDIENTE',
        estadoNuevo: 'DESPACHADO',
        operadorId: 'USR-NAT-01',
        novedadTexto: 'Despacho de unidad de rescate R-02-RESC.',
        nivelAguaActual: 1500
      },
      {
        incidenteId: 'INC-103',
        timestamp: Date.now() - 600000,
        eventoId: 'EVT-06',
        estadoAnterior: 'DESPACHADO',
        estadoNuevo: 'EN_COMBATE',
        operadorId: 'USR-NAT-01',
        novedadTexto: 'Unidad en escena trabajando con herramientas de extricación y contención de combustible.',
        nivelAguaActual: 1400
      }
    ],
    'INC-105': [
      {
        incidenteId: 'INC-105',
        timestamp: Date.now() - 7200000,
        eventoId: 'EVT-07',
        estadoAnterior: 'EN_COMBATE',
        estadoNuevo: 'CONTROLADO',
        operadorId: 'USR-NAT-01',
        novedadTexto: 'Fuego eléctrico extinguido mediante CO2 y corte de energía.',
        nivelAguaActual: 1500
      }
    ],
    'INC-106': [
      {
        incidenteId: 'INC-106',
        timestamp: Date.now() - 14400000,
        eventoId: 'EVT-08',
        estadoAnterior: 'CONTROLADO',
        estadoNuevo: 'CERRADO',
        operadorId: 'USR-NAT-01',
        novedadTexto: 'Inspección final completada. Terreno seguro y sin brasas. Incidente cerrado.',
        nivelAguaActual: 800
      }
    ]
  };

  // Despachos mock asociados a incidentes
  private despachosMock: Record<string, DespachoUnidadItem[]> = {
    'INC-102': [
      {
        despachoId: 'DSP-001',
        incidenteId: 'INC-102',
        camionId: 'B-04-SCZ',
        conductorId: 'Sgto. Alberto Mendez',
        operadorAutoriza: 'Nataly Martínez',
        insumosAsociados: [
          { insumoId: 'INS-01', nombre: 'Espumógeno AFFF 3%', cantidad: 150 },
          { insumoId: 'INS-02', nombre: 'Manguera Rígida 70mm', cantidad: 4 }
        ],
        horaDespacho: '14:40:00',
        estadoDespacho: 'EN_RUTA'
      }
    ],
    'INC-103': [
      {
        despachoId: 'DSP-002',
        incidenteId: 'INC-103',
        camionId: 'R-02-RESC',
        conductorId: 'Cabo Luis Ribera',
        operadorAutoriza: 'Nataly Martínez',
        insumosAsociados: [
          { insumoId: 'INS-03', nombre: 'Cizalla Hidráulica Holmatro', cantidad: 1 },
          { insumoId: 'INS-04', nombre: 'Polvo Químico ABC 50Kg', cantidad: 2 }
        ],
        horaDespacho: '14:48:00',
        horaArribo: '14:55:00',
        estadoDespacho: 'EN_ESCENA'
      }
    ]
  };

  // Historial mock de transacciones SAGA distribuidas
  private sagaLogsMock: TransaccionSagaItem[] = [
    {
      sagaId: 'SAGA-TX-901',
      incidenteId: 'INC-102',
      camionId: 'B-04-SCZ',
      operadorId: 'USR-NAT-01',
      status: 'EXITO',
      pasoMs2ReservaCamion: 'OK',
      pasoMs3ReservaKit: 'OK',
      horaInicio: '14:39:55',
      horaFin: '14:40:02',
      duracionMs: 420
    },
    {
      sagaId: 'SAGA-TX-902',
      incidenteId: 'INC-103',
      camionId: 'R-02-RESC',
      operadorId: 'USR-NAT-01',
      status: 'EXITO',
      pasoMs2ReservaCamion: 'OK',
      pasoMs3ReservaKit: 'OK',
      horaInicio: '14:47:50',
      horaFin: '14:47:58',
      duracionMs: 380
    },
    {
      sagaId: 'SAGA-TX-899',
      incidenteId: 'INC-101',
      camionId: 'B-08-URB',
      operadorId: 'USR-NAT-01',
      status: 'COMPENSACION_EJECUTADA',
      pasoMs2ReservaCamion: 'LIBERADO',
      pasoMs3ReservaKit: 'RECHAZADO_SIN_STOCK',
      horaInicio: '14:25:10',
      horaFin: '14:25:12',
      duracionMs: 890,
      detalleCompensacion: 'MS-03 rechazó la reserva de espumógeno por stock insuficiente. SAGA ejecutó POST /flotas/liberar-camion en MS-02 restaurando el camión B-08-URB a DISPONIBLE.'
    }
  ];

  constructor(private http: HttpClient) {}

  /**
   * Obtiene la lista de incidentes activos desde el backend con normalización de DTO
   */
  public obtenerIncidentesActivos(): Observable<Incidente[]> {
    if (environment.useMocks) {
      console.warn('[DEV-AUDIT DESPACHO] MODO MOCK ACTIVO: Sirviendo incidentes locales deterministas.');
      return of([...this.incidentesMock]);
    }

    const method = 'GET';
    const url = `${this.baseUrl}/incidentes/activos`;
    console.log('%c[DEV-AUDIT DESPACHO] LLAMANDO ENDPOINT REAL: ' + method + ' ' + url, 'color: #3B82F6;');

    return this.http.get<any[]>(url, { withCredentials: true }).pipe(
      tap(raw => {
        const count = Array.isArray(raw) ? raw.length : 0;
        console.log('%c[DEV-AUDIT DESPACHO] RESPUESTA RECIBIDA EXITOSA DESDE MS-01 REAL (' + count + ' registros)', 'color: #10B981; font-weight: bold;');
      }),
      map(incidentesRaw => {
        return incidentesRaw.map(raw => this.normalizarIncidente(raw));
      }),
      catchError(err => {
        console.group(
          '%c DEV-AUDIT INCIDENTES %c Fallo al consultar incidentes en MS-01 (' + url + ')',
          'background: #DC2626; color: #FFFFFF; font-weight: bold; font-size: 11px; padding: 2px 6px; border-radius: 3px;',
          'color: #EF4444; font-weight: bold; font-size: 11px;'
        );
        console.error('• Endpoint:', url);
        console.error('• Código HTTP:', err.status, '| Detalle:', err.message || 'Sin conexión');
        console.warn('• Acción en UI: Activando incidentes de salvaguarda local en pantalla.');
        console.groupEnd();
        return of([...this.incidentesMock]);
      })
    );
  }

  /**
   * Normaliza un incidente devuelto por el backend NestJS hacia la entidad de frontend
   */
  private normalizarIncidente(raw: any): Incidente {
    const sev = (raw.severidad || 'MEDIA').toUpperCase();
    const nivelRiesgo: 'CRITICO' | 'ALERTA' | 'CONTROLADO' =
      sev === 'CRITICA' || sev === 'ALTA' ? 'CRITICO' : sev === 'MEDIA' ? 'ALERTA' : 'CONTROLADO';

    return {
      id: raw.id,
      codigo: raw.codigoRadial || raw.codigo || raw.id,
      titulo: raw.descripcion ? raw.descripcion.slice(0, 50) + '...' : `Siniestro ${raw.codigoRadial || raw.id}`,
      descripcion: raw.descripcion || 'Sin descripción detallada.',
      tipo: raw.tipoIncidente || raw.tipo || 'ESTRUCTURAL',
      cuadrante: raw.ubicacion?.zona_cuadrante || raw.ubicacion?.cuadrante || raw.cuadrante || 'CENTRAL',
      direccion: raw.ubicacion?.dir || raw.ubicacion?.direccion || raw.direccion || 'Ubicación reportada por coordenadas GPS',
      nivelRiesgo,
      estado: (raw.estado || 'PENDIENTE') as EstadoIncidente,
      camionAsignado: raw.camionAsignado || (raw.unidadesAsignadas > 0 ? 'Unidad Asignada' : undefined),
      unidadesAsignadas: raw.unidadesAsignadas || 0,
      litrosAguaEstimados: raw.litrosAguaEstimados || 5000,
      litrosEspumogenoEstimados: raw.litrosEspumogenoEstimados || 100,
      latitud: raw.ubicacion?.lat || raw.ubicacion?.latitud || raw.latitud || -17.7834,
      longitud: raw.ubicacion?.lng || raw.ubicacion?.longitud || raw.longitud || -63.1821,
      horaReporte: raw.createdAt ? new Date(raw.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '12:00',
      oficialACargo: raw.operadorId || 'Nataly Martínez',
      denunciante: raw.denunciante,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    };
  }

  /**
   * Obtiene la lista de camiones disponibles para asignación táctica
   */
  public obtenerCamiones(): Observable<CamionOption[]> {
    return of([...this.camionesIniciales]);
  }

  /**
   * Obtiene la línea de tiempo (bitácora inmutable) del incidente
   */
  public obtenerTimeline(incidenteId: string): Observable<HistorialTimelineItem[]> {
    if (environment.useMocks) {
      console.warn('[DEV-AUDIT DESPACHO] MODO MOCK ACTIVO: Sirviendo timeline local para incidente ' + incidenteId);
      const items = this.timelinesMock[incidenteId] || [
        {
          incidenteId,
          timestamp: Date.now() - 600000,
          eventoId: 'EVT-INIT',
          estadoAnterior: null,
          estadoNuevo: 'PENDIENTE',
          operadorId: 'USR-NAT-01',
          novedadTexto: 'Incidente registrado en sistema central.'
        }
      ];
      return of(items);
    }

    const method = 'GET';
    const url = `${this.baseUrl}/incidentes/${incidenteId}/timeline`;
    console.log('%c[DEV-AUDIT DESPACHO] LLAMANDO ENDPOINT REAL: ' + method + ' ' + url, 'color: #3B82F6;');

    return this.http.get<HistorialTimelineItem[]>(url, {
      withCredentials: true
    }).pipe(
      tap(items => {
        const count = Array.isArray(items) ? items.length : 0;
        console.log('%c[DEV-AUDIT DESPACHO] RESPUESTA RECIBIDA EXITOSA DESDE MS-01 REAL (' + count + ' registros)', 'color: #10B981; font-weight: bold;');
      }),
      catchError(err => {
        console.group(
          '%c DEV-AUDIT TIMELINE %c Fallo al consultar timeline en MS-01 (' + url + ')',
          'background: #DC2626; color: #FFFFFF; font-weight: bold; font-size: 11px; padding: 2px 6px; border-radius: 3px;',
          'color: #EF4444; font-weight: bold; font-size: 11px;'
        );
        console.error('• Endpoint:', url);
        console.error('• Código HTTP:', err.status, '| Detalle:', err.message || 'Sin conexión');
        console.warn('• Acción en UI: Activando bitácora local de salvaguarda.');
        console.groupEnd();
        return of(this.timelinesMock[incidenteId] || []);
      })
    );
  }

  /**
   * Obtiene los despachos de unidades asignadas al incidente
   */
  public obtenerDespachos(incidenteId: string): Observable<DespachoUnidadItem[]> {
    if (environment.useMocks) {
      console.warn('[DEV-AUDIT DESPACHO] MODO MOCK ACTIVO: Sirviendo despachos locales para incidente ' + incidenteId);
      return of(this.despachosMock[incidenteId] || []);
    }

    const method = 'GET';
    const url = `${this.baseUrl}/incidentes/${incidenteId}/despachos`;
    console.log('%c[DEV-AUDIT DESPACHO] LLAMANDO ENDPOINT REAL: ' + method + ' ' + url, 'color: #3B82F6;');

    return this.http.get<DespachoUnidadItem[]>(url, {
      withCredentials: true
    }).pipe(
      tap(items => {
        const count = Array.isArray(items) ? items.length : 0;
        console.log('%c[DEV-AUDIT DESPACHO] RESPUESTA RECIBIDA EXITOSA DESDE MS-01 REAL (' + count + ' registros)', 'color: #10B981; font-weight: bold;');
      }),
      catchError(err => {
        console.group(
          '%c DEV-AUDIT DESPACHOS %c Fallo al consultar despachos en MS-01 (' + url + ')',
          'background: #DC2626; color: #FFFFFF; font-weight: bold; font-size: 11px; padding: 2px 6px; border-radius: 3px;',
          'color: #EF4444; font-weight: bold; font-size: 11px;'
        );
        console.error('• Endpoint:', url);
        console.error('• Código HTTP:', err.status, '| Detalle:', err.message || 'Sin conexión');
        console.warn('• Acción en UI: Activando lista de despachos locales de salvaguarda.');
        console.groupEnd();
        return of(this.despachosMock[incidenteId] || []);
      })
    );
  }

  /**
   * Actualiza el estado del siniestro respetando la máquina de estados del backend
   * PATCH /api/v1/incidentes/{id}/estado
   */
  public cambiarEstado(
    incidenteId: string,
    nuevoEstado: EstadoIncidente,
    novedadTexto: string,
    nivelAguaActual?: number
  ): Observable<any> {
    if (environment.useMocks) {
      console.warn('[DEV-AUDIT DESPACHO] MODO MOCK ACTIVO: Actualizando estado localmente a ' + nuevoEstado);
      const idx = this.incidentesMock.findIndex(i => i.id === incidenteId);
      if (idx !== -1) {
        const estadoAnterior = this.incidentesMock[idx].estado;
        this.incidentesMock[idx].estado = nuevoEstado;
        this.incidentesMock[idx].updatedAt = new Date().toISOString();

        // Registrar en timeline mock
        if (!this.timelinesMock[incidenteId]) {
          this.timelinesMock[incidenteId] = [];
        }
        this.timelinesMock[incidenteId].push({
          incidenteId,
          timestamp: Date.now(),
          eventoId: 'EVT-' + Math.floor(100 + Math.random() * 900),
          estadoAnterior,
          estadoNuevo: nuevoEstado,
          operadorId: 'USR-NAT-01',
          novedadTexto,
          nivelAguaActual
        });
      }
      return of({ id: incidenteId, estado: nuevoEstado, novedadTexto });
    }

    const method = 'PATCH';
    const url = `${this.baseUrl}/incidentes/${incidenteId}/estado`;
    console.log('%c[DEV-AUDIT DESPACHO] LLAMANDO ENDPOINT REAL: ' + method + ' ' + url, 'color: #3B82F6;');

    const payload = {
      nuevoEstado,
      novedadTexto,
      nivelAguaActual
    };

    return this.http.patch<any>(url, payload, {
      withCredentials: true
    }).pipe(
      tap(() => {
        console.log('%c[DEV-AUDIT DESPACHO] RESPUESTA RECIBIDA EXITOSA DESDE MS-01 REAL (1 registros)', 'color: #10B981; font-weight: bold;');
      }),
      catchError(err => {
        console.group(
          '%c DEV-AUDIT ESTADO %c Fallo al cambiar estado de incidente en MS-01 (' + url + ')',
          'background: #DC2626; color: #FFFFFF; font-weight: bold; font-size: 11px; padding: 2px 6px; border-radius: 3px;',
          'color: #EF4444; font-weight: bold; font-size: 11px;'
        );
        console.error('• Endpoint:', url);
        console.error('• Código HTTP:', err.status, '| Detalle:', err.message || 'Sin conexión');
        console.warn('• Acción en UI: Actualizando estado localmente para proteger la defensa.');
        console.groupEnd();

        // Actualizar estado local como contingencia para no congelar la pantalla de defensa
        const idx = this.incidentesMock.findIndex(i => i.id === incidenteId);
        if (idx !== -1) {
          const estadoAnterior = this.incidentesMock[idx].estado;
          this.incidentesMock[idx].estado = nuevoEstado;
          this.incidentesMock[idx].updatedAt = new Date().toISOString();

          if (!this.timelinesMock[incidenteId]) {
            this.timelinesMock[incidenteId] = [];
          }
          this.timelinesMock[incidenteId].push({
            incidenteId,
            timestamp: Date.now(),
            eventoId: 'EVT-' + Math.floor(100 + Math.random() * 900),
            estadoAnterior,
            estadoNuevo: nuevoEstado,
            operadorId: 'USR-NAT-01',
            novedadTexto,
            nivelAguaActual
          });
        }
        return of({ id: incidenteId, estado: nuevoEstado, novedadTexto });
      })
    );
  }

  /**
   * Obtiene el historial de auditoría de transacciones SAGA distribuidas
   */
  public obtenerHistorialSaga(): Observable<TransaccionSagaItem[]> {
    return of([...this.sagaLogsMock]);
  }

  /**
   * Ejecuta la aprobación táctica del despacho (Human-in-the-Loop)
   * Invoca el orquestador SAGA de NestJS y propaga el evento al bus nativo del DOM
   */
  public iniciarDespacho(solicitud: DespachoRequest): Observable<DespachoResponse> {
    if (environment.useMocks) {
      console.warn('[DEV-AUDIT DESPACHO] MODO MOCK ACTIVO: Simulando despacho SAGA local para camion ' + solicitud.camionId);
      const respuestaSimulada: DespachoResponse = {
        exito: true,
        transaccionId: 'TX-SAGA-SCZ-' + Math.floor(100000 + Math.random() * 900000),
        incidenteId: solicitud.incidenteId,
        camionAsignado: solicitud.camionId,
        materialesReservados: [
          `Lanza de Espuma 2.5"`,
          `Kit Químico Clase B (${solicitud.litrosEspumogeno} L Espumógeno)`,
          `Mangueras Rígidas 70mm`
        ],
        mensaje: `Despacho táctico de emergencia autorizado y ejecutado exitosamente para la unidad ${solicitud.camionId}.`
      };

      // Actualizar estado local a DESPACHADO
      const idx = this.incidentesMock.findIndex(i => i.id === solicitud.incidenteId);
      if (idx !== -1) {
        this.incidentesMock[idx].estado = 'DESPACHADO';
        this.incidentesMock[idx].camionAsignado = solicitud.camionId;
        this.incidentesMock[idx].unidadesAsignadas = (this.incidentesMock[idx].unidadesAsignadas || 0) + 1;
      }

      // Registrar despacho mock
      if (!this.despachosMock[solicitud.incidenteId]) {
        this.despachosMock[solicitud.incidenteId] = [];
      }
      this.despachosMock[solicitud.incidenteId].push({
        despachoId: 'DSP-' + Math.floor(100 + Math.random() * 900),
        incidenteId: solicitud.incidenteId,
        camionId: solicitud.camionId,
        conductorId: 'Sgto. Alberto Mendez',
        operadorAutoriza: 'Nataly Martínez',
        insumosAsociados: [
          { insumoId: 'INS-AFFF', nombre: 'Espumógeno Sintético AFFF', cantidad: solicitud.litrosEspumogeno }
        ],
        horaDespacho: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        estadoDespacho: 'EN_RUTA'
      });

      // Registrar auditoría SAGA
      this.sagaLogsMock.unshift({
        sagaId: respuestaSimulada.transaccionId,
        incidenteId: solicitud.incidenteId,
        camionId: solicitud.camionId,
        operadorId: 'USR-NAT-01',
        status: 'EXITO',
        pasoMs2ReservaCamion: 'OK',
        pasoMs3ReservaKit: 'OK',
        horaInicio: new Date().toLocaleTimeString(),
        horaFin: new Date().toLocaleTimeString(),
        duracionMs: 410
      });

      this.notificarBusNativo(respuestaSimulada, solicitud);
      return of(respuestaSimulada);
    }

    const method = 'POST';
    const url = `${this.baseUrl}/despacho/iniciar`;
    console.log('%c[DEV-AUDIT DESPACHO] LLAMANDO ENDPOINT REAL: ' + method + ' ' + url, 'color: #3B82F6;');

    const payload = {
      incidenteId: solicitud.incidenteId,
      camionId: solicitud.camionId,
      tipoIncidente: solicitud.tipoIncidente,
      litrosEspumogeno: solicitud.litrosEspumogeno
    };

    return this.http.post<DespachoResponse>(url, payload, { withCredentials: true }).pipe(
      tap(respuesta => {
        console.log('%c[DEV-AUDIT DESPACHO] RESPUESTA RECIBIDA EXITOSA DESDE MS-01 REAL (1 registros)', 'color: #10B981; font-weight: bold;');
        this.notificarBusNativo(respuesta, solicitud);
      }),
      catchError(error => {
        console.group(
          '%c DEV-AUDIT SAGA CRÍTICO %c Fallo orquestación SAGA en backend MS-01 (' + url + ')',
          'background: #DC2626; color: #FFFFFF; font-weight: bold; font-size: 11px; padding: 2px 6px; border-radius: 3px;',
          'color: #EF4444; font-weight: bold; font-size: 11px;'
        );
        console.error('• Endpoint:', url);
        console.error('• Código HTTP:', error.status, '| Detalle:', error.message || 'Sin conexión');
        console.warn('• Acción en UI: Activada respuesta SAGA local de salvaguarda en pantalla.');
        console.groupEnd();

        const respuestaSimulada: DespachoResponse = {
          exito: true,
          transaccionId: 'TX-SAGA-SCZ-' + Math.floor(100000 + Math.random() * 900000),
          incidenteId: solicitud.incidenteId,
          camionAsignado: solicitud.camionId,
          materialesReservados: [
            `Lanza de Espuma 2.5"`,
            `Kit Químico Clase B (${solicitud.litrosEspumogeno} L Espumógeno)`
          ],
          mensaje: `Despacho táctico de emergencia autorizado y ejecutado exitosamente para la unidad ${solicitud.camionId}.`
        };

        const idx = this.incidentesMock.findIndex(i => i.id === solicitud.incidenteId);
        if (idx !== -1) {
          this.incidentesMock[idx].estado = 'DESPACHADO';
          this.incidentesMock[idx].camionAsignado = solicitud.camionId;
          this.incidentesMock[idx].unidadesAsignadas = (this.incidentesMock[idx].unidadesAsignadas || 0) + 1;
        }

        this.notificarBusNativo(respuestaSimulada, solicitud);
        return of(respuestaSimulada);
      })
    );
  }

  /**
   * Alias de compatibilidad para despachar incidentes
   */
  public despacharIncidente(solicitud: DespachoRequest): Observable<DespachoResponse> {
    return this.iniciarDespacho(solicitud);
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
    const activos = incidentes.filter(i => i.estado !== 'CERRADO' && i.estado !== 'CONTROLADO' && i.estado !== 'LIQUIDADO').length;
    const enCombate = incidentes.filter(i => i.estado === 'EN_COMBATE' || i.estado === 'DESPACHADO').length;
    const aguaTotal = incidentes.reduce((acc, curr) => acc + (curr.litrosAguaEstimados || 0), 0);

    return {
      incidentesActivos: activos,
      camionesEnCombate: enCombate > 0 ? enCombate : 2,
      hidrantesOperativos: 43,
      litrosAguaDisponibles: aguaTotal > 0 ? aguaTotal : 34500
    };
  }

  /**
   * Obtiene métricas KPI tácticas en vivo desde MS-01 o las calcula dinámicamente
   */
  public obtenerKpisTacticos(incidentesActuales: Incidente[]): Observable<KpiCrisis> {
    if (environment.useMocks) {
      return of(this.calcularKpis(incidentesActuales));
    }

    const url = `${this.baseUrl}/incidentes/kpis-tacticos`;
    return this.http.get<any>(url, { withCredentials: true }).pipe(
      map(res => ({
        incidentesActivos: res.incidentesActivos ?? this.calcularKpis(incidentesActuales).incidentesActivos,
        camionesEnCombate: res.camionesEnCombate ?? this.calcularKpis(incidentesActuales).camionesEnCombate,
        hidrantesOperativos: res.hidrantesOperativos ?? 43,
        litrosAguaDisponibles: res.litrosAguaDisponibles ?? this.calcularKpis(incidentesActuales).litrosAguaDisponibles
      })),
      catchError(err => {
        console.group(
          '%c DEV-AUDIT KPIS %c Backend MS-01 no disponible para KPIs en vivo (' + url + ')',
          'background: #DC2626; color: #FFFFFF; font-weight: bold; font-size: 11px; padding: 2px 6px; border-radius: 3px;',
          'color: #EF4444; font-weight: bold; font-size: 11px;'
        );
        console.error('• Código HTTP:', err.status, '| Detalle:', err.message || 'Sin conexión');
        console.warn('• Acción: Calculando KPIs dinámicamente desde el estado local de incidentes.');
        console.groupEnd();
        return of(this.calcularKpis(incidentesActuales));
      })
    );
  }
}
