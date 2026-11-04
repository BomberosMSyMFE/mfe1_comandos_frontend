import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ReportesService, ReporteRespuestaDTO } from '../services/reportes.service';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './reportes.component.html',
  styleUrls: ['./reportes.component.css']
})
export class ReportesComponent {
  public instruccionTexto = signal<string>('Generar reporte táctico del incendio en Parque Industrial nave textil con detalle de unidades y espumógeno.');
  public vozTts = signal<string>('es-BO-MarceloNeural');
  public archivoAudio = signal<File | null>(null);
  public nombreArchivo = signal<string>('');

  public procesando = signal<boolean>(false);
  public reporteGenerado = signal<ReporteRespuestaDTO | null>(null);
  public errorMensaje = signal<string | null>(null);

  constructor(private reportesService: ReportesService) {}

  public onArchivoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.archivoAudio.set(file);
      this.nombreArchivo.set(file.name);
    }
  }

  public generarPorTexto(): void {
    if (!this.instruccionTexto().trim()) {
      this.errorMensaje.set('Debe ingresar un requerimiento de reporte.');
      return;
    }

    this.errorMensaje.set(null);
    this.procesando.set(true);

    this.reportesService.generarPorTexto(this.instruccionTexto().trim(), this.vozTts()).subscribe({
      next: (resp) => {
        this.reporteGenerado.set(resp);
        this.procesando.set(false);
      },
      error: (err) => {
        this.errorMensaje.set(`Error al conectar con MS-05 IA: ${err.message}`);
        this.procesando.set(false);
      }
    });
  }

  public generarPorVoz(): void {
    const archivo = this.archivoAudio();
    if (!archivo) {
      this.errorMensaje.set('Debe seleccionar un archivo de audio radial (WAV, MP3, OGG).');
      return;
    }

    this.errorMensaje.set(null);
    this.procesando.set(true);

    this.reportesService.generarPorVoz(archivo, this.vozTts()).subscribe({
      next: (resp) => {
        this.reporteGenerado.set(resp);
        this.procesando.set(false);
      },
      error: (err) => {
        this.errorMensaje.set(`Error en pipeline Whisper de voz: ${err.message}`);
        this.procesando.set(false);
      }
    });
  }

  public limpiar(): void {
    this.reporteGenerado.set(null);
    this.errorMensaje.set(null);
    this.archivoAudio.set(null);
    this.nombreArchivo.set('');
  }
}
