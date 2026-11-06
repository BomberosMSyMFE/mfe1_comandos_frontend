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

### PRUEBA 7: Consola de Reportes Multimodales y Constructor Dinámico (Requisitos de Examen INF512)
* **Objetivo:** Demostrar el cumplimiento riguroso de los requisitos de examen del Ing. Rolando Martínez Canedo:
  - **Requisito ⑤:** *"La generación de reportes dinámicos se puede hacer a partir de prompt, audio y/o texto, permitiendo especificar qué columnas tendrá el reporte, qué criterios de selección y si lo generamos en Excel o PDF"*.
  - **Pregunta #4:** *"¿La aplicación permite generar reportes dinámicos a través de peticiones vía prompt utilizando agentes inteligentes y/o similares conectados directamente a la base de datos?"*.
* **Ubicación:** Pestaña `Reportes Multimodales IA` en Sala de Crisis o directamente en `http://localhost:4201/reportes` (y vía Host en `http://localhost:4200/reportes`).

---

## 3. Batería Exhaustiva de Prompts para el Examen (Verbales con Micrófono y Escritos)

El módulo cuenta con dos modalidades plenamente integradas:
1. **Modo Prompt & Voz (Lenguaje Natural / Faster-Whisper):** Ingesta de audio o texto libre indicando columnas, criterios y formatos.
2. **Modo Constructor Dinámico (Query Builder Táctico):** Interfaz visual interactiva con selector de tablas, checkboxes de columnas, filtros y switch de sumatoria contable.

A continuación se presentan 5 ejemplos concretos listos para leer con micrófono o pegar en el prompt durante la defensa:

---

### EJEMPLO 1: Siniestros Críticos Cuadrante Norte con Fila de Totales
* **Instrucción Verbal / Prompt:**
  > *"Atención Sala de Situación. Generar reporte dinámico de todos los siniestros de severidad Crítica en el Cuadrante Norte. Incluir específicamente las columnas: Código de Incidente, Tipo de Emergencia, Dirección, Agua Usada en Litros y Unidades Despachadas. Activar fila de totales contables para el volumen de agua y unidades, y compilar en formato Excel y PDF."*
* **Columnas Solicitadas:** `Código Incidente`, `Tipo de Emergencia`, `Dirección / Zona`, `Agua Usada (Litros)`, `Unidades Despachadas`.
* **Criterios de Selección:**
  - Cuadrante: `NORTE`
  - Severidad: `CRITICA`
* **Fila de Totales:** Activada (`true`) para columnas sumables `agua_usada` y `unidades`.
* **Formato de Salida:** `Ambos (Excel OpenPyXL + PDF WeasyPrint)`.
* **Verificación de Salida:**
  1. En el Constructor Dinámico, seleccionar la tabla `Siniestros e Incidentes`.
  2. Marcar las 5 columnas especificadas.
  3. Fijar Cuadrante en `NORTE` y Severidad en `CRITICA`.
  4. Mantener encendido el switch `Incluir Fila de Totales Contables`.
  5. Clic en `Compilar Reporte Dinámico`.
  6. **Resultado:** Se proyecta la fila del incidente `INC-SCZ-101` (Parque Industrial) y en el pie de tabla se muestra la fila roja destacada `TOTAL GENERAL` con `14,500 Litros` de agua y `3 Unidades`. Se habilitan los botones `Descargar Excel OpenPyXL` y `Descargar PDF WeasyPrint`.

---

### EJEMPLO 2: Flota Operativa en Escena y Disponibilidad Hídrica
* **Instrucción Verbal / Prompt:**
  > *"Central de Crisis, requiero reporte dinámico de la flota de camiones que se encuentran actualmente En Escena y Disponibles en todos los cuadrantes. Detallar únicamente las columnas: Unidad, Placa Oficial, Tipo de Vehículo, Estado Operativo, Capacidad Máxima y Nivel de Agua Actual. Calcular la sumatoria total de agua disponible en la flota y exportar en formato Excel OpenPyXL."*
* **Columnas Solicitadas:** `Unidad / ID`, `Placa Oficial`, `Tipo de Vehículo`, `Estado Operativo`, `Capacidad Tanque (L)`, `Agua Actual (L)`.
* **Criterios de Selección:**
  - Cuadrante: `TODOS`
  - Estado: `EN_ESCENA` (o `DISPONIBLE`)
* **Fila de Totales:** Activada (`true`) sumando `capacidad_max` y `agua_actual`.
* **Formato de Salida:** `Excel OpenPyXL`.
* **Verificación de Salida:**
  1. Seleccionar tabla `Flota de Camiones`.
  2. Marcar las 6 columnas indicadas.
  3. Elegir formato `Excel OpenPyXL`.
  4. Clic en `Compilar Reporte Dinámico`.
  5. **Resultado:** Se despliegan las unidades vehiculares filtradas con su telemetría de agua, la fila final `TOTAL GENERAL` suma los litros exactos en reserva y el botón primario de descarga es `Descargar Excel OpenPyXL`. Al hacer clic, descarga el archivo CSV/Excel formateado.

---

### EJEMPLO 3: Red de Hidrantes Operativos Cuadrante Centro y Caudales
* **Instrucción Verbal / Prompt:**
  > *"Control de Abastecimiento Hídrico. Compilar reporte táctico de la red de hidrantes con estado Operativo en el Cuadrante Centro y Norte. Mostrar las columnas: Código de Hidrante, Ubicación o Calle, Caudal en Litros por Minuto, Presión en Bar y Tipo de Acople. Incluir la fila de totales con el caudal hídrico consolidado en formato PDF WeasyPrint."*
* **Columnas Solicitadas:** `Código Hidrante`, `Ubicación / Calle`, `Caudal (Litros/Min)`, `Presión de Red (Bar)`, `Tipo de Acople`.
* **Criterios de Selección:**
  - Cuadrante: `CENTRO` (o `NORTE`)
  - Estado: `OPERATIVO`
* **Fila de Totales:** Activada (`true`) totalizando `caudal_lpm`.
* **Formato de Salida:** `PDF WeasyPrint`.
* **Verificación de Salida:**
  1. Seleccionar tabla `Red de Hidrantes`.
  2. Marcar las columnas de caudal, presión y acople.
  3. Fijar Estado en `OPERATIVO`.
  4. Elegir formato `PDF WeasyPrint`.
  5. Clic en `Compilar Reporte Dinámico`.
  6. **Resultado:** Se visualizan los hidrantes operativos (excluyendo el HID-SCZ-103 que está fuera de servicio), se totaliza el caudal sumado (`2,500 L/min` en Centro o `4,000 L/min` sumado Norte) y se habilita el botón `Descargar PDF WeasyPrint`. Al hacer clic se genera la vista oficial imprimible de alta fidelidad.

---

### EJEMPLO 4: Almacén de Insumos - Stock de Espumógenos AFFF y Químicos Críticos
* **Instrucción Verbal / Prompt:**
  > *"Mando de Logística y Suministros. Generar reporte de inventario del almacén de insumos filtrando materiales con nivel de stock Normal y Crítico de la categoría Químico y EPP en la Estación Central. Seleccionar las columnas: Código de Insumo, Descripción del Material, Categoría Táctica, Stock Existente, Unidad de Medida y Valor Estimado en Bolivianos. Incluir la suma total del valor valorizado y compilar en Ambos formatos, Excel y PDF."*
* **Columnas Solicitadas:** `Código Insumo`, `Descripción del Material`, `Categoría Táctica`, `Stock Existente`, `Unidad de Medida`, `Valor Estimado (Bs)`.
* **Criterios de Selección:**
  - Cuadrante / Estación: `Central`
  - Estado de Stock: `NORMAL`
* **Fila de Totales:** Activada (`true`) sumando `cantidad` y `valor_estimado_bs`.
* **Formato de Salida:** `Ambos (Excel + PDF)`.
* **Verificación de Salida:**
  1. Seleccionar tabla `Almacén de Insumos`.
  2. Ajustar los criterios de bodega y columnas valorizadas.
  3. Presionar `Compilar Reporte Dinámico`.
  4. **Resultado:** Despliega el inventario valorizado de espumógenos AFFF y trajes HazMat, calcula la sumatoria económica contable en Bolivianos en la fila de totales y provee descargas en ambos formatos.

---

### EJEMPLO 5: Consolidado Operacional para Cierre de Emergencia
* **Instrucción Verbal / Prompt:**
  > *"Comando Departamental de Bomberos Santa Cruz. Generar informe de cierre operacional de siniestros en estado En Combate y Controlado en el Cuadrante Sur y Oeste. Proyectar las columnas: Código, Tipo, Zona, Severidad, Agua Consumida y Espumógeno Utilizado. Totalizar consumo acumulado de agua y espumógeno y generar descarga dual en PDF WeasyPrint y Hoja de Cálculo Excel OpenPyXL."*
* **Columnas Solicitadas:** `Código Incidente`, `Tipo de Emergencia`, `Severidad / Riesgo`, `Dirección / Zona`, `Agua Usada (Litros)`, `Espuma Usada (Litros)`.
* **Criterios de Selección:**
  - Cuadrantes: `SUR` o `OESTE`
  - Estados: `EN_COMBATE` / `CONTROLADO`
* **Fila de Totales:** Activada (`true`) con balance hídrico completo.
* **Formato de Salida:** `Ambos (Excel + PDF)`.
* **Verificación de Salida:**
  1. Ingresar el texto en la caja del `Modo Prompt & Voz`.
  2. Presionar `Generar por Prompt`.
  3. **Resultado:** El motor RAG analiza determinísticamente las entidades solicitadas, compila el informe Markdown estructurado con tablas ASCII, genera el resumen ejecutivo y sintetiza el briefing radial con Edge-TTS para reproducción inmediata.

---

## 4. Matriz de Cobertura de Requisitos de Examen

| Requisito de Examen | Elemento en Frontend | Estado |
| :--- | :--- | :--- |
| **Entrada por Prompt** | Textarea reactiva con placeholder táctico en `Modo Prompt & Voz` | Implementado |
| **Entrada por Audio (Whisper)** | Selector de archivo radial y llamada a pipeline Faster-Whisper ASR | Implementado |
| **Especificación de Columnas** | Lista de checkboxes dinámicos con contador, acciones rápidas y símbolo &Sigma; | Implementado |
| **Criterios de Selección** | Filtros tácticos por Cuadrante, Estado Operativo, Severidad y Término libre | Implementado |
| **Salida en Excel OpenPyXL** | Selector de formato y botón de exportación a `.xlsx` / `.csv` | Implementado |
| **Salida en PDF WeasyPrint** | Selector de formato y botón de exportación a documento de alta fidelidad | Implementado |
| **Fila de Totales Contables** | Switch táctico y renderizado de fila destacada con sumas deterministas | Implementado |
| **Barra de Progreso Táctica** | Indicador de avance 0% a 100% con fases operacionales visibles | Implementado |
| **Conexión a Base de Datos** | Endpoints `/esquemas-tablas` y `/generar-dinamico` con mock fallback determinista | Implementado |

