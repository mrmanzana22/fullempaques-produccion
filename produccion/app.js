// FULLEMPAQUES Producción - App Principal
// Conexión con Supabase y lógica de la aplicación

// ========== CONFIGURACIÓN ==========
const SUPABASE_URL = 'https://sjfhtopclyxbwzhslhwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqZmh0b3BjbHl4Ynd6aHNsaHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NzEyMTcsImV4cCI6MjA3NjU0NzIxN30.OWaCsPD2khL9PDMG8ZwbQkJNHe4U8bwx595cWWIxlp8';

// Inicializar Supabase
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========== ESTADO GLOBAL ==========
let currentOperator = null;
let currentOT = null;
let currentOTEstacion = null;
let timerInterval = null;
let timerStartTime = null;
let timerPausedTime = 0;
let tiempoEnPausas = 0; // Tiempo acumulado en pausas (ms)
let pausaStartTime = null; // Cuando inició la pausa actual
let isOnline = navigator.onLine;

// ========== ELEMENTOS DOM ==========
const screens = {
  login: document.getElementById('login-screen'),
  otList: document.getElementById('ot-list-screen'),
  work: document.getElementById('work-screen')
};

const modals = {
  pause: document.getElementById('modal-pause'),
  complete: document.getElementById('modal-complete'),
  entrada: document.getElementById('modal-entrada')
};

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', () => {
  initPinKeypad();
  initEventListeners();
  initServiceWorker();
  initConnectionStatus();

  // Verificar si hay sesión guardada
  const savedOperator = localStorage.getItem('currentOperator');
  if (savedOperator) {
    currentOperator = JSON.parse(savedOperator);
    showScreen('otList');
    loadOTList();
    updateOperatorDisplay();
  }
});

// ========== SERVICE WORKER ==========
async function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('sw.js');
      console.log('[App] Service Worker registrado:', registration.scope);

      // Escuchar mensajes del SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'sync-complete') {
          showToast('Datos sincronizados correctamente', 'success');
          loadOTList();
        }
      });
    } catch (error) {
      console.error('[App] Error registrando Service Worker:', error);
    }
  }
}

// ========== CONEXIÓN ==========
function initConnectionStatus() {
  updateConnectionStatus();

  window.addEventListener('online', () => {
    isOnline = true;
    updateConnectionStatus();
    // Intentar sincronizar datos pendientes
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage('check-sync');
    }
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    updateConnectionStatus();
    showToast('Sin conexión - Los cambios se guardarán localmente', 'warning');
  });
}

function updateConnectionStatus() {
  const statusElements = document.querySelectorAll('.connection-status');
  statusElements.forEach(el => {
    if (isOnline) {
      el.classList.remove('offline');
      el.classList.add('online');
      el.querySelector('span:last-child').textContent = 'Conectado';
    } else {
      el.classList.remove('online');
      el.classList.add('offline');
      el.querySelector('span:last-child').textContent = 'Sin conexión';
    }
  });
}

// ========== PIN LOGIN ==========
let pinValue = '';

function initPinKeypad() {
  const keys = document.querySelectorAll('.pin-key');
  keys.forEach(key => {
    key.addEventListener('click', () => handlePinKey(key.dataset.value));
  });
}

function handlePinKey(value) {
  if (value === 'delete') {
    pinValue = pinValue.slice(0, -1);
  } else if (pinValue.length < 4) {
    pinValue += value;
  }

  updatePinDisplay();

  if (pinValue.length === 4) {
    attemptLogin(pinValue);
  }
}

function updatePinDisplay() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((dot, index) => {
    dot.classList.toggle('filled', index < pinValue.length);
  });
}

async function attemptLogin(pin) {
  const errorElement = document.getElementById('login-error');
  errorElement.textContent = '';

  console.log('[App] Intentando login con PIN:', pin);

  try {
    const { data, error } = await db
      .from('operadores')
      .select('*')
      .eq('pin_hash', pin)
      .eq('activo', true)
      .single();

    console.log('[App] Respuesta Supabase:', { data, error });

    if (error || !data) {
      console.log('[App] Login fallido - error:', error);
      errorElement.textContent = 'PIN incorrecto';
      pinValue = '';
      updatePinDisplay();
      return;
    }

    // Login exitoso
    currentOperator = data;
    localStorage.setItem('currentOperator', JSON.stringify(data));
    pinValue = '';
    updatePinDisplay();
    showScreen('otList');
    loadOTList();
    updateOperatorDisplay();

  } catch (err) {
    console.error('[App] Error en login:', err);
    errorElement.textContent = 'Error de conexión';
    pinValue = '';
    updatePinDisplay();
  }
}

function updateOperatorDisplay() {
  if (!currentOperator) return;

  const initials = currentOperator.nombre.split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  document.querySelectorAll('.operator-avatar').forEach(el => {
    el.textContent = initials;
  });

  document.querySelectorAll('[id$="operator-name"]').forEach(el => {
    el.textContent = currentOperator.nombre;
  });
}

// ========== NAVEGACIÓN ==========
function showScreen(screenName) {
  Object.values(screens).forEach(screen => screen.classList.add('hidden'));
  screens[screenName].classList.remove('hidden');
}

function initEventListeners() {
  // Logout
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-back-to-list').addEventListener('click', () => {
    stopTimer();
    showScreen('otList');
    loadOTList();
  });

  // Filtros OT
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadOTList(tab.dataset.filter);
    });
  });

  // Modales
  document.getElementById('btn-cancel-pause').addEventListener('click', () => closeModal('pause'));
  document.getElementById('btn-confirm-pause').addEventListener('click', confirmPause);
  document.getElementById('btn-cancel-complete').addEventListener('click', () => closeModal('complete'));
  document.getElementById('btn-confirm-complete').addEventListener('click', handleCompleteWithAlert);
  document.getElementById('btn-cancel-entrada').addEventListener('click', () => closeModal('entrada'));
  document.getElementById('btn-confirm-entrada').addEventListener('click', confirmEntrada);

}

function logout() {
  stopTimer();
  currentOperator = null;
  currentOT = null;
  currentOTEstacion = null;
  localStorage.removeItem('currentOperator');
  showScreen('login');
}

// ========== LISTA DE OT ==========
async function loadOTList(filter = 'todas') {
  const container = document.getElementById('ot-list-container');
  container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    let query = db
      .from('ordenes_trabajo')
      .select(`
        *,
        ot_estaciones (
          id,
          estacion_id,
          estado,
          cantidad_entrada,
          cantidad_salida,
          estaciones (nombre, orden_flujo, tipo_estacion)
        )
      `)
      .order('created_at', { ascending: false });

    if (filter !== 'todas') {
      query = query.eq('estado', filter);
    }

    const { data, error } = await query;

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 50px; color: var(--text-secondary);">
          <p style="font-size: 1.2rem;">No hay órdenes de trabajo</p>
        </div>
      `;
      return;
    }

    container.innerHTML = data.map(ot => renderOTCard(ot)).join('');

    // Event delegation - más confiable que adjuntar a cada card
    const cards = container.querySelectorAll('.ot-card');
    console.log('[App] Cards renderizadas:', cards.length);

    // Remover listener anterior si existe y agregar nuevo
    container.onclick = (e) => {
      const card = e.target.closest('.ot-card');
      if (card && card.dataset.otId) {
        console.log('[App] Click detectado en OT:', card.dataset.otId);
        openWorkScreen(card.dataset.otId);
      }
    };

  } catch (err) {
    console.error('[App] Error cargando OTs:', err);
    container.innerHTML = `
      <div style="text-align: center; padding: 50px; color: var(--danger);">
        <p>Error cargando órdenes de trabajo</p>
        <button onclick="loadOTList()" style="margin-top: 15px; padding: 10px 20px; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer;">Reintentar</button>
      </div>
    `;
  }
}

function renderOTCard(ot) {
  const estaciones = ot.ot_estaciones || [];
  const completadas = estaciones.filter(e => e.estado === 'completada').length;
  const progreso = estaciones.length > 0 ? Math.round((completadas / estaciones.length) * 100) : 0;
  const actual = estaciones.find(e => e.estado === 'en_proceso' || e.estado === 'pausada');

  const estadoClass = ot.estado.replace('_', '-');

  return `
    <div class="ot-card" data-ot-id="${ot.id}">
      <div class="ot-card-header">
        <div class="ot-number">${ot.numero_ot}</div>
        <div class="ot-status ${estadoClass}">${formatEstado(ot.estado)}</div>
      </div>
      <div class="ot-cliente">${ot.cliente}</div>
      <div class="ot-producto">${ot.descripcion_producto}</div>
      <div class="ot-progress-container">
        <div class="ot-progress-label">
          <span>Progreso</span>
          <span>${completadas}/${estaciones.length} estaciones</span>
        </div>
        <div class="ot-progress-bar">
          <div class="ot-progress-fill" style="width: ${progreso}%"></div>
        </div>
      </div>
      <div class="ot-stations">
        ${estaciones
          .sort((a, b) => (a.estaciones?.orden_flujo || 0) - (b.estaciones?.orden_flujo || 0))
          .map(e => `
            <span class="station-badge ${e.estado === 'completada' ? 'completed' : e.estado === 'en_proceso' || e.estado === 'pausada' ? 'current' : ''}">
              ${e.estaciones?.nombre || 'Estación'}
            </span>
          `).join('')}
      </div>
    </div>
  `;
}

function formatEstado(estado) {
  const estados = {
    pendiente: 'Pendiente',
    en_proceso: 'En Proceso',
    pausada: 'Pausada',
    completada: 'Completada'
  };
  return estados[estado] || estado;
}

// ========== PANTALLA DE TRABAJO ==========
async function openWorkScreen(otId) {
  try {
    console.log('[App] Abriendo OT:', otId);

    // Cargar OT con estaciones
    const { data: ot, error } = await db
      .from('ordenes_trabajo')
      .select(`
        *,
        ot_estaciones (
          *,
          estaciones (id, nombre, orden_flujo, tipo_estacion)
        )
      `)
      .eq('id', otId)
      .single();

    console.log('[App] OT cargada:', ot);
    console.log('[App] Estaciones:', ot?.ot_estaciones);

    if (error) throw error;

    currentOT = ot;

    // Buscar estación actual del operador o primera pendiente
    const miEstacion = ot.ot_estaciones.find(e =>
      e.operador_id === currentOperator.id &&
      (e.estado === 'en_proceso' || e.estado === 'pausada')
    );

    const estacionPendiente = ot.ot_estaciones
      .sort((a, b) => (a.estaciones?.orden_flujo || 0) - (b.estaciones?.orden_flujo || 0))
      .find(e => e.estado === 'pendiente');

    console.log('[App] Mi estación:', miEstacion);
    console.log('[App] Estación pendiente:', estacionPendiente);

    currentOTEstacion = miEstacion || estacionPendiente;

    if (!currentOTEstacion) {
      showToast('No hay estaciones disponibles en esta OT', 'warning');
      return;
    }

    // Actualizar UI
    updateWorkScreen();
    showScreen('work');

    // Si ya está en proceso, iniciar timer desde donde quedó
    if (currentOTEstacion.estado === 'en_proceso') {
      const inicio = new Date(currentOTEstacion.fecha_inicio);
      timerStartTime = inicio.getTime();
      startTimer();
    } else if (currentOTEstacion.estado === 'pausada') {
      // Calcular tiempo acumulado antes de la pausa
      timerPausedTime = calcularTiempoAcumulado();
      updateTimerDisplay();
    }

  } catch (err) {
    console.error('[App] Error abriendo OT:', err);
    showToast('Error cargando orden de trabajo', 'error');
  }
}

function updateWorkScreen() {
  if (!currentOT || !currentOTEstacion) return;

  document.getElementById('work-ot-number').textContent = currentOT.numero_ot;
  document.getElementById('work-cliente').textContent = currentOT.cliente;
  document.getElementById('work-producto').textContent = currentOT.descripcion_producto;
  document.getElementById('work-estacion').textContent = currentOTEstacion.estaciones?.nombre || 'Estación';

  // Buscar estación anterior
  const estacionesOrdenadas = currentOT.ot_estaciones
    .sort((a, b) => (a.estaciones?.orden_flujo || 0) - (b.estaciones?.orden_flujo || 0));
  const indexActual = estacionesOrdenadas.findIndex(e => e.id === currentOTEstacion.id);
  const anterior = indexActual > 0 ? estacionesOrdenadas[indexActual - 1] : null;

  document.getElementById('work-estacion-anterior').textContent =
    anterior ? anterior.estaciones?.nombre : '-';

  // Verificar tipo de estación (material vs tiempo)
  const tipoEstacion = currentOTEstacion.estaciones?.tipo_estacion || 'material';
  const quantitySection = document.getElementById('quantity-section');

  if (tipoEstacion === 'tiempo') {
    // Estaciones de tiempo (diseño, revisión): ocultar cantidades
    quantitySection.style.display = 'none';
  } else {
    // Estaciones de material: mostrar cantidades
    quantitySection.style.display = 'flex';

    // Cantidades
    document.getElementById('qty-entrada').textContent = currentOTEstacion.cantidad_entrada || 0;
    document.getElementById('qty-salida').textContent = currentOTEstacion.cantidad_salida || 0;
    document.getElementById('qty-merma').textContent = currentOTEstacion.cantidad_merma || 0;

    // Unidad de medida
    const unidad = currentOT.unidad_medida || 'unidades';
    document.getElementById('unidad-entrada').textContent = `(${unidad})`;
    document.getElementById('unidad-salida').textContent = `(${unidad})`;
    document.getElementById('unidad-merma').textContent = `(${unidad})`;
  }

  // Actualizar barra de progreso
  updateProgressBar();

  // Actualizar color de fondo según estado
  updateWorkScreenState();

  // Estado del timer
  updateTimerStatus();
  renderActionButtons();
}

function updateProgressBar() {
  if (!currentOT || !currentOT.ot_estaciones) return;

  const estaciones = currentOT.ot_estaciones;
  const total = estaciones.length;
  const completadas = estaciones.filter(e => e.estado === 'completada').length;
  const actual = estaciones.findIndex(e => e.id === currentOTEstacion.id) + 1;
  const porcentaje = total > 0 ? Math.round((completadas / total) * 100) : 0;

  document.getElementById('progress-text').textContent = `Estación ${actual} de ${total}`;
  document.getElementById('progress-percent').textContent = `${porcentaje}% completado`;
  document.getElementById('progress-fill').style.width = `${porcentaje}%`;
}

function updateWorkScreenState() {
  const workScreenMain = document.getElementById('work-screen-main');
  if (!workScreenMain) return;

  // Remover todas las clases de estado
  workScreenMain.classList.remove('estado-pendiente', 'estado-en-proceso', 'estado-pausado', 'estado-merma-alta');

  // Agregar clase según estado actual
  switch (currentOTEstacion.estado) {
    case 'pendiente':
      workScreenMain.classList.add('estado-pendiente');
      break;
    case 'en_proceso':
      workScreenMain.classList.add('estado-en-proceso');
      break;
    case 'pausada':
      workScreenMain.classList.add('estado-pausado');
      break;
  }
}

function updateTimerStatus() {
  const statusEl = document.getElementById('timer-status');
  const timerEl = document.getElementById('timer-display');

  statusEl.classList.remove('running', 'paused');
  timerEl.classList.remove('running', 'paused');

  switch (currentOTEstacion.estado) {
    case 'pendiente':
      statusEl.textContent = 'Listo para iniciar';
      break;
    case 'en_proceso':
      statusEl.textContent = 'En proceso';
      statusEl.classList.add('running');
      timerEl.classList.add('running');
      break;
    case 'pausada':
      statusEl.textContent = 'Pausada';
      statusEl.classList.add('paused');
      timerEl.classList.add('paused');
      break;
    case 'completada':
      statusEl.textContent = 'Completada';
      break;
  }
}

function renderActionButtons() {
  const container = document.getElementById('action-buttons');

  switch (currentOTEstacion.estado) {
    case 'pendiente':
      container.innerHTML = `
        <button class="btn-action btn-start" onclick="openEntradaModal()">Iniciar</button>
      `;
      break;
    case 'en_proceso':
      container.innerHTML = `
        <button class="btn-action btn-pause" onclick="openPauseModal()">Pausar</button>
        <button class="btn-action btn-complete" onclick="openCompleteModal()">Completar</button>
      `;
      break;
    case 'pausada':
      container.innerHTML = `
        <button class="btn-action btn-resume" onclick="reanudarEstacion()">Reanudar</button>
      `;
      break;
    case 'completada':
      container.innerHTML = `
        <button class="btn-action btn-back" onclick="showScreen('otList'); loadOTList();">Volver a Lista</button>
      `;
      break;
  }
}

// ========== TIMER ==========
function startTimer() {
  if (timerInterval) return;

  timerInterval = setInterval(updateTimerDisplay, 1000);
  updateTimerDisplay();
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimerDisplay() {
  let elapsed;
  let pausasActual = tiempoEnPausas;

  if (currentOTEstacion.estado === 'en_proceso' && timerStartTime) {
    elapsed = Date.now() - timerStartTime + timerPausedTime;
  } else if (currentOTEstacion.estado === 'pausada' && pausaStartTime) {
    elapsed = timerPausedTime;
    pausasActual = tiempoEnPausas + (Date.now() - pausaStartTime);
  } else {
    elapsed = timerPausedTime;
  }

  const hours = Math.floor(elapsed / 3600000);
  const minutes = Math.floor((elapsed % 3600000) / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);

  document.getElementById('timer-display').textContent =
    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  // Actualizar display de eficiencia
  updateEfficiencyDisplay(elapsed, pausasActual);
}

function updateEfficiencyDisplay(tiempoTotal, tiempoPausas) {
  const effDisplay = document.getElementById('efficiency-display');
  if (!effDisplay) return;

  // Mostrar solo si hay tiempo transcurrido
  if (tiempoTotal <= 0 && tiempoPausas <= 0) {
    effDisplay.style.display = 'none';
    return;
  }
  effDisplay.style.display = 'flex';

  const tiempoEfectivo = Math.max(0, tiempoTotal);
  const tiempoTotalConPausas = tiempoEfectivo + tiempoPausas;

  // Formatear tiempos
  const formatTime = (ms) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  document.getElementById('tiempo-efectivo').textContent = formatTime(tiempoEfectivo);
  document.getElementById('tiempo-pausas').textContent = formatTime(tiempoPausas);

  // Calcular eficiencia
  const eficiencia = tiempoTotalConPausas > 0
    ? Math.round((tiempoEfectivo / tiempoTotalConPausas) * 100)
    : 100;

  const eficienciaEl = document.getElementById('porcentaje-eficiencia');
  eficienciaEl.textContent = `${eficiencia}%`;
  eficienciaEl.classList.toggle('low', eficiencia < 70);
}

function calcularTiempoAcumulado() {
  if (!currentOTEstacion.fecha_inicio) return 0;

  // Esto es una simplificación - en producción real
  // deberíamos sumar los intervalos entre pausas
  const inicio = new Date(currentOTEstacion.fecha_inicio).getTime();
  const fin = currentOTEstacion.fecha_fin
    ? new Date(currentOTEstacion.fecha_fin).getTime()
    : Date.now();

  return fin - inicio;
}

// ========== ACCIONES ==========
function openEntradaModal() {
  const tipoEstacion = currentOTEstacion.estaciones?.tipo_estacion || 'material';

  if (tipoEstacion === 'tiempo') {
    // Estaciones de tiempo: iniciar directamente sin pedir cantidad
    iniciarEstacionTiempo();
  } else {
    // Estaciones de material: pedir cantidad de entrada
    document.getElementById('entrada-qty').value = currentOT.cantidad_solicitada || '';
    openModal('entrada');
  }
}

async function confirmEntrada() {
  const cantidad = parseInt(document.getElementById('entrada-qty').value);

  if (!cantidad || cantidad < 1) {
    showToast('Ingresa una cantidad válida', 'error');
    return;
  }

  try {
    const { data, error } = await db.rpc('iniciar_estacion', {
      p_orden_trabajo_id: currentOT.id,
      p_estacion_id: currentOTEstacion.estaciones.id,
      p_operador_id: currentOperator.id,
      p_cantidad_entrada: cantidad
    });

    if (error) throw error;

    closeModal('entrada');
    showToast('Estación iniciada', 'success');

    // Actualizar estado local
    currentOTEstacion.estado = 'en_proceso';
    currentOTEstacion.cantidad_entrada = cantidad;
    currentOTEstacion.fecha_inicio = new Date().toISOString();

    timerStartTime = Date.now();
    timerPausedTime = 0;
    tiempoEnPausas = 0;
    pausaStartTime = null;
    startTimer();
    updateWorkScreen();

  } catch (err) {
    console.error('[App] Error iniciando estación:', err);
    showToast('Error al iniciar estación', 'error');
  }
}

// Iniciar estación de tipo tiempo (sin cantidad de entrada)
async function iniciarEstacionTiempo() {
  try {
    const { data, error } = await db.rpc('iniciar_estacion', {
      p_orden_trabajo_id: currentOT.id,
      p_estacion_id: currentOTEstacion.estaciones.id,
      p_operador_id: currentOperator.id,
      p_cantidad_entrada: 0  // Sin cantidad para estaciones de tiempo
    });

    if (error) throw error;

    showToast('Trabajo iniciado', 'success');

    // Actualizar estado local
    currentOTEstacion.estado = 'en_proceso';
    currentOTEstacion.cantidad_entrada = 0;
    currentOTEstacion.fecha_inicio = new Date().toISOString();

    timerStartTime = Date.now();
    timerPausedTime = 0;
    tiempoEnPausas = 0;
    pausaStartTime = null;
    startTimer();
    updateWorkScreen();

  } catch (err) {
    console.error('[App] Error iniciando estación tiempo:', err);
    showToast('Error al iniciar', 'error');
  }
}

async function openPauseModal() {
  // Cargar motivos de pausa
  try {
    const { data, error } = await db
      .from('motivos_pausa')
      .select('*')
      .eq('activo', true)
      .order('nombre');

    if (error) throw error;

    const container = document.getElementById('pause-options');
    container.innerHTML = data.map(m => `
      <button class="pause-option" data-id="${m.id}">${m.nombre}</button>
    `).join('');

    container.querySelectorAll('.pause-option').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.pause-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    openModal('pause');

  } catch (err) {
    console.error('[App] Error cargando motivos:', err);
    showToast('Error cargando motivos de pausa', 'error');
  }
}

async function confirmPause() {
  const selected = document.querySelector('.pause-option.selected');
  if (!selected) {
    showToast('Selecciona un motivo de pausa', 'error');
    return;
  }

  const motivoId = selected.dataset.id;
  const detalle = document.getElementById('pause-detail').value;

  try {
    const { data, error } = await db.rpc('pausar_estacion', {
      p_ot_estacion_id: currentOTEstacion.id,
      p_motivo_id: motivoId,
      p_operador_id: currentOperator.id,
      p_detalle: detalle || null
    });

    if (error) throw error;

    closeModal('pause');

    // Guardar tiempo acumulado y marcar inicio de pausa
    timerPausedTime = Date.now() - timerStartTime + timerPausedTime;
    timerStartTime = null;
    pausaStartTime = Date.now(); // Iniciar contador de pausa

    currentOTEstacion.estado = 'pausada';
    showToast('Estación pausada', 'warning');
    updateWorkScreen();

    // Mantener timer corriendo para mostrar tiempo de pausa
    startTimer();

  } catch (err) {
    console.error('[App] Error pausando:', err);
    showToast('Error al pausar estación', 'error');
  }
}

async function reanudarEstacion() {
  try {
    const { data, error } = await db.rpc('reanudar_estacion', {
      p_ot_estacion_id: currentOTEstacion.id,
      p_operador_id: currentOperator.id
    });

    if (error) throw error;

    // Acumular tiempo de pausa
    if (pausaStartTime) {
      tiempoEnPausas += Date.now() - pausaStartTime;
      pausaStartTime = null;
    }

    currentOTEstacion.estado = 'en_proceso';
    timerStartTime = Date.now();
    showToast('Estación reanudada', 'success');
    updateWorkScreen();

  } catch (err) {
    console.error('[App] Error reanudando:', err);
    showToast('Error al reanudar estación', 'error');
  }
}

async function openCompleteModal() {
  const tipoEstacion = currentOTEstacion.estaciones?.tipo_estacion || 'material';

  // Resetear campos
  document.getElementById('complete-qty-salida').value = currentOTEstacion.cantidad_entrada || '';
  document.getElementById('complete-qty-merma').value = '0';
  document.getElementById('complete-notes').value = '';
  document.getElementById('complete-obs-merma').value = '';

  // Ocultar campos de motivo inicialmente
  document.getElementById('merma-motivo-container').style.display = 'none';
  document.getElementById('merma-observacion-container').style.display = 'none';

  // Para estaciones de tiempo, ocultar campos de cantidad
  const salidaGroup = document.getElementById('complete-qty-salida').closest('.form-group');
  const mermaCalcContainer = document.getElementById('merma-calc-container');

  if (tipoEstacion === 'tiempo') {
    salidaGroup.style.display = 'none';
    mermaCalcContainer.style.display = 'none';
  } else {
    salidaGroup.style.display = 'block';
  }

  // Cargar motivos de merma
  try {
    const { data: motivos, error } = await db
      .from('motivos_merma')
      .select('*')
      .eq('activo', true)
      .order('nombre');

    if (!error && motivos) {
      const select = document.getElementById('complete-motivo-merma');
      select.innerHTML = '<option value="">Seleccionar motivo...</option>' +
        motivos.map(m => `<option value="${m.id}">${m.nombre}</option>`).join('');
    }
  } catch (err) {
    console.error('[App] Error cargando motivos merma:', err);
  }

  // Calcular merma automáticamente cuando cambia la salida
  const salidaInput = document.getElementById('complete-qty-salida');
  const mermaInput = document.getElementById('complete-qty-merma'); // hidden input
  const mermaDisplay = document.getElementById('complete-qty-merma-display');
  const mermaContainer = document.getElementById('merma-calc-container');
  const mermaEntradaSpan = document.getElementById('merma-entrada');
  const mermaSalidaSpan = document.getElementById('merma-salida');
  const cantidadEntrada = currentOTEstacion.cantidad_entrada || 0;

  // Mostrar la entrada en la fórmula
  mermaEntradaSpan.textContent = cantidadEntrada.toLocaleString();

  salidaInput.oninput = () => {
    const salida = parseInt(salidaInput.value) || 0;
    const merma = Math.max(0, cantidadEntrada - salida);

    // Actualizar valores
    mermaInput.value = merma;
    mermaDisplay.textContent = merma.toLocaleString();
    mermaSalidaSpan.textContent = salida.toLocaleString();

    // Mostrar/ocultar contenedor de merma calculada
    const showMerma = merma > 0;
    mermaContainer.style.display = showMerma ? 'block' : 'none';

    // Agregar clase si merma es alta (>10%)
    const porcentajeMerma = cantidadEntrada > 0 ? (merma / cantidadEntrada) * 100 : 0;
    mermaDisplay.classList.toggle('high', porcentajeMerma > 10);

    // Cambiar estado visual si merma alta
    const workScreenMain = document.getElementById('work-screen-main');
    if (workScreenMain) {
      workScreenMain.classList.toggle('estado-merma-alta', porcentajeMerma > 10);
    }

    // Mostrar/ocultar campos de motivo según merma
    document.getElementById('merma-motivo-container').style.display = showMerma ? 'block' : 'none';
    document.getElementById('merma-observacion-container').style.display = showMerma ? 'block' : 'none';

    // Resetear motivo si no hay merma
    if (!showMerma) {
      document.getElementById('complete-motivo-merma').value = '';
      document.getElementById('complete-obs-merma').value = '';
    }
  };

  // Disparar cálculo inicial
  salidaInput.dispatchEvent(new Event('input'));

  openModal('complete');
}

// Interceptar el botón de completar para mostrar alerta si merma alta
async function handleCompleteWithAlert() {
  const cantidadEntrada = currentOTEstacion.cantidad_entrada || 0;
  const cantidadSalida = parseInt(document.getElementById('complete-qty-salida').value) || 0;
  const merma = Math.max(0, cantidadEntrada - cantidadSalida);
  const porcentajeMerma = cantidadEntrada > 0 ? (merma / cantidadEntrada) * 100 : 0;

  // Si merma > 10%, mostrar alerta primero
  if (porcentajeMerma > 10) {
    await showMermaAlert(porcentajeMerma);
  }

  // Continuar con la confirmación
  confirmComplete();
}

async function confirmComplete() {
  const tipoEstacion = currentOTEstacion.estaciones?.tipo_estacion || 'material';
  const notas = document.getElementById('complete-notes').value;

  let cantidadSalida = 0;
  let cantidadMerma = 0;
  let motivoMermaId = null;
  let obsMerma = null;

  // Solo procesar cantidades para estaciones de material
  if (tipoEstacion === 'material') {
    cantidadSalida = parseInt(document.getElementById('complete-qty-salida').value) || 0;
    cantidadMerma = parseInt(document.getElementById('complete-qty-merma').value) || 0;
    motivoMermaId = document.getElementById('complete-motivo-merma').value || null;
    obsMerma = document.getElementById('complete-obs-merma').value || null;

    if (cantidadSalida < 0 || cantidadMerma < 0) {
      showToast('Las cantidades no pueden ser negativas', 'error');
      return;
    }

    // Validar que si hay merma, se seleccione un motivo
    if (cantidadMerma > 0 && !motivoMermaId) {
      showToast('Selecciona un motivo de merma', 'error');
      return;
    }
  }

  try {
    const { data, error } = await db.rpc('completar_estacion', {
      p_ot_estacion_id: currentOTEstacion.id,
      p_cantidad_salida: cantidadSalida,
      p_cantidad_merma: cantidadMerma,
      p_notas: notas || null,
      p_motivo_merma_id: motivoMermaId ? parseInt(motivoMermaId) : null,
      p_observacion_merma: obsMerma
    });

    if (error) throw error;

    closeModal('complete');
    stopTimer();

    // Calcular tiempo y eficiencia para mostrar
    const tiempoTotal = timerPausedTime + (timerStartTime ? Date.now() - timerStartTime : 0);
    const tiempoTotalConPausas = tiempoTotal + tiempoEnPausas;
    const eficiencia = tiempoTotalConPausas > 0 ? Math.round((tiempoTotal / tiempoTotalConPausas) * 100) : 100;

    // Mostrar overlay de éxito
    showSuccessOverlay(tiempoTotal, eficiencia, cantidadSalida);

    currentOTEstacion.estado = 'completada';
    currentOTEstacion.cantidad_salida = cantidadSalida;
    currentOTEstacion.cantidad_merma = cantidadMerma;

  } catch (err) {
    console.error('[App] Error completando:', err);
    showToast('Error al completar estación', 'error');
  }
}

function showSuccessOverlay(tiempoMs, eficiencia, cantidad) {
  const overlay = document.getElementById('success-overlay');
  const tipoEstacion = currentOTEstacion.estaciones?.tipo_estacion || 'material';

  // Formatear tiempo
  const hours = Math.floor(tiempoMs / 3600000);
  const minutes = Math.floor((tiempoMs % 3600000) / 60000);
  const seconds = Math.floor((tiempoMs % 60000) / 1000);
  const tiempoStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  document.getElementById('success-tiempo').textContent = tiempoStr;
  document.getElementById('success-eficiencia').textContent = `${eficiencia}%`;

  // Para estaciones de tiempo, mostrar "Completado" en vez de cantidad
  if (tipoEstacion === 'tiempo') {
    document.getElementById('success-salida').textContent = '✓';
    document.querySelector('#success-overlay .success-stat:last-child .success-stat-label').textContent = 'Estado';
  } else {
    // Obtener unidad de medida
    const unidad = currentOT?.unidad_medida || 'unidades';
    document.getElementById('success-salida').textContent = `${cantidad.toLocaleString()} ${unidad}`;
    document.querySelector('#success-overlay .success-stat:last-child .success-stat-label').textContent = 'Unidades';
  }

  overlay.classList.add('show');

  // Ocultar después de 3 segundos y volver a lista
  setTimeout(() => {
    overlay.classList.remove('show');
    showScreen('otList');
    loadOTList();
  }, 3500);
}

function showMermaAlert(porcentaje) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('merma-alert');
    document.getElementById('merma-alert-percent').textContent = `${porcentaje.toFixed(1)}%`;
    overlay.classList.add('show');

    const btn = document.getElementById('btn-merma-alert-continue');
    const handler = () => {
      overlay.classList.remove('show');
      btn.removeEventListener('click', handler);
      resolve();
    };
    btn.addEventListener('click', handler);
  });
}

// ========== MODALES ==========
function openModal(name) {
  modals[name].classList.add('active');
}

function closeModal(name) {
  modals[name].classList.remove('active');
  // Reset forms
  if (name === 'pause') {
    document.getElementById('pause-detail').value = '';
    document.querySelectorAll('.pause-option').forEach(b => b.classList.remove('selected'));
  }
}

// ========== TOAST ==========
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ========== EXPONER FUNCIONES GLOBALES ==========
window.openPauseModal = openPauseModal;
window.openCompleteModal = openCompleteModal;
window.reanudarEstacion = reanudarEstacion;
window.openEntradaModal = openEntradaModal;
window.openWorkScreen = openWorkScreen;  // ← CRÍTICO: Estaba faltando!
window.showScreen = showScreen;
window.loadOTList = loadOTList;
