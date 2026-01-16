// FULLEMPAQUES - Almacén Alistamiento
// Control de alistamiento de materiales para producción

// Configuración Supabase
const SUPABASE_URL = 'https://sjfhtopclyxbwzhslhwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqZmh0b3BjbHl4Ynd6aHNsaHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NzEyMTcsImV4cCI6MjA3NjU0NzIxN30.OWaCsPD2khL9PDMG8ZwbQkJNHe4U8bwx595cWWIxlp8';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Estado
let currentOperador = null;
let selectedOT = null;
let otsList = [];

// ==================== INICIALIZACIÓN ====================

document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

function initializeApp() {
  const savedSession = localStorage.getItem('almacen_session');
  if (savedSession) {
    const session = JSON.parse(savedSession);
    if (Date.now() - session.timestamp < 8 * 60 * 60 * 1000) {
      currentOperador = session.operador;
      showAlmacenScreen();
      return;
    }
  }
  setupLoginHandlers();
}

// ==================== LOGIN ====================

function setupLoginHandlers() {
  let pin = '';
  const dots = document.querySelectorAll('.pin-dot');
  const keys = document.querySelectorAll('.pin-key');
  const errorDiv = document.getElementById('login-error');

  keys.forEach(key => {
    key.addEventListener('click', async () => {
      const value = key.dataset.value;

      if (value === 'delete') {
        pin = pin.slice(0, -1);
      } else if (pin.length < 4) {
        pin += value;
      }

      dots.forEach((dot, i) => {
        dot.classList.toggle('filled', i < pin.length);
      });

      if (pin.length === 4) {
        await verifyPin(pin);
        pin = '';
        dots.forEach(dot => dot.classList.remove('filled'));
      }
    });
  });
}

async function verifyPin(pin) {
  const errorDiv = document.getElementById('login-error');

  try {
    const { data, error } = await db
      .from('operadores')
      .select('*')
      .eq('pin_hash', pin)
      .eq('activo', true)
      .single();

    if (error || !data) {
      errorDiv.textContent = 'PIN incorrecto';
      errorDiv.style.display = 'block';
      setTimeout(() => errorDiv.style.display = 'none', 2000);
      return;
    }

    // Verificar rol (almacen, jefe_produccion o admin)
    const rolesPermitidos = ['almacen', 'jefe_produccion', 'admin'];
    if (!rolesPermitidos.includes(data.rol)) {
      errorDiv.textContent = 'Acceso no autorizado';
      errorDiv.style.display = 'block';
      setTimeout(() => errorDiv.style.display = 'none', 2000);
      return;
    }

    currentOperador = data;
    localStorage.setItem('almacen_session', JSON.stringify({
      operador: data,
      timestamp: Date.now()
    }));

    showAlmacenScreen();

  } catch (err) {
    console.error('Error verificando PIN:', err);
    errorDiv.textContent = 'Error de conexión';
    errorDiv.style.display = 'block';
  }
}

// ==================== PANTALLA PRINCIPAL ====================

function showAlmacenScreen() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('almacen-screen').classList.remove('hidden');
  document.getElementById('operator-name').textContent = currentOperador.nombre;
  
  document.getElementById('btn-logout').addEventListener('click', logout);
  
  loadPendingOTs();
}

function logout() {
  localStorage.removeItem('almacen_session');
  currentOperador = null;
  selectedOT = null;
  document.getElementById('almacen-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

// ==================== CARGAR OTs ====================

async function loadPendingOTs() {
  const listContainer = document.getElementById('ot-list');
  listContainer.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    // Obtener el ID de la estación ALM
    const { data: estacionAlm } = await db
      .from('estaciones')
      .select('id')
      .eq('codigo', 'ALM')
      .single();

    if (!estacionAlm) {
      throw new Error('Estación ALM no encontrada');
    }

    // Cargar OTs en estación ALM con estado asignada o pendiente
    const { data, error } = await db
      .from('ordenes_trabajo')
      .select('*')
      .eq('estacion_actual', estacionAlm.id)
      .in('estado', ['asignada', 'pendiente', 'en_proceso'])
      .is('deleted_at', null)
      .order('prioridad', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;

    otsList = data || [];
    renderOTsList();
    document.getElementById('ot-count').textContent = otsList.length;

  } catch (err) {
    console.error('Error cargando OTs:', err);
    listContainer.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--text-secondary);">
        Error al cargar OTs<br>
        <button onclick="loadPendingOTs()" style="margin-top: 10px; padding: 8px 16px; cursor: pointer;">Reintentar</button>
      </div>
    `;
  }
}

function renderOTsList() {
  const listContainer = document.getElementById('ot-list');

  if (otsList.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
        <div style="font-size: 3rem; margin-bottom: 10px;">✅</div>
        No hay OTs pendientes de alistar
      </div>
    `;
    return;
  }

  listContainer.innerHTML = otsList.map(ot => `
    <div class="ot-card pendiente-alistar ${selectedOT?.id === ot.id ? 'selected' : ''}"
         onclick="selectOT('${ot.id}')">
      <div class="ot-card-header">
        <span class="ot-numero">${ot.numero_ot}</span>
        <span class="badge-pendiente">Por alistar</span>
      </div>
      <div class="ot-cliente">${ot.cliente_nombre || 'Sin cliente'}</div>
      <div class="ot-producto">${ot.producto_descripcion || 'Sin descripción'}</div>
      <div class="ot-material">
        📦 ${ot.material_nombre || 'Material'} - ${formatNumber(ot.cantidad_pliegos || 0)} pliegos
      </div>
    </div>
  `).join('');
}

// ==================== SELECCIÓN Y DETALLE ====================

function selectOT(id) {
  selectedOT = otsList.find(ot => ot.id === id);
  if (!selectedOT) return;

  renderOTsList();
  showOTDetail();
  resetChecklist();
}

function showOTDetail() {
  if (!selectedOT) return;

  document.getElementById('detail-empty').classList.add('hidden');
  document.getElementById('detail-content').classList.remove('hidden');

  // Info general
  document.getElementById('detail-numero').textContent = selectedOT.numero_ot;
  document.getElementById('detail-cliente').textContent = selectedOT.cliente_nombre || '-';
  document.getElementById('detail-producto').textContent = selectedOT.producto_descripcion || '-';
  document.getElementById('detail-cantidad').textContent = formatNumber(selectedOT.cantidad_solicitada) + ' unidades';
  
  const prioridadTexto = ['', 'Urgente', 'Muy Alta', 'Alta', 'Media-Alta', 'Normal', 'Media', 'Baja', 'Muy Baja', 'Mínima'];
  document.getElementById('detail-prioridad').textContent = prioridadTexto[selectedOT.prioridad] || 'Normal';

  // Materiales
  document.getElementById('mat-nombre').textContent = selectedOT.material_nombre || '-';
  document.getElementById('mat-calibre').textContent = selectedOT.calibre || '-';
  document.getElementById('mat-medida').textContent = selectedOT.medida_corte || '-';
  document.getElementById('mat-pliegos').textContent = formatNumber(selectedOT.cantidad_pliegos || 0);

  // Limpiar observaciones
  document.getElementById('obs-alistamiento').value = '';
}

function resetChecklist() {
  document.querySelectorAll('.checklist-item').forEach(item => {
    item.classList.remove('checked');
    item.querySelector('input').checked = false;
  });
  updateAlistarButton();
}

function toggleCheck(element) {
  const checkbox = element.querySelector('input');
  checkbox.checked = !checkbox.checked;
  element.classList.toggle('checked', checkbox.checked);
  updateAlistarButton();
}

function updateAlistarButton() {
  const checkboxes = document.querySelectorAll('.checklist-item input');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  const btn = document.getElementById('btn-alistar');
  btn.disabled = !allChecked;
}

// ==================== ALISTAMIENTO ====================

function confirmarAlistamiento() {
  if (!selectedOT) return;

  const checkboxes = document.querySelectorAll('.checklist-item input');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  
  if (!allChecked) {
    showToast('Completa todos los items del checklist', 'error');
    return;
  }

  document.getElementById('confirm-message').textContent = 
    `¿Confirmas que los materiales para ${selectedOT.numero_ot} están listos para producción?`;
  
  document.getElementById('modal-confirm').classList.add('active');
  document.getElementById('btn-confirm-alistar').onclick = ejecutarAlistamiento;
}

async function ejecutarAlistamiento() {
  if (!selectedOT) return;

  const btn = document.getElementById('btn-confirm-alistar');
  btn.disabled = true;
  btn.textContent = 'Procesando...';

  try {
    const observaciones = document.getElementById('obs-alistamiento').value;

    // 1. Obtener siguiente estación (PRE - Pre-prensa)
    const { data: siguienteEstacion } = await db
      .from('estaciones')
      .select('id, nombre')
      .eq('codigo', 'PRE')
      .single();

    if (!siguienteEstacion) {
      throw new Error('Estación de Pre-prensa no encontrada');
    }

    // 2. Registrar el alistamiento en ot_alistamiento (si existe la tabla)
    try {
      await db.from('ot_alistamiento').insert({
        orden_trabajo_id: selectedOT.id,
        operador_id: currentOperador.id,
        observaciones: observaciones || null,
        checklist_completo: true,
        fecha_alistamiento: new Date().toISOString()
      });
    } catch (e) {
      // Si la tabla no existe, solo logueamos
      console.log('Tabla ot_alistamiento no disponible:', e.message);
    }

    // 3. Actualizar la OT - mover a siguiente estación
    const { error: updateError } = await db
      .from('ordenes_trabajo')
      .update({
        estacion_actual: siguienteEstacion.id,
        estado: 'en_proceso',
        fecha_alistamiento: new Date().toISOString(),
        alistado_por: currentOperador.id,
        observaciones_alistamiento: observaciones || null
      })
      .eq('id', selectedOT.id);

    if (updateError) throw updateError;

    // 4. Crear registro en ot_estaciones para siguiente estación
    await db.from('ot_estaciones').insert({
      orden_trabajo_id: selectedOT.id,
      estacion_id: siguienteEstacion.id,
      estado: 'pendiente'
    });

    closeModal();
    showToast(`Alistamiento completado - OT enviada a ${siguienteEstacion.nombre}`, 'success');

    // Limpiar y recargar
    selectedOT = null;
    document.getElementById('detail-empty').classList.remove('hidden');
    document.getElementById('detail-content').classList.add('hidden');
    await loadPendingOTs();

  } catch (err) {
    console.error('Error en alistamiento:', err);
    showToast('Error al procesar alistamiento: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar';
  }
}

function closeModal() {
  document.getElementById('modal-confirm').classList.remove('active');
}

// ==================== UTILIDADES ====================

function formatNumber(num) {
  if (!num) return '0';
  return num.toLocaleString('es-CO');
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Exponer funciones globales
window.selectOT = selectOT;
window.loadPendingOTs = loadPendingOTs;
window.toggleCheck = toggleCheck;
window.confirmarAlistamiento = confirmarAlistamiento;
window.closeModal = closeModal;
