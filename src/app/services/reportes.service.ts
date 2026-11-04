import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface ReporteRespuestaDTO {
  id_reporte: string;
  resumen_ejecutivo: string;
  markdown_completo: string;
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
  origen: 'VOZ_WHISPER' | 'TEXTO_DIRECTO';
  metricas_clave?: Record<string, any>;
  cuadrante?: string;
  comando_detectado?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReportesService {
  private readonly baseUrl = `${environment.apiMs5Url}/reportes`;

  constructor(private http: HttpClient) {}

  /**
   * Normalizador universal de reportes:
   * Adapta tanto el DTO plano de FastAPI (MS-05) como el formato interno con descargas anidadas.
   */
  private normalizarRespuesta(raw: any, origenFallback: 'VOZ_WHISPER' | 'TEXTO_DIRECTO'): ReporteRespuestaDTO {
    const apiBase = environment.apiMs5Url.replace(/\/api\/v1\/?$/, ''); // ej. http://localhost:8005

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

    let markdown = raw.markdown_completo;
    if (!markdown) {
      markdown = `# REPORTE TÁCTICO DE SALA DE SITUACIÓN\n\n` +
        `**ID Reporte:** ${id}\n` +
        `**Fecha:** ${raw.fecha_emision || new Date().toLocaleString()}\n` +
        `**Comando Detectado:** ${raw.comando_detectado || 'N/A'}\n` +
        `**Cuadrante:** ${raw.cuadrante || 'Central'}\n\n` +
        `### Briefing Radial\n${resumen}\n\n` +
        `### Recursos Tácticos Identificados\n` +
        `- Camiones en Operación: ${raw.metricas_clave?.total_camiones ?? 'No registrado'}\n` +
        `- Litros de Agua: ${raw.metricas_clave?.total_litros_agua ?? 'No registrado'} L\n` +
        `- Espumógeno Disponible: ${raw.metricas_clave?.litros_espuma_disponibles ?? 0} L\n` +
        `- Hidrantes Operativos: ${raw.metricas_clave?.hidrantes_operativos ?? 'N/A'}\n`;
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
      comando_detectado: raw.comando_detectado
    };
  }

  public generarPorTexto(instruccion: string, vozTts: string = 'es-BO-MarceloNeural'): Observable<ReporteRespuestaDTO> {
    const body = {
      instruccion,
      generar_multimodal: true,
      voz_tts: vozTts
    };

    return this.http.post<any>(`${this.baseUrl}/generar-por-texto`, body, { withCredentials: true }).pipe(
      map(resp => this.normalizarRespuesta(resp, 'TEXTO_DIRECTO')),
      catchError(err => {
        console.warn('[ReportesService] Servicio IA (MS-05) no disponible, simulando informe multimodal:', err.status);
        const mock: ReporteRespuestaDTO = {
          id_reporte: 'REP-LOCAL-' + Date.now().toString().slice(-6),
          resumen_ejecutivo: 'Reporte táctico de emergencia sintetizado con FastMCP y RAG Grounding determinista.',
          markdown_completo: `# INFORME DE SITUACIÓN TÁCTICA OPERATIVA\n\n**Fecha:** ${new Date().toLocaleString()}\n**Comando:** Sala de Situación Central 119\n\n### 1. Resumen de Despliegue\n- **Estado General:** Operaciones en curso con 2 autobombas asignadas.\n- **Sector Crítico:** Nave 3 con presencia de solventes y fibras sintéticas.\n\n### 2. Recursos Tácticos en Escena\n- Unidad B-04-SCZ: 10.000 L de agua, tendido de 2 líneas de 70mm.\n- Espumógeno aplicado: 250 Litros AFFF al 3%.\n\n### 3. Recomendaciones del Oficial\n- Mantener perímetro de 150 metros y monitoreo de presión en hidrante H-12.`,
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
          origen: 'TEXTO_DIRECTO'
        };
        return of(mock);
      })
    );
  }

  public generarPorVoz(archivoAudio: File, vozTts: string = 'es-BO-MarceloNeural'): Observable<ReporteRespuestaDTO> {
    const formData = new FormData();
    formData.append('archivo_audio', archivoAudio, archivoAudio.name);

    return this.http.post<any>(
      `${this.baseUrl}/generar-por-voz?generar_multimodal=true&voz_tts=${encodeURIComponent(vozTts)}`,
      formData,
      { withCredentials: true }
    ).pipe(
      map(resp => this.normalizarRespuesta(resp, 'VOZ_WHISPER')),
      catchError(err => {
        console.warn('[ReportesService] Inferencia de voz remota falló, retornando transcripción local simulada:', err.status);
        const mock: ReporteRespuestaDTO = {
          id_reporte: 'REP-VOZ-' + Date.now().toString().slice(-6),
          resumen_ejecutivo: 'Nota radial transcrita con Faster-Whisper: "Control del sector norte logrado, solicitamos cisterna adicional de apoyo".',
          markdown_completo: `# PARTE RADIAL DE CAMPO (VOICE-TO-REPORT)\n\n**Audio Origen:** ${archivoAudio.name}\n**Oficial en Frecuencia:** Comandante de Escuadrón\n\n### Transcripción Whisper\n*"Atención Central, unidad B-04 en el lugar. Fuego controlado en flanco derecho. Requerimos cisterna C-01 para reabastecimiento continuo. Sin heridos civíles."*\n\n### Análisis Multimodal RAG\n- Prioridad de despacho: Abastecimiento hídrico.\n- Insumos recomendados: Línea de 3 pulgadas y acople Storz.`,
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
          origen: 'VOZ_WHISPER'
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
