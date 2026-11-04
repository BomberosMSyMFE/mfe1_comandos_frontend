# Guía de Pruebas Funcionales y Resiliencia — `mfe1_comandos_frontend`

**Plataforma Distribuida para el Cuerpo de Bomberos — INF512 (Ingeniería de Software II)**  
**Semestre:** 2/2026 — UAGRM  
**Docente:** M.Sc. Ing. Rolando Antonio Martinez Canedo  
**Responsable:** Nataly Martínez (Líder / Fullstack)  
**Microfrontend URL (Autónomo):** `http://localhost:4201`  
**Host URL (Integrado):** `http://localhost:4200/crisis`

---

## 1. Puesta en Marcha

1. Abrir terminal en `mfe1_comandos_frontend`:
   ```bash
   cd /home/nataly/Projects/sw2/mfe1_comandos_frontend
   npm start
   ```
2. El servidor compilará los módulos federados y levantará en `http://localhost:4201`.
3. Abrir en el navegador: `http://localhost:4201`.

---

## 2. Batería de Pruebas Funcionales

### PRUEBA 1: Inspección de Métricas KPI Tácticas y Badge WebSockets
* **Objetivo:** Verificar la visualización de los indicadores tácticos clave y el estado del socket en vivo.
* **Pasos:**
  1. Observar la barra superior de la Sala de Crisis:
     - Badge a la derecha: `<i class="bi bi-reception-4"></i> EN VIVO WSS` (verde) o `<i class="bi bi-arrow-repeat"></i> CONECTANDO CON GATEWAY...` (ámbar si el backend de NestJS aún no está iniciado).
  2. Verificar las 4 tarjetas KPI en la parte superior:
     - **INCIDENTES ACTIVOS:** Número en tipografía monoespaciada táctica (ej. `4`).
     - **UNIDADES EN COMBATE:** Camiones actualmente asignados a emergencias.
     - **HIDRANTES EN SERVICIO:** Puntos de abastecimiento operativos (ej. `43 / 45`).
     - **AGUA TÁCTICA DISPONIBLE:** Litros totales en reserva (ej. `34.500 L`).

---

### PRUEBA 2: Filtros Tácticos y Semáforo de Riesgo
* **Objetivo:** Comprobar el filtrado en tiempo real sin recarga de página y la aplicación estricta de la paleta semafórica.
* **Pasos:**
  1. En la caja de búsqueda "Buscar por código, calle o cuadrante...", escribir: `Mutualista`.
     - **Resultado:** La tabla se filtra al instante mostrando únicamente el incidente `INC-101` (Parque Industrial).
  2. Presionar el botón `[ Limpiar ]`. La tabla restaura todos los incidentes.
  3. En el selector "Nivel de Riesgo", elegir **`Crítico (Rojo)`**:
     - **Resultado:** Solo se listan incidentes con badge crítico:  
       Texto `#991B1B` sobre fondo suave `#FEE2E2` y borde `#FCA5A5` con ícono `<i class="bi bi-exclamation-octagon-fill"></i>`.
  4. En el selector, elegir **`Alerta (Ámbar)`**:
     - **Resultado:** Se listan siniestros con texto `#B45309` sobre fondo `#FEF3C7` y borde `#FDE68A`.
  5. En el selector, elegir **`Controlado (Verde)`**:
     - **Resultado:** Se listan siniestros con texto `#166534` sobre fondo `#DCFCE7` y borde `#86EFAC`.

---

### PRUEBA 3: Paginación Estándar de 15 Registros por Página
* **Objetivo:** Validar que la tabla respeta el límite estricto de 15 registros y los controles de navegación.
* **Pasos:**
  1. En el pie de la tabla, verificar:
     - Leyenda izquierda: `Mostrando 1–5 de 5 incidentes` (o la cantidad total correspondiente).
     - Botones derechos: `[ Anterior ]`, `Página 1 de 1`, `[ Siguiente ]`.
  2. Los botones de paginación se deshabilitan correctamente en los extremos (primer y último límite).

---

### PRUEBA 4: Intentar Tumbar el Formulario Táctico (Validaciones en Letras Rojas)
* **Objetivo:** Probar que el sistema previene el ingreso de valores absurdos o incompletos y despliega mensajes de advertencia en color rojo `#DC2626`.
* **Pasos:**
  1. En la fila del incidente `INC-101`, hacer clic en el botón primario:  
     `[bi-send-fill] Aprobar Despacho`.
  2. Se abrirá el modal de gobernanza táctica **Human-in-the-Loop**.
  3. **Caso de Intento de Falla 1: Cantidad de espumógeno negativa**
     - En el campo "Reserva de Espumógeno Sintético AFFF (Litros)", escribir: `-50`.
     - Presionar el botón `[ Confirmar y Despachar Unidad ]`.
     - **Resultado:** Justo debajo del campo aparece en letras rojas `#DC2626`:  
       `<i class="bi bi-exclamation-circle-fill"></i> La cantidad de espumógeno debe ser un número mayor o igual a 0.`
  4. **Caso de Intento de Falla 2: Cantidad excesiva de espumógeno**
     - Escribir: `5000` (5.000 litros).
     - Presionar `[ Confirmar y Despachar Unidad ]`.
     - **Resultado:** Aparece en rojo `#DC2626`:  
       `<i class="bi bi-exclamation-circle-fill"></i> La reserva máxima por unidad táctica es de 1.000 litros.`
  5. **Caso de Intento de Falla 3: Unidad sin seleccionar**
     - Dejar el selector de camiones vacío.
     - Presionar `[ Confirmar y Despachar Unidad ]`.
     - **Resultado:** Aparece en rojo `#DC2626`:  
       `<i class="bi bi-exclamation-circle-fill"></i> Debe seleccionar una unidad vehicular disponible para el despacho.`

---

### PRUEBA 5: Aprobación Human-in-the-Loop Exitosa y Emisión de Evento al Bus
* **Objetivo:** Ejecutar la orden de despacho táctico y verificar la coordinación con SAGA.
* **Pasos:**
  1. En el modal abierto para `INC-101`:
     - Seleccionar unidad: `B-04-SCZ - Autobomba Cisterna Pesada (Agua: 10,000 L)`.
     - Ingresar espumógeno: `250`.
     - En "Notas Tácticas", ingresar: `Ataque defensivo por flanco este, verificar hidrante H-12`.
  2. Presionar `[ Confirmar y Despachar Unidad ]`.
  3. **Resultado:**
     - El botón muestra estado de carga: `<i class="bi bi-arrow-repeat spin-icon"></i> Coordinando SAGA...`.
     - Se cierra el modal.
     - En la esquina superior derecha aparece el toast de éxito:  
       `<i class="bi bi-check-circle-fill"></i> Despacho aprobado con éxito. SAGA completada para B-04-SCZ.`
     - En la tabla, la fila de `INC-101` actualiza su estado a:  
       `<i class="bi bi-truck"></i> EN CAMINO`.
     - En la consola de desarrollador (F12) se verifica la emisión nativa:  
       `[Native Event Bus] Emitiendo BOMBERO_DISPATCH_EVENT a window`.

---

### PRUEBA 6: Simulación de Fallo de Backend / SAGA (Modal NO se Cierra)
* **Objetivo:** Demostrar que ante un error HTTP (ej. 409 conflicto por camión ya ocupado o 500), el modal permanece abierto con el motivo exacto y no borra el formulario.
* **Pasos:**
  1. Configurar en `.env`: `USE_MOCKS=false`.
  2. Intentar despachar un incidente sin que el backend de NestJS esté encendido (o apuntando a una URL inexistente).
  3. Presionar `[ Confirmar y Despachar Unidad ]`.
  4. **Resultado:**
     - El modal **PERMANECE ABIERTO** (no se pierde lo escrito).
     - En la parte superior interna del modal aparece el banner rojo:  
       `<div class="modal-alert-danger"><i class="bi bi-exclamation-triangle-fill"></i> Fallo en la orquestación SAGA: Error de conexión en red...</div>`.
     - El operador puede corregir el dato y reintentar.

---

### PRUEBA 7: Consola de Reportes Multimodales (MS-05 Voice-to-Report)
* **Objetivo:** Probar la ingesta de notas de voz radiales y comandos en texto.
* **Pasos:**
  1. En la URL del navegador, dirigirse a `http://localhost:4201/reportes`.
  2. **Prueba por Texto:**
     - Escribir en el campo: `Generar informe de situación de fuego estructural con balance de espuma y mangueras requeridas.`
     - Presionar `[ Generar por Texto ]`.
     - Se desplegará el resumen ejecutivo, el reproductor de audio radial y los botones para descargar PDF y Excel.
  3. **Prueba por Voz (Audio Radial):**
     - En el área punteada "Ingesta Radial Voice-to-Report", hacer clic y subir un archivo de audio (ej. `parcial.mp3` ubicado en la raíz del proyecto).
     - Presionar `[ Transcribir y Compilar Multimodal ]`.
     - El sistema transcribe el audio mediante Faster-Whisper, aplica RAG Grounding determinista y sintetiza el briefing sonoro con Edge-TTS.
