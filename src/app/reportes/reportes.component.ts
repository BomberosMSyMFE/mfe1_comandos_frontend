import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  ReportesService,
  ReporteRespuestaDTO,
  EsquemaTabla,
  ReporteDinamicoPayload
} from '../services/reportes.service';

export type ModoVisualReporte = 'PROMPT_VOZ' | 'QUERY_BUILDER';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './reportes.component.html',
  styleUrls: ['./reportes.component.css']
})
export class ReportesComponent implements OnInit, OnDestroy {
  // Modo visual activo: PROMPT/VOZ o CONSTRUCTOR DINÁMICO
  public modoVisual = signal<ModoVisualReporte>('PROMPT_VOZ');

  // =========================================================================
  // MODO 1: PROMPT Y AUDIO RADIAL (WHISPER / GRABACIÓN CON MICRÓFONO)
  // =========================================================================
  public instruccionTexto = signal<string>(
    'Generar reporte dinámico de siniestros críticos en el cuadrante Norte con columnas código, tipo de siniestro, agua usada y unidades asignadas, con fila de totales en formato Excel y PDF.'
  );
  public vozTts = signal<string>('es-BO-MarceloNeural');
  public archivoAudio = signal<File | null>(null);
  public nombreArchivo = signal<string>('');

  // Grabador de Micrófono en Tiempo Real (MediaRecorder)
  public grabandoAudio = signal<boolean>(false);
  public tiempoGrabacionSegundos = signal<number>(0);
  public audioGrabadoUrl = signal<string | null>(null);
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private timerGrabacion: any = null;
  private audioStream: MediaStream | null = null;

  public formatoTiempoGrabacion = computed<string>(() => {
    const totalSeg = this.tiempoGrabacionSegundos();
    const min = Math.floor(totalSeg / 60).toString().padStart(2, '0');
    const seg = (totalSeg % 60).toString().padStart(2, '0');
    return `${min}:${seg}`;
  });

  // =========================================================================
  // MODO 2: CONSTRUCTOR DINÁMICO (QUERY BUILDER TÁCTICO)
  // =========================================================================
  public esquemas = signal<EsquemaTabla[]>([]);
  public cargandoEsquemas = signal<boolean>(false);
  public fuenteSeleccionada = signal<string>('siniestros');
  public columnasSeleccionadas = signal<string[]>([]);
  public filtroCuadrante = signal<string>('TODOS');
  public filtroEstado = signal<string>('TODOS');
  public filtroSeveridad = signal<string>('TODAS');
  public filtroLibre = signal<string>('');
  public formatoSalida = signal<'AMBOS' | 'EXCEL' | 'PDF'>('AMBOS');
  public incluirTotales = signal<boolean>(true);

  // =========================================================================
  // ESTADO GLOBAL DE EJECUCIÓN, PROGRESO Y RESULTADOS
  // =========================================================================
  public procesando = signal<boolean>(false);
  public progresoCompilacion = signal<number>(0);
  public mensajeProgreso = signal<string>('');
  public reporteGenerado = signal<ReporteRespuestaDTO | null>(null);
  public errorMensaje = signal<string | null>(null);
  public toastExito = signal<string | null>(null);

  // Esquema actualmente seleccionado
  public esquemaActual = computed<EsquemaTabla | undefined>(() => {
    const list = this.esquemas();
    return list.find(e => e.id === this.fuenteSeleccionada()) || list[0];
  });

  // Flag si la tabla actual admite severidad (ej. Siniestros)
  public tieneSeveridad = computed<boolean>(() => {
    const esq = this.esquemaActual();
    return !!(esq?.criteriosDisponibles?.severidades && esq.criteriosDisponibles.severidades.length > 0);
  });

  // Total de columnas seleccionadas
  public totalColumnasSeleccionadas = computed<number>(() => {
    return this.columnasSeleccionadas().length;
  });

  constructor(private reportesService: ReportesService) {}

  public ngOnInit(): void {
    this.cargarEsquemas();
  }

  public ngOnDestroy(): void {
    this.cancelarGrabacionAudio();
  }

  // =========================================================================
  // GRABACIÓN DE AUDIO CON MICRÓFONO EN VIVO (MEDIARECORDER API)
  // =========================================================================
  public async iniciarGrabacionAudio(): Promise<void> {
    try {
      this.errorMensaje.set(null);
      this.audioChunks = [];
      
      // Solicitar acceso al micrófono
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.audioStream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        const url = URL.createObjectURL(audioBlob);
        this.audioGrabadoUrl.set(url);
        
        const audioFile = new File([audioBlob], `grabacion_radial_${Date.now()}.wav`, { type: 'audio/wav' });
        this.archivoAudio.set(audioFile);
        this.nombreArchivo.set(`Voz Grabada en Vivo (${this.tiempoGrabacionSegundos()}s)`);

        // Detener tracks del stream
        if (this.audioStream) {
          this.audioStream.getTracks().forEach(track => track.stop());
          this.audioStream = null;
        }
      };

      this.mediaRecorder.start();
      this.grabandoAudio.set(true);
      this.tiempoGrabacionSegundos.set(0);

      this.timerGrabacion = setInterval(() => {
        this.tiempoGrabacionSegundos.update(s => s + 1);
      }, 1000);
    } catch (err: any) {
      console.error('[Reportes] Error al acceder al micrófono:', err);
      this.errorMensaje.set('No se pudo acceder al micrófono del navegador. Verifique los permisos o cargue un archivo de audio.');
    }
  }

  public detenerGrabacionAudio(): void {
    if (this.mediaRecorder && this.grabandoAudio()) {
      this.mediaRecorder.stop();
      this.grabandoAudio.set(false);
      if (this.timerGrabacion) {
        clearInterval(this.timerGrabacion);
        this.timerGrabacion = null;
      }
    }
  }

  public cancelarGrabacionAudio(): void {
    if (this.mediaRecorder && this.grabandoAudio()) {
      try {
        this.mediaRecorder.stop();
      } catch {
        // Ignorar si ya estaba detenido
      }
      this.grabandoAudio.set(false);
    }
    if (this.timerGrabacion) {
      clearInterval(this.timerGrabacion);
      this.timerGrabacion = null;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
    this.audioGrabadoUrl.set(null);
    this.archivoAudio.set(null);
    this.nombreArchivo.set('');
  }

  /**
   * Carga los esquemas desde el backend o mock táctico y preselecciona columnas por defecto
   */
  public cargarEsquemas(): void {
    this.cargandoEsquemas.set(true);
    this.reportesService.obtenerEsquemasTablas().subscribe({
      next: (esqs) => {
        this.esquemas.set(esqs);
        this.cargandoEsquemas.set(false);
        this.inicializarColumnasPorDefecto();
      },
      error: () => {
        this.cargandoEsquemas.set(false);
      }
    });
  }

  private inicializarColumnasPorDefecto(): void {
    const actual = this.esquemaActual();
    if (actual) {
      const defs = actual.columnas
        .filter(c => c.seleccionadaPorDefecto)
        .map(c => c.id);
      this.columnasSeleccionadas.set(defs.length > 0 ? defs : actual.columnas.map(c => c.id));
    }
  }

  public setModoVisual(modo: ModoVisualReporte): void {
    this.modoVisual.set(modo);
    this.errorMensaje.set(null);
  }

  public onFuenteChange(nuevaFuente: string): void {
    this.fuenteSeleccionada.set(nuevaFuente);
    this.filtroCuadrante.set('TODOS');
    this.filtroEstado.set('TODOS');
    this.filtroSeveridad.set('TODAS');
    this.filtroLibre.set('');
    this.inicializarColumnasPorDefecto();
  }

  public toggleColumna(colId: string): void {
    const actuales = [...this.columnasSeleccionadas()];
    const index = actuales.indexOf(colId);
    if (index >= 0) {
      if (actuales.length <= 1) {
        this.errorMensaje.set('Debe mantener al menos una columna seleccionada en el reporte.');
        return;
      }
      this.errorMensaje.set(null);
      actuales.splice(index, 1);
    } else {
      this.errorMensaje.set(null);
      actuales.push(colId);
    }
    this.columnasSeleccionadas.set(actuales);
  }

  public isColumnaSeleccionada(colId: string): boolean {
    return this.columnasSeleccionadas().includes(colId);
  }

  public seleccionarTodasColumnas(): void {
    const actual = this.esquemaActual();
    if (actual) {
      this.columnasSeleccionadas.set(actual.columnas.map(c => c.id));
      this.errorMensaje.set(null);
    }
  }

  public restaurarColumnasPorDefecto(): void {
    this.inicializarColumnasPorDefecto();
    this.errorMensaje.set(null);
  }

  // =========================================================================
  // EJECUCIÓN MODO 2: COMPILADOR DINÁMICO TÁCTICO
  // =========================================================================
  public compilarReporteDinamico(): void {
    if (this.columnasSeleccionadas().length === 0) {
      this.errorMensaje.set('Debe seleccionar al menos una columna para compilar el reporte.');
      return;
    }

    this.errorMensaje.set(null);
    this.procesando.set(true);
    this.progresoCompilacion.set(15);
    this.mensajeProgreso.set('Consultando catálogo de datos y esquema de tabla...');

    const payload: ReporteDinamicoPayload = {
      fuente_datos: this.fuenteSeleccionada(),
      columnas: this.columnasSeleccionadas(),
      criterios: {
        cuadrante: this.filtroCuadrante(),
        estado: this.filtroEstado(),
        severidad: this.tieneSeveridad() ? this.filtroSeveridad() : undefined,
        filtro_libre: this.filtroLibre().trim() || undefined
      },
      formato: this.formatoSalida(),
      incluir_totales: this.incluirTotales()
    };

    // Animación táctica progresiva en 3 pasos
    setTimeout(() => {
      this.progresoCompilacion.set(45);
      this.mensajeProgreso.set('Aplicando criterios de selección, filtros y proyecciones...');
    }, 200);

    setTimeout(() => {
      this.progresoCompilacion.set(75);
      this.mensajeProgreso.set('Calculando sumatorias contables y generando artefactos OpenPyXL/WeasyPrint...');
    }, 450);

    setTimeout(() => {
      this.reportesService.generarReporteDinamico(payload).subscribe({
        next: (resp) => {
          this.progresoCompilacion.set(100);
          this.mensajeProgreso.set('Compilación finalizada.');
          this.reporteGenerado.set(resp);
          this.procesando.set(false);
          this.toastExito.set(`Reporte dinámico ${resp.id_reporte} compilado exitosamente.`);
          setTimeout(() => this.toastExito.set(null), 4000);
        },
        error: (err) => {
          this.errorMensaje.set(`Error al compilar reporte dinámico: ${err.message || 'Fallo de conexión'}`);
          this.procesando.set(false);
        }
      });
    }, 700);
  }

  // =========================================================================
  // EJECUCIÓN MODO 1: PROMPT NATURAL Y VOZ RADIAL
  // =========================================================================
  public generarPorTexto(): void {
    if (!this.instruccionTexto().trim()) {
      this.errorMensaje.set('Debe ingresar un requerimiento de reporte.');
      return;
    }

    this.errorMensaje.set(null);
    this.procesando.set(true);
    this.progresoCompilacion.set(30);
    this.mensajeProgreso.set('Procesando solicitud en lenguaje natural con RAG Grounding...');

    this.reportesService.generarPorTexto(this.instruccionTexto().trim(), this.vozTts()).subscribe({
      next: (resp) => {
        this.progresoCompilacion.set(100);
        this.reporteGenerado.set(resp);
        this.procesando.set(false);
        this.toastExito.set('Reporte por prompt generado con éxito.');
        setTimeout(() => this.toastExito.set(null), 4000);
      },
      error: (err) => {
        this.errorMensaje.set(`Error al conectar con MS-05 IA: ${err.message}`);
        this.procesando.set(false);
      }
    });
  }

  public onArchivoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.archivoAudio.set(file);
      this.nombreArchivo.set(file.name);
    }
  }

  public generarPorVoz(): void {
    const archivo = this.archivoAudio();
    if (!archivo) {
      this.errorMensaje.set('Debe seleccionar un archivo de audio radial (WAV, MP3, OGG).');
      return;
    }

    this.errorMensaje.set(null);
    this.procesando.set(true);
    this.progresoCompilacion.set(25);
    this.mensajeProgreso.set('Transcribiendo audio de radio con Faster-Whisper ASR...');

    setTimeout(() => {
      this.progresoCompilacion.set(65);
      this.mensajeProgreso.set('Extrayendo entidades operacionales y calculando métricas...');
    }, 400);

    this.reportesService.generarPorVoz(archivo, this.vozTts()).subscribe({
      next: (resp) => {
        this.progresoCompilacion.set(100);
        this.reporteGenerado.set(resp);
        this.procesando.set(false);
        this.toastExito.set('Inferencia de voz y reporte multimodal completados.');
        setTimeout(() => this.toastExito.set(null), 4000);
      },
      error: (err) => {
        this.errorMensaje.set(`Error en pipeline Whisper de voz: ${err.message}`);
        this.procesando.set(false);
      }
    });
  }

  /**
   * Descarga autónoma de artefactos con compatibilidad para navegador offline / mock.
   * Genera archivo descargable directo (.csv con BOM para Excel o ventana para PDF).
   */
  public descargarArtefacto(tipo: 'excel' | 'pdf'): void {
    const rep = this.reporteGenerado();
    if (!rep) return;

    if (tipo === 'excel') {
      // Si hay datos tabulares, exportamos CSV compatible universal con Excel (UTF-8 con BOM)
      if (rep.datos_tabla && rep.datos_tabla.filas.length > 0) {
        const cabeceras = rep.datos_tabla.nombres_columnas.join(';');
        const filasStr = rep.datos_tabla.filas.map(f =>
          rep.datos_tabla!.columnas.map(cId => `"${f[cId] ?? ''}"`).join(';')
        );
        let csvContent = '\uFEFF' + cabeceras + '\r\n' + filasStr.join('\r\n');

        if (rep.datos_tabla.fila_totales) {
          const totStr = rep.datos_tabla.columnas.map(cId =>
            `"${rep.datos_tabla!.fila_totales![cId] ?? ''}"`
          ).join(';');
          csvContent += '\r\n' + totStr;
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Reporte_Bomberos_${rep.id_reporte}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // Enlace directo si no hay filas locales
      const url = rep.descargas?.excel || this.reportesService.obtenerUrlExcel(rep.id_reporte);
      window.open(url, '_blank');
    } else if (tipo === 'pdf') {
      // Si existe un PDF real compilado por WeasyPrint en el backend (no mock ni local), abrirlo
      if (
        rep.descargas?.pdf &&
        !rep.descargas.pdf.includes('REP-MOCK') &&
        !rep.descargas.pdf.includes('REP-LOCAL-') &&
        !rep.descargas.pdf.includes('REP-VOZ-') &&
        !rep.descargas.pdf.includes('REP-DIN-')
      ) {
        window.open(rep.descargas.pdf, '_blank');
        return;
      }

      // Si estamos en modo autónomo/mock o el backend no está conectado:
      // Construir la ventana de impresión institucional con la tabla completa, columnas, totales y estilos oficiales
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const tabla = rep.datos_tabla;
      let tablaHtml = '';

      if (tabla && tabla.filas && tabla.filas.length > 0) {
        const thead = `
          <thead>
            <tr>
              ${tabla.nombres_columnas.map(c => `<th>${c}</th>`).join('')}
            </tr>
          </thead>
        `;

        const tbody = `
          <tbody>
            ${tabla.filas.map((fila, idx) => `
              <tr class="${idx % 2 === 0 ? 'even' : 'odd'}">
                ${tabla.columnas.map(colId => {
                  const val = fila[colId] ?? '';
                  const isNum = typeof val === 'number';
                  const displayVal = isNum ? val.toLocaleString() : val;
                  return `<td class="${isNum ? 'text-right' : ''}">${displayVal}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        `;

        const tfoot = tabla.fila_totales ? `
          <tfoot>
            <tr class="totales">
              ${tabla.columnas.map(colId => {
                const val = tabla.fila_totales![colId] ?? '';
                const isNum = typeof val === 'number';
                const displayVal = isNum ? `${val.toLocaleString()} (Σ)` : val;
                return `<td class="${isNum ? 'text-right font-bold' : 'font-bold'}">${displayVal}</td>`;
              }).join('')}
            </tr>
          </tfoot>
        ` : '';

        tablaHtml = `
          <table class="report-table">
            ${thead}
            ${tbody}
            ${tfoot}
          </table>
        `;
      } else {
        tablaHtml = '<p style="font-style: italic; color: #64748B;">No se encontraron registros tabulares bajo los criterios seleccionados.</p>';
      }

      const ordenDictadaHtml = rep.orden_dictada ? `
        <div class="orden-card">
          <div class="orden-title">ORDEN DICTADA POR VOZ / REQUERIMIENTO TÁCTICO:</div>
          <div class="orden-text">"${rep.orden_dictada}"</div>
        </div>
      ` : '';

      const htmlDocument = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte Táctico Oficial - ${rep.id_reporte}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm 15mm 15mm 15mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0F172A;
      background-color: #FFFFFF;
      margin: 0;
      padding: 24px;
      font-size: 11px;
      line-height: 1.4;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .header-bar {
      border-bottom: 3px solid #CE2029;
      padding-bottom: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand-title {
      color: #CE2029;
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin: 0;
    }
    .brand-sub {
      color: #64748B;
      font-size: 10px;
      font-weight: 600;
      margin-top: 2px;
    }
    .meta-badge {
      font-family: monospace;
      font-size: 11px;
      background-color: #F1F5F9;
      border: 1px solid #CBD5E1;
      padding: 4px 10px;
      border-radius: 4px;
      font-weight: 700;
      color: #0F172A;
      text-align: right;
    }
    .orden-card {
      background-color: #FFF5F5;
      border: 1px solid #FCA5A5;
      border-left: 4px solid #CE2029;
      border-radius: 4px;
      padding: 10px 14px;
      margin-bottom: 14px;
    }
    .orden-title {
      font-size: 10px;
      font-weight: 800;
      color: #CE2029;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .orden-text {
      font-size: 12px;
      color: #1E293B;
      font-style: italic;
      font-family: monospace;
      margin: 0;
    }
    .summary-card {
      background-color: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 4px;
      padding: 10px 14px;
      margin-bottom: 16px;
    }
    .summary-title {
      font-size: 10px;
      font-weight: 800;
      color: #334155;
      text-transform: uppercase;
      margin-bottom: 4px;
      letter-spacing: 0.5px;
    }
    .summary-text {
      font-size: 11px;
      color: #1E293B;
      margin: 0;
    }
    .table-section-title {
      font-size: 12px;
      font-weight: 800;
      color: #0F172A;
      margin: 16px 0 8px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    table.report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-top: 6px;
      background-color: #FFFFFF;
    }
    table.report-table th {
      background-color: #CE2029 !important;
      color: #FFFFFF !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      font-weight: 800;
      text-transform: uppercase;
      padding: 8px 10px;
      border: 1px solid #7A1E24;
      text-align: left;
      font-size: 10px;
      letter-spacing: 0.3px;
    }
    table.report-table td {
      padding: 7px 10px;
      border: 1px solid #CBD5E1;
      color: #1E293B;
    }
    table.report-table tr.even {
      background-color: #F8FAFC !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    table.report-table tr.totales {
      background-color: #FEE2E2 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      font-weight: 800;
      color: #991B1B;
      border-top: 2px solid #F87171;
    }
    table.report-table tr.totales td {
      border-top: 2px solid #F87171;
      color: #991B1B;
      font-family: monospace;
      font-size: 11px;
    }
    .text-right { text-align: right; }
    .font-bold { font-weight: bold; }
    .footer-stamp {
      margin-top: 30px;
      border-top: 1px solid #CBD5E1;
      padding-top: 10px;
      display: flex;
      justify-content: space-between;
      color: #64748B;
      font-size: 9px;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div>
      <h1 class="brand-title">CUERPO DE BOMBEROS SANTA CRUZ &bull; INFORME TÁCTICO OFICIAL</h1>
      <div class="brand-sub">SALA DE SITUACIÓN &bull; INF512 SISTEMA DE COMANDO Y CONTROL</div>
    </div>
    <div class="meta-badge">
      <div><strong>ID:</strong> ${rep.id_reporte}</div>
      <div><strong>FECHA:</strong> ${new Date().toLocaleString()}</div>
    </div>
  </div>

  ${ordenDictadaHtml}

  <div class="summary-card">
    <div class="summary-title">DICTAMEN EJECUTIVO &bull; SALA DE SITUACIÓN:</div>
    <p class="summary-text">${rep.resumen_ejecutivo}</p>
  </div>

  <div class="table-section-title">REGISTROS TABULARES PROYECTADOS (${tabla?.total_registros ?? tabla?.filas?.length ?? 0} REGISTROS)</div>
  ${tablaHtml}

  <div class="footer-stamp">
    <span>DOCUMENTO OFICIAL AUDITADO &bull; INF512 UAGRM</span>
    <span>OFICIAL RESPONSABLE: NATALY MARTÍNEZ (OPERADOR)</span>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 250);
    };
  </script>
</body>
</html>`;

      printWindow.document.open();
      printWindow.document.write(htmlDocument);
      printWindow.document.close();
    }
  }

  public limpiar(): void {
    this.reporteGenerado.set(null);
    this.errorMensaje.set(null);
    this.archivoAudio.set(null);
    this.nombreArchivo.set('');
    this.progresoCompilacion.set(0);
    this.mensajeProgreso.set('');
  }
}
