# PapaSense T-6: Sistema de Monitoreo de Humedad para Cultivo de Papa (AFC)

Prototipo y dispositivo experimental de diseño industrial enfocado en optimizar el uso del agua en la **Agricultura Familiar Campesina (AFC)** mediante sensórica de bajo costo y una interfaz móvil accesible.

---

## 📁 Estructura del Proyecto

```
Sensor T6/
│
├── index.html                 # Aplicación móvil (PWA) interactiva
├── styles.css                 # Estilos, efectos y animaciones
├── app.js                     # Lógica de la app, comunicación Bluetooth HC-05 y simulador
├── manifest.json              # Manifiesto PWA para instalación en celular
├── sw.js                      # Service Worker para funcionamiento offline en campo
├── abrir_app.bat              # Lanzador rápido de un clic para Windows
│
├── icons/
│   └── icon.svg               # Icono de la aplicación (brote + gota)
│
├── arduino/
│   ├── papa_sensor_uno.ino    # Código principal para Arduino UNO + FC-28 + LCD I2C + Bluetooth HC-05
│   └── CONEXIONES_Y_CIRCUITO.md # Diagrama de pines, esquema y técnica anti-corrosión
│
└── docs/
    ├── CRITERIOS_AGRONOMICOS_PAPA.md # Requerimientos hídricos de la papa y fisiología
    └── MANUAL_DE_USUARIO_Y_DISENO.md # Justificación de diseño industrial y guía de uso
```

---

## 🚀 Inicio Rápido

1. **Abrir la Aplicación en tu Celular o Computador:**
   - Haz doble clic en `abrir_app.bat` o abre directamente [`index.html`](file:///c:/Users/tonit/Downloads/Antigravity%20proyectos/Sensor%20T6/index.html) en tu navegador.
   - En computador, presiona `F12` y luego `Ctrl + Shift + M` para visualizarla en formato smartphone.
   - En celular, puedes guardarla en la pantalla de inicio para usarla como aplicación nativa instalada.

2. **Probar el Simulador Interactivo:**
   - En la parte inferior de la pantalla encontrarás el **Panel de Prueba / Prototipo**.
   - Haz clic en los botones de estado (`Seco`, `Alerta`, `Óptimo`, `Saturado`) o mueve el deslizador para ver cómo reacciona en tiempo real la semaforización, las recomendaciones de riego y el gráfico histórico.

3. **Subir el Código a Arduino:**
   - Sigue los pasos detallados en [`docs/MANUAL_DE_USUARIO_Y_DISENO.md`](file:///c:/Users/tonit/Downloads/Antigravity%20proyectos/Sensor%20T6/docs/MANUAL_DE_USUARIO_Y_DISENO.md).
   - Revisa las conexiones físicas en [`arduino/CONEXIONES_Y_CIRCUITO.md`](file:///c:/Users/tonit/Downloads/Antigravity%20proyectos/Sensor%20T6/arduino/CONEXIONES_Y_CIRCUITO.md).
