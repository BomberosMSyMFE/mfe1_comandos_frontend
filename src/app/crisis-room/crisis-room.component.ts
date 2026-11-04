import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { Incidente, NivelRiesgo, KpiCrisis } from '../models/incidente.model';
import { CamionOption, DespachoRequest } from '../models/despacho.model';
import { DespachoService } from '../services/despacho.service';
import { SalaCrisisSocketService } from '../services/sala-crisis-socket.service';

@Component({
  selector: 'app-crisis-room',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './crisis-room.component.html',
  styleUrls: ['./crisis-room.component.css']
})
export class CrisisRoomComponent implements OnInit, OnDestroy {
  // Lista reactiva de incidentes usando Angular Signals
  public incidentes = signal<Incidente[]>([]);
  public camiones = signal<CamionOption[]>([]);
  public estaConectadoWs = signal<boolean>(false);
  public cargando = signal<boolean>(false);
  public mensajeToast = signal<{ tipo: 'info' | 'success' | 'danger'; texto: string } | null>(null);

  // Filtros de búsqueda y estado
  public filtroTexto = signal<string>('');
  public filtroRiesgo = signal<string>('TODOS');

  // Paginación estándar (15 registros por página según contrato)
  public readonly elementosPorPagina = 15;
  public paginaActual = signal<number>(1);

  // Modal Human-in-the-Loop de Aprobación de Despacho
  public modalDespachoAbierto = signal<boolean>(false);
  public incidenteSeleccionado = signal<Incidente | null>(null);
  public camionSeleccionadoId = signal<string>('');
  public litrosEspumogeno = signal<number>(250);
  public notasOperativas = signal<string>('');
  public enviandoDespacho = signal<boolean>(false);
  public errorDespachoModal = signal<string | null>(null);
  public erroresCampos = signal<{ camion?: string; espumogeno?: string }>({});

  private subs = new Subscription();

  // Computed signals
  public incidentesFiltrados = computed(() => {
    const texto = this.filtroTexto().toLowerCase().trim();
    const riesgo = this.filtroRiesgo();

    return this.incidentes().filter(inc => {
      const coincideTexto = !texto ||
        inc.codigo.toLowerCase().includes(texto) ||
        inc.titulo.toLowerCase().includes(texto) ||
        inc.cuadrante.toLowerCase().includes(texto) ||
        inc.direccion.toLowerCase().includes(texto);

      const coincideRiesgo = riesgo === 'TODOS' || inc.nivelRiesgo === riesgo;

      return coincideTexto && coincideRiesgo;
    });
  });

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

  constructor(
    private despachoService: DespachoService,
    private socketService: SalaCrisisSocketService
  ) {}

  ngOnInit(): void {
    this.cargarDatosIniciales();
    this.suscribirWebSockets();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private cargarDatosIniciales(): void {
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
  }

  private suscribirWebSockets(): void {
    this.subs.add(
      this.socketService.estaConectado$.subscribe(conectado => {
        this.estaConectadoWs.set(conectado);
      })
    );

    this.subs.add(
      this.socketService.onIncidenteCreado$.subscribe(nuevo => {
        this.incidentes.update(actuales => [nuevo, ...actuales]);
        this.mostrarToast('danger', `Nuevo incidente reportado: ${nuevo.codigo} - ${nuevo.titulo}`);
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
            inc.id === cambio.incidenteId ? { ...inc, estado: cambio.estado as any } : inc
          )
        );
      })
    );
  }

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

    // Validación inline en letras rojas
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
              ? { ...item, estado: 'DESPACHADO', camionAsignado: camionId }
              : item
          )
        );

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
      case 'CRITICO': return 'badge-fire-critical';
      case 'ALERTA': return 'badge-fire-warning';
      case 'CONTROLADO': return 'badge-fire-success';
      default: return 'badge-fire-neutral';
    }
  }

  public formatearTipo(tipo: string): string {
    return tipo ? tipo.replace(/_/g, ' ') : '';
  }
}
