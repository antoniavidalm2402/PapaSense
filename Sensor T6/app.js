/**
 * PapaSense - Mobile Application Logic
 * Prototipo T-6 de Monitoreo de Humedad de Suelo para Cultivo de Papa (AFC)
 * Caso de Estudio: Papa cv. Désirée en Chile (INIA / FAO / FIA)
 * Industrial Design Project
 */

// Application State
const state = {
  moisture: 72,             // Porcentaje de humedad (0 - 100)
  rawAdc: 480,              // Valor analógico ADC (0 - 1023)
  status: 'OPTIMO',         // 'SECO', 'OPTIMO', 'SATURADO'
  temperature: 18.5,        // Temperatura de suelo estimada (°C)
  prevMoisture: 72,         // Para detección de fluctuaciones
  lastReadingTime: new Date(),
  connectionMode: 'demo',   // 'demo', 'serial', 'direct', 'cloud'
  arduinoUrl: 'http://192.168.4.1/data',
  pollIntervalMs: 5000,
  pollTimer: null,
  isPolling: false,
  soundEnabled: true,

  // Serial Cable Connection State
  serialPort: null,
  serialReader: null,
  serialKeepReading: false,
  isSerialConnected: false,

  // Hardware Autonomy & Solar Energy (Panel Solar 5V 1W + Li-Ion 18650)
  batteryPct: 84,           // Carga de batería actual (%)
  batteryVoltage: 3.98,     // Tensión de celda (V)
  isSolarCharging: true,    // Generación activa vía panel 5V 1W
  solarVoltage: 4.95,       // Tensión fotovoltaica de entrada (V)
  solarCurrentMa: 180,      // Corriente generada (mA)
  batterySoh: 94,           // State of Health / Salud de batería (%)
  batteryCycles: 86,        // Ciclos de carga acumulados

  // Wireless Telemetry & Diagnostics (Bluetooth HC-05)
  btConnected: false,
  maintenanceRequired: false,
  maintenanceReason: '',

  // Agronomic Thresholds for Potato cv. Désirée in Chile (INIA Remehue / Carillanca)
  variety: 'Désirée',
  thresholds: {
    dry: 60,                // < 60% Estrés hídrico y riesgo de sarna común
    saturated: 80,          // > 80% Riesgo de Tizón Tardío (Phytophthora infestans)
    soilType: 'franco'      // 'franco', 'arcilloso', 'arenoso'
  },

  // Fluctuation Alert Tracker
  activeAlert: null,

  // Historical Data Log
  history: []
};

// SVG Circumference for Circular Gauge (r = 66 -> 2 * PI * 66 = ~414.69)
const GAUGE_CIRCUMFERENCE = 414.69;

// Chart.js instance reference
let moistureChart = null;

/**
 * Safe Helper to render Lucide Icons without throwing if offline or loading late
 */
function safeRenderIcons() {
  if (typeof lucide !== 'undefined' && lucide && typeof lucide.createIcons === 'function') {
    try {
      lucide.createIcons();
    } catch (e) {
      console.warn('Lucide icons warning:', e);
    }
  }
}

/**
 * Application Lifecycle Initialization
 */
function initApp() {
  safeRenderIcons();
  checkWebSerialAvailability();
  initHistoricalData();
  initChart();
  updateUI(state.moisture, state.rawAdc, true);
  updateEnergyUI();
  startDemoHeartbeat();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Offline cache registered in HTTP
    });
  }
}

// Execute immediately if DOM already loaded or wait for event
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

/**
 * Initializes a realistic agricultural history curve for the potato plot (cv. Désirée)
 */
function initHistoricalData() {
  try {
    const saved = localStorage.getItem('papasense_history');
    if (saved) {
      state.history = JSON.parse(saved);
      renderLogTable();
      return;
    }
  } catch (e) {
    console.warn('No se pudo leer localStorage:', e);
  }

  // Generate 10 past points for a realistic 24-hour cycle
  const now = Date.now();
  const mockPoints = [
    { offsetH: 22, moisture: 64, note: 'Riego matutino finalizado' },
    { offsetH: 20, moisture: 76, note: 'Infiltración uniforme en caballón' },
    { offsetH: 18, moisture: 78, note: 'Capacidad de campo óptima' },
    { offsetH: 15, moisture: 75, note: 'Radiación solar alta (21°C)' },
    { offsetH: 12, moisture: 72, note: 'Drenaje natural suelo franco' },
    { offsetH: 9,  moisture: 69, note: 'Evapotranspiración normal Désirée' },
    { offsetH: 6,  moisture: 66, note: 'Consumo por tubérculos en llenado' },
    { offsetH: 4,  moisture: 74, note: 'Riego ligero de mantención' },
    { offsetH: 2,  moisture: 73, note: 'Humedad estable en zona radicular' },
    { offsetH: 0,  moisture: 72, note: 'Lectura actual sincronizada' }
  ];

  state.history = mockPoints.map(p => {
    const timestamp = new Date(now - p.offsetH * 3600 * 1000);
    return {
      id: Date.now() + Math.random(),
      timestamp: timestamp.toISOString(),
      moisture: p.moisture,
      status: evaluateStatus(p.moisture),
      note: p.note
    };
  });

  saveHistory();
  renderLogTable();
}

/**
 * Determines agronomic status based on crop thresholds
 */
function evaluateStatus(val) {
  if (val < state.thresholds.dry) {
    return 'SECO';
  } else if (val > state.thresholds.saturated) {
    return 'SATURADO';
  } else {
    return 'OPTIMO';
  }
}

/**
 * Primary UI updater
 */
function updateUI(moistureVal, rawAdc = null, isInitial = false) {
  state.prevMoisture = state.moisture;
  state.moisture = Math.max(0, Math.min(100, Math.round(moistureVal)));
  if (rawAdc !== null) {
    state.rawAdc = rawAdc;
  } else {
    state.rawAdc = Math.round(1023 - (state.moisture / 100) * (1023 - 280));
  }

  state.status = evaluateStatus(state.moisture);
  state.lastReadingTime = new Date();

  // 1. Update Numeric Moisture Display
  const moistureEl = document.getElementById('moistureValue');
  if (moistureEl) {
    moistureEl.textContent = state.moisture;
  }

  // 2. Update Circular Gauge
  const progressRing = document.getElementById('gaugeProgressRing');
  if (progressRing) {
    const offset = GAUGE_CIRCUMFERENCE - (state.moisture / 100) * GAUGE_CIRCUMFERENCE;
    progressRing.style.strokeDashoffset = offset;

    progressRing.classList.remove('text-amber-500', 'text-emerald-500', 'text-sky-500');
    if (state.status === 'SECO') {
      progressRing.classList.add('text-amber-500');
    } else if (state.status === 'OPTIMO') {
      progressRing.classList.add('text-emerald-500');
    } else {
      progressRing.classList.add('text-sky-500');
    }
  }

  // 3. Update Range Pointer
  const rangePointer = document.getElementById('rangePointer');
  if (rangePointer) {
    rangePointer.style.marginLeft = `${state.moisture}%`;
  }

  // 4. Update Status Badge & Hero Glow
  const statusBadge = document.getElementById('statusBadge');
  const statusBadgeText = document.getElementById('statusBadgeText');
  const statusIndicatorDot = document.getElementById('statusIndicatorDot');
  const heroBgGlow = document.getElementById('heroBgGlow');
  const soilTensionText = document.getElementById('soilTensionText');
  const rawAdcText = document.getElementById('rawAdcText');
  const plantVisualIconContainer = document.getElementById('plantVisualIconContainer');

  if (rawAdcText) {
    rawAdcText.textContent = `Humedad en Suelo`;
  }

  if (statusBadge && statusBadgeText && statusIndicatorDot) {
    statusBadge.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border shadow-sm transition-all duration-300 ';
    
    if (state.status === 'SECO') {
      statusBadge.classList.add('bg-amber-100', 'text-amber-900', 'border-amber-300');
      statusIndicatorDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse';
      statusBadgeText.textContent = 'DÉFICIT / SECO';
      if (soilTensionText) soilTensionText.textContent = 'Estrés Hídrico Désirée';
      if (heroBgGlow) heroBgGlow.className = 'absolute -right-16 -top-16 w-52 h-52 rounded-full bg-amber-200/50 blur-3xl pointer-events-none transition-all duration-700';

      if (plantVisualIconContainer) {
        plantVisualIconContainer.className = 'w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-1 text-amber-600 transition-all duration-500 shadow-inner';
        plantVisualIconContainer.innerHTML = '<i data-lucide="sun" class="w-8 h-8"></i>';
      }
    } else if (state.status === 'OPTIMO') {
      statusBadge.classList.add('bg-emerald-100', 'text-emerald-900', 'border-emerald-300');
      statusIndicatorDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
      statusBadgeText.textContent = 'ÓPTIMO';
      if (soilTensionText) soilTensionText.textContent = 'Capacidad de Campo';
      if (heroBgGlow) heroBgGlow.className = 'absolute -right-16 -top-16 w-52 h-52 rounded-full bg-emerald-100/60 blur-3xl pointer-events-none transition-all duration-700';

      if (plantVisualIconContainer) {
        plantVisualIconContainer.className = 'w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-1 text-emerald-600 transition-all duration-500 shadow-inner';
        plantVisualIconContainer.innerHTML = '<i data-lucide="flower-2" class="w-8 h-8"></i>';
      }
    } else {
      // SATURADO
      statusBadge.classList.add('bg-sky-100', 'text-sky-900', 'border-sky-300');
      statusIndicatorDot.className = 'w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse';
      statusBadgeText.textContent = 'SATURADO';
      if (soilTensionText) soilTensionText.textContent = 'Riesgo Tizón / Encharque';
      if (heroBgGlow) heroBgGlow.className = 'absolute -right-16 -top-16 w-52 h-52 rounded-full bg-sky-200/50 blur-3xl pointer-events-none transition-all duration-700';

      if (plantVisualIconContainer) {
        plantVisualIconContainer.className = 'w-14 h-14 rounded-2xl bg-sky-50 flex items-center justify-center mb-1 text-sky-600 transition-all duration-500 shadow-inner';
        plantVisualIconContainer.innerHTML = '<i data-lucide="cloud-rain" class="w-8 h-8"></i>';
      }
    }
  }

  // 5. Update Agronomic Prescriptions with exact time & intensity for cv. Désirée
  updateAgronomicPrescription();

  // 6. Check Fluctuation Anomaly
  if (!isInitial) {
    detectFluctuations(state.prevMoisture, state.moisture);
  }

  // 7. Sync Slider value if in demo
  const slider = document.getElementById('simSlider');
  const sliderDisplay = document.getElementById('sliderValDisplay');
  if (slider && sliderDisplay) {
    slider.value = state.moisture;
    sliderDisplay.textContent = `${state.moisture}%`;
  }

  // Safely re-render icons
  safeRenderIcons();
}

/**
 * Updates Agronomic Recommendations specifically for Potato cv. Désirée (Chile / INIA / FAO)
 * Incorporates exact Irrigation Duration, Intensity (mm/h) and Net Irrigation Layer.
 */
function updateAgronomicPrescription() {
  const card = document.getElementById('recommendationCard');
  const recTitle = document.getElementById('recTitle');
  const recDesc = document.getElementById('recDescription');
  const recIconWrapper = document.getElementById('recIconWrapper');
  const irrigationDuration = document.getElementById('irrigationDuration');
  const irrigationIntensity = document.getElementById('irrigationIntensity');

  if (!card || !recTitle) return;

  if (state.status === 'SECO') {
    card.className = 'rounded-3xl p-5 bg-gradient-to-br from-amber-700 to-amber-950 text-white shadow-lg shadow-amber-950/20 relative overflow-hidden transition-all duration-300 text-center flex flex-col items-center';
    if (recIconWrapper) {
      recIconWrapper.className = 'p-3 rounded-2xl bg-white/10 backdrop-blur-md text-amber-200 my-1';
      recIconWrapper.innerHTML = '<i data-lucide="alert-circle" class="w-7 h-7"></i>';
    }
    
    recTitle.textContent = 'Riego Necesario: Estrés Hídrico en cv. Désirée';
    if (recDesc) {
      recDesc.textContent = `Humedad actual (${state.moisture}%) bajo el umbral crítico (${state.thresholds.dry}%). Según el INIA Chile, el déficit hídrico continuo en la papa Désirée produce agrietamiento de la piel y favorece el ataque de sarna común. Inicie el ciclo de riego.`;
    }
    
    if (irrigationDuration) irrigationDuration.textContent = '1 hora';
    if (irrigationIntensity) irrigationIntensity.textContent = '6-10 L/h';

  } else if (state.status === 'OPTIMO') {
    card.className = 'rounded-3xl p-5 bg-gradient-to-br from-emerald-800 to-brand-950 text-white shadow-lg shadow-emerald-950/20 relative overflow-hidden transition-all duration-300 text-center flex flex-col items-center';
    if (recIconWrapper) {
      recIconWrapper.className = 'p-3 rounded-2xl bg-white/10 backdrop-blur-md text-emerald-300 my-1';
      recIconWrapper.innerHTML = '<i data-lucide="check-circle" class="w-7 h-7"></i>';
    }

    recTitle.textContent = 'Suelo en Capacidad de Campo Óptima';
    if (recDesc) {
      recDesc.textContent = `Humedad (${state.moisture}%) en rango ideal para el desarrollo uniforme de tubérculos cv. Désirée. Mantenga el sistema cerrado para economizar recurso hídrico.`;
    }
    
    if (irrigationDuration) irrigationDuration.textContent = '1 hora (Sugerido)';
    if (irrigationIntensity) irrigationIntensity.textContent = '6-10 L/h';

  } else {
    // SATURADO: Recomendaciones de acción resolutiva
    card.className = 'rounded-3xl p-5 bg-gradient-to-br from-sky-800 to-stone-900 text-white shadow-lg shadow-sky-950/20 relative overflow-hidden transition-all duration-300 text-center flex flex-col items-center';
    if (recIconWrapper) {
      recIconWrapper.className = 'p-3 rounded-2xl bg-white/10 backdrop-blur-md text-sky-200 my-1';
      recIconWrapper.innerHTML = '<i data-lucide="alert-triangle" class="w-7 h-7"></i>';
    }

    recTitle.textContent = 'Suelo Saturado: Alerta de Encharque y Tizón';
    if (recDesc) {
      recDesc.textContent = `Humedad excesiva (${state.moisture}%). Acción resolutiva: Suspenda todo riego de inmediato. Espere 48 a 72 horas sin regar y airee los camellones removiendo levemente la tierra de los costados para facilitar la evaporación del agua retenida y evitar asfixia radicular y tizón tardío.`;
    }

    if (irrigationDuration) irrigationDuration.textContent = '0 min (Suspender)';
    if (irrigationIntensity) irrigationIntensity.textContent = '0 L/h (Drenaje activo)';
  }

  safeRenderIcons();
}

/**
 * Updates UI of Energy Autonomy (5V 1W Solar Panel & Li-Ion Battery)
 */
function updateEnergyUI() {
  const topSolarText = document.getElementById('topSolarText');
  const topSolarDot = document.getElementById('topSolarDot');
  const batteryStatusMini = document.getElementById('batteryStatusMini');

  if (topSolarText) {
    if (state.isSolarCharging) {
      topSolarText.textContent = `☀️ Solar 5V | ${state.batteryPct}% ⚡`;
      if (topSolarDot) topSolarDot.className = 'w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse';
    } else if (state.batteryPct >= 98) {
      topSolarText.textContent = `🔋 Batería 100% | Carga Completa`;
      if (topSolarDot) topSolarDot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500';
    } else {
      topSolarText.textContent = `🌙 Noche | Batería ${state.batteryPct}%`;
      if (topSolarDot) topSolarDot.className = 'w-1.5 h-1.5 rounded-full bg-stone-400';
    }
  }

  if (batteryStatusMini) {
    batteryStatusMini.textContent = `${state.batteryPct}%`;
  }

  const navBatPctText = document.getElementById('navBatPctText');
  const navSolarStatusSubtext = document.getElementById('navSolarStatusSubtext');
  const navBatIconContainer = document.getElementById('navBatIconContainer');

  if (navBatPctText) navBatPctText.textContent = `${state.batteryPct}%`;

  if (navSolarStatusSubtext && navBatIconContainer) {
    if (state.isSolarCharging) {
      navSolarStatusSubtext.textContent = '☀️ Solar 5V';
      navSolarStatusSubtext.className = 'text-[9px] font-bold text-amber-700 truncate leading-tight mt-0.5';
      navBatIconContainer.innerHTML = '<i data-lucide="zap" class="w-3.5 h-3.5 text-amber-500 fill-amber-500"></i>';
    } else if (state.batteryPct >= 98) {
      navSolarStatusSubtext.textContent = '🔋 Cargado';
      navSolarStatusSubtext.className = 'text-[9px] font-bold text-emerald-700 truncate leading-tight mt-0.5';
      navBatIconContainer.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600"></i>';
    } else {
      navSolarStatusSubtext.textContent = '🔋 Batería';
      navSolarStatusSubtext.className = 'text-[9px] font-bold text-stone-600 truncate leading-tight mt-0.5';
      navBatIconContainer.innerHTML = '<i data-lucide="battery" class="w-3.5 h-3.5 text-stone-500"></i>';
    }
  }

  const modalSolarV = document.getElementById('modalSolarV');
  const modalSolarI = document.getElementById('modalSolarI');
  const modalSolarTag = document.getElementById('modalSolarTag');
  const modalBatPctVal = document.getElementById('modalBatPctVal');
  const modalBatBar = document.getElementById('modalBatBar');
  const diagBatteryHealth = document.getElementById('diagBatteryHealth');

  if (modalSolarV) modalSolarV.textContent = `${state.solarVoltage.toFixed(2)} V`;
  if (modalSolarI) modalSolarI.textContent = state.isSolarCharging ? `~${state.solarCurrentMa} mA (0.9 W)` : `0 mA (Sin radiación)`;
  if (modalSolarTag) {
    if (state.isSolarCharging) {
      modalSolarTag.textContent = '☀️ Generación Activa';
      modalSolarTag.className = 'text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300';
    } else {
      modalSolarTag.textContent = '🌙 Noche / Inactivo';
      modalSolarTag.className = 'text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200';
    }
  }

  if (modalBatPctVal) {
    const chargeStr = state.isSolarCharging ? 'Cargando con Panel Solar' : 'Alimentando desde Batería';
    modalBatPctVal.textContent = `${state.batteryPct}% (${chargeStr})`;
  }
  if (modalBatBar) {
    modalBatBar.style.width = `${state.batteryPct}%`;
    modalBatBar.className = state.batteryPct > 40 ? 'h-full bg-emerald-500 transition-all duration-500' : 'h-full bg-amber-500 transition-all duration-500';
    if (state.batteryPct < 20) modalBatBar.className = 'h-full bg-rose-500 transition-all duration-500';
  }

  if (diagBatteryHealth) {
    diagBatteryHealth.textContent = `${state.batterySoh}% (${state.batterySoh >= 75 ? 'Óptimo' : 'Degradada'})`;
    diagBatteryHealth.className = state.batterySoh >= 75 ? 'font-bold text-emerald-600' : 'font-bold text-rose-600';
  }

  const diagBtSignal = document.getElementById('diagBtSignal');
  if (diagBtSignal) {
    if (state.connectionMode === 'bluetooth') {
      diagBtSignal.textContent = 'Conectado (9600 baud)';
      diagBtSignal.className = 'font-bold text-blue-600';
    } else {
      diagBtSignal.textContent = 'En espera / Listo para vincular';
      diagBtSignal.className = 'font-bold text-stone-500';
    }
  }

  checkMaintenanceStatus();
  safeRenderIcons();
}

/**
 * Checks system health and triggers maintenance notifications
 */
function checkMaintenanceStatus() {
  const topMaintBadge = document.getElementById('topMaintBadge');
  const maintBox = document.getElementById('maintenanceAlertBox');
  const maintMsg = document.getElementById('maintenanceAlertMsg');
  const diagMaintBadge = document.getElementById('diagMaintBadge');
  const diagSensorStatus = document.getElementById('diagSensorStatus');

  let requiresMaint = false;
  let reason = '';

  // 1. Análisis de Batería Baja / Degradada y Panel Solar
  if (state.batteryPct < 20 || state.batterySoh < 70) {
    requiresMaint = true;
    reason = 'Batería baja / autonomía reducida: revise las pilas, limpie la superficie del panel solar de polvo o tierra y, de ser necesario, reemplace las pilas 18650.';
  } 
  // 2. Análisis del Sensor FC-28 (lectura saturada permanente o anómala)
  else if (state.rawAdc > 1020 && state.moisture === 0) {
    requiresMaint = true;
    reason = 'Sonda FC-28 desconectada o fuera de tierra. Revise el conexionado de cables en los pines D7 y A0.';
  } else if (state.rawAdc < 150) {
    requiresMaint = true;
    reason = 'Cortocircuito o electrodo en contacto directo. Revise las pistas de la sonda o reemplace la pieza FC-28.';
  }

  state.maintenanceRequired = requiresMaint;
  state.maintenanceReason = reason;

  if (diagSensorStatus) {
    diagSensorStatus.textContent = (state.rawAdc > 1020 || state.rawAdc < 150) ? 'Revisar / Reemplazar' : 'Operativa (Sin sulfatación)';
    diagSensorStatus.className = (state.rawAdc > 1020 || state.rawAdc < 150) ? 'font-bold text-rose-600' : 'font-bold text-emerald-600';
  }

  if (requiresMaint) {
    topMaintBadge?.classList.remove('hidden');
    topMaintBadge?.classList.add('flex');

    if (diagMaintBadge) {
      diagMaintBadge.textContent = 'Mantención Requerida';
      diagMaintBadge.className = 'text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 animate-pulse';
    }

    if (maintBox && maintMsg) {
      maintBox.classList.remove('hidden');
      maintMsg.textContent = reason;
    }
  } else {
    topMaintBadge?.classList.add('hidden');
    topMaintBadge?.classList.remove('flex');

    if (diagMaintBadge) {
      diagMaintBadge.textContent = 'Buen Estado';
      diagMaintBadge.className = 'text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800';
    }

    if (maintBox) {
      maintBox.classList.add('hidden');
    }
  }
}

/**
 * Fluctuation Anomaly Detector
 */
function detectFluctuations(oldVal, newVal) {
  const delta = newVal - oldVal;
  const absDelta = Math.abs(delta);

  if (delta <= -8) {
    showAlertBanner(
      'Alerta: Desecación Brusca en Papa Désirée',
      `La humedad cayó velozmente de ${oldVal}% a ${newVal}% (-${absDelta}%). En suelo franco, revise si hay viento seco o falla de retención en caballón.`,
      'amber'
    );
    playAlertTone();
    addHistoryEntry(newVal, 'Fluctuación negativa abrupta (-' + absDelta + '%)');
  } else if (delta >= 12) {
    showAlertBanner(
      'Aumento Significativo de Humedad',
      `Se detectó un incremento de +${absDelta}% (${oldVal}% → ${newVal}%). ¿Se ejecutó riego o hubo precipitaciones en la zona?`,
      'sky'
    );
    playAlertTone();
    addHistoryEntry(newVal, 'Incremento súbito de humedad (+' + absDelta + '%)');
  } else if (newVal < state.thresholds.dry && oldVal >= state.thresholds.dry) {
    showAlertBanner(
      'Papa Désirée en Estrés Hídrico',
      `El suelo bajó a ${newVal}%. Riesgo de sarna común y pérdida de calibre. Aplique riego de 40 min a 4.5 mm/h.`,
      'amber'
    );
    playAlertTone();
    addHistoryEntry(newVal, 'Transición a estado SECO');
  }
}

/**
 * Shows top notification alert banner
 */
function showAlertBanner(title, msg, tone = 'amber') {
  const banner = document.getElementById('alertBanner');
  const bannerTitle = document.getElementById('alertBannerTitle');
  const bannerMsg = document.getElementById('alertBannerMsg');

  if (!banner) return;

  banner.classList.remove('hidden', 'bg-amber-50', 'border-amber-300', 'text-amber-950', 'bg-emerald-50', 'border-emerald-300', 'text-emerald-950', 'bg-sky-50', 'border-sky-300', 'text-sky-950');
  
  if (tone === 'emerald') {
    banner.classList.add('bg-emerald-50', 'border-emerald-300', 'text-emerald-950');
  } else if (tone === 'sky') {
    banner.classList.add('bg-sky-50', 'border-sky-300', 'text-sky-950');
  } else {
    banner.classList.add('bg-amber-50', 'border-amber-300', 'text-amber-950');
  }

  if (bannerTitle) bannerTitle.textContent = title;
  if (bannerMsg) bannerMsg.textContent = msg;
}

/**
 * Dismisses top notification alert banner
 */
function dismissAlertBanner() {
  const banner = document.getElementById('alertBanner');
  if (banner) {
    banner.classList.add('hidden');
  }
}

/**
 * Web Audio API Acoustic Feedback (Chime)
 */
function playAlertTone() {
  if (!state.soundEnabled) return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (err) {
    console.warn('Audio notice:', err);
  }
}

/**
 * Chart.js Setup and Realtime Updates
 */
function initChart() {
  const canvas = document.getElementById('moistureChart');
  if (!canvas) return;

  if (typeof Chart === 'undefined') {
    console.warn('Chart.js no está disponible (modo offline).');
    return;
  }

  const ctx = canvas.getContext('2d');

  const labels = state.history.slice(-8).map(h => {
    const d = new Date(h.timestamp);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  });

  const values = state.history.slice(-8).map(h => h.moisture);

  const gradient = ctx.createLinearGradient(0, 0, 0, 160);
  gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
  gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

  moistureChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Humedad (%)',
          data: values,
          borderColor: '#10b981',
          borderWidth: 2.5,
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#10b981',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1c1917',
          titleFont: { family: 'Plus Jakarta Sans', size: 11 },
          bodyFont: { family: 'Plus Jakarta Sans', size: 12, weight: 'bold' },
          padding: 8,
          cornerRadius: 10,
          callbacks: {
            label: function(context) {
              return ` ${context.parsed.y}% Humedad cv. Désirée`;
            }
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)',
            drawBorder: false
          },
          ticks: {
            stepSize: 20,
            font: { family: 'Plus Jakarta Sans', size: 10, weight: 'bold' },
            color: '#a8a29e',
            callback: function(v) { return v + '%'; }
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            font: { family: 'Plus Jakarta Sans', size: 10 },
            color: '#a8a29e'
          }
        }
      }
    }
  });
}

/**
 * Pushes new reading into chart and updates table
 */
function recordNewReading(moisture, note = 'Lectura periódica') {
  const newEntry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    moisture: moisture,
    status: evaluateStatus(moisture),
    note: note
  };

  state.history.push(newEntry);
  if (state.history.length > 50) {
    state.history.shift();
  }

  saveHistory();
  renderLogTable();

  if (moistureChart) {
    const timeLabel = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`;
    moistureChart.data.labels.push(timeLabel);
    moistureChart.data.datasets[0].data.push(moisture);

    if (moistureChart.data.labels.length > 10) {
      moistureChart.data.labels.shift();
      moistureChart.data.datasets[0].data.shift();
    }
    moistureChart.update('none');
  }
}

function addHistoryEntry(moisture, note) {
  recordNewReading(moisture, note);
}

function saveHistory() {
  try {
    localStorage.setItem('papasense_history', JSON.stringify(state.history));
  } catch (e) {
    console.warn('Storage unavailable', e);
  }
}

/**
 * Renders the recent log list
 */
function renderLogTable() {
  const container = document.getElementById('logListContainer');
  const modalContainer = document.getElementById('modalLogListContainer');
  const totalCountEl = document.getElementById('totalLogsCount');

  if (totalCountEl) {
    totalCountEl.textContent = state.history.length;
  }

  const latestEntries = [...state.history].reverse().slice(0, 8);
  const allEntriesReversed = [...state.history].reverse();

  const generateRowHtml = (item) => {
    const date = new Date(item.timestamp);
    const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    let statusClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (item.status === 'SECO') statusClass = 'bg-amber-50 text-amber-700 border-amber-200';
    if (item.status === 'SATURADO') statusClass = 'bg-sky-50 text-sky-700 border-sky-200';

    return `
      <div class="flex items-center justify-between p-2 rounded-xl bg-stone-50/70 border border-stone-100 hover:bg-stone-50 transition text-xs">
        <div class="flex items-center gap-2">
          <span class="font-mono text-[10px] text-stone-400 font-semibold">${timeStr}</span>
          <span class="font-bold text-stone-800">${item.moisture}%</span>
          <span class="text-[10px] text-stone-500 truncate max-w-[140px]">${item.note || ''}</span>
        </div>
        <span class="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${statusClass}">
          ${item.status}
        </span>
      </div>
    `;
  };

  if (container) {
    container.innerHTML = latestEntries.map(generateRowHtml).join('');
  }

  if (modalContainer) {
    modalContainer.innerHTML = allEntriesReversed.map(generateRowHtml).join('');
  }
}

/**
 * Simulates gentle natural soil humidity breathing in Demo Mode
 */
function startDemoHeartbeat() {
  setInterval(() => {
    // Si el usuario conectó un Arduino real por cable o Bluetooth, no sobreescribir con valores aleatorios simulados
    if (state.connectionMode === 'demo' && !state.isSerialConnected) {
      const jitter = (Math.random() - 0.5) * 1.2;
      const newMoisture = Math.round(Math.max(10, Math.min(95, state.moisture + jitter)));
      if (newMoisture !== state.moisture) {
        updateUI(newMoisture, null, false);
      }
    }
  }, 4000);
}

/**
 * Demo Mode Action: Set simulated moisture value
 */
function setSimulatedMoisture(val) {
  updateUI(val);
  recordNewReading(val, `Simulación manual: ${val}%`);
}

/**
 * Demo Mode Action: Slider input
 */
function onSliderChange(val) {
  updateUI(parseInt(val, 10));
}

/**
 * Demo Mode Action: Simulate sudden rapid drop
 */
function simulateRapidDrop() {
  const target = Math.max(25, state.moisture - 24);
  updateUI(target);
  recordNewReading(target, 'Evento simulado: Desecación súbita');
}

/**
 * Demo Mode Action: Simulate sudden rain or irrigation
 */
function simulateRainSurge() {
  const target = Math.min(96, state.moisture + 28);
  updateUI(target);
  recordNewReading(target, 'Evento simulado: Lluvia intensa');
}

/**
 * Demo Mode Action: Simulate Solar Charging State (Sun vs Night)
 */
function simulateSolarState(isSun) {
  state.isSolarCharging = isSun;
  if (isSun) {
    state.solarVoltage = 4.95;
    state.solarCurrentMa = 180;
    state.batteryPct = Math.min(100, state.batteryPct + 5);
    showAlertBanner('Generación Solar Activa', 'El panel de 5V 1W está suministrando 4.95V (~180mA) al circuito de carga TP4056.', 'emerald');
  } else {
    state.solarVoltage = 0.4;
    state.solarCurrentMa = 0;
    state.batteryPct = Math.max(10, state.batteryPct - 2);
    showAlertBanner('Modo Noche Activado', 'El prototipo está operando de manera autónoma con su batería Li-Ion 18650.', 'amber');
  }
  updateEnergyUI();
}

/**
 * Demo Mode Action: Simulate Battery Degradation (Maintenance Alert)
 */
function simulateBatteryDegradation() {
  state.batterySoh = 58;
  state.batteryPct = 14;
  updateEnergyUI();
  showAlertBanner(
    '⚠️ MANTENCIÓN: Batería Degradada (SOH 58%)',
    'La celda de litio 18650 presenta degradación prematura. Se requiere reemplazo de celda o limpieza de la superficie del panel solar.',
    'amber'
  );
  playAlertTone();
}

/**
 * Demo Mode Action: Simulate Bluetooth Disconnection Issue (Maintenance Alert)
 */
function simulateBluetoothIssue() {
  state.btConnected = false;
  showAlertBanner(
    '⚠️ ALERTA: Conexión Bluetooth Interrumpida',
    'Se perdió el enlace inalámbrico con el módulo HC-05 del prototipo. Verifique el alcance o emparejamiento.',
    'amber'
  );
  playAlertTone();
}

/**
 * User records an irrigation event
 */
function recordIrrigationAction() {
  const current = state.moisture;
  const simulatedPostIrrigation = Math.min(80, current + 20);
  updateUI(simulatedPostIrrigation);
  recordNewReading(simulatedPostIrrigation, 'Riego aplicado (cv. Désirée 40 min)');
  showAlertBanner(
    'Riego Registrado con Éxito',
    `Se ha contabilizado el riego en el historial. Humedad proyectada: ${simulatedPostIrrigation}% (Lámina neta: 3.0 mm).`,
    'emerald'
  );
  playAlertTone();
}

/**
 * Smooth scroll to INIA Guide section
 */
function scrollToGuiaInia() {
  const section = document.getElementById('guiaIniaSection');
  if (section) {
    section.scrollIntoView({ behavior: 'smooth' });
    const details = section.querySelector('details');
    if (details) details.open = true;
    section.classList.add('ring-2', 'ring-brand-500');
    setTimeout(() => section.classList.remove('ring-2', 'ring-brand-500'), 1200);
  }
}

/**
 * Bottom Navigation Active Tab Handler
 */
function setActiveTab(tab) {
  if (tab === 'monitor') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const hero = document.getElementById('heroCard');
    if (hero) {
      hero.classList.add('ring-2', 'ring-brand-500');
      setTimeout(() => hero.classList.remove('ring-2', 'ring-brand-500'), 1000);
    }
  }
}

/**
 * Filter time range for graph
 */
function setTimeRange(range) {
  document.getElementById('btnRange6h')?.classList.remove('bg-white', 'shadow-xs', 'text-stone-900');
  document.getElementById('btnRange24h')?.classList.remove('bg-white', 'shadow-xs', 'text-stone-900');
  document.getElementById('btnRange7d')?.classList.remove('bg-white', 'shadow-xs', 'text-stone-900');

  const activeBtn = document.getElementById(`btnRange${range}`);
  if (activeBtn) {
    activeBtn.classList.add('bg-white', 'shadow-xs', 'text-stone-900');
  }

  if (moistureChart) {
    let count = 6;
    if (range === '24h') count = 12;
    if (range === '7d') count = 20;

    const slice = state.history.slice(-count);
    moistureChart.data.labels = slice.map(h => {
      const d = new Date(h.timestamp);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    });
    moistureChart.data.datasets[0].data = slice.map(h => h.moisture);
    moistureChart.update();
  }
}

/**
 * Export history as CSV
 */
function exportHistoryCSV() {
  if (state.history.length === 0) {
    alert('No hay registros acumulados para exportar.');
    return;
  }

  let csv = 'ID,Fecha_Hora,Variedad,Humedad_Porcentaje,Estado_Cultivo,Notas\n';
  state.history.forEach(row => {
    csv += `"${row.id}","${row.timestamp}","Papa Désirée",${row.moisture},"${row.status}","${row.note || ''}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `PapaSense_Desiree_Humedad_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Modal Management
 */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

/**
 * Adjust thresholds depending on soil texture (INIA Chile / Agricultural Science)
 */
function updateSoilTextureThresholds(soil) {
  state.thresholds.soilType = soil;
  const dryInp = document.getElementById('dryThresholdInput');
  const satInp = document.getElementById('satThresholdInput');

  if (soil === 'arenoso') {
    state.thresholds.dry = 55;
    state.thresholds.saturated = 75;
  } else if (soil === 'arcilloso') {
    state.thresholds.dry = 65;
    state.thresholds.saturated = 85;
  } else {
    // Franco / Trumao (Default in Southern Chile)
    state.thresholds.dry = 60;
    state.thresholds.saturated = 80;
  }

  if (dryInp) dryInp.value = state.thresholds.dry;
  if (satInp) satInp.value = state.thresholds.saturated;
}

function saveAgronomicSettings() {
  const dryInp = document.getElementById('dryThresholdInput');
  const satInp = document.getElementById('satThresholdInput');
  const soundInp = document.getElementById('soundToggle');

  if (dryInp) state.thresholds.dry = parseInt(dryInp.value, 10);
  if (satInp) state.thresholds.saturated = parseInt(satInp.value, 10);
  if (soundInp) state.soundEnabled = soundInp.checked;

  closeModal('settingsModal');
  updateUI(state.moisture, state.rawAdc);
  showAlertBanner('Parámetros Actualizados', `Umbrales Désirée: Seco < ${state.thresholds.dry}%, Saturado > ${state.thresholds.saturated}%.`, 'emerald');
}

/**
 * Arduino Bluetooth HC-05 & USB Cable Serial Connection Management
 */
function checkWebSerialAvailability() {
  const badge = document.getElementById('serialSupportBadge');
  const isAndroid = typeof window.AndroidBluetooth !== 'undefined' && window.AndroidBluetooth !== null;
  const hasSerial = ('serial' in navigator);
  const hasBluetooth = ('bluetooth' in navigator);

  if (isAndroid) {
    if (badge) {
      badge.textContent = 'Android App (HC-05 Listo)';
      badge.className = 'text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800';
    }
  } else if (hasSerial || hasBluetooth) {
    if (badge) {
      badge.textContent = 'Bluetooth / Serial Listo';
      badge.className = 'text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800';
    }
  } else {
    if (badge) {
      badge.textContent = 'Usar Chrome / Edge';
      badge.className = 'text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800';
    }
  }
}

async function connectSerialOrBluetooth(isBluetoothMode = false) {
  const statusText = document.getElementById('serialStatusText');
  const btnText = document.getElementById('btnSerialText');
  const connStatusDot = document.getElementById('connStatusDot');
  const connStatusText = document.getElementById('connStatusText');
  const diagBtSignal = document.getElementById('diagBtSignal');

  // Soporte nativo para la APK de Android (vía JavascriptInterface AndroidBluetooth)
  if (typeof window.AndroidBluetooth !== 'undefined' && window.AndroidBluetooth !== null) {
    if (isBluetoothMode) {
      if (statusText) statusText.textContent = 'Abriendo selector Bluetooth Android...';
      try {
        window.AndroidBluetooth.connectBluetooth();
      } catch (err) {
        console.warn('Error llamando a AndroidBluetooth:', err);
      }
      return;
    }
  }

  if (!('serial' in navigator)) {
    const msg = 'Tu navegador no tiene activada la API Web Serial.\n\nPor favor, abre la aplicación en Google Chrome o Microsoft Edge en tu computadora (o navegador compatible en Android). Si abres el archivo localmente como file:///, asegúrate de permitir la conexión de dispositivos.';
    alert(msg);
    if (statusText) statusText.textContent = 'Navegador no compatible (usa Chrome/Edge)';
    return;
  }

  try {
    if (statusText) {
      statusText.textContent = isBluetoothMode ? 'Buscando puerto Bluetooth HC-05...' : 'Seleccione el puerto COM de su Arduino...';
    }

    // Solicitar permiso de puerto serie al usuario
    state.serialPort = await navigator.serial.requestPort();

    // Abrir a 9600 baudios (estándar de Arduino UNO y HC-05)
    await state.serialPort.open({ 
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none'
    });

    state.isSerialConnected = true;
    state.connectionMode = isBluetoothMode ? 'bluetooth' : 'serial';
    state.serialKeepReading = true;

    if (btnText) btnText.textContent = 'Desconectar';
    if (statusText) {
      statusText.textContent = `Conectado en tiempo real (${isBluetoothMode ? 'Bluetooth HC-05' : 'Cable USB'} - 9600 baud)`;
      statusText.className = 'font-bold text-emerald-600';
    }
    if (connStatusDot) {
      connStatusDot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
    }
    if (connStatusText) {
      connStatusText.textContent = isBluetoothMode ? 'Bluetooth HC-05 OK' : 'USB Cable OK';
    }
    if (diagBtSignal) {
      diagBtSignal.textContent = isBluetoothMode ? 'Vinculado y Recibiendo' : 'Operativo (Vía USB)';
      diagBtSignal.className = 'font-bold text-emerald-600';
    }

    showAlertBanner(
      'Dispositivo Conectado en Tiempo Real',
      `Recibiendo lecturas del sensor y batería cada 1.5s vía ${isBluetoothMode ? 'Bluetooth HC-05' : 'Cable USB'}.`,
      'emerald'
    );

    // Iniciar loop de lectura continua tolerante
    readSerialStream();

  } catch (err) {
    console.warn('Error al conectar puerto serie:', err);
    if (statusText) {
      statusText.textContent = 'Error de conexión: ' + (err.message || 'Cancelado');
      statusText.className = 'font-bold text-rose-600';
    }
    state.isSerialConnected = false;
  }
}

async function handleBluetoothButtonClick() {
  if (state.isSerialConnected) {
    await disconnectSerialCable();
  } else {
    const mode = document.getElementById('connModeSelect')?.value || 'bluetooth';
    await connectSerialOrBluetooth(mode === 'bluetooth');
  }
}

async function readSerialStream() {
  // Lectura directa desde port.readable con TextDecoder manual
  // Más compatible que TextDecoderStream + pipeTo en todos los navegadores
  const decoder = new TextDecoder('utf-8');
  let reader = null;
  let lineBuffer = '';

  try {
    // Obtener reader directamente del stream readable del puerto
    reader = state.serialPort.readable.getReader();
    state.serialReader = reader;

    while (state.serialKeepReading) {
      const { value, done } = await reader.read();
      if (done) {
        console.log('[PapaSense] Stream de serie finalizado.');
        break;
      }
      if (value && value.length > 0) {
        // value es un Uint8Array — decodificar a texto
        lineBuffer += decoder.decode(value, { stream: true });

        // Separar líneas completas (Arduino envía \r\n con println)
        const parts = lineBuffer.split('\n');
        lineBuffer = parts.pop(); // El último fragmento puede estar incompleto

        for (let line of parts) {
          // Limpiar \r y espacios sobrantes
          line = line.replace(/\r/g, '').trim();
          if (line.length > 0) {
            parseSerialLine(line);
          }
        }
      }
    }
  } catch (error) {
    if (state.serialKeepReading) {
      console.warn('[PapaSense] Error en lectura de serie:', error);
      // Intentar mostrar error en UI
      const statusText = document.getElementById('serialStatusText');
      if (statusText) {
        statusText.textContent = 'Error de lectura: ' + (error.message || 'conexión interrumpida');
        statusText.className = 'font-bold text-rose-600';
      }
    }
  } finally {
    if (reader) {
      try { reader.cancel(); } catch (e) {}
      try { reader.releaseLock(); } catch (e) {}
    }
    state.serialReader = null;
    if (state.isSerialConnected) {
      // Si el stream cayó inesperadamente, actualizar estado
      state.isSerialConnected = false;
      state.connectionMode = 'demo';
      const btnText = document.getElementById('btnSerialText');
      if (btnText) btnText.textContent = 'Conectar HC-05';
    }
  }
}

function parseSerialLine(rawLine) {
  if (!rawLine) return;
  console.log('[Serie Recibido]:', rawLine);

  // 1. Extraer JSON si está presente en la línea (incluso si tiene texto antes o después)
  const jsonStart = rawLine.indexOf('{');
  const jsonEnd = rawLine.lastIndexOf('}');
  
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    const jsonSubstring = rawLine.substring(jsonStart, jsonEnd + 1);
    try {
      const data = JSON.parse(jsonSubstring);
      if (typeof data.moisture !== 'undefined') {
        const moist = Math.max(0, Math.min(100, Math.round(Number(data.moisture))));
        const rawAdc = (typeof data.raw !== 'undefined') ? Number(data.raw) : null;
        
        updateUI(moist, rawAdc);
        
        if (typeof data.battery !== 'undefined') {
          state.batteryPct = Math.max(0, Math.min(100, Math.round(Number(data.battery))));
        }
        if (typeof data.charging !== 'undefined') {
          state.isSolarCharging = Boolean(data.charging);
        }
        if (typeof data.solar_v !== 'undefined') {
          state.solarVoltage = Number(data.solar_v);
        }
        if (typeof data.soh !== 'undefined') {
          state.batterySoh = Number(data.soh);
        }

        updateEnergyUI();
        recordNewReading(moist, `Lectura en vivo (${state.connectionMode === 'bluetooth' ? 'Bluetooth' : 'USB'})`);

        // Indicador visual de recepción
        const statusText = document.getElementById('serialStatusText');
        if (statusText) {
          statusText.textContent = `En vivo: Humedad ${moist}% | Batería ${state.batteryPct}%`;
          statusText.className = 'font-bold text-emerald-600';
        }
        return;
      }
    } catch (e) {
      console.warn('Error al parsear JSON recibido:', e);
    }
  }

  // 2. Respaldo ultra-tolerante para texto plano (ej: "Humedad: 72%", "Valor crudo A0: 480 -> Humedad: 72%", "Hum: 72%")
  const lineLower = rawLine.toLowerCase();
  if (lineLower.includes('hum') || lineLower.includes('moist')) {
    const moistMatch = rawLine.match(/(?:humedad|hum|moisture)[:=\s]*(\d+)/i);
    const rawMatch = rawLine.match(/(?:crudo|raw|adc|a0)[:=\s]*(\d+)/i);
    const batMatch = rawLine.match(/(?:bat|bateria|battery)[:=\s]*(\d+)/i);
    
    if (moistMatch) {
      const moist = Math.max(0, Math.min(100, parseInt(moistMatch[1], 10)));
      const rawVal = rawMatch ? parseInt(rawMatch[1], 10) : null;
      
      updateUI(moist, rawVal);
      if (batMatch) {
        state.batteryPct = Math.max(0, Math.min(100, parseInt(batMatch[1], 10)));
      }
      updateEnergyUI();
      recordNewReading(moist, `Lectura en vivo (${state.connectionMode === 'bluetooth' ? 'Bluetooth' : 'USB'})`);

      const statusText = document.getElementById('serialStatusText');
      if (statusText) {
        statusText.textContent = `En vivo: Humedad ${moist}% | Batería ${state.batteryPct}%`;
        statusText.className = 'font-bold text-emerald-600';
      }
      return;
    }
  }
}

async function disconnectSerialCable() {
  // Señalizar al loop de lectura que debe terminar
  state.serialKeepReading = false;

  const statusText = document.getElementById('serialStatusText');
  const btnText = document.getElementById('btnSerialText');
  const connStatusDot = document.getElementById('connStatusDot');
  const connStatusText = document.getElementById('connStatusText');
  const diagBtSignal = document.getElementById('diagBtSignal');

  try {
    // Si corre en la app nativa de Android, ordenar desconexión
    if (typeof window.AndroidBluetooth !== 'undefined' && window.AndroidBluetooth !== null) {
      try { window.AndroidBluetooth.disconnectBluetooth(); } catch (e) {}
    }
    // 1. Cancelar el reader activo (libera el lock sobre readable)
    if (state.serialReader) {
      try { await state.serialReader.cancel(); } catch (e) {}
      try { state.serialReader.releaseLock(); } catch (e) {}
      state.serialReader = null;
    }
    // 2. Cerrar el puerto físico
    if (state.serialPort) {
      try { await state.serialPort.close(); } catch (e) {}
      state.serialPort = null;
    }
  } catch (e) {
    console.warn('[PapaSense] Error al desconectar puerto:', e);
  }

  state.isSerialConnected = false;
  state.connectionMode = 'demo';

  if (btnText) btnText.textContent = 'Conectar HC-05';
  if (statusText) {
    statusText.textContent = 'Desconectado — modo demostración activo';
    statusText.className = 'font-bold text-stone-500';
  }
  if (connStatusDot) connStatusDot.className = 'w-2 h-2 rounded-full bg-amber-500';
  if (connStatusText) connStatusText.textContent = 'Demo';
  if (diagBtSignal) {
    diagBtSignal.textContent = 'Sin señal';
    diagBtSignal.className = 'font-bold text-stone-500';
  }

  showAlertBanner('Dispositivo Desconectado', 'La app volvió al modo demostración con datos simulados.', 'amber');
}

/**
 * Android Native APK Bridge Callbacks
 * Estas funciones son invocadas directamente desde Java / Kotlin en la app nativa de Android
 */
window.onAndroidBluetoothConnected = function(deviceName, macAddress) {
  state.isSerialConnected = true;
  state.connectionMode = 'bluetooth';

  const btnText = document.getElementById('btnSerialText');
  const statusText = document.getElementById('serialStatusText');
  const connStatusDot = document.getElementById('connStatusDot');
  const connStatusText = document.getElementById('connStatusText');
  const diagBtSignal = document.getElementById('diagBtSignal');

  if (btnText) btnText.textContent = 'Desconectar';
  if (statusText) {
    statusText.textContent = `En vivo: ${deviceName || 'HC-05'} (${macAddress || 'Bluetooth'})`;
    statusText.className = 'font-bold text-emerald-600';
  }
  if (connStatusDot) connStatusDot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
  if (connStatusText) connStatusText.textContent = 'Bluetooth OK';
  if (diagBtSignal) {
    diagBtSignal.textContent = 'Vinculado y Recibiendo';
    diagBtSignal.className = 'font-bold text-emerald-600';
  }

  showAlertBanner('Bluetooth Conectado', `Vinculado con ${deviceName || 'HC-05'} en Android. Recibiendo datos.`, 'emerald');
};

window.onAndroidBluetoothDisconnected = function(reason) {
  state.isSerialConnected = false;
  state.connectionMode = 'demo';

  const btnText = document.getElementById('btnSerialText');
  const statusText = document.getElementById('serialStatusText');
  const connStatusDot = document.getElementById('connStatusDot');
  const connStatusText = document.getElementById('connStatusText');
  const diagBtSignal = document.getElementById('diagBtSignal');

  if (btnText) btnText.textContent = 'Conectar HC-05';
  if (statusText) {
    statusText.textContent = reason ? `Desconectado: ${reason}` : 'Desconectado (Modo Demo)';
    statusText.className = 'font-bold text-stone-500';
  }
  if (connStatusDot) connStatusDot.className = 'w-2 h-2 rounded-full bg-amber-500';
  if (connStatusText) connStatusText.textContent = 'Demo';
  if (diagBtSignal) {
    diagBtSignal.textContent = 'Sin señal';
    diagBtSignal.className = 'font-bold text-stone-500';
  }
};

window.onAndroidBluetoothData = function(line) {
  parseSerialLine(line);
};

/**
 * Arduino Connection Mode Settings (Demo / Bluetooth HC-05 / Serial)
 */
function toggleConnMode(val) {
  state.connectionMode = val;
  const connStatusDot = document.getElementById('connStatusDot');
  const connStatusText = document.getElementById('connStatusText');
  const connActionTitle = document.getElementById('connActionTitle');
  const connActionSub = document.getElementById('connActionSub');
  const btnSerialText = document.getElementById('btnSerialText');

  if (val === 'bluetooth') {
    if (connStatusDot) connStatusDot.className = 'w-2 h-2 rounded-full bg-blue-500';
    if (connStatusText) connStatusText.textContent = 'Bluetooth HC-05';
    if (connActionTitle) connActionTitle.textContent = 'Vincular Bluetooth HC-05';
    if (connActionSub) connActionSub.textContent = 'Seleccione el puerto COM asignado al HC-05';
    if (btnSerialText && !state.isSerialConnected) btnSerialText.textContent = 'Conectar HC-05';
  } else if (val === 'serial') {
    if (connStatusDot) connStatusDot.className = 'w-2 h-2 rounded-full bg-emerald-500';
    if (connStatusText) connStatusText.textContent = 'Cable USB';
    if (connActionTitle) connActionTitle.textContent = 'Conectar Cable USB';
    if (connActionSub) connActionSub.textContent = 'Seleccione el puerto COM de su Arduino Uno';
    if (btnSerialText && !state.isSerialConnected) btnSerialText.textContent = 'Conectar Cable';
  } else {
    if (connStatusDot) connStatusDot.className = 'w-2 h-2 rounded-full bg-amber-500';
    if (connStatusText) connStatusText.textContent = 'Demo';
    if (connActionTitle) connActionTitle.textContent = 'Modo Simulación';
    if (connActionSub) connActionSub.textContent = 'Valores aleatorios generados en pantalla';
    if (btnSerialText && !state.isSerialConnected) btnSerialText.textContent = 'Activar Demo';
  }
}

function saveConnectionSettings() {
  const mode = document.getElementById('connModeSelect')?.value || 'demo';
  toggleConnMode(mode);
  closeModal('deviceModal');
  showAlertBanner('Configuración Guardada', `Modo de comunicación seleccionado: ${mode === 'bluetooth' ? 'Bluetooth HC-05' : (mode === 'serial' ? 'USB Serial' : 'Demostración')}.`, 'emerald');
}
