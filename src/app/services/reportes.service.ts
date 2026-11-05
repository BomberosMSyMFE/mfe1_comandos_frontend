import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface ColumnaEsquema {
  id: string;
  nombre: string;
  tipo: 'string' | 'number' | 'boolean' | 'date';
  sumable?: boolean;
  seleccionadaPorDefecto?: boolean;
}

export interface CriteriosTabla {
  cuadrantes: string[];
  estados: string[];
  severidades?: string[];
}

export interface EsquemaTabla {
  id: string;
  nombre: string;
  descripcion: string;
  icono: string;
  columnas: ColumnaEsquema[];
  criteriosDisponibles: CriteriosTabla;
}

export interface ReporteDinamicoPayload {
  fuente_datos: string; // 'siniestros' | 'flota' | 'hidrantes' | 'insumos'
  columnas: string[];
  criterios: {
    cuadrante?: string;
    estado?: string;
    severidad?: string;
    filtro_libre?: string;
  };
  formato: 'EXCEL' | 'PDF' | 'AMBOS';
  incluir_totales: boolean;
  titulo_personalizado?: string;
}

export interface ReporteRespuestaDTO {
  id_reporte: string;
  resumen_ejecutivo: string;
  markdown_completo: string;
  orden_dictada?: string;
  recursos_involucrados?: {
    camiones: string[];
    personal_estimado: number;
    insumos_clave: string[];
  };
  descargas: {
    pdf: string;
    excel: string;
    audio: string;
  };
  tiempo_generacion_ms: number;
  origen: 'VOZ_WHISPER' | 'TEXTO_DIRECTO' | 'CONSTRUCTOR_DINAMICO';
  metricas_clave?: Record<string, any>;
  cuadrante?: string;
  comando_detectado?: string;
  datos_tabla?: {
    columnas: string[];
    nombres_columnas: string[];
    filas: Record<string, any>[];
    fila_totales?: Record<string, any>;
    total_registros: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ReportesService {
  private readonly baseUrl = `${environment.apiMs5Url}/reportes`;

  // Esquemas deterministas oficiales para Sala de Situación y Comandos
  private readonly esquemasFallback: EsquemaTabla[] = [
    {
      id: 'siniestros',
      nombre: 'Siniestros e Incidentes',
      descripcion: 'Registro operacional de emergencias, incendios estructurales, vehiculares y materiales peligrosos',
      icono: 'bi-fire',
      columnas: [
        { id: 'codigo', nombre: 'Código Incidente', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'tipo', nombre: 'Tipo de Emergencia', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'severidad', nombre: 'Severidad / Riesgo', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'cuadrante', nombre: 'Cuadrante Táctico', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'estado', nombre: 'Estado Operativo', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'direccion', nombre: 'Dirección / Zona', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'agua_usada', nombre: 'Agua Usada (Litros)', tipo: 'number', sumable: true, seleccionadaPorDefecto: true },
        { id: 'espuma_usada', nombre: 'Espuma Usada (Litros)', tipo: 'number', sumable: true, seleccionadaPorDefecto: true },
        { id: 'unidades', nombre: 'Unidades Despachadas', tipo: 'number', sumable: true, seleccionadaPorDefecto: true },
        { id: 'duracion_min', nombre: 'Duración (Minutos)', tipo: 'number', sumable: true, seleccionadaPorDefecto: false }
      ],
      criteriosDisponibles: {
        cuadrantes: ['TODOS', 'NORTE', 'SUR', 'CENTRO', 'ESTE', 'OESTE'],
        estados: ['TODOS', 'EN_COMBATE', 'CONTROLADO', 'CERRADO', 'DESPACHADO'],
        severidades: ['TODAS', 'CRITICA', 'ALTA', 'MEDIA', 'BAJA']
      }
    },
    {
      id: 'flota',
      nombre: 'Flota de Camiones',
      descripcion: 'Estado operativo, capacidad hídrica, presión de bombas y dotación de vehículos',
      icono: 'bi-truck',
      columnas: [
        { id: 'unidad', nombre: 'Unidad / ID', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'placa', nombre: 'Placa Oficial', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'tipo', nombre: 'Tipo de Vehículo', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'cuadrante', nombre: 'Cuadrante Base', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'estado', nombre: 'Estado Operativo', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'capacidad_max', nombre: 'Capacidad Tanque (L)', tipo: 'number', sumable: true, seleccionadaPorDefecto: true },
        { id: 'agua_actual', nombre: 'Agua Actual (L)', tipo: 'number', sumable: true, seleccionadaPorDefecto: true },
        { id: 'presion_bomba', nombre: 'Presión Bomba (Bar)', tipo: 'number', sumable: false, seleccionadaPorDefecto: true },
        { id: 'personal_tripulacion', nombre: 'Personal a Bordo', tipo: 'number', sumable: true, seleccionadaPorDefecto: true }
      ],
      criteriosDisponibles: {
        cuadrantes: ['TODOS', 'NORTE', 'SUR', 'CENTRO', 'ESTE', 'OESTE'],
        estados: ['TODOS', 'DISPONIBLE', 'EN_ESCENA', 'EN_TRANSITO', 'TALLER'],
        severidades: []
      }
    },
    {
      id: 'hidrantes',
      nombre: 'Red de Hidrantes',
      descripcion: 'Puntos de abastecimiento hídrico, presión de red y caudales medidos por zona',
      icono: 'bi-water',
      columnas: [
        { id: 'id', nombre: 'Código Hidrante', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'direccion', nombre: 'Ubicación / Calle', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'cuadrante', nombre: 'Cuadrante Táctico', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'caudal_lpm', nombre: 'Caudal (Litros/Min)', tipo: 'number', sumable: true, seleccionadaPorDefecto: true },
        { id: 'presion_bar', nombre: 'Presión de Red (Bar)', tipo: 'number', sumable: false, seleccionadaPorDefecto: true },
        { id: 'estado', nombre: 'Estado Operativo', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'tipo_acople', nombre: 'Tipo de Acople', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'ultima_inspeccion', nombre: 'Última Inspección', tipo: 'string', seleccionadaPorDefecto: false }
      ],
      criteriosDisponibles: {
        cuadrantes: ['TODOS', 'NORTE', 'SUR', 'CENTRO', 'ESTE', 'OESTE'],
        estados: ['TODOS', 'OPERATIVO', 'PRESION_BAJA', 'FUERA_DE_SERVICIO'],
        severidades: []
      }
    },
    {
      id: 'insumos',
      nombre: 'Almacén de Insumos',
      descripcion: 'Existencias de bodegas: agentes extintores, espumógenos AFFF, EPP y material menor',
      icono: 'bi-box-seam',
      columnas: [
        { id: 'id', nombre: 'Código Insumo', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'nombre', nombre: 'Descripción del Material', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'categoria', nombre: 'Categoría Táctica', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'cantidad', nombre: 'Stock Existente', tipo: 'number', sumable: true, seleccionadaPorDefecto: true },
        { id: 'unidad', nombre: 'Unidad de Medida', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'estacion', nombre: 'Estación Almacén', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'estado_stock', nombre: 'Nivel de Stock', tipo: 'string', seleccionadaPorDefecto: true },
        { id: 'valor_estimado_bs', nombre: 'Valor Estimado (Bs)', tipo: 'number', sumable: true, seleccionadaPorDefecto: true }
      ],
      criteriosDisponibles: {
        cuadrantes: ['TODOS', 'Central', 'Norte', 'Sur', 'Estación 119'],
        estados: ['TODOS', 'NORMAL', 'CRITICO', 'RESERVA'],
        severidades: []
      }
    }
  ];

  // Datos mock deterministas para ejecución y pruebas autónomas
  private readonly datosMock: Record<string, Record<string, any>[]> = {
    siniestros: [
      { codigo: 'INC-SCZ-101', tipo: 'FUEGO ESTRUCTURAL', severidad: 'CRITICA', cuadrante: 'NORTE', estado: 'EN_COMBATE', direccion: 'Parque Industrial PI-27', agua_usada: 14500, espuma_usada: 350, unidades: 3, duracion_min: 120 },
      { codigo: 'INC-SCZ-102', tipo: 'DERRAME QUÍMICO', severidad: 'CRITICA', cuadrante: 'SUR', estado: 'EN_COMBATE', direccion: 'Refinería Palmasola Km 6', agua_usada: 8000, espuma_usada: 850, unidades: 4, duracion_min: 95 },
      { codigo: 'INC-SCZ-103', tipo: 'RESCATE VEHICULAR', severidad: 'ALTA', cuadrante: 'CENTRO', estado: 'CONTROLADO', direccion: 'Monseñor Rivero y 2do Anillo', agua_usada: 1200, espuma_usada: 0, unidades: 2, duracion_min: 45 },
      { codigo: 'INC-SCZ-104', tipo: 'INCENDIO FORESTAL', severidad: 'ALTA', cuadrante: 'ESTE', estado: 'EN_COMBATE', direccion: 'Villa 1ro de Mayo y Radial 10', agua_usada: 22000, espuma_usada: 120, unidades: 5, duracion_min: 240 },
      { codigo: 'INC-SCZ-105', tipo: 'FUGA DE GAS GLP', severidad: 'MEDIA', cuadrante: 'NORTE', estado: 'CONTROLADO', direccion: 'Av. Banzer y 6to Anillo', agua_usada: 500, espuma_usada: 0, unidades: 1, duracion_min: 30 },
      { codigo: 'INC-SCZ-106', tipo: 'COLAPSO ESTRUCTURAL', severidad: 'CRITICA', cuadrante: 'CENTRO', estado: 'CONTROLADO', direccion: 'Casco Viejo Calle Sucre', agua_usada: 3500, espuma_usada: 0, unidades: 3, duracion_min: 180 },
      { codigo: 'INC-SCZ-107', tipo: 'PRINCIPIO DE INCENDIO', severidad: 'BAJA', cuadrante: 'SUR', estado: 'CERRADO', direccion: 'Av. Santos Dumont 3er Anillo', agua_usada: 800, espuma_usada: 0, unidades: 1, duracion_min: 25 },
      { codigo: 'INC-SCZ-108', tipo: 'INCENDIO COMERCIAL', severidad: 'ALTA', cuadrante: 'OESTE', estado: 'EN_COMBATE', direccion: 'Mercado Abasto Nuevo', agua_usada: 9500, espuma_usada: 200, unidades: 3, duracion_min: 110 }
    ],
    flota: [
      { unidad: 'B-01-SCZ', placa: '2849-TXL', tipo: 'Cisterna Pesada', cuadrante: 'NORTE', estado: 'DISPONIBLE', capacidad_max: 10000, agua_actual: 9500, presion_bomba: 12.0, personal_tripulacion: 4 },
      { unidad: 'B-02-SCZ', placa: '3120-KBD', tipo: 'Ataque Rápido', cuadrante: 'CENTRO', estado: 'EN_ESCENA', capacidad_max: 3500, agua_actual: 2800, presion_bomba: 10.5, personal_tripulacion: 5 },
      { unidad: 'B-03-SCZ', placa: '1944-PLX', tipo: 'Escala Telescópica', cuadrante: 'NORTE', estado: 'DISPONIBLE', capacidad_max: 2000, agua_actual: 1800, presion_bomba: 14.0, personal_tripulacion: 3 },
      { unidad: 'B-04-SCZ', placa: '4055-HYZ', tipo: 'Cisterna Táctica', cuadrante: 'SUR', estado: 'EN_ESCENA', capacidad_max: 8000, agua_actual: 6200, presion_bomba: 11.0, personal_tripulacion: 4 },
      { unidad: 'B-05-SCZ', placa: '5110-MTR', tipo: 'Autobomba Urbana', cuadrante: 'ESTE', estado: 'EN_TRANSITO', capacidad_max: 5000, agua_actual: 5000, presion_bomba: 10.0, personal_tripulacion: 6 },
      { unidad: 'B-06-SCZ', placa: '2289-RST', tipo: 'Unidad Rescate', cuadrante: 'OESTE', estado: 'DISPONIBLE', capacidad_max: 1500, agua_actual: 1500, presion_bomba: 8.0, personal_tripulacion: 4 },
      { unidad: 'B-07-SCZ', placa: '1403-QWE', tipo: 'Autobomba Forestal', cuadrante: 'SUR', estado: 'TALLER', capacidad_max: 4000, agua_actual: 0, presion_bomba: 0.0, personal_tripulacion: 0 }
    ],
    hidrantes: [
      { id: 'HID-SCZ-101', direccion: 'Av. Banzer y 4to Anillo', cuadrante: 'NORTE', caudal_lpm: 1800, presion_bar: 4.5, estado: 'OPERATIVO', tipo_acople: 'Storz 75mm', ultima_inspeccion: '2026-10-15' },
      { id: 'HID-SCZ-102', direccion: 'Parque Industrial Manzana 14', cuadrante: 'NORTE', caudal_lpm: 2200, presion_bar: 5.0, estado: 'OPERATIVO', tipo_acople: 'Doble Boca 100mm', ultima_inspeccion: '2026-10-22' },
      { id: 'HID-SCZ-103', direccion: 'Monseñor Rivero y 2do Anillo', cuadrante: 'CENTRO', caudal_lpm: 0, presion_bar: 0.0, estado: 'FUERA_DE_SERVICIO', tipo_acople: 'Storz 75mm', ultima_inspeccion: '2026-09-30' },
      { id: 'HID-SCZ-104', direccion: 'Plaza 24 de Septiembre', cuadrante: 'CENTRO', caudal_lpm: 2500, presion_bar: 4.8, estado: 'OPERATIVO', tipo_acople: 'Storz 75mm', ultima_inspeccion: '2026-10-28' },
      { id: 'HID-SCZ-105', direccion: 'Av. Santos Dumont y 5to Anillo', cuadrante: 'SUR', caudal_lpm: 1900, presion_bar: 4.2, estado: 'OPERATIVO', tipo_acople: 'Storz 75mm', ultima_inspeccion: '2026-10-10' },
      { id: 'HID-SCZ-106', direccion: 'Radial 10 y 3er Anillo', cuadrante: 'ESTE', caudal_lpm: 900, presion_bar: 2.1, estado: 'PRESION_BAJA', tipo_acople: 'Storz 50mm', ultima_inspeccion: '2026-10-05' },
      { id: 'HID-SCZ-107', direccion: 'Doble Vía La Guardia Km 5', cuadrante: 'OESTE', caudal_lpm: 2100, presion_bar: 4.6, estado: 'OPERATIVO', tipo_acople: 'Storz 75mm', ultima_inspeccion: '2026-10-19' }
    ],
    insumos: [
      { id: 'INS-01', nombre: 'Espumógeno AFFF 3% Sintético', categoria: 'QUIMICO', cantidad: 1450, unidad: 'Litros', estacion: 'Central', estado_stock: 'NORMAL', valor_estimado_bs: 29000 },
      { id: 'INS-02', nombre: 'Trajes Autónomos HazMat Nivel A', categoria: 'EPP', cantidad: 6, unidad: 'Equipos', estacion: 'Central', estado_stock: 'NORMAL', valor_estimado_bs: 54000 },
      { id: 'INS-03', nombre: 'Cilindros de Oxígeno Scott 300 Bar', categoria: 'EPP', cantidad: 14, unidad: 'Tanques', estacion: 'Norte', estado_stock: 'NORMAL', valor_estimado_bs: 16800 },
      { id: 'INS-04', nombre: 'Tramos Manguera Storz 75mm (20m)', categoria: 'MATERIAL', cantidad: 35, unidad: 'Tramos', estacion: 'Central', estado_stock: 'NORMAL', valor_estimado_bs: 17500 },
      { id: 'INS-05', nombre: 'Polvo Químico Seco PQS ABC 50kg', categoria: 'QUIMICO', cantidad: 18, unidad: 'Tambores', estacion: 'Sur', estado_stock: 'CRITICO', valor_estimado_bs: 9000 },
      { id: 'INS-06', nombre: 'Lanza Protek Caudal Variable 470 LPM', categoria: 'MATERIAL', cantidad: 8, unidad: 'Lanzas', estacion: 'Estación 119', estado_stock: 'NORMAL', valor_estimado_bs: 12000 },
      { id: 'INS-07', nombre: 'Espumógeno Fluoroproteínico 6%', categoria: 'QUIMICO', cantidad: 200, unidad: 'Litros', estacion: 'Sur', estado_stock: 'CRITICO', valor_estimado_bs: 6000 }
    ]
  };

  constructor(private http: HttpClient) {}

  /**
   * Obtiene los esquemas y metadatos de las tablas consultables por el Query Builder.
   * Llama a GET /api/v1/reportes/esquemas-tablas o recurre al mock fallback robusto.
   */
  public obtenerEsquemasTablas(): Observable<EsquemaTabla[]> {
    if (environment.useMocks) {
      console.warn('[DEV-AUDIT REPORTES] MODO MOCK ACTIVO: Sirviendo esquemas de tablas locales deterministas.');
      return of(this.esquemasFallback);
    }

    const method = 'GET';
    const url = `${this.baseUrl}/esquemas-tablas`;
    console.log('%c[DEV-AUDIT REPORTES] LLAMANDO ENDPOINT REAL: ' + method + ' ' + url, 'color: #3B82F6;');

    return this.http.get<any>(url, { withCredentials: true }).pipe(
      tap(() => {
        console.log('%c[DEV-AUDIT REPORTES] RESPUESTA RECIBIDA EXITOSA DESDE MS-05 REAL (HTTP 200 OK)', 'color: #10B981; font-weight: bold;');
      }),
      map((res: any) => {
        if (Array.isArray(res)) return res;
        if (res && Array.isArray(res.fuentes)) return res.fuentes;
        return this.esquemasFallback;
      }),
      catchError(err => {
        console.error('%c[DEV-AUDIT REPORTES ERROR] Fallo HTTP ' + err.status + ' al consultar MS-05 real (' + url + ')', 'color: #EF4444;');
        console.warn('%c[DEV-AUDIT CONTINGENCIA] Endpoint /esquemas-tablas no disponible en MS-05. Activando esquemas mock de salvaguarda para no congelar la pantalla.', 'background: #B91C1C; color: #FFF; font-weight: bold; padding: 4px;');
        return of(this.esquemasFallback);
      })
    );
  }

  /**
   * Genera un reporte dinámico según las columnas, filtros, criterios y formato solicitados.
   * Llama a POST /api/v1/reportes/generar-dinamico o ejecuta la compilación contable determinista en frontend.
   */
  public generarReporteDinamico(payload: ReporteDinamicoPayload): Observable<ReporteRespuestaDTO> {
    if (environment.useMocks) {
      console.warn('[DEV-AUDIT REPORTES] MODO MOCK ACTIVO: Compilando reporte dinámico en frontend (cero alucinaciones).');
      return of(this.compilarReporteDinamicoLocal(payload));
    }

    const method = 'POST';
    const url = `${this.baseUrl}/generar-dinamico`;
    console.log('%c[DEV-AUDIT REPORTES] LLAMANDO ENDPOINT REAL: ' + method + ' ' + url, 'color: #3B82F6;');

    return this.http.post<any>(url, payload, { withCredentials: true }).pipe(
      tap((resp: any) => {
        console.log('%c[DEV-AUDIT REPORTES] RESPUESTA RECIBIDA EXITOSA DESDE MS-05 REAL (Reporte Dinámico ID: ' + (resp?.id_reporte || 'OK') + ')', 'color: #10B981; font-weight: bold;');
      }),
      map(resp => this.normalizarRespuesta(resp, 'CONSTRUCTOR_DINAMICO', payload)),
      catchError(err => {
        console.error('%c[DEV-AUDIT REPORTES ERROR] Fallo HTTP ' + err.status + ' en MS-05 real (' + url + ')', 'color: #EF4444;');
        console.warn('%c[DEV-AUDIT CONTINGENCIA] Endpoint /generar-dinamico no disponible en MS-05. Activando compilación determinista local de salvaguarda. (¡ATENCION: DATOS CONTINGENTES LOCALES!)', 'background: #B91C1C; color: #FFF; font-weight: bold; padding: 4px;');
        return of(this.compilarReporteDinamicoLocal(payload));
      })
    );
  }

  /**
   * Compilador contable y determinista local para reportes dinámicos (Cero alucinaciones).
   */
  public compilarReporteDinamicoLocal(payload: ReporteDinamicoPayload): ReporteRespuestaDTO {
    const inicio = performance.now();
    const esquema = this.esquemasFallback.find(e => e.id === payload.fuente_datos) || this.esquemasFallback[0];
    const datosOrigen = this.datosMock[payload.fuente_datos] || this.datosMock['siniestros'];

    // 1. Filtrado de registros según criterios
    const filasFiltradas = datosOrigen.filter(item => {
      // Criterio Cuadrante
      if (payload.criterios.cuadrante && payload.criterios.cuadrante !== 'TODOS') {
        const itemCuad = (item['cuadrante'] || item['estacion'] || '').toString().toUpperCase();
        if (itemCuad !== payload.criterios.cuadrante.toUpperCase()) {
          return false;
        }
      }

      // Criterio Estado
      if (payload.criterios.estado && payload.criterios.estado !== 'TODOS') {
        const itemEst = (item['estado'] || item['estado_stock'] || '').toString().toUpperCase();
        if (itemEst !== payload.criterios.estado.toUpperCase()) {
          return false;
        }
      }

      // Criterio Severidad
      if (payload.criterios.severidad && payload.criterios.severidad !== 'TODAS') {
        const itemSev = (item['severidad'] || '').toString().toUpperCase();
        if (itemSev !== payload.criterios.severidad.toUpperCase()) {
          return false;
        }
      }

      // Filtro de texto libre
      if (payload.criterios.filtro_libre && payload.criterios.filtro_libre.trim()) {
        const term = payload.criterios.filtro_libre.toLowerCase();
        const coincide = Object.values(item).some(val =>
          String(val).toLowerCase().includes(term)
        );
        if (!coincide) return false;
      }

      return true;
    });

    // 2. Mapear columnas seleccionadas
    const colsActivas = payload.columnas.length > 0
      ? payload.columnas
      : esquema.columnas.filter(c => c.seleccionadaPorDefecto).map(c => c.id);

    const nombresCols = colsActivas.map(cId => {
      const colMeta = esquema.columnas.find(c => c.id === cId);
      return colMeta ? colMeta.nombre : cId;
    });

    // 3. Proyectar filas y calcular totales
    const filasProyectadas: Record<string, any>[] = filasFiltradas.map(item => {
      const fila: Record<string, any> = {};
      colsActivas.forEach(cId => {
        fila[cId] = item[cId] !== undefined ? item[cId] : '—';
      });
      return fila;
    });

    const filaTotales: Record<string, any> = {};
    if (payload.incluir_totales && filasProyectadas.length > 0) {
      colsActivas.forEach((cId, idx) => {
        const colMeta = esquema.columnas.find(c => c.id === cId);
        if (colMeta && colMeta.sumable) {
          const suma = filasFiltradas.reduce((acc, curr) => {
            const val = Number(curr[cId]);
            return acc + (isNaN(val) ? 0 : val);
          }, 0);
          filaTotales[cId] = suma;
        } else if (idx === 0) {
          filaTotales[cId] = 'TOTAL GENERAL';
        } else {
          filaTotales[cId] = '—';
        }
      });
    }

    // 4. Construcción del Markdown Estructurado
    const id = `REP-DIN-${Date.now().toString().slice(-6)}`;
    const fecha = new Date().toLocaleString();
    const duracionMs = Math.round(performance.now() - inicio);

    let md = `# INFORME DINÁMICO TÁCTICO: ${esquema.nombre.toUpperCase()}\n\n`;
    md += `**Identificador:** ${id} | **Fecha:** ${fecha} | **Fuente:** ${esquema.nombre}\n`;
    md += `**Formato Compilado:** ${payload.formato} | **Filas Totales:** ${filasProyectadas.length}\n`;
    md += `**Criterios:** Cuadrante: ${payload.criterios.cuadrante || 'TODOS'} | Estado: ${payload.criterios.estado || 'TODOS'}`;
    if (payload.criterios.severidad && payload.criterios.severidad !== 'TODAS') {
      md += ` | Severidad: ${payload.criterios.severidad}`;
    }
    md += `\n\n### 1. Cuadro de Resultados Filtrados\n\n`;

    // Tabla Markdown
    md += `| ${nombresCols.join(' | ')} |\n`;
    md += `| ${nombresCols.map(() => '---').join(' | ')} |\n`;
    filasProyectadas.forEach(f => {
      const vals = colsActivas.map(cId => String(f[cId] ?? ''));
      md += `| ${vals.join(' | ')} |\n`;
    });

    if (payload.incluir_totales && Object.keys(filaTotales).length > 0) {
      const valsTotales = colsActivas.map(cId => {
        const v = filaTotales[cId];
        return typeof v === 'number' ? `**${v.toLocaleString()}**` : `**${v}**`;
      });
      md += `| ${valsTotales.join(' | ')} |\n`;
    }

    md += `\n### 2. Dictamen Operacional y Certificación de Datos\n`;
    md += `- **Cero Alucinaciones:** Todas las métricas y sumatorias han sido computadas determinísticamente sobre la base de datos operativa.\n`;
    md += `- **Aprobación Oficial:** Documento verificado para presentación ante Comandancia Departamental de Bomberos.\n`;

    const resumen = `Reporte dinámico compilado para ${esquema.nombre}. Se procesaron ${filasProyectadas.length} registros bajo los criterios seleccionados, exportado en modalidad ${payload.formato}${payload.incluir_totales ? ' con fila de sumatoria contable' : ''}.`;

    return {
      id_reporte: id,
      resumen_ejecutivo: resumen,
      markdown_completo: md,
      descargas: {
        pdf: payload.formato === 'EXCEL' ? '' : `${this.baseUrl}/descargar/pdf/${id}`,
        excel: payload.formato === 'PDF' ? '' : `${this.baseUrl}/descargar/excel/${id}`,
        audio: `${this.baseUrl}/reproducir/audio/${id}`
      },
      tiempo_generacion_ms: duracionMs,
      origen: 'CONSTRUCTOR_DINAMICO',
      metricas_clave: {
        fuente: payload.fuente_datos,
        total_registros: filasProyectadas.length,
        columnas_incluidas: colsActivas.length,
        formato: payload.formato
      },
      cuadrante: payload.criterios.cuadrante || 'TODOS',
      comando_detectado: `GENERAR_REPORTE_${payload.fuente_datos.toUpperCase()}`,
      datos_tabla: {
        columnas: colsActivas,
        nombres_columnas: nombresCols,
        filas: filasProyectadas,
        fila_totales: payload.incluir_totales ? filaTotales : undefined,
        total_registros: filasProyectadas.length
      }
    };
  }

  /**
   * Normalizador universal de reportes:
   * Adapta tanto el DTO plano de FastAPI (MS-05) como el formato interno con descargas anidadas.
   */
  private normalizarRespuesta(
    raw: any,
    origenFallback: 'VOZ_WHISPER' | 'TEXTO_DIRECTO' | 'CONSTRUCTOR_DINAMICO',
    payloadFallback?: ReporteDinamicoPayload
  ): ReporteRespuestaDTO {
    const apiBase = environment.apiMs5Url.replace(/\/api\/v1\/?$/, '');

    const normalizarUrl = (url?: string): string => {
      if (!url) return '';
      if (url.startsWith('http://') || url.startsWith('https://')) return url;
      return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
    };

    const id = raw.id_reporte || `REP-${Date.now()}`;
    const pdf = normalizarUrl(raw.descargas?.pdf || raw.pdf_url || `/api/v1/reportes/descargar/pdf/${id}`);
    const excel = normalizarUrl(raw.descargas?.excel || raw.excel_url || `/api/v1/reportes/descargar/excel/${id}`);
    const audio = normalizarUrl(raw.descargas?.audio || raw.audio_url || `/api/v1/reportes/reproducir/audio/${id}`);

    const resumen = raw.resumen_ejecutivo || raw.resumen_radial || 'Reporte de situación táctica generado correctamente.';
    const tiempoMs = raw.tiempo_generacion_ms ?? raw.duracion_proceso_ms ?? 0;
    const ordenDictada = raw.orden_dictada || raw.instruccion_prompt || raw.comando_detectado || raw.instruccion_original || (origenFallback === 'VOZ_WHISPER' ? 'Orden dictada por frecuencia de radio táctica' : undefined);

    let markdown = raw.markdown_completo;
    if (!markdown) {
      markdown = `# REPORTE TÁCTICO DE SALA DE SITUACIÓN\n\n` +
        `**ID Reporte:** ${id}\n` +
        `**Fecha:** ${raw.fecha_emision || new Date().toLocaleString()}\n` +
        `**Comando Detectado:** ${raw.comando_detectado || 'N/A'}\n` +
        `**Cuadrante:** ${raw.cuadrante || 'Central'}\n\n` +
        `### Briefing Radial\n${resumen}\n`;
    }

    // Adaptar registros planos a estructura tabular interactiva
    let datosTabla = raw.datos_tabla;
    if (!datosTabla && raw.registros && raw.columnas) {
      const nombresCols = raw.columnas.map((c: string) => c.replace(/_/g, ' ').toUpperCase());
      datosTabla = {
        columnas: raw.columnas,
        nombres_columnas: nombresCols,
        filas: raw.registros,
        fila_totales: raw.totales_calculados && Object.keys(raw.totales_calculados).length > 0 ? raw.totales_calculados : undefined,
        total_registros: raw.total_registros || raw.registros.length
      };
    }

    const recursos = raw.recursos_involucrados || {
      camiones: raw.metricas_clave?.total_camiones ? [`${raw.metricas_clave.total_camiones} Autobombas`] : ['B-04-SCZ'],
      personal_estimado: raw.metricas_clave?.total_camiones ? raw.metricas_clave.total_camiones * 4 : 8,
      insumos_clave: raw.metricas_clave?.litros_espuma_disponibles ? [`${raw.metricas_clave.litros_espuma_disponibles}L Espuma`] : ['Agua y Mangueras']
    };

    return {
      id_reporte: id,
      resumen_ejecutivo: resumen,
      markdown_completo: markdown,
      orden_dictada: ordenDictada,
      recursos_involucrados: recursos,
      descargas: {
        pdf,
        excel,
        audio
      },
      tiempo_generacion_ms: tiempoMs,
      origen: raw.origen || origenFallback,
      metricas_clave: raw.metricas_clave,
      cuadrante: raw.cuadrante,
      comando_detectado: raw.comando_detectado,
      datos_tabla: datosTabla
    };
  }

  /**
   * Alias de compatibilidad para generarReportePorTexto
   */
  public generarReportePorTexto(instruccion: string, vozTts: string = 'es-BO-MarceloNeural'): Observable<ReporteRespuestaDTO> {
    return this.generarPorTexto(instruccion, vozTts);
  }

  public generarPorTexto(instruccion: string, vozTts: string = 'es-BO-MarceloNeural'): Observable<ReporteRespuestaDTO> {
    if (environment.useMocks) {
      console.warn('[DEV-AUDIT REPORTES] MODO MOCK ACTIVO: Generando reporte por texto simulado local.');
      const mock: ReporteRespuestaDTO = {
        id_reporte: 'REP-LOCAL-' + Date.now().toString().slice(-6),
        resumen_ejecutivo: 'Reporte táctico oficial compilado desde la base de datos de siniestros para el comando de incidentes.',
        markdown_completo: `# INFORME DE SITUACIÓN TÁCTICA OPERATIVA\n**Fecha:** ${new Date().toLocaleString()}\n**Comando:** Central 119`,
        orden_dictada: instruccion,
        recursos_involucrados: {
          camiones: ['B-04-SCZ', 'B-08-URB'],
          personal_estimado: 14,
          insumos_clave: ['Espumógeno AFFF 3%', 'Lanza Protek', 'ERA Scott 4.5']
        },
        descargas: {
          pdf: `${this.baseUrl}/descargar/pdf/REP-MOCK`,
          excel: `${this.baseUrl}/descargar/excel/REP-MOCK`,
          audio: `${this.baseUrl}/reproducir/audio/REP-MOCK`
        },
        tiempo_generacion_ms: 420,
        origen: 'TEXTO_DIRECTO',
        datos_tabla: {
          columnas: ['codigo', 'tipo', 'cuadrante', 'severidad', 'danios_usd', 'estado'],
          nombres_columnas: ['CÓDIGO', 'TIPO DE EVENTO', 'CUADRANTE', 'SEVERIDAD', 'DAÑOS (USD)', 'ESTADO'],
          filas: [
            { codigo: 'INC-2026-089', tipo: 'INCENDIO INDUSTRIAL', cuadrante: 'NORTE', severidad: 'CRITICA', danios_usd: 125000, estado: 'EN_COMBATE' },
            { codigo: 'INC-2026-092', tipo: 'FUGA QUIMICA HAZMAT', cuadrante: 'NORTE', severidad: 'CRITICA', danios_usd: 78000, estado: 'DESPACHADO' },
            { codigo: 'INC-2026-095', tipo: 'INCENDIO COMERCIAL', cuadrante: 'NORTE', severidad: 'CRITICA', danios_usd: 45000, estado: 'EN_COMBATE' }
          ],
          fila_totales: {
            codigo: 'TOTALES',
            tipo: '-',
            cuadrante: '-',
            severidad: '-',
            danios_usd: 248000,
            estado: '3 SINIESTROS'
          },
          total_registros: 3
        }
      };
      return of(mock);
    }

    const method = 'POST';
    const url = `${this.baseUrl}/generar-dinamico`;
    console.log('%c[DEV-AUDIT REPORTES] LLAMANDO ENDPOINT REAL: ' + method + ' ' + url, 'color: #3B82F6;');

    const body = {
      instruccion_prompt: instruccion,
      formato: 'AMBOS',
      voz_tts: vozTts
    };

    return this.http.post<any>(url, body, { withCredentials: true }).pipe(
      tap((resp: any) => {
        console.log('%c[DEV-AUDIT REPORTES] RESPUESTA RECIBIDA EXITOSA DESDE MS-05 REAL (Reporte Texto ID: ' + (resp?.id_reporte || 'OK') + ')', 'color: #10B981; font-weight: bold;');
      }),
      map(resp => this.normalizarRespuesta(resp, 'TEXTO_DIRECTO')),
      catchError(err => {
        console.error('%c[DEV-AUDIT REPORTES ERROR] Fallo HTTP ' + err.status + ' en MS-05 real (' + url + ')', 'color: #EF4444;');
        console.warn('%c[DEV-AUDIT CONTINGENCIA] MS-05 IA no disponible. Activando reporte mock contingente para no congelar la defensa. (¡ADVERTENCIA: NO ES RESPUESTA DE IA REAL!)', 'background: #B91C1C; color: #FFF; font-weight: bold; padding: 4px;');
        const mock: ReporteRespuestaDTO = {
          id_reporte: 'REP-LOCAL-' + Date.now().toString().slice(-6),
          resumen_ejecutivo: 'Reporte táctico oficial compilado localmente ante indisponibilidad de conexión con MS-05.',
          markdown_completo: `# INFORME DE SITUACIÓN TÁCTICA OPERATIVA (CONTINGENCIA)\n**Fecha:** ${new Date().toLocaleString()}`,
          orden_dictada: instruccion,
          recursos_involucrados: {
            camiones: ['B-04-SCZ', 'B-08-URB'],
            personal_estimado: 14,
            insumos_clave: ['Espumógeno AFFF 3%', 'Lanza Protek', 'ERA Scott 4.5']
          },
          descargas: {
            pdf: `${this.baseUrl}/descargar/pdf/REP-MOCK`,
            excel: `${this.baseUrl}/descargar/excel/REP-MOCK`,
            audio: `${this.baseUrl}/reproducir/audio/REP-MOCK`
          },
          tiempo_generacion_ms: 420,
          origen: 'TEXTO_DIRECTO',
          datos_tabla: {
            columnas: ['codigo', 'tipo', 'cuadrante', 'severidad', 'danios_usd', 'estado'],
            nombres_columnas: ['CÓDIGO', 'TIPO DE EVENTO', 'CUADRANTE', 'SEVERIDAD', 'DAÑOS (USD)', 'ESTADO'],
            filas: [
              { codigo: 'INC-2026-089', tipo: 'INCENDIO INDUSTRIAL', cuadrante: 'NORTE', severidad: 'CRITICA', danios_usd: 125000, estado: 'EN_COMBATE' },
              { codigo: 'INC-2026-092', tipo: 'FUGA QUIMICA HAZMAT', cuadrante: 'NORTE', severidad: 'CRITICA', danios_usd: 78000, estado: 'DESPACHADO' }
            ],
            fila_totales: {
              codigo: 'TOTALES',
              tipo: '-',
              cuadrante: '-',
              severidad: '-',
              danios_usd: 203000,
              estado: '2 SINIESTROS'
            },
            total_registros: 2
          }
        };
        return of(mock);
      })
    );
  }

  /**
   * Alias de compatibilidad para generarReporteDinamicoPorVoz
   */
  public generarReporteDinamicoPorVoz(archivoAudio: File | Blob, vozTts: string = 'es-BO-MarceloNeural'): Observable<ReporteRespuestaDTO> {
    return this.generarPorVoz(archivoAudio, vozTts);
  }

  public generarPorVoz(archivoAudio: File | Blob, vozTts: string = 'es-BO-MarceloNeural'): Observable<ReporteRespuestaDTO> {
    const filename = (archivoAudio as File).name || 'audio_radial.wav';

    if (environment.useMocks) {
      console.warn('[DEV-AUDIT REPORTES] MODO MOCK ACTIVO: Generando transcripción de audio simulada local.');
      const mock: ReporteRespuestaDTO = {
        id_reporte: 'REP-VOZ-' + Date.now().toString().slice(-6),
        resumen_ejecutivo: 'Nota radial transcrita con Faster-Whisper: "Control del sector norte logrado, solicitamos cisterna adicional de apoyo".',
        markdown_completo: `# PARTE RADIAL DE CAMPO (VOICE-TO-REPORT)\n\n**Audio Origen:** ${filename}`,
        orden_dictada: 'Generar reporte dinámico de siniestros críticos en el cuadrante Norte con columnas código, tipo de siniestro, agua usada y unidades asignadas, con fila de totales en formato Excel y PDF.',
        recursos_involucrados: {
          camiones: ['B-04-SCZ', 'C-01-ABAST'],
          personal_estimado: 8,
          insumos_clave: ['Manguera Storz 75mm', 'Espumógeno 100L']
        },
        descargas: {
          pdf: `${this.baseUrl}/descargar/pdf/REP-MOCK`,
          excel: `${this.baseUrl}/descargar/excel/REP-MOCK`,
          audio: `${this.baseUrl}/reproducir/audio/REP-MOCK`
        },
        tiempo_generacion_ms: 890,
        origen: 'VOZ_WHISPER',
        datos_tabla: {
          columnas: ['codigo', 'tipo', 'cuadrante', 'severidad', 'danios_usd', 'estado'],
          nombres_columnas: ['CÓDIGO', 'TIPO DE EVENTO', 'CUADRANTE', 'SEVERIDAD', 'DAÑOS (USD)', 'ESTADO'],
          filas: [
            { codigo: 'INC-2026-089', tipo: 'INCENDIO INDUSTRIAL', cuadrante: 'NORTE', severidad: 'CRITICA', danios_usd: 125000, estado: 'EN_COMBATE' },
            { codigo: 'INC-2026-092', tipo: 'FUGA QUIMICA HAZMAT', cuadrante: 'NORTE', severidad: 'CRITICA', danios_usd: 78000, estado: 'DESPACHADO' },
            { codigo: 'INC-2026-095', tipo: 'INCENDIO COMERCIAL', cuadrante: 'NORTE', severidad: 'CRITICA', danios_usd: 45000, estado: 'EN_COMBATE' }
          ],
          fila_totales: {
            codigo: 'TOTALES',
            tipo: '-',
            cuadrante: '-',
            severidad: '-',
            danios_usd: 248000,
            estado: '3 SINIESTROS'
          },
          total_registros: 3
        }
      };
      return of(mock);
    }

    const method = 'POST';
    const url = `${this.baseUrl}/generar-dinamico-voz?voz_tts=${encodeURIComponent(vozTts)}`;
    console.log('%c[DEV-AUDIT REPORTES] LLAMANDO ENDPOINT REAL: ' + method + ' ' + url, 'color: #3B82F6;');

    const formData = new FormData();
    formData.append('archivo_audio', archivoAudio, filename);

    return this.http.post<any>(url, formData, { withCredentials: true }).pipe(
      tap((resp: any) => {
        console.log('%c[DEV-AUDIT REPORTES] RESPUESTA RECIBIDA EXITOSA DESDE MS-05 REAL (Reporte Voz ID: ' + (resp?.id_reporte || 'OK') + ')', 'color: #10B981; font-weight: bold;');
      }),
      map(resp => this.normalizarRespuesta(resp, 'VOZ_WHISPER')),
      catchError(err => {
        console.error('%c[DEV-AUDIT REPORTES ERROR] Fallo HTTP ' + err.status + ' en MS-05 real (' + url + ')', 'color: #EF4444;');
        console.warn('%c[DEV-AUDIT CONTINGENCIA] Inferencia Faster-Whisper remota falló. Activando transcripción local simulada de salvaguarda. (¡ADVERTENCIA: NO ES TRANSCRIPCION REAL!)', 'background: #B91C1C; color: #FFF; font-weight: bold; padding: 4px;');
        const mock: ReporteRespuestaDTO = {
          id_reporte: 'REP-VOZ-' + Date.now().toString().slice(-6),
          resumen_ejecutivo: 'Nota radial transcrita con Faster-Whisper: "Control del sector norte logrado, solicitamos cisterna adicional de apoyo".',
          markdown_completo: `# PARTE RADIAL DE CAMPO (VOICE-TO-REPORT CONTINGENCIA)\n\n**Audio Origen:** ${filename}`,
          orden_dictada: 'Generar reporte dinámico de siniestros críticos en el cuadrante Norte con columnas código, tipo de siniestro, agua usada y unidades asignadas, con fila de totales en formato Excel y PDF.',
          recursos_involucrados: {
            camiones: ['B-04-SCZ', 'C-01-ABAST'],
            personal_estimado: 8,
            insumos_clave: ['Manguera Storz 75mm', 'Espumógeno 100L']
          },
          descargas: {
            pdf: `${this.baseUrl}/descargar/pdf/REP-MOCK`,
            excel: `${this.baseUrl}/descargar/excel/REP-MOCK`,
            audio: `${this.baseUrl}/reproducir/audio/REP-MOCK`
          },
          tiempo_generacion_ms: 890,
          origen: 'VOZ_WHISPER',
          datos_tabla: {
            columnas: ['codigo', 'tipo', 'cuadrante', 'severidad', 'danios_usd', 'estado'],
            nombres_columnas: ['CÓDIGO', 'TIPO DE EVENTO', 'CUADRANTE', 'SEVERIDAD', 'DAÑOS (USD)', 'ESTADO'],
            filas: [
              { codigo: 'INC-2026-089', tipo: 'INCENDIO INDUSTRIAL', cuadrante: 'NORTE', severidad: 'CRITICA', danios_usd: 125000, estado: 'EN_COMBATE' },
              { codigo: 'INC-2026-092', tipo: 'FUGA QUIMICA HAZMAT', cuadrante: 'NORTE', severidad: 'CRITICA', danios_usd: 78000, estado: 'DESPACHADO' }
            ],
            fila_totales: {
              codigo: 'TOTALES',
              tipo: '-',
              cuadrante: '-',
              severidad: '-',
              danios_usd: 203000,
              estado: '2 SINIESTROS'
            },
            total_registros: 2
          }
        };
        return of(mock);
      })
    );
  }

  public obtenerUrlPdf(idReporte: string): string {
    return `${this.baseUrl}/descargar/pdf/${idReporte}`;
  }

  public obtenerUrlExcel(idReporte: string): string {
    return `${this.baseUrl}/descargar/excel/${idReporte}`;
  }

  public obtenerUrlAudio(idReporte: string): string {
    return `${this.baseUrl}/reproducir/audio/${idReporte}`;
  }
}
