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
  public rolUsuario = signal<'OPERADOR' | 'BOMBERO' | 'ADMINISTRADOR' | 'DESCONOCIDO'>('OPERADOR');
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

  // Lista de incidentes filtrada
  public incidentesFiltrados = computed(() => {
    const texto = this.filtroTexto().toLowerCase().trim();
    const riesgo = this.filtroRiesgo();

    return this.incidentes().filter(inc => {
      const coincideTexto =
        !texto ||
        inc.codigo.toLowerCase().includes(texto) ||
        inc.titulo.toLowerCase().includes(texto) ||
        inc.cuadrante.toLowerCase().includes(texto) ||
        inc.direccion.toLowerCase().includes(texto);

      const coincideRiesgo = riesgo === 'TODOS' || inc.nivelRiesgo === riesgo;
      return coincideTexto && coincideRiesgo;
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
    if (this.rolUsuario() !== 'BOMBERO') {
      this.cargarDatosIniciales();
    }
    this.suscribirWebSockets();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.cleanupAuthListeners) {
      this.cleanupAuthListeners();
    }
  }

  /**
   * Detecta el rol del usuario conectado según sessionStorage y revalida con /api/v1/auth/me
   */
  public detectarRolUsuario(): void {
    let rolDetectado: 'OPERADOR' | 'BOMBERO' | 'ADMINISTRADOR' | null = null;

    // 1. Primero verificar sessionStorage ('BOMBEROS_SSO_USER')
    try {
      const stored = sessionStorage.getItem('BOMBEROS_SSO_USER');
      if (stored) {
        const user = JSON.parse(stored);
        if (user && user.rol) {
          const rol = String(user.rol).toUpperCase();
          if (rol === 'BOMBERO' || rol === 'OPERADOR' || rol === 'ADMINISTRADOR') {
            rolDetectado = rol as any;
            this.rolUsuario.set(rolDetectado!);
            if (rolDetectado === 'BOMBERO') {
              this.seccionActiva.set('REPORTES');
            }
          }
        }
      }
    } catch (e) {
      console.warn('[MFE1 RBAC] Error leyendo BOMBEROS_SSO_USER en sessionStorage:', e);
    }

    // 2. Si no existe en sessionStorage (o para revalidar), llamada HTTP con credenciales HttpOnly
    const authMeUrl = `${environment.apiMs1Url}/auth/me`;
    this.http.get<{ usuarioId?: string; email?: string; rol?: string }>(authMeUrl, { withCredentials: true }).subscribe({
      next: (res) => {
        if (res && res.rol) {
          const rolHttp = String(res.rol).toUpperCase() as 'OPERADOR' | 'BOMBERO' | 'ADMINISTRADOR';
          const anterior = this.rolUsuario();
          this.rolUsuario.set(rolHttp);
          if (rolHttp === 'BOMBERO') {
            this.seccionActiva.set('REPORTES');
          } else if (anterior === 'BOMBERO' && (rolHttp === 'OPERADOR' || rolHttp === 'ADMINISTRADOR')) {
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
        const anterior = this.rolUsuario();
        this.rolUsuario.set(rol as any);
        if (rol === 'BOMBERO') {
          this.seccionActiva.set('REPORTES');
        } else if (anterior === 'BOMBERO' && (rol === 'OPERADOR' || rol === 'ADMINISTRADOR')) {
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
      this.socketService.onIncidenteCreado$.subscribe(nuevo => {
        this.incidentes.update(actuales => [nuevo, ...actuales]);
        this.mostrarToast('danger', `Alarma ingresada: ${nuevo.codigo} - ${nuevo.titulo}`);
      })
    );

    this.subs.add(
      this.socketService.onIncidenteDespachado$.subscribe(despacho => {
        this.incidentes.update(actuales =>
          actuales.map(inc =>
            inc.id === despacho.incidenteId
              ? { ...inc, estado: 'DESPACHADO', camionAsignado: despacho.camionAsignado }
              : inc
          )
        );
        this.mostrarToast('info', `Unidad ${despacho.camionAsignado} despachada al siniestro ${despacho.incidenteId}`);
      })
    );

    this.subs.add(
      this.socketService.onEstadoCambiado$.subscribe(cambio => {
        this.incidentes.update(actuales =>
          actuales.map(inc =>
            inc.id === cambio.incidenteId ? { ...inc, estado: cambio.estado as EstadoIncidente } : inc
          )
        );
      })
    );
  }

  /**
   * Ordena incidentes priorizando los de riesgo CRÍTICO, luego ALERTA y finalmente CONTROLADO
   */
  private ordenarPorRiesgo(items: Incidente[]): Incidente[] {
    const peso: Record<string, number> = {
      CRITICO: 3,
      ALERTA: 2,
      CONTROLADO: 1
    };
    return [...items].sort((a, b) => (peso[b.nivelRiesgo] || 0) - (peso[a.nivelRiesgo] || 0));
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
      observaciones: this.notasOperativas()
    };

    this.despachoService.iniciarDespacho(solicitud).subscribe({
      next: (respuesta) => {
        this.enviandoDespacho.set(false);
        this.modalDespachoAbierto.set(false);

        // Actualizar estado en la lista local
        this.incidentes.update(actuales =>
          actuales.map(item =>
            item.id === inc!.id
              ? { ...item, estado: 'DESPACHADO', camionAsignado: camionId, unidadesAsignadas: (item.unidadesAsignadas || 0) + 1 }
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
          `Despacho aprobado con éxito. SAGA completada para ${camionId} (TX: ${respuesta.transaccionId}).`
        );
      },
      error: (err) => {
        this.enviandoDespacho.set(false);
        // REGLA INVIOLABLE: El modal NO se cierra ante errores del backend
        this.errorDespachoModal.set(
          `Fallo en la orquestación SAGA: ${err.message || 'Error de compensación al reservar materiales o asignar camión'}`
        );
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
