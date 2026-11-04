# Guía de Arquitectura y Archivos Clave — `mfe1_comandos_frontend`

**Plataforma Distribuida para el Cuerpo de Bomberos — INF512 (Ingeniería de Software II)**  
**Semestre:** 2/2026 — UAGRM  
**Docente:** M.Sc. Ing. Rolando Antonio Martinez Canedo  
**Responsable:** Nataly Martínez (Líder / Fullstack)  
**Rol:** Microfrontend Remoto de Sala de Crisis (Puerto `4201`)

---

## 1. Visión General de la Arquitectura del Microfrontend

El repositorio **`mfe1_comandos_frontend`** es la consola táctica de despacho del Cuerpo de Bomberos. Funciona de manera **100% autónoma** en el puerto `4201`, pero al mismo tiempo expone sus componentes y rutas hacia el Host (`appshell_frontend`) mediante **Webpack 5 Module Federation**:

* Provee el tablero reactivo de emergencias en vivo (`CrisisRoomComponent`).
* Gestiona la conexión continua con el backend mediante WebSockets (`socket.io-client`).
* Implementa la gobernanza **Human-in-the-Loop** para autorizar el despacho coordinando con el orquestador SAGA de NestJS (`POST /api/v1/despacho/iniciar`).
* Dispara eventos al bus de la ventana (`BOMBERO_DISPATCH_EVENT`).
* Integra el módulo multimodal **Voice-to-Report** consumiendo el microservicio de IA FastMCP (MS-05).

---

## 2. Mapa de Archivos Más Importantes

```text
mfe1_comandos_frontend/
├── .env                              # Switch USE_MOCKS y URLs de endpoints
├── .env.example                      # Ejemplo de configuración de red
├── scripts/
│   └── set-env.js                    # Sincronizador de .env hacia environment.ts
├── webpack.config.js                 # Exposición de './Component', './routes', './Reportes'
├── src/
│   ├── theme-variables.css           # Tokens de diseño institucionales
│   ├── environments/
│   │   └── environment.ts            # Variables globales generadas desde .env
│   └── app/
│       ├── models/
│       │   ├── incidente.model.ts    # Entidad de incidente y tipos de riesgo
│       │   └── despacho.model.ts     # DTOs de SAGA y unidades de camiones
│       ├── services/
│       │   ├── sala-crisis-socket.service.ts # Gateway WebSocket en vivo + oscilador audio
│       │   ├── despacho.service.ts   # SAGA HTTP, switch USE_MOCKS y Event Bus
│       │   └── reportes.service.ts   # Inferencia de voz Faster-Whisper (MS-05)
│       ├── crisis-room/
│       │   ├── crisis-room.component.ts   # Lógica del tablero, KPIs y modal SAGA
│       │   ├── crisis-room.component.html # UI semafórica sin emojis, paginación 15
│       │   ├── crisis-room.component.css  # Estilos con tokens de diseño sobrios
│       │   └── crisis-room.routes.ts      # Rutas exportadas para Module Federation
│       └── reportes/
│           ├── reportes.component.ts # Ingesta de audio WAV/MP3 y texto
│           ├── reportes.component.html # Visualizador multimodal y player Edge-TTS
│           └── reportes.component.css
```

---

## 3. Desglose Detallado de Archivos y Fragmentos de Código

### 3.1. `webpack.config.js` — Exposición Federada del Remoto
Configura el nombre único del contenedor remoto y los puntos de entrada expuestos a través de `remoteEntry.js`:

```javascript
const { shareAll, withModuleFederationPlugin } = require('@angular-architects/module-federation/webpack');

module.exports = withModuleFederationPlugin({
  name: 'mfe1_comandos_frontend',
  exposes: {
    // Expone la Sala de Crisis principal para montaje en el Shell
    './Component': './src/app/crisis-room/crisis-room.component.ts',
    // Expone las rutas internas del microfrontend
    './routes': './src/app/crisis-room/crisis-room.routes.ts',
    // Expone el módulo de reportes multimodales
    './Reportes': './src/app/reportes/reportes.component.ts',
  },
  shared: {
    ...shareAll({ singleton: true, strictVersion: true, requiredVersion: 'auto' }),
  },
});
```

---

### 3.2. `src/app/services/sala-crisis-socket.service.ts` — WebSockets y Alarma Táctica
Mantiene la conexión en tiempo real con el namespace `/ws/sala-crisis` de NestJS. Utiliza **Web Audio API** para generar un tono sonoro analógico de advertencia cada vez que entra un incidente crítico, sin requerir librerías externas:

```typescript
@Injectable({ providedIn: 'root' })
export class SalaCrisisSocketService {
  private socket: Socket | null = null;
  private readonly socketUrl = environment.wsSalaCrisisUrl;

  public conectar(): void {
    this.socket = io(this.socketUrl, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnectionAttempts: 10
    });

    this.socket.on('INCIDENTE_CREADO', (datos: Incidente) => {
      this.reproducirAlarmaCritica(); // Genera oscilador de audio
      this.incidenteCreadoSubject.next(datos);
    });

    this.socket.on('INCIDENTE_DESPACHADO', (datos) => {
      this.incidenteDespachadoSubject.next(datos);
    });
  }

  public reproducirAlarmaCritica(): void {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  }
}
```

---

### 3.3. `src/app/services/despacho.service.ts` — Orquestación SAGA y Event Bus
Gestiona la invocación a la SAGA distribuida de `ms1_comandos_backend`. Si `USE_MOCKS=true`, responde al instante con datos simulados deterministas para pruebas locales. Si es `false`, llama a la API real. En ambos casos, notifica al **Native Event Bus**:

```typescript
public iniciarDespacho(solicitud: DespachoRequest): Observable<DespachoResponse> {
  if (environment.useMocks) {
    const respuestaSimulada: DespachoResponse = {
      exito: true,
      transaccionId: 'TX-SAGA-MOCK-' + Math.floor(100000 + Math.random() * 900000),
      incidenteId: solicitud.incidenteId,
      camionAsignado: solicitud.camionId,
      materialesReservados: ['Lanza Protek 2.5"', `${solicitud.litrosEspumogeno} L Espumógeno`],
      mensaje: 'Despacho aprobado exitosamente con SAGA simulada.'
    };
    this.notificarBusNativo(respuestaSimulada, solicitud);
    return of(respuestaSimulada);
  }

  return this.http.post<DespachoResponse>(`${this.baseUrl}/despacho/iniciar`, solicitud, { withCredentials: true }).pipe(
    tap(respuesta => this.notificarBusNativo(respuesta, solicitud)),
    catchError(error => throwError(() => new Error(error.error?.mensaje || 'Error en SAGA')))
  );
}

private notificarBusNativo(respuesta: DespachoResponse, solicitud: DespachoRequest): void {
  window.dispatchEvent(new CustomEvent('BOMBERO_DISPATCH_EVENT', {
    detail: {
      evento: 'BOMBERO_DISPATCH_EVENT',
      transaccionId: respuesta.transaccionId,
      incidenteId: solicitud.incidenteId,
      camionId: solicitud.camionId,
      materiales: respuesta.materialesReservados,
      timestamp: new Date().toISOString()
    }
  }));
}
```

---

### 3.4. `src/app/crisis-room/crisis-room.component.ts` — Semáforo y Gobernanza
Controla la vista principal. Utiliza señales computadas para el filtrado en vivo por nivel de riesgo y la paginación estricta de 15 registros.

**Regla Inviolable de Modales:**
```typescript
public ejecutarAprobacionDespacho(): void {
  const errores: { camion?: string; espumogeno?: string } = {};

  if (!this.camionSeleccionadoId()) {
    errores.camion = 'Debe seleccionar una unidad vehicular disponible para el despacho.';
  }
  if (this.litrosEspumogeno() < 0 || this.litrosEspumogeno() > 1000) {
    errores.espumogeno = 'La cantidad de espumógeno debe situarse entre 0 y 1.000 litros.';
  }

  if (Object.keys(errores).length > 0) {
    this.erroresCampos.set(errores); // Errores en rojo (#DC2626)
    return;
  }

  this.enviandoDespacho.set(true);

  this.despachoService.iniciarDespacho(solicitud).subscribe({
    next: (resp) => {
      this.enviandoDespacho.set(false);
      this.modalDespachoAbierto.set(false); // Cierra solo en éxito
      this.mostrarToast('success', `Despacho aprobado: Unidad ${solicitud.camionId}`);
    },
    error: (err) => {
      this.enviandoDespacho.set(false);
      // REGLA INVIOLABLE: El modal NO se cierra ante errores
      this.errorDespachoModal.set(`Fallo en orquestación SAGA: ${err.message}`);
    }
  });
}
```

---

### 3.5. `src/app/services/reportes.service.ts` — Voice-to-Report Multimodal (MS-05)
Envía comandos de texto o notas de voz grabadas en campo mediante `FormData` al microservicio de IA:

```typescript
public generarPorVoz(archivoAudio: File, vozTts: string): Observable<ReporteRespuestaDTO> {
  const formData = new FormData();
  formData.append('archivo_audio', archivoAudio, archivoAudio.name);

  return this.http.post<ReporteRespuestaDTO>(
    `${this.baseUrl}/generar-por-voz?generar_multimodal=true&voz_tts=${encodeURIComponent(vozTts)}`,
    formData
  );
}
```
* **Punto Clave:** El reporte resultante provee enlaces directos a `/descargar/pdf/{id}` (WeasyPrint con CSS Paged Media), `/descargar/excel/{id}` (OpenPyXL) y `/reproducir/audio/{id}` (Edge-TTS).
