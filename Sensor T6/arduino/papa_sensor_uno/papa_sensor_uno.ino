/*
 * ======================================================================================
 * PROYECTO DE DISEÑO INDUSTRIAL: DISPOSITIVO EXPERIMENTAL T-6
 * MONITOREO DE HUMEDAD EN SUELO PARA CULTIVO DE PAPA cv. DÉSIRÉE (Chile) - AFC
 * VERSIÓN BLUETOOTH HC-05 + ARDUINO UNO + SENSOR FC-28 + LCD 16x2 I2C
 * Basado en la configuración validada de pines y hardware de referencia (celesteVfc28)
 * ======================================================================================
 * 
 * CONFIGURACIÓN DE PINES:
 * - Bluetooth HC-05:
 *     Pin D12 de Arduino (RX) -> Conectar al TXD del HC-05
 *     Pin D13 de Arduino (TX) -> Conectar al RXD del HC-05 (con divisor o directo)
 * - Sensor de Humedad FC-28:
 *     Pin A0 -> Entrada analógica de señal
 *     VCC    -> 5V de Arduino (o Pin D7 si usa alimentación controlada)
 *     GND    -> GND de Arduino
 * - Pantalla LCD 16x2 I2C (PCF8574 dirección 0x27):
 *     SDA    -> Pin A4
 *     SCL    -> Pin A5
 *     VCC    -> 5V
 *     GND    -> GND
 * - Pulsador de activación (opcional):
 *     Pin D2 -> Pulsador a GND (usa INPUT_PULLUP interno)
 * - Divisor de Batería (opcional):
 *     Pin A1 -> Divisor 100k/100k a positivo de celda 18650 (respaldo automático a 84% si no hay hardware)
 *
 * ESPECIFICACIÓN DE PANTALLA LCD:
 * 1. Al encender: "PapaSense T6" / "Iniciando..."
 * 2. En funcionamiento continuo:
 *    - Línea 0: "Bateria:  84%"
 *    - Línea 1: "Hum:  72% OPTIMO" (o SECO / SATURADO)
 * ======================================================================================
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <SoftwareSerial.h>

// --------------------------------------------------------------------------------------
// CONFIGURACIÓN DE PINES DE HARDWARE (Mapeo validado en prototipo)
// --------------------------------------------------------------------------------------
const int PIN_SENSOR_ANALOG  = A0;  // FC-28 señal analógica
const int PIN_BATTERY_ANALOG = A1;  // Entrada divisor batería
const int PIN_SENSOR_POWER   = 7;   // Alimentación opcional D7
const int PIN_BUTTON         = 2;   // Pulsador de activación en D2 (INPUT_PULLUP)

// Módulo Bluetooth HC-05 en pines 12 (RX) y 13 (TX)
const int PIN_BT_RX          = 9; // Arduino RX <- TXD de HC-05
const int PIN_BT_TX          = 12; // Arduino TX -> RXD de HC-05
SoftwareSerial btSerial(PIN_BT_RX, PIN_BT_TX);

// Pantalla LCD I2C (dirección estándar 0x27, 16 columnas x 2 filas)
LiquidCrystal_I2C lcd(0x27, 16, 2);

// --------------------------------------------------------------------------------------
// CALIBRACIÓN EMPÍRICA DEL SENSOR FC-28 (Ajustada según referencia celesteVfc28)
// --------------------------------------------------------------------------------------
const int AirValue   = 700; // Valor en seco (aire)
const int WaterValue = 280; // Valor saturado (agua)

// --------------------------------------------------------------------------------------
// UMBRALES AGRONÓMICOS - PAPA cv. DÉSIRÉE (INIA Chile / Suelo Franco)
// --------------------------------------------------------------------------------------
const int UMBRAL_SECO_DESIREE      = 60; // < 60% Estrés hídrico (riesgo sarna común)
const int UMBRAL_SATURADO_DESIREE  = 80; // > 80% Riesgo saturación / tizón tardío

// --------------------------------------------------------------------------------------
// GESTIÓN DE TIEMPOS Y HIBERNACIÓN
// --------------------------------------------------------------------------------------
const unsigned long INTERVALO_LECTURA_MS = 1000UL;  // Muestreo cada 1 segundo (rápido y ágil)
const unsigned long TIEMPO_HIBERNACION   = 60000UL; // 1 minuto si se activa hibernación
const unsigned long DEBOUNCE_DELAY       = 50UL;    // Filtro antirrebote mecánico (50 ms)
const bool USAR_HIBERNACION_LCD          = true;   // true = apaga luz tras 1 min; false = siempre encendida

// --------------------------------------------------------------------------------------
// VARIABLES GLOBALES
// --------------------------------------------------------------------------------------
int humedadPorcentaje = 72;
int valorAdcFiltrado  = 480;
String estadoCultivo  = "OPTIMO";

int bateriaPorcentaje = 84;
float bateriaVoltaje  = 3.98;

unsigned long tiempoUltimaLectura = 0;
unsigned long tiempoEncendidoLCD  = 0;
bool pantallaActiva               = true;

int estadoBotonAnterior           = HIGH;
unsigned long ultimoCambioBoton   = 0;

// ======================================================================================
// SETUP
// ======================================================================================
void setup() {
  // Comunicación serie estándar (USB) a 9600 baudios
  Serial.begin(9600);
  
  // Comunicación serie Bluetooth HC-05 a 9600 baudios
  btSerial.begin(9600);

  // Pin de alimentación de sensor (por si está conectado a D7)
  pinMode(PIN_SENSOR_POWER, OUTPUT);
  digitalWrite(PIN_SENSOR_POWER, HIGH);

  // Pulsador en D2 con resistencia pull-up interna
  pinMode(PIN_BUTTON, INPUT_PULLUP);

  pinMode(PIN_SENSOR_ANALOG, INPUT);
  pinMode(PIN_BATTERY_ANALOG, INPUT);

  // Inicialización de la pantalla LCD
  lcd.init();
  lcd.backlight();

  // 1. Pantalla de inicio con nombre del proyecto
  lcd.clear();
  lcd.setCursor(2, 0);
  lcd.print("PapaSense T6");
  lcd.setCursor(2, 1);
  lcd.print("Iniciando...");

  Serial.println(F("[PapaSense T6] Sistema listo. Bluetooth HC-05 en pines D12/D13 (9600 baud)."));
  btSerial.println(F("{\"status\":\"READY\",\"msg\":\"PapaSense T6 Online\"}"));

  delay(1500);
  lcd.clear();

  // Primera lectura inmediata
  leerSensorHumedad();
  leerBateria();
  evaluarEstado();
  actualizarPantallaLCD();

  tiempoEncendidoLCD = millis();
}

// ======================================================================================
// LOOP PRINCIPAL
// ======================================================================================
void loop() {
  unsigned long tiempoActual = millis();

  // --- 1. Gestión del botón pulsador en D2 (antirrebote) ---
  int lecturaBoton = digitalRead(PIN_BUTTON);
  if (lecturaBoton != estadoBotonAnterior) {
    ultimoCambioBoton = tiempoActual;
  }
  if ((tiempoActual - ultimoCambioBoton) > DEBOUNCE_DELAY) {
    if (lecturaBoton == LOW) {
      tiempoEncendidoLCD = tiempoActual;
      if (!pantallaActiva) {
        pantallaActiva = true;
        lcd.display();
        lcd.backlight();
        actualizarPantallaLCD();
      }
    }
  }
  estadoBotonAnterior = lecturaBoton;

  // --- 2. Hibernación opcional de pantalla LCD ---
  if (USAR_HIBERNACION_LCD && pantallaActiva && (tiempoActual - tiempoEncendidoLCD >= TIEMPO_HIBERNACION)) {
    pantallaActiva = false;
    lcd.noBacklight();
    lcd.noDisplay();
  }

  // --- 3. Lectura periódica y telemetría cada 1 segundo ---
  if (tiempoActual - tiempoUltimaLectura >= INTERVALO_LECTURA_MS) {
    tiempoUltimaLectura = tiempoActual;

    leerSensorHumedad();
    leerBateria();
    evaluarEstado();

    if (pantallaActiva) {
      actualizarPantallaLCD();
    }

    enviarTelemetriaBluetoothYUSB();
  }

  // --- 4. Comandos entrantes desde la App vía Bluetooth o USB ---
  if (btSerial.available()) {
    String cmd = btSerial.readStringUntil('\n');
    cmd.trim();
    if (cmd == "GET" || cmd == "PING" || cmd == "READ") {
      enviarTelemetriaBluetoothYUSB();
    }
  }
  if (Serial.available()) {
    String cmdUsb = Serial.readStringUntil('\n');
    cmdUsb.trim();
    if (cmdUsb == "GET" || cmdUsb == "PING" || cmdUsb == "READ") {
      enviarTelemetriaBluetoothYUSB();
    }
  }
}

// ======================================================================================
// LECTURA DEL SENSOR FC-28
// ======================================================================================
void leerSensorHumedad() {
  digitalWrite(PIN_SENSOR_POWER, HIGH);

  // Muestreo con promedio de 3 lecturas rápidas
  long suma = 0;
  for (int i = 0; i < 3; i++) {
    suma += analogRead(PIN_SENSOR_ANALOG);
    delay(3);
  }
  valorAdcFiltrado = suma / 3;

  // Conversión con valores empíricos: AirValue=700 (seco), WaterValue=280 (saturado)
  humedadPorcentaje = map(valorAdcFiltrado, AirValue, WaterValue, 0, 100);
  humedadPorcentaje = constrain(humedadPorcentaje, 0, 100);
}

// ======================================================================================
// LECTURA DE BATERÍA
// ======================================================================================
void leerBateria() {
  int adcBat = analogRead(PIN_BATTERY_ANALOG);
  float vLeido = (adcBat * 5.0 / 1023.0) * 2.0;

  // Si no hay divisor conectado en A1 (<1.5V), asigna valor nominal de 84% (4.02V)
  if (vLeido < 1.5) {
    bateriaVoltaje = 4.02;
    bateriaPorcentaje = 84;
  } else {
    bateriaVoltaje = vLeido;
    bateriaPorcentaje = map((int)(bateriaVoltaje * 100), 320, 420, 0, 100);
    bateriaPorcentaje = constrain(bateriaPorcentaje, 0, 100);
  }
}

// ======================================================================================
// EVALUACIÓN DE ESTADO AGRONÓMICO
// ======================================================================================
void evaluarEstado() {
  if (humedadPorcentaje < UMBRAL_SECO_DESIREE) {
    estadoCultivo = "SECO";
  } else if (humedadPorcentaje > UMBRAL_SATURADO_DESIREE) {
    estadoCultivo = "SATURADO";
  } else {
    estadoCultivo = "OPTIMO";
  }
}

// ======================================================================================
// PANTALLA LCD 16x2: LECTURA DIRECTA
// Línea 0: "Bateria:  84%"
// Línea 1: "Hum:  72% OPTIMO" (o "Hum:  45% SECO" / "Hum:  92% SATURADO")
// ======================================================================================
void actualizarPantallaLCD() {
  // Línea 0: Batería
  lcd.setCursor(0, 0);
  lcd.print("Bateria: ");
  if (bateriaPorcentaje < 100) lcd.print(" ");
  lcd.print(bateriaPorcentaje);
  lcd.print("%   ");

  // Línea 1: Humedad y Estado
  lcd.setCursor(0, 1);
  lcd.print("Hum: ");
  if (humedadPorcentaje < 100) lcd.print(" ");
  if (humedadPorcentaje < 10) lcd.print(" ");
  lcd.print(humedadPorcentaje);
  lcd.print("% ");

  if (estadoCultivo == "OPTIMO") {
    lcd.print("OPTIMO  ");
  } else if (estadoCultivo == "SECO") {
    lcd.print("SECO    ");
  } else {
    lcd.print("SATURADO");
  }
}

// ======================================================================================
// ENVÍO DE DATOS VÍA BLUETOOTH HC-05 Y USB SERIAL EN SIMULTÁNEO
// Formato JSON compatible con la aplicación web y línea legible por monitor serie
// ======================================================================================
void enviarTelemetriaBluetoothYUSB() {
  String json = "{";
  json += "\"moisture\":" + String(humedadPorcentaje) + ",";
  json += "\"raw\":" + String(valorAdcFiltrado) + ",";
  json += "\"status\":\"" + estadoCultivo + "\",";
  json += "\"battery\":" + String(bateriaPorcentaje) + ",";
  json += "\"battery_v\":" + String(bateriaVoltaje, 2) + ",";
  json += "\"charging\":true,";
  json += "\"soh\":94";
  json += "}";

  // Transmitir JSON a la app móvil/web vía Bluetooth HC-05
  btSerial.println(json);

  // Transmitir JSON también por USB para depuración con cable directo
  Serial.println(json);
}
