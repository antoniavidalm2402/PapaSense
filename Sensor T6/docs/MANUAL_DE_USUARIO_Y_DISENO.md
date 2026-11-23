# Manual de Usuario y Justificación de Diseño Industrial: PapaSense T-6

## 1. Fundamentos de Diseño Industrial e Interacción (UI/UX)

El dispositivo experimental y la aplicación móvil **PapaSense** fueron concebidos bajo principios de diseño centrado en el usuario (DCU) aplicados al contexto de la **Agricultura Familiar Campesina (AFC)**:

### A. Reducción de la Carga Cognitiva
- **Semaforización Directa:** El agricultor no necesita interpretar curvas complejas de potencial mátrico o resistividad eléctrica. La app sintetiza el estado en tres categorías inequívocas: **SECO (Ámbar)**, **ÓPTIMO (Verde Esmeralda)** y **SATURADO (Azul)**.
- **Acción Prescriptiva:** Más allá de un número, la interfaz siempre entrega una acción clara: *"Regar 35 min"*, *"Mantener sin riego"* o *"Suspender y drenar"*.

### B. Accesibilidad Visual y Entorno Rural
- **Lectura a Pleno Sol:** Tipografía de gran escala (*Plus Jakarta Sans* y *Space Grotesk*), alto contraste lumínico (fondo neutro con componentes destacados) y ausencia de tipografías condensadas o delgadas que se pierden con el reflejo solar.
- **Doble Retroalimentación (Visual + Sonora):** En campo, el usuario suele tener las manos ocupadas con herramientas o tierra. Las alertas críticas incorporan un timbre melódico sintético generado con la API de audio del navegador.

### C. Reducción de la Brecha Tecnológica
- **Lenguaje Empático y Cercano:** Evita términos técnicos intimidantes, utilizando frases comprensibles para la comunidad campesina.
- **Uso Sin Internet (Offline-First):** En zonas rurales sin señal celular (4G/3G), el dispositivo genera su propia red local WiFi (**SoftAP**). El celular se conecta directamente al prototipo en el predio sin gastar datos ni requerir conexión a la nube.

---

## 2. Cómo Probar la Aplicación en Celular o Computadora

La aplicación móvil es una **Progressive Web App (PWA)** autónoma, lista para ejecutarse inmediatamente:

### Opción A: Abrir Directamente en el Navegador
1. Haz doble clic en el archivo [`index.html`](file:///c:/Users/tonit/Downloads/Antigravity%20proyectos/Sensor%20T6/index.html) para abrirlo en Google Chrome, Microsoft Edge, Safari o Firefox.
2. Si deseas simular la pantalla exacta de un celular:
   - Presiona `F12` en el teclado para abrir las herramientas de desarrollador.
   - Presiona `Ctrl + Shift + M` (modo vista móvil) y selecciona un dispositivo como *iPhone 14* o *Samsung Galaxy*.

### Opción B: Instalar en Celular como Aplicación Nativa (PWA)
1. Conecta tu celular a la misma red WiFi o transfiere la carpeta del proyecto.
2. Abre la app en Chrome o Safari móvil.
3. Toca en el menú de opciones del navegador y selecciona **"Agregar a la pantalla de inicio"** (o "Instalar aplicación").
4. La aplicación se instalará con su propio icono de papa/brote, funcionando a pantalla completa y sin barra de direcciones.

---

## 3. Panel de Pruebas y Simulación (Para Evaluación de Jurados)

Para presentaciones académicas o evaluaciones de diseño donde el circuito físico no esté encendido, la aplicación incluye un **Panel de Prueba Integrado** al final de la pantalla:
- **Botón "Seco (32%)":** Transiciona la interfaz a estado de déficit hídrico, activando la sugerencia de riego y la alerta visual ámbar.
- **Botón "Alerta (54%)":** Muestra el inicio del estrés en la planta de papa.
- **Botón "Óptimo (72%)":** Muestra el balance ideal en capacidad de campo.
- **Botón "Saturado (92%)":** Alerta sobre riesgo fitosanitario de Tizón Tardío y asfixia.
- **Control Deslizante (Slider):** Permite calibrar en tiempo real de 0% a 100%.
- **Simular Desecación Brusca / Lluvia Intensa:** Demuestra la detección de anomalías y fluctuaciones rápidas.

---

## 4. Pasos para Subir el Código al Arduino Uno

1. Abre el software **Arduino IDE**.
2. Instala las librerías necesarias desde el gestor de bibliotecas (`Herramientas -> Administrar Bibliotecas`):
   - `LiquidCrystal I2C` (por Frank de Brabander o Marco Schwartz).
3. Conecta tu placa **Arduino UNO** a la computadora con el cable USB.
4. Abre el archivo [`arduino/papa_sensor_uno.ino`](file:///c:/Users/tonit/Downloads/Antigravity%20proyectos/Sensor%20T6/arduino/papa_sensor_uno.ino).
5. Selecciona en el menú:
   - **Placa:** *Arduino Uno*
   - **Puerto:** El puerto COM correspondiente (ej: *COM3*, *COM4*).
6. Presiona el botón **Subir** (flecha hacia la derecha).
7. Una vez subido, abre el **Monitor Serie** (9600 baudios) para visualizar las lecturas de depuración.
8. En la pantalla LCD 16x2 verás inmediatamente el porcentaje de humedad y la recomendación agronómica.
