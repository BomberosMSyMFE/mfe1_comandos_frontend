import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import {
  Incidente,
  NivelRiesgo,
  EstadoIncidente,
  KpiCrisis,
  HistorialTimelineItem,
  DespachoUnidadItem,
  TransaccionSagaItem
} from '../models/incidente.model';
import { CamionOption, DespachoRequest } from '../models/despacho.model';
import { DespachoService } from '../services/despacho.service';
import { SalaCrisisSocketService } from '../services/sala-crisis-socket.service';
import { ReportesComponent } from '../reportes/reportes.component';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-crisis-room',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ReportesComponent],
  templateUrl: './crisis-room.component.html',
  styleUrls: ['./crisis-room.component.css']
})
export class CrisisRoomComponent implements OnInit, OnDestroy {
  // Pestañas de Navegación Táctica de MFE1
  public seccionActiva = signal<'CRISIS' | 'SAGA' | 'REPORTES'>('CRISIS');

  // Control RBAC de Roles y Restricción Táctica
  public rolUsuario = signal<'OPERADOR' | 'BOMBERO' | 'ADMINISTRADOR' | 'DESCONOCIDO'>('DESCONOCIDO');
  public modalRolNoAutorizado = signal<boolean>(false);
  private cleanupAuthListeners: (() => void) | null = null;
  private wsSuscrito = false;

  // Tipo de vista en Sala de Crisis: Tablero Kanban vs Tabla Táctica
  public tipoVista = signal<'KANBAN' | 'TABLA'>('KANBAN');

  // Lista reactiva de incidentes usando Angular Signals
  public incidentes = signal<Incidente[]>([]);
  public camiones = signal<CamionOption[]>([]);
  public sagaLogs = signal<TransaccionSagaItem[]>([]);
  public estaConectadoWs = signal<boolean>(false);
  public cargando = signal<boolean>(false);
  public mensajeToast = signal<{ tipo: 'info' | 'success' | 'danger'; texto: string } | null>(null);

  // Alerta Táctica Flotante Cross-MFE (Flotas -> Sala de Crisis)
  public alertaFlotasCrossMfe = signal<{
    tipo: 'CONTROLADO' | 'CERRADO' | 'INFO';
    codigo: string;
    mensaje: string;
    camionId?: string;
    timestamp: string;
  } | null>(null);
  private cleanupCrossMfeListeners: (() => void) | null = null;

  // Filtros de búsqueda y estado
  public filtroTexto = signal<string>('');
  public filtroRiesgo = signal<string>('TODOS');

  // Paginación para vista de tabla (15 registros por página)
  public readonly elementosPorPagina = 15;
  public paginaActual = signal<number>(1);

  // Panel Lateral / Modal de Detalle de Incidente
  public modalDetalleAbierto = signal<boolean>(false);
  public incidenteDetalle = signal<Incidente | null>(null);
  public timelineDetalle = signal<HistorialTimelineItem[]>([]);
  public despachosDetalle = signal<DespachoUnidadItem[]>([]);
  public cargandoDetalle = signal<boolean>(false);

  // Modal de Transición de Estado (PATCH /api/v1/incidentes/{id}/estado)
  public modalCambioEstadoAbierto = signal<boolean>(false);
  public nuevoEstadoSeleccionado = signal<EstadoIncidente>('EN_COMBATE');
  public novedadTexto = signal<string>('');
  public nivelAguaActual = signal<number | undefined>(undefined);
  public enviandoCambioEstado = signal<boolean>(false);
  public errorCambioEstado = signal<string | null>(null);

  // Modal Human-in-the-Loop de Aprobación de Despacho SAGA
  public modalDespachoAbierto = signal<boolean>(false);
  public incidenteSeleccionado = signal<Incidente | null>(null);
  public camionSeleccionadoId = signal<string>('');
  public litrosEspumogeno = signal<number>(250);
  public notasOperativas = signal<string>('');
  public enviandoDespacho = signal<boolean>(false);
  public errorDespachoModal = signal<string | null>(null);
  public erroresCampos = signal<{ camion?: string; espumogeno?: string; novedad?: string }>({});

  private subs = new Subscription();

  // Lista de incidentes filtrada (Ordenada con los más recientes primero)
  public incidentesFiltrados = computed(() => {
    const texto = this.filtroTexto().toLowerCase().trim();
    const riesgo = this.filtroRiesgo();

    const filtrados = this.incidentes().filter(inc => {
      const coincideTexto =
        !texto ||
        inc.codigo.toLowerCase().includes(texto) ||
        inc.titulo.toLowerCase().includes(texto) ||
        inc.cuadrante.toLowerCase().includes(texto) ||
        inc.direccion.toLowerCase().includes(texto);

      const coincideRiesgo = riesgo === 'TODOS' || inc.nivelRiesgo === riesgo;
      return coincideTexto && coincideRiesgo;
    });

    return [...filtrados].sort((a, b) => {
      const timeA = this.getTimestampEfectivo(a);
      const timeB = this.getTimestampEfectivo(b);
      return timeB - timeA;
    });
  });

  // Columnas Kanban: Ordenadas con tarjetas críticas arriba/adelante
  public columnaPendiente = computed(() => {
    return this.ordenarPorRiesgo(this.incidentesFiltrados().filter(i => i.estado === 'PENDIENTE'));
  });

  public columnaDespachado = computed(() => {
    return this.ordenarPorRiesgo(this.incidentesFiltrados().filter(i => i.estado === 'DESPACHADO'));
  });

  public columnaEnCombate = computed(() => {
    return this.ordenarPorRiesgo(this.incidentesFiltrados().filter(i => i.estado === 'EN_COMBATE'));
  });

  public columnaControlado = computed(() => {
    return this.ordenarPorRiesgo(this.incidentesFiltrados().filter(i => i.estado === 'CONTROLADO'));
  });

  public columnaCerrado = computed(() => {
    return this.ordenarPorRiesgo(this.incidentesFiltrados().filter(i => i.estado === 'CERRADO'));
  });

  // Paginación de tabla
  public totalPaginas = computed(() => {
    return Math.max(1, Math.ceil(this.incidentesFiltrados().length / this.elementosPorPagina));
  });

  public incidentesPaginados = computed(() => {
    const inicio = (this.paginaActual() - 1) * this.elementosPorPagina;
    return this.incidentesFiltrados().slice(inicio, inicio + this.elementosPorPagina);
  });

  public kpis = computed<KpiCrisis>(() => {
    return this.despachoService.calcularKpis(this.incidentes());
  });

  // Reglas de negocio para transiciones de estado válidas según ms1_comandos_backend
  public estadosSiguientesValidos = computed<EstadoIncidente[]>(() => {
    const inc = this.incidenteDetalle();
    if (!inc) return [];

    switch (inc.estado) {
      case 'PENDIENTE':
        return ['DESPACHADO'];
      case 'DESPACHADO':
        return ['EN_COMBATE'];
      case 'EN_COMBATE':
        return ['CONTROLADO'];
      case 'CONTROLADO':
        return ['CERRADO'];
      case 'CERRADO':
      default:
        return [];
    }
  });

  constructor(
    private despachoService: DespachoService,
    private socketService: SalaCrisisSocketService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.detectarRolUsuario();
    this.escucharCambiosAuth();
    this.escucharEventosCrossMfe();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.cleanupAuthListeners) {
      this.cleanupAuthListeners();
    }
    if (this.cleanupCrossMfeListeners) {
      this.cleanupCrossMfeListeners();
    }
  }

  /**
   * Detecta el rol del usuario conectado según sessionStorage y revalida con /api/v1/auth/me
   */
  public detectarRolUsuario(): void {
    let rolDetectado: 'OPERADOR' | 'BOMBERO' | 'ADMINISTRADOR' | null = null;

    // 1. Primero verificar sessionStorage ('BOMBEROS_SSO_USER')
    try {
      const stored = typeof window !== 'undefined' ? sessionStorage.getItem('BOMBEROS_SSO_USER') : null;
      if (stored) {
        const user = JSON.parse(stored);
        if (user && user.rol) {
          const rol = String(user.rol).toUpperCase();
          if (rol === 'BOMBERO' || rol === 'OPERADOR' || rol === 'ADMINISTRADOR') {
            rolDetectado = rol as any;
            this.rolUsuario.set(rolDetectado!);
            if (rolDetectado === 'BOMBERO') {
              this.seccionActiva.set('REPORTES');
            } else {
              this.cargarDatosIniciales();
              this.suscribirWebSockets();
            }
          }
        }
      }
    } catch (e) {
      console.warn('[MFE1 RBAC] Error leyendo BOMBEROS_SSO_USER en sessionStorage:', e);
    }

    // 2. Revalidar con llamada HTTP con credenciales HttpOnly (/auth/me)
    const authMeUrl = `${environment.apiMs1Url}/auth/me`;
    this.http.get<{ usuarioId?: string; email?: string; rol?: string }>(authMeUrl, { withCredentials: true }).subscribe({
      next: (res) => {
        if (res && res.rol) {
          const rolHttp = String(res.rol).toUpperCase() as 'OPERADOR' | 'BOMBERO' | 'ADMINISTRADOR';
          this.rolUsuario.set(rolHttp);
          if (rolHttp === 'BOMBERO') {
            this.seccionActiva.set('REPORTES');
          } else if (rolHttp === 'OPERADOR' || rolHttp === 'ADMINISTRADOR') {
            this.cargarDatosIniciales();
            this.suscribirWebSockets();
          }
        }
      },
      error: () => {
        if (!rolDetectado) {
          this.rolUsuario.set('DESCONOCIDO');
        }
      }
    });
  }

  /**
   * Sincronización en caliente ante eventos SSO desde AppShell
   */
  private escucharCambiosAuth(): void {
    if (typeof window === 'undefined') return;

    const aplicarRol = (rolRaw?: string | null) => {
      if (!rolRaw) {
        this.rolUsuario.set('DESCONOCIDO');
        return;
      }
      const rol = String(rolRaw).toUpperCase();
      if (rol === 'BOMBERO' || rol === 'OPERADOR' || rol === 'ADMINISTRADOR') {
        this.rolUsuario.set(rol as any);
        if (rol === 'BOMBERO') {
          this.seccionActiva.set('REPORTES');
        } else if (rol === 'OPERADOR' || rol === 'ADMINISTRADOR') {
          this.cargarDatosIniciales();
          this.suscribirWebSockets();
        }
      }
    };

    const authListener = (event: Event) => {
      const custom = event as CustomEvent;
      aplicarRol(custom.detail?.rol);
    };

    const storageListener = (event: StorageEvent) => {
      if (event.key === 'BOMBEROS_SSO_USER') {
        try {
          const user = event.newValue ? JSON.parse(event.newValue) : null;
          aplicarRol(user?.rol);
        } catch {}
      }
    };

    window.addEventListener('BOMBERO_AUTH_CHANGE', authListener);
    window.addEventListener('storage', storageListener);

    this.cleanupAuthListeners = () => {
      window.removeEventListener('BOMBERO_AUTH_CHANGE', authListener);
      window.removeEventListener('storage', storageListener);
    };
  }

  /**
   * Escucha eventos nativos de integración Cross-MFE (MFE-02 Flotas -> MFE-01 Sala de Crisis)
   * Detecta cuando una unidad en terreno reporta:
   * 1. Fuego CONTROLADO -> Mueve el siniestro a 'CONTROLADO' y emite badge táctico
   * 2. Siniestro EXTINGUIDO / LIQUIDADO -> Mueve el siniestro a 'CERRADO' y emite badge táctico
   * Soporta eventos DOM (CustomEvent), mensajes postMessage y captura de telemetría de consola F12 ([App] Evento de Incidente).
   */
  private escucharEventosCrossMfe(): void {
    if (typeof window === 'undefined') return;

    const procesarTransicion = (incidenteId?: string, nuevoEstadoRaw?: string, camionId?: string) => {
      if (!nuevoEstadoRaw) return;
      const estadoUpper = String(nuevoEstadoRaw).toUpperCase();

      let estadoDestino: EstadoIncidente | null = null;
      let esExtinguido = false;

      if (estadoUpper.includes('CONTROLADO')) {
        estadoDestino = 'CONTROLADO';
      } else if (
        estadoUpper.includes('EXTINGUID') ||
        estadoUpper.includes('LIQUIDAD') ||
        estadoUpper.includes('CERRAD')
      ) {
        estadoDestino = 'CERRADO';
        esExtinguido = true;
      }

      if (!estadoDestino) return;

      const rawId = incidenteId ? String(incidenteId).trim() : '';
      const rawCamion = camionId ? String(camionId).trim() : '';

      const buscarIncidente = (lista: Incidente[]): Incidente | undefined => {
        return lista.find(i => {
          if (!i) return false;
          // 1. Coincidencia por UUID o ID primario
          if (rawId && (i.id === rawId || i.id?.toLowerCase() === rawId.toLowerCase())) return true;
          // 2. Coincidencia por Código Radial (ej. INC-2026-SCZ-294) o Código
          if (rawId && (i.codigoRadial === rawId || i.codigoRadial?.toLowerCase() === rawId.toLowerCase())) return true;
          if (rawId && (i.codigo === rawId || i.codigo?.toLowerCase() === rawId.toLowerCase())) return true;
          // 3. Coincidencia por sufijo numérico radial (ej. si llega 294 o INC-294)
          const numBuscado = rawId.match(/\d+$/);
          if (numBuscado && (i.codigoRadial?.endsWith(numBuscado[0]) || i.codigo?.endsWith(numBuscado[0]))) return true;
          // 4. Coincidencia por camión asignado
          if (rawCamion && (i.camionAsignado === rawCamion || i.camionAsignado?.includes(rawCamion))) return true;
          return false;
        });
      };

      const listaActual = this.incidentes();
      let inc = buscarIncidente(listaActual);

      const codRadial = inc?.codigoRadial || inc?.codigo || (rawId ? (rawId.startsWith('01') ? `INC-${rawId.slice(0, 8)}` : rawId) : 'Siniestro Táctico');
      const unidadStr = rawCamion || inc?.camionAsignado || 'Unidad de Flotas';

      if (estadoDestino === 'CONTROLADO') {
        this.alertaFlotasCrossMfe.set({
          tipo: 'CONTROLADO',
          codigo: codRadial,
          mensaje: `Unidad ${unidadStr} reportó Fuego CONTROLADO en el siniestro ${codRadial}. El tablero fue actualizado en vivo.`,
          camionId: unidadStr,
          timestamp: new Date().toLocaleTimeString()
        });
        this.mostrarToast('success', `[MFE-02 FLOTAS] ${codRadial} pasó a CONTROLADO por ${unidadStr}`);
      } else {
        this.alertaFlotasCrossMfe.set({
          tipo: 'CERRADO',
          codigo: codRadial,
          mensaje: `Unidad ${unidadStr} reportó siniestro EXTINGUIDO en ${codRadial}. Incidente CERRADO formalmente.`,
          camionId: unidadStr,
          timestamp: new Date().toLocaleTimeString()
        });
        this.mostrarToast('info', `[MFE-02 FLOTAS] ${codRadial} fue EXTINGUIDO y CERRADO`);
      }

      // Auto-ocultar badge táctico a los 12 segundos
      setTimeout(() => {
        if (this.alertaFlotasCrossMfe()?.codigo === codRadial) {
          this.alertaFlotasCrossMfe.set(null);
        }
      }, 12000);

      const aplicarTransicionEnIncidente = (targetInc: Incidente, todas: Incidente[]) => {
        targetInc.estado = estadoDestino!;
        targetInc.updatedAt = new Date().toISOString();
        this.incidentes.set([...todas]);

        // Refrescar modal si está abierto para este siniestro
        const detalleActual = this.incidenteDetalle();
        if (detalleActual && (
          detalleActual.id === targetInc.id ||
          detalleActual.codigoRadial === targetInc.codigoRadial ||
          detalleActual.codigo === targetInc.codigo
        )) {
          this.incidenteDetalle.update(curr => curr ? { ...curr, estado: estadoDestino!, updatedAt: targetInc.updatedAt } : null);
          this.despachoService.obtenerTimeline(targetInc.id).subscribe({
            next: (tl) => this.timelineDetalle.set(tl)
          });
        }

        const novedad = esExtinguido
          ? `Fuego extinguido y liquidado por unidad de bomberos ${unidadStr}. Transición automática a CERRADO.`
          : `Fuego controlado reportado por unidad en escena ${unidadStr}. Transición automática a CONTROLADO.`;

        this.despachoService.cambiarEstado(targetInc.id, estadoDestino!, novedad).subscribe({
          next: () => {
            console.log(`[Cross-MFE Flotas -> Crisis] Incidente '${targetInc.id}' (${targetInc.codigoRadial || targetInc.codigo}) persistido exitosamente como ${estadoDestino}`);
          },
          error: (err: any) => {
            console.warn(`[Cross-MFE Flotas -> Crisis] Fallo al persistir en backend MS-01:`, err);
          }
        });
      };

      if (inc) {
        aplicarTransicionEnIncidente(inc, listaActual);
      } else {
        // Si no está en memoria, consultar backend para sincronizar y buscar
        this.despachoService.obtenerIncidentesActivos().subscribe({
          next: (incList: any[]) => {
            const normalizados = (incList || []).map((raw: any) => this.despachoService.normalizarIncidente(raw));
            this.incidentes.set(normalizados);
            const encontrado = buscarIncidente(normalizados);
            if (encontrado) {
              aplicarTransicionEnIncidente(encontrado, normalizados);
            }
          }
        });
      }
    };

    const handlerIncidenteCambiado = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      console.log('[MFE-01 SALA CRISIS] Interceptado BOMBEROS:ESTADO_INCIDENTE_CAMBIADO:', detail);
      procesarTransicion(detail.incidenteId, detail.nuevoEstado || detail.estado, detail.camionId);
    };

    const handlerIncidenteControlado = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      console.log('[MFE-01 SALA CRISIS] Interceptado BOMBEROS:INCIDENTE_CONTROLADO:', detail);
      procesarTransicion(detail.incidenteId, 'CONTROLADO', detail.camionId);
    };

    const handlerEstadoCamion = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.nuevoEstado === 'FUEGO_CONTROLADO' || detail.nuevoEstado === 'CONTROLADO') {
        procesarTransicion(detail.incidenteId, 'CONTROLADO', detail.camionId);
      } else if (detail.nuevoEstado === 'EXTINGUIDO' || detail.nuevoEstado === 'LIQUIDADO') {
        procesarTransicion(detail.incidenteId, 'EXTINGUIDO', detail.camionId);
      }
    };

    const handlerMessage = (evt: MessageEvent) => {
      try {
        if (evt?.data && typeof evt.data === 'object') {
          const d = evt.data;
          if (d.tipo === 'EVENTO_INCIDENTE' || d.type === 'EVENTO_INCIDENTE' || d.evento === 'ESTADO_INCIDENTE') {
            procesarTransicion(d.incidenteId || d.id, d.nuevoEstado || d.estado, d.camionId);
          }
        }
      } catch {}
    };

    // Interceptor de console.log para capturar eventos de telemetría de MFE-02 Flotas:
    // Formato detectado: "[App] Evento de Incidente: <id_o_codigo> -> <ESTADO>"
    const originalConsoleLog = console.log;
    const logInterceptor = (...args: any[]) => {
      try {
        originalConsoleLog.apply(console, args);
      } catch {}
      try {
        const fullMsg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        if (fullMsg.includes('Evento de Incidente:')) {
          const match = fullMsg.match(/Evento de Incidente:\s*([^\s->]+)\s*->\s*([A-Za-z0-9_-]+)/i);
          if (match) {
            const rawId = match[1].trim();
            const rawEstado = match[2].trim();
            console.info(`[MFE-01 CRISIS] Interceptado evento de flotas vía console.log: id=${rawId}, estado=${rawEstado}`);
            procesarTransicion(rawId, rawEstado);
          }
        }
      } catch {}
    };
    console.log = logInterceptor;

    window.addEventListener('BOMBEROS:ESTADO_INCIDENTE_CAMBIADO', handlerIncidenteCambiado);
    window.addEventListener('BOMBEROS:INCIDENTE_CONTROLADO', handlerIncidenteControlado);
    window.addEventListener('BOMBEROS:ESTADO_CAMION_CAMBIADO', handlerEstadoCamion);
    window.addEventListener('message', handlerMessage);

    this.cleanupCrossMfeListeners = () => {
      console.log = originalConsoleLog;
      window.removeEventListener('BOMBEROS:ESTADO_INCIDENTE_CAMBIADO', handlerIncidenteCambiado);
      window.removeEventListener('BOMBEROS:INCIDENTE_CONTROLADO', handlerIncidenteControlado);
      window.removeEventListener('BOMBEROS:ESTADO_CAMION_CAMBIADO', handlerEstadoCamion);
      window.removeEventListener('message', handlerMessage);
    };
  }

  /**
   * Gestiona el cambio de pestaña táctica aplicando la regla RBAC estricta:
   * El rol BOMBERO solo tiene permitido el módulo REPORTES.
   * Si intenta entrar a CRISIS o SAGA, se bloquea y se muestra la modal táctica.
   */
  public cambiarSeccion(seccion: 'CRISIS' | 'SAGA' | 'REPORTES'): void {
    if (this.rolUsuario() === 'BOMBERO' && (seccion === 'CRISIS' || seccion === 'SAGA')) {
      this.modalRolNoAutorizado.set(true);
      this.seccionActiva.set('REPORTES');
      return;
    }
    this.seccionActiva.set(seccion);
    if (seccion === 'SAGA') {
      this.despachoService.obtenerHistorialSaga().subscribe({
        next: (logs) => this.sagaLogs.set(logs)
      });
    }
  }

  public recargarHistorialSaga(): void {
    this.despachoService.obtenerHistorialSaga().subscribe({
      next: (logs) => {
        this.sagaLogs.set(logs);
        this.mostrarToast('info', `Monitor SAGA actualizado: ${logs.length} transacciones registradas.`);
      }
    });
  }

  public cerrarModalRolNoAutorizado(): void {
    this.modalRolNoAutorizado.set(false);
  }

  public irAModuloReportesPermitido(): void {
    this.modalRolNoAutorizado.set(false);
    this.seccionActiva.set('REPORTES');
  }

  private cargarDatosIniciales(): void {
    if (this.rolUsuario() === 'BOMBERO') {
      return;
    }

    this.cargando.set(true);

    this.subs.add(
      this.despachoService.obtenerIncidentesActivos().subscribe({
        next: (lista) => {
          this.incidentes.set(lista);
          this.cargando.set(false);
        },
        error: () => {
          this.cargando.set(false);
        }
      })
    );

    this.subs.add(
      this.despachoService.obtenerCamiones().subscribe({
        next: (camiones) => {
          this.camiones.set(camiones);
          if (camiones.length > 0) {
            this.camionSeleccionadoId.set(camiones[0].id);
          }
        }
      })
    );

    this.subs.add(
      this.despachoService.obtenerHistorialSaga().subscribe({
        next: (logs) => {
          this.sagaLogs.set(logs);
        }
      })
    );
  }

  private suscribirWebSockets(): void {
    if (this.wsSuscrito) {
      return;
    }
    this.wsSuscrito = true;

    // Monitoreo de estado de conexión WebSocket (común para todos los roles autenticados)
    this.subs.add(
      this.socketService.estaConectado$.subscribe(conectado => {
        this.estaConectadoWs.set(conectado);
      })
    );

    // Si es BOMBERO, no requiere escuchar los eventos de despacho ni alarmas de sala de crisis
    if (this.rolUsuario() === 'BOMBERO') {
      return;
    }

    this.subs.add(
      this.socketService.onIncidenteCreado$.subscribe(raw => {
        console.log('[CrisisRoom] Evento recibido: INCIDENTE_CREADO', raw);
        const nuevo = this.despachoService.normalizarIncidente(raw);
        this.incidentes.update(actuales => {
          const existeIdx = actuales.findIndex(i => i.id === nuevo.id || (nuevo.codigo && i.codigo === nuevo.codigo));
          if (existeIdx !== -1) {
            const actualizados = [...actuales];
            actualizados[existeIdx] = nuevo;
            return actualizados;
          }
          return [nuevo, ...actuales];
        });
        this.mostrarToast('danger', `Alarma ingresada: ${nuevo.codigo} - ${nuevo.titulo}`);
      })
    );

    // Sondeo de seguridad táctica en segundo plano cada 12 segundos para resiliencia ante cortes de red
    const intervalPolling = setInterval(() => {
      this.despachoService.obtenerIncidentesActivos().subscribe({
        next: (lista) => {
          this.incidentes.set(lista);
          const detalleActual = this.incidenteDetalle();
          if (detalleActual) {
            const encontrado = lista.find(i => i.id === detalleActual.id || i.codigoRadial === detalleActual.codigoRadial || i.codigo === detalleActual.codigo);
            if (encontrado && encontrado.estado !== detalleActual.estado) {
              this.incidenteDetalle.set(encontrado);
              this.despachoService.obtenerTimeline(encontrado.id).subscribe({
                next: (tl) => this.timelineDetalle.set(tl)
              });
            }
          }
        }
      });
    }, 12000);
    this.subs.add({ unsubscribe: () => clearInterval(intervalPolling) });

    this.subs.add(
      this.socketService.onIncidenteDespachado$.subscribe(despacho => {
        const camionUnidad = despacho.camionAsignado || despacho.camion;
        this.incidentes.update(actuales =>
          actuales.map(inc =>
            inc.id === despacho.incidenteId
              ? { ...inc, estado: 'DESPACHADO', camionAsignado: camionUnidad, unidadesAsignadas: (inc.unidadesAsignadas || 0) + 1 }
              : inc
          )
        );
        this.mostrarToast('info', `Unidad ${camionUnidad} despachada al siniestro ${despacho.incidenteId}`);
      })
    );

    this.subs.add(
      this.socketService.onEstadoCambiado$.subscribe(cambio => {
        console.log('[CrisisRoom] Evento WebSocket recibido onEstadoCambiado:', cambio);
        const targetId = String(cambio.incidenteId || '').trim();
        const targetCod = String(cambio.codigoRadial || cambio.codigo || '').trim();
        const nuevoEstado = cambio.estado as EstadoIncidente;

        let actualizado = false;
        this.incidentes.update(actuales =>
          actuales.map(inc => {
            const coincide =
              (targetId && (inc.id === targetId || inc.id?.toLowerCase() === targetId.toLowerCase())) ||
              (targetCod && (inc.codigoRadial === targetCod || inc.codigo === targetCod || inc.codigoRadial?.toLowerCase() === targetCod.toLowerCase())) ||
              (targetId && (inc.codigoRadial === targetId || inc.codigo === targetId || inc.codigoRadial?.toLowerCase() === targetId.toLowerCase()));

            if (coincide) {
              actualizado = true;
              return {
                ...inc,
                estado: nuevoEstado,
                updatedAt: new Date().toISOString()
              };
            }
            return inc;
          })
        );

        // Si el modal de detalle está abierto para este incidente, refrescar su estado y timeline
        const detalleActual = this.incidenteDetalle();
        if (detalleActual && (
          detalleActual.id === targetId ||
          detalleActual.codigoRadial === targetCod ||
          detalleActual.codigo === targetCod ||
          detalleActual.id === targetCod ||
          detalleActual.codigoRadial === targetId
        )) {
          this.incidenteDetalle.update(curr => curr ? { ...curr, estado: nuevoEstado, updatedAt: new Date().toISOString() } : null);
          this.despachoService.obtenerTimeline(detalleActual.id).subscribe({
            next: (tl) => this.timelineDetalle.set(tl)
          });
        }

        const codMostrar = targetCod || targetId || 'Siniestro';
        if (nuevoEstado === 'CONTROLADO') {
          this.alertaFlotasCrossMfe.set({
            tipo: 'CONTROLADO',
            codigo: codMostrar,
            mensaje: `Siniestro ${codMostrar} pasó a CONTROLADO por telemetría en vivo.`,
            camionId: 'Flotas en Terreno',
            timestamp: new Date().toLocaleTimeString()
          });
          this.mostrarToast('success', `[MFE-02 FLOTAS] ${codMostrar} pasó a CONTROLADO`);
        } else if (nuevoEstado === 'CERRADO') {
          this.alertaFlotasCrossMfe.set({
            tipo: 'CERRADO',
            codigo: codMostrar,
            mensaje: `Siniestro ${codMostrar} fue EXTINGUIDO y CERRADO formalmente.`,
            camionId: 'Flotas en Terreno',
            timestamp: new Date().toLocaleTimeString()
          });
          this.mostrarToast('info', `[MFE-02 FLOTAS] ${codMostrar} fue EXTINGUIDO y CERRADO`);
        }

        setTimeout(() => {
          if (this.alertaFlotasCrossMfe()?.codigo === codMostrar) {
            this.alertaFlotasCrossMfe.set(null);
          }
        }, 12000);

        if (!actualizado) {
          this.despachoService.obtenerIncidentesActivos().subscribe({
            next: (lista) => this.incidentes.set(lista)
          });
        }
      })
    );
  }

  /**
   * Obtiene la marca de tiempo efectiva de un incidente, priorizando su última modificación (updatedAt)
   * para que al cambiar de estado salte inmediatamente al principio de la columna operativa correspondiente.
   */
  public getTimestampEfectivo(item: Incidente): number {
    const tUpdated = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
    const tCreated = item.createdAt ? new Date(item.createdAt).getTime() : 0;
    if (!isNaN(tUpdated) && tUpdated > 0) return tUpdated;
    if (!isNaN(tCreated) && tCreated > 0) return tCreated;
    return 0;
  }

  /**
   * Ordena incidentes priorizando los más recientemente actualizados/creados primero
   * (según updatedAt descendente, con fallback a createdAt)
   * y desempata por nivel de riesgo (CRÍTICO -> ALERTA -> CONTROLADO)
   */
  private ordenarPorRiesgo(items: Incidente[]): Incidente[] {
    const peso: Record<string, number> = {
      CRITICO: 3,
      ALERTA: 2,
      CONTROLADO: 1
    };
    return [...items].sort((a, b) => {
      // 1. Prioridad: Últimos modificados/actualizados primero (updatedAt / createdAt)
      const timeA = this.getTimestampEfectivo(a);
      const timeB = this.getTimestampEfectivo(b);
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      // 2. Desempate por criticidad/severidad
      return (peso[b.nivelRiesgo] || 0) - (peso[a.nivelRiesgo] || 0);
    });
  }

  // =========================================================================
  // DETALLE DE INCIDENTE, UNIDADES Y TIMELINE
  // =========================================================================
  public abrirDetalle(incidente: Incidente): void {
    this.incidenteDetalle.set(incidente);
    this.modalDetalleAbierto.set(true);
    this.cargandoDetalle.set(true);

    this.despachoService.obtenerTimeline(incidente.id).subscribe({
      next: (timeline) => {
        this.timelineDetalle.set(timeline);
      }
    });

    this.despachoService.obtenerDespachos(incidente.id).subscribe({
      next: (despachos) => {
        this.despachosDetalle.set(despachos);
        this.cargandoDetalle.set(false);
      },
      error: () => {
        this.cargandoDetalle.set(false);
      }
    });
  }

  public cerrarDetalle(): void {
    this.modalDetalleAbierto.set(false);
    this.incidenteDetalle.set(null);
    this.timelineDetalle.set([]);
    this.despachosDetalle.set([]);
  }

  // =========================================================================
  // CAMBIO DE ESTADO DEL SINIESTRO (PATCH /incidentes/{id}/estado)
  // =========================================================================
  public abrirModalCambioEstado(): void {
    const inc = this.incidenteDetalle();
    if (!inc) return;

    const validos = this.estadosSiguientesValidos();
    if (validos.length > 0) {
      this.nuevoEstadoSeleccionado.set(validos[0]);
    }
    this.novedadTexto.set('');
    this.nivelAguaActual.set(inc.litrosAguaEstimados);
    this.errorCambioEstado.set(null);
    this.modalCambioEstadoAbierto.set(true);
  }

  public cerrarModalCambioEstado(): void {
    if (this.enviandoCambioEstado()) return;
    this.modalCambioEstadoAbierto.set(false);
    this.errorCambioEstado.set(null);
  }

  public ejecutarCambioEstado(): void {
    const inc = this.incidenteDetalle();
    const nuevoEstado = this.nuevoEstadoSeleccionado();
    const novedad = this.novedadTexto().trim();
    const nivelAgua = this.nivelAguaActual();

    if (!inc) return;

    if (!novedad) {
      this.errorCambioEstado.set('Debe ingresar un texto de novedad para la bitácora inmutable.');
      return;
    }

    this.enviandoCambioEstado.set(true);
    this.errorCambioEstado.set(null);

    this.despachoService.cambiarEstado(inc.id, nuevoEstado, novedad, nivelAgua).subscribe({
      next: () => {
        this.enviandoCambioEstado.set(false);
        this.modalCambioEstadoAbierto.set(false);

        // Actualizar estado en lista principal
        this.incidentes.update(actuales =>
          actuales.map(item =>
            item.id === inc.id ? { ...item, estado: nuevoEstado, updatedAt: new Date().toISOString() } : item
          )
        );

        // Actualizar detalle abierto
        if (this.incidenteDetalle()?.id === inc.id) {
          this.incidenteDetalle.update(curr => curr ? { ...curr, estado: nuevoEstado } : null);
        }

        // Recargar timeline
        this.despachoService.obtenerTimeline(inc.id).subscribe({
          next: (tl) => this.timelineDetalle.set(tl)
        });

        this.mostrarToast('success', `Estado actualizado a ${nuevoEstado} para el siniestro ${inc.codigo}`);
      },
      error: (err) => {
        this.enviandoCambioEstado.set(false);
        // REGLA INVIOLABLE: No cerrar modal ante error
        this.errorCambioEstado.set(err.message || 'Error al cambiar estado del siniestro');
      }
    });
  }

  // =========================================================================
  // GOBERNANZA HUMAN-IN-THE-LOOP (DESPACHO SAGA)
  // =========================================================================
  public abrirModalDespacho(incidente: Incidente): void {
    this.incidenteSeleccionado.set(incidente);
    this.errorDespachoModal.set(null);
    this.erroresCampos.set({});
    this.litrosEspumogeno.set(incidente.litrosEspumogenoEstimados || 250);
    this.notasOperativas.set('');

    const camionDisponible = this.camiones().find(c => c.estado === 'DISPONIBLE');
    if (camionDisponible) {
      this.camionSeleccionadoId.set(camionDisponible.id);
    }

    this.modalDespachoAbierto.set(true);
  }

  public cerrarModalDespacho(): void {
    if (this.enviandoDespacho()) return;
    this.modalDespachoAbierto.set(false);
    this.incidenteSeleccionado.set(null);
    this.errorDespachoModal.set(null);
    this.erroresCampos.set({});
  }

  public ejecutarAprobacionDespacho(): void {
    const inc = this.incidenteSeleccionado();
    const camionId = this.camionSeleccionadoId();
    const litros = this.litrosEspumogeno();

    const errores: { camion?: string; espumogeno?: string } = {};

    if (!camionId) {
      errores.camion = 'Debe seleccionar una unidad vehicular disponible para el despacho.';
    }

    if (litros === null || litros === undefined || litros < 0) {
      errores.espumogeno = 'La cantidad de espumógeno debe ser un número mayor o igual a 0.';
    } else if (litros > 1000) {
      errores.espumogeno = 'La reserva máxima por unidad táctica es de 1.000 litros.';
    }

    if (Object.keys(errores).length > 0) {
      this.erroresCampos.set(errores);
      return;
    }

    this.erroresCampos.set({});
    this.enviandoDespacho.set(true);
    this.errorDespachoModal.set(null);

    const solicitud: DespachoRequest = {
      incidenteId: inc!.id,
      camionId: camionId,
      tipoIncidente: inc!.tipo,
      litrosEspumogeno: litros,
      observaciones: this.notasOperativas(),
      direccion: inc!.direccion,
      ubicacion: inc!.direccion,
      cuadrante: inc!.cuadrante,
      latitud: inc!.latitud,
      longitud: inc!.longitud,
    };

    this.despachoService.iniciarDespacho(solicitud).subscribe({
      next: (respuesta) => {
        this.enviandoDespacho.set(false);
        this.modalDespachoAbierto.set(false);

        // Actualizar estado en la lista local con el camión confirmado por la respuesta SAGA
        const camionConfirmado = respuesta.camionAsignado || camionId;
        this.incidentes.update(actuales =>
          actuales.map(item =>
            item.id === inc!.id
              ? { ...item, estado: 'DESPACHADO', camionAsignado: camionConfirmado, unidadesAsignadas: (item.unidadesAsignadas || 0) + 1 }
              : item
          )
        );

        // Si el detalle estaba abierto, refrescar
        if (this.incidenteDetalle()?.id === inc!.id) {
          this.abrirDetalle(this.incidentes().find(i => i.id === inc!.id)!);
        }

        // Recargar logs de SAGA
        this.despachoService.obtenerHistorialSaga().subscribe({
          next: (logs) => this.sagaLogs.set(logs)
        });

        this.mostrarToast(
          'success',
          `Despacho aprobado con éxito. SAGA completada para ${camionConfirmado} (TX: ${respuesta.transaccionId}).`
        );
      },
      error: (err) => {
        this.enviandoDespacho.set(false);
        // REGLA INVIOLABLE: El modal NO se cierra ante errores del backend
        this.errorDespachoModal.set(
          `Fallo en la orquestación SAGA: ${err.message || 'Error de compensación al reservar materiales o asignar camión'}`
        );
        // Recargar inmediatamente historial SAGA ante compensación o rechazo para auditoría en vivo
        this.despachoService.obtenerHistorialSaga().subscribe({
          next: (logs) => this.sagaLogs.set(logs)
        });
      }
    });
  }

  public cambiarPagina(nuevaPagina: number): void {
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPaginas()) {
      this.paginaActual.set(nuevaPagina);
    }
  }

  public limpiarFiltros(): void {
    this.filtroTexto.set('');
    this.filtroRiesgo.set('TODOS');
    this.paginaActual.set(1);
  }

  public mostrarToast(tipo: 'info' | 'success' | 'danger', texto: string): void {
    this.mensajeToast.set({ tipo, texto });
    setTimeout(() => {
      this.mensajeToast.set(null);
    }, 6000);
  }

  public claseBadgeRiesgo(nivel: NivelRiesgo): string {
    switch (nivel) {
      case 'CRITICO':
        return 'badge-fire-critical';
      case 'ALERTA':
        return 'badge-fire-warning';
      case 'CONTROLADO':
        return 'badge-fire-success';
      default:
        return 'badge-fire-neutral';
    }
  }

  public claseBadgeEstado(estado: EstadoIncidente | string): string {
    switch (estado) {
      case 'PENDIENTE':
        return 'badge-fire-warning';
      case 'DESPACHADO':
        return 'badge-fire-info';
      case 'EN_COMBATE':
        return 'badge-fire-critical';
      case 'CONTROLADO':
        return 'badge-fire-success';
      case 'CERRADO':
        return 'badge-fire-neutral';
      default:
        return 'badge-fire-neutral';
    }
  }

  public formatearTipo(tipo: string): string {
    return tipo ? tipo.replace(/_/g, ' ') : '';
  }
}
