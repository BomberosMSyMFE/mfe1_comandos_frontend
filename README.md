# `mfe1_comandos_frontend` — Consola de Comandos y Sala de Crisis

**Plataforma Distribuida para el Cuerpo de Bomberos — INF512 (Ingeniería de Software II)**  
**Semestre:** 2/2026 — UAGRM  
**Docente:** M.Sc. Ing. Rolando Antonio Martinez Canedo  
**Responsable:** Nataly Martínez (Líder / Fullstack)  
**Tecnología:** Angular 18 (Standalone Components, Signals, RxJS) + Webpack 5 Module Federation + Socket.io  
**Puerto Asignado:** `4201` (`http://localhost:4201`)

---

## 1. Misión y Capacidades del Microfrontend

Este microfrontend remoto proporciona la interfaz táctica para la **Sala de Crisis y Despacho de Emergencias (Central 119)**:

1. **Dashboard Reactivo en Tiempo Real:**
   - Métricas KPI en vivo: Incidentes Activos, Unidades en Combate, Hidrantes Operativos y Reserva de Agua Táctica.
   - Conexión continua por WebSockets (`socket.io-client`) al Gateway de Crisis de NestJS en `http://localhost:3000/ws/sala-crisis`.
   - Eventos escuchados: `INCIDENTE_CREADO`, `INCIDENTE_DESPACHADO`, `ESTADO_CAMBIADO`, `ALERTA_CRISIS`.
   - Alarma auditiva sintetizada mediante Web Audio API ante nuevos siniestros críticos.
2. **Tabla de Incidentes Tácticos con Semáforo de Riesgo:**
   - Cumplimiento de paginación estándar de **15 registros por página**.
   - Badges semafóricos de riesgo:
     - `CRÍTICO`: Texto `#991B1B` sobre fondo `#FEE2E2` (Rojo Fuego).
     - `ALERTA`: Texto `#B45309` sobre fondo `#FEF3C7` (Ámbar Advertencia).
     - `CONTROLADO`: Texto `#166534` sobre fondo `#DCFCE7` (Verde Disponible).
3. **Gobernanza Human-in-the-Loop (`[ Aprobar Despacho ]`):**
   - El operador selecciona la unidad vehicular (`B-04-SCZ`, `B-08-URB`, `C-01-ABAST`, `R-02-RESC`) y define los litros de espumógeno.
   - Invoca el orquestador SAGA de NestJS (`POST http://localhost:3000/api/v1/despacho/iniciar`).
   - Dispara el evento `BOMBERO_DISPATCH_EVENT` al bus nativo del navegador (`window`).
   - **Regla Inviolable de Modales:** Si el backend rechaza la transacción o la SAGA ejecuta compensación, el modal **NO se cierra**, mostrando un banner de alerta roja (`.modal-alert-danger`) con la explicación del servidor para evitar pérdida de datos.
4. **Módulo de Reportes Multimodales (Integración MS-05):**
   - Generación de informes mediante texto en lenguaje natural o subida de notas de voz radiales (WAV, MP3, OGG).
   - Inferencia con Faster-Whisper, RAG Grounding determinista y Edge-TTS.
   - Descarga directa de PDF (WeasyPrint con CSS Paged Media), Excel (OpenPyXL) y reproductor en vivo de audio radial.

---

## 2. Módulos Expuestos vía Module Federation (`webpack.config.js`)

```javascript
module.exports = withModuleFederationPlugin({
  name: 'mfe1_comandos_frontend',
  exposes: {
    './Component': './src/app/crisis-room/crisis-room.component.ts',
    './Reportes': './src/app/reportes/reportes.component.ts',
    './routes': './src/app/crisis-room/crisis-room.routes.ts',
  },
  shared: {
    ...shareAll({ singleton: true, strictVersion: true, requiredVersion: 'auto' }),
  },
});
```

El archivo `remoteEntry.js` generado en `http://localhost:4201/remoteEntry.js` es consumido dinámicamente por el Host (`appshell_frontend`).

---

## 3. Puesta en Marcha en Desarrollo

```bash
# 1. Acceder al directorio
cd mfe1_comandos_frontend

# 2. Compilar bundles federados
npm run build

# 3. Iniciar servidor remoto en puerto 4201
npm start
```

Abrir de forma autónoma en el navegador: `http://localhost:4201`
O a través del Host: `http://localhost:4200/crisis`
