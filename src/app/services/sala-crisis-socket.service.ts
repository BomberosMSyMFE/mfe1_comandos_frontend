import { Injectable, NgZone } from '@angular/core';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { Incidente } from '../models/incidente.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SalaCrisisSocketService {
  private socket: Socket | null = null;
  private readonly socketUrl = environment.wsSalaCrisisUrl;

  private incidenteCreadoSubject = new Subject<Incidente>();
  private incidenteDespachadoSubject = new Subject<any>();
  private estadoCambiadoSubject = new Subject<{ incidenteId: string; estado: string; historial?: any; codigoRadial?: string; codigo?: string }>();
  private alertaCrisisSubject = new Subject<any>();
  private conectadoSubject = new BehaviorSubject<boolean>(false);

  public readonly onIncidenteCreado$ = this.incidenteCreadoSubject.asObservable();
  public readonly onIncidenteDespachado$ = this.incidenteDespachadoSubject.asObservable();
  public readonly onEstadoCambiado$ = this.estadoCambiadoSubject.asObservable();
  public readonly onAlertaCrisis$ = this.alertaCrisisSubject.asObservable();
  public readonly estaConectado$ = this.conectadoSubject.asObservable();

  constructor(private ngZone: NgZone) {
    this.conectar();
  }

  public conectar(): void {
    if (this.socket && this.socket.connected) {
      return;
    }

    try {
      this.socket = io(this.socketUrl, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 20,
        reconnectionDelay: 1500,
        timeout: 10000
      });

      this.socket.on('connect', () => {
        this.ngZone.run(() => {
          console.log('[SalaCrisisSocket] Conexión establecida con Gateway de Crisis');
          this.conectadoSubject.next(true);
        });
      });

      this.socket.on('disconnect', () => {
        this.ngZone.run(() => {
          console.warn('[SalaCrisisSocket] Desconectado del Gateway de Crisis');
          this.conectadoSubject.next(false);
        });
      });

      this.socket.on('connect_error', (error) => {
        this.ngZone.run(() => {
          console.warn('[SalaCrisisSocket] Error en conexión WebSocket:', error.message);
          this.conectadoSubject.next(false);
        });
      });

      this.socket.on('INCIDENTE_CREADO', (datos: Incidente) => {
        this.ngZone.run(() => {
          console.log('[SalaCrisisSocket] Evento recibido: INCIDENTE_CREADO', datos);
          this.reproducirAlarmaCritica();
          this.incidenteCreadoSubject.next(datos);
        });
      });

      this.socket.on('INCIDENTE_DESPACHADO', (datos: any) => {
        this.ngZone.run(() => {
          console.log('[SalaCrisisSocket] Evento recibido: INCIDENTE_DESPACHADO', datos);
          this.incidenteDespachadoSubject.next(datos);
        });
      });

      this.socket.on('ESTADO_CAMBIADO', (datos: any) => {
        this.ngZone.run(() => {
          console.log('[SalaCrisisSocket] Evento recibido: ESTADO_CAMBIADO', datos);
          this.estadoCambiadoSubject.next(datos);
        });
      });

      this.socket.on('INCIDENTE_CAMBIADO', (datos: any) => {
        this.ngZone.run(() => {
          console.log('[SalaCrisisSocket] Evento recibido: INCIDENTE_CAMBIADO', datos);
          this.estadoCambiadoSubject.next(datos);
        });
      });

      this.socket.on('ALERTA_CRISIS', (datos: any) => {
        this.ngZone.run(() => {
          console.warn('[SalaCrisisSocket] Evento recibido: ALERTA_CRISIS', datos);
          this.reproducirAlarmaCritica();
          this.alertaCrisisSubject.next(datos);
        });
      });

    } catch (e) {
      console.warn('[SalaCrisisSocket] No se pudo inicializar Socket.io:', e);
      this.conectadoSubject.next(false);
    }
  }

  public desconectar(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.conectadoSubject.next(false);
    }
  }

  /**
   * Genera un tono de advertencia sonoro sintetizado con Web Audio API (sin dependencias de archivos de audio)
   */
  public reproducirAlarmaCritica(): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // Tono A5
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // Si el navegador bloquea audio sin interacción del usuario, ignorar silenciosamente
    }
  }
}
