# Guía: Cómo descargar e instalar PapaSense T-6 en un Celular Android

Esta guía detalla las formas seguras y directas de utilizar la aplicación en un teléfono Android, conservando la versión web existente y garantizando el funcionamiento del **Modo Demostración** y la **Conexión Bluetooth HC-05**.

---

## 📌 Comparación de Opciones en Android

| Característica | Opción 1: Aplicación Web Progresiva (PWA) | Opción 2: Archivo Instalador (.APK Nativo) |
| :--- | :--- | :--- |
| **Instalación** | Directa desde Chrome (sin compilar nada) | Instalando el archivo `.apk` en el celular |
| **Modo Demostración** | ✅ Sí (100% funcional) | ✅ Sí (100% funcional) |
| **Conexión Bluetooth HC-05** | ⚠️ Requiere cable USB-OTG (los navegadores móviles no admiten Bluetooth Serial SPP) | ✅ Sí (Conexión inalámbrica nativa directa al HC-05) |
| **Tiempo de configuración** | Inmediato (1 minuto) | Requiere compilar con Android Studio o GitHub Actions |

---

## 🚀 Opción 1: Instalación Inmediata como PWA (Sin compilar nada)

La aplicación ya cuenta con un archivo `manifest.json` y `sw.js` (Service Worker) para instalarse como una app nativa en Android.

### Pasos:
1. En tu computador, ejecuta [`abrir_app.bat`](file:///c:/Users/tonit/Downloads/Antigravity%20proyectos/Sensor%20T6/abrir_app.bat).
2. La consola te mostrará dos enlaces:
   - Acceso en tu PC: `http://localhost:8080/index.html`
   - **Acceso desde tu Celular:** `http://192.168.X.X:8080/index.html` (deben estar conectados a la misma red Wi-Fi).
3. En tu teléfono Android, abre **Google Chrome** e ingresa la dirección `http://192.168.X.X:8080/index.html`.
4. Pulsa los **3 puntos** del menú de Chrome (arriba a la derecha).
5. Selecciona **"Instalar aplicación"** o **"Añadir a pantalla principal"**.
6. Se creará el ícono de **PapaSense** en el menú de tu teléfono. Funcionará en pantalla completa e incluso sin conexión a internet.

---

## 📦 Opción 2: Compilación y Descarga del APK Nativo (Con Bluetooth HC-05)

Para conectar el módulo HC-05 de forma inalámbrica desde Android, se requiere una aplicación empaquetada (`.apk`) debido a que Android solo permite comunicación serie RFCOMM/SPP a través de su API nativa de Bluetooth.

Ya hemos creado todo el proyecto Android listo en la carpeta [`android/`](file:///c:/Users/tonit/Downloads/Antigravity%20proyectos/Sensor%20T6/android).

### Método A: Compilar con Android Studio (Recomendado si tienes Android Studio)
1. Descarga e instala [Android Studio](https://developer.android.com/studio) en tu computador (gratuito).
2. Abre Android Studio y selecciona **Open** (Abrir proyecto).
3. Selecciona la carpeta [`android`](file:///c:/Users/tonit/Downloads/Antigravity%20proyectos/Sensor%20T6/android).
4. Espera a que termine la sincronización de Gradle.
5. En la barra superior, ve a **Build** ➔ **Build Bundle(s) / APK(s)** ➔ **Build APK(s)**.
6. Al finalizar, aparecerá una notificación abajo a la derecha: haz clic en **"locate"**.
7. Copia el archivo `app-debug.apk` a tu teléfono (por WhatsApp, Telegram, correo o cable USB).
8. En tu celular, abre el archivo y pulsa **Instalar**.

### Método B: Compilación Automática y Gratuita en la Nube con GitHub
Si tienes una cuenta de GitHub:
1. Sube esta carpeta a un repositorio en GitHub.
2. La carpeta ya incluye el flujo automatizado [`.github/workflows/build-apk.yml`](file:///c:/Users/tonit/Downloads/Antigravity%20proyectos/Sensor%20T6/.github/workflows/build-apk.yml).
3. Ve a la pestaña **Actions** en tu repositorio de GitHub.
4. El sistema compilará el archivo APK automáticamente en minutos.
5. Descarga el archivo generado directamente a tu teléfono e instálalo.

---

## 🔄 ¿Cómo sincronizar cambios del código web con la App de Android?

Si modificas el diseño o la lógica en `index.html` o `app.js`, solo debes hacer doble clic en:
[`actualizar_app_android.bat`](file:///c:/Users/tonit/Downloads/Antigravity%20proyectos/Sensor%20T6/actualizar_app_android.bat)

Esto actualizará automáticamente los archivos dentro de la carpeta de Android (`android/app/src/main/assets/`) para que tu próxima compilación tenga siempre la última versión.
