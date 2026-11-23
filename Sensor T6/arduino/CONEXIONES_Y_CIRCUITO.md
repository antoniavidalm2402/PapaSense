# Guía de Conexión y Circuito: Dispositivo Experimental T-6 (Versión Bluetooth HC-05)

Este documento detalla el conexionado de pines validado en el prototipo físico con **Arduino UNO + Sensor FC-28 + LCD 16x2 I2C + Módulo Bluetooth HC-05 + Batería Li-Ion y Panel Solar**.

---

## 1. Diagrama de Pines en Arduino UNO R3

### A. Módulo Bluetooth Serial HC-05 (Comunicación Inalámbrica con la App)
| Pin HC-05 | Conectar a Arduino UNO | Función / Observación |
| :--- | :--- | :--- |
| **VCC** | **5V** | Alimentación del módulo |
| **GND** | **GND** | Tierra común |
| **TXD** | **Pin Digital 12 (D12)** | SoftwareSerial RX de Arduino (recibe datos del HC-05 a 9600 baud) |
| **RXD** | **Pin Digital 13 (D13)** | SoftwareSerial TX de Arduino (transmite datos hacia el HC-05) |

> **Nota de conexión:**
> En Arduino UNO, el módulo HC-05 está configurado en `SoftwareSerial btSerial(12, 13);` (Pin 12 RX <- HC-05 TXD; Pin 13 TX -> HC-05 RXD).

---

### B. Sensor de Humedad de Suelo FC-28
| Pin FC-28 | Conectar a Arduino UNO | Función |
| :--- | :--- | :--- |
| **VCC** | **5V** (o Pin Digital 7) | Alimentación del sensor |
| **GND** | **GND** | Tierra común |
| **A0 (Señal)** | **Pin Analógico A0** | Entrada analógica (Calibración: Aire ~700, Agua ~280) |

---

### C. Pantalla LCD 16x2 con Interfaz I2C (PCF8574)
| Pin LCD I2C | Conectar a Arduino UNO | Función |
| :--- | :--- | :--- |
| **GND** | **GND** | Tierra común |
| **VCC** | **5V** | Alimentación lógica y luz de fondo |
| **SDA** | **Pin Analógico A4** | Bus de datos I2C |
| **SCL** | **Pin Analógico A5** | Bus de reloj I2C |

---

### D. Pulsador de Activación (Opcional - Reactivación de LCD)
| Conexión | Conectar a Arduino UNO | Función |
| :--- | :--- | :--- |
| **Pulsador** | **Pin Digital 2 (D2) a GND** | Botón para encender/reactivar pantalla LCD (usa resistencia `INPUT_PULLUP` interna) |

---

### E. Monitoreo de Batería Li-Ion 18650
| Señal | Conectar a Arduino UNO | Función |
| :--- | :--- | :--- |
| **Divisor Batería** | **Pin Analógico A1** | Divisor 100kΩ / 100kΩ a tierra conectado al polo positivo de la celda 18650 (si no está conectado, el sistema asume 84% nominal de respaldo) |

---

## 2. Comportamiento de la Pantalla LCD 16x2

1. **Al encender / reiniciar:**
   ```
   +----------------+
   |  PapaSense T6  |
   |  Iniciando...  |
   +----------------+
   ```
2. **Durante el funcionamiento continuo:**
   - **Línea 0:** Nivel de batería:
     ```text
     Bateria:  84%
     ```
   - **Línea 1:** Humedad, porcentaje y estado:
     ```text
     Hum:  72% OPTIMO
     ```
     *(o `Hum:  45% SECO` / `Hum:  92% SATURADO`)*.

---

## 3. Conexión Inalámbrica con la App Web

1. Empareja el módulo **HC-05** en tu computador vía Bluetooth (PIN de fábrica habitual: `1234` o `0000`).
2. Ejecuta `abrir_app.bat` para iniciar el servidor local en `http://localhost:8080/index.html`.
3. En la app: haz clic en el ícono de **Dispositivo** (arriba a la derecha).
4. Selecciona **"Inalámbrico: Bluetooth HC-05"** y presiona **"Conectar Ahora"**.
5. Selecciona el puerto serie COM asociado a tu HC-05 en el diálogo de Google Chrome / Edge.
6. ¡Listo! La app se sincronizará automáticamente cada 1 segundo con los datos reales del sensor.
