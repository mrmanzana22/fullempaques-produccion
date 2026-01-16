// FULLEMPAQUES - Jefe de Producción
// Control de asignación de OTs a producción

// Configuración Supabase
const SUPABASE_URL = 'https://sjfhtopclyxbwzhslhwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqZmh0b3BjbHl4Ynd6aHNsaHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NzEyMTcsImV4cCI6MjA3NjU0NzIxN30.OWaCsPD2khL9PDMG8ZwbQkJNHe4U8bwx595cWWIxlp8';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Estado de la aplicación
let currentOperador = null;
let selectedOT = null;
let otsList = [];

// Mapeo de códigos de acabados a nombres legibles
const ACABADOS_NOMBRES = {
  'PLAST_BRILL_EXT': 'Plastificado Brillante Ext',
  'PLAST_MATE_EXT': 'Plastificado Mate Ext',
  'PLAST_BRILL_INT': 'Plastificado Brillante Int',
  'PLAST_MATE_INT': 'Plastificado Mate Int',
  'BARNIZ_UV_TOTAL': 'Barniz UV Total',
  'BARNIZ_UV_RESERVA': 'Barniz UV Reservado',
  'ESTAMPADO_FOIL': 'Estampado Foil',
  'REPUJADO': 'Repujado',
  'TROQUELADO': 'Troquelado',
  'PEGA_CAJA': 'Pega Caja',
  'PEGA_ACETATO': 'Pega Acetato',
  'ARMADO_BOLSA': 'Armado Bolsa',
  'CINTA_SATIN': 'Cinta Satín',
  'PERFORADO': 'Perforado',
  'CORDON': 'Cordón'
};

// ==================== INICIALIZACIÓN ====================

document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

function initializeApp() {
  // Verificar si hay sesión guardada
  const savedSession = localStorage.getItem('jefe_session');
  if (savedSession) {
    const session = JSON.parse(savedSession);
    // Verificar que la sesión no haya expirado (8 horas)
    if (Date.now() - session.timestamp < 8 * 60 * 60 * 1000) {
      currentOperador = session.operador;
      showJefeScreen();
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

      // Actualizar dots
      dots.forEach((dot, i) => {
        dot.classList.toggle('filled', i < pin.length);
      });

      // Verificar PIN cuando tenga 4 dígitos
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
      setTimeout(() => {
        errorDiv.style.display = 'none';
      }, 2000);
      return;
    }

    // Verificar que sea jefe de producción
    if (data.rol !== 'jefe_produccion' && data.rol !== 'admin') {
      errorDiv.textContent = 'Acceso no autorizado';
      errorDiv.style.display = 'block';
      setTimeout(() => {
        errorDiv.style.display = 'none';
      }, 2000);
      return;
    }

    currentOperador = data;

    // Guardar sesión
    localStorage.setItem('jefe_session', JSON.stringify({
      operador: data,
      timestamp: Date.now()
    }));

    showJefeScreen();

  } catch (err) {
    console.error('Error verificando PIN:', err);
    errorDiv.textContent = 'Error de conexión';
    errorDiv.style.display = 'block';
  }
}

// ==================== PANTALLA PRINCIPAL ====================

function showJefeScreen() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('jefe-screen').classList.remove('hidden');

  // Configurar logout
  document.getElementById('btn-logout').addEventListener('click', logout);

  // Configurar botón de asignar
  document.getElementById('btn-assign').addEventListener('click', assignOT);

  // Cargar OTs pendientes
  loadPendingOTs();

  // Configurar fecha por defecto (7 días desde hoy)
  const fechaInput = document.getElementById('assign-fecha');
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 7);
  fechaInput.value = defaultDate.toISOString().split('T')[0];
}

function logout() {
  localStorage.removeItem('jefe_session');
  currentOperador = null;
  selectedOT = null;
  document.getElementById('jefe-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

// ==================== CARGAR OTs ====================

async function loadPendingOTs() {
  const listContainer = document.getElementById('ot-list');
  listContainer.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    // Cargar OTs que están en estado pendiente y en estación de Diseño
    // O que tienen estado 'diseño_completado'
    const { data, error } = await db
      .from('ordenes_trabajo')
      .select(`
        *,
        estacion:estaciones(nombre, codigo)
      `)
      .or('estado.eq.pendiente,estado.eq.diseño_completado')
      .is('deleted_at', null)
      .order('prioridad', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Filtrar solo las que están en Diseño (código DIS) o esperando asignación
    otsList = data.filter(ot => {
      const enDiseno = ot.estacion?.codigo === 'DIS';
      const esperandoAsignacion = ot.estado === 'diseño_completado';
      return enDiseno || esperandoAsignacion;
    });

    renderOTsList();
    document.getElementById('ot-count').textContent = otsList.length;

  } catch (err) {
    console.error('Error cargando OTs:', err);
    listContainer.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--text-secondary);">
        Error al cargar OTs
        <br><button onclick="loadPendingOTs()" style="margin-top: 10px; padding: 8px 16px; cursor: pointer;">Reintentar</button>
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
        No hay OTs pendientes de asignar
      </div>
    `;
    return;
  }

  listContainer.innerHTML = otsList.map(ot => `
    <div class="ot-card ${selectedOT?.id === ot.id ? 'selected' : ''}"
         onclick="selectOT('${ot.id}')">
      <div class="ot-card-header">
        <span class="ot-numero">${ot.numero_ot}</span>
        <span class="ot-urgencia ${ot.urgencia || 'normal'}">${ot.urgencia || 'Normal'}</span>
      </div>
      <div class="ot-cliente">${ot.cliente_nombre || 'Sin cliente'}</div>
      <div class="ot-producto">${ot.producto_descripcion || 'Sin descripción'}</div>
      <div class="ot-cantidad">📦 ${formatNumber(ot.cantidad_solicitada)} unidades</div>
    </div>
  `).join('');
}

// ==================== SELECCIÓN Y DETALLE ====================

function selectOT(id) {
  selectedOT = otsList.find(ot => ot.id === id);

  if (!selectedOT) return;

  // Actualizar lista (marcar seleccionado)
  renderOTsList();

  // Mostrar detalle
  showOTDetail();
}

function showOTDetail() {
  if (!selectedOT) return;

  document.getElementById('detail-empty').classList.add('hidden');
  document.getElementById('detail-content').classList.remove('hidden');
  document.getElementById('assign-section').classList.remove('hidden');

  // Llenar datos
  document.getElementById('detail-numero').textContent = selectedOT.numero_ot;
  document.getElementById('detail-cliente').textContent = selectedOT.cliente_nombre || 'Sin cliente';

  const urgenciaEl = document.getElementById('detail-urgencia');
  urgenciaEl.textContent = selectedOT.urgencia || 'Normal';
  urgenciaEl.className = `ot-urgencia ${selectedOT.urgencia || 'normal'}`;

  // Producto
  document.getElementById('detail-codigo').textContent = selectedOT.producto_codigo || '-';
  document.getElementById('detail-producto').textContent = selectedOT.producto_descripcion || '-';
  document.getElementById('detail-cantidad').textContent = formatNumber(selectedOT.cantidad_solicitada);
  document.getElementById('detail-medidas').textContent = selectedOT.producto_medidas || '-';

  // Material
  document.getElementById('detail-material').textContent = selectedOT.material_nombre || '-';
  document.getElementById('detail-calibre').textContent = selectedOT.calibre || '-';

  // Impresión
  document.getElementById('detail-tintas').textContent = selectedOT.num_tintas || '0';
  document.getElementById('detail-colores').textContent = selectedOT.colores || '-';
  document.getElementById('detail-tiros').textContent = selectedOT.numero_tiros || '-';

  // Corte
  document.getElementById('detail-medida-corte').textContent = selectedOT.medida_corte || '-';
  document.getElementById('detail-pliegos').textContent = selectedOT.cantidad_pliegos ? formatNumber(selectedOT.cantidad_pliegos) : '-';

  // Acabados
  const acabadosContainer = document.getElementById('detail-acabados');
  const acabados = selectedOT.acabados || [];

  if (acabados.length > 0) {
    acabadosContainer.innerHTML = acabados.map(codigo => {
      const nombre = ACABADOS_NOMBRES[codigo] || codigo;
      return `<span class="acabado-chip">${nombre}</span>`;
    }).join('');
  } else {
    acabadosContainer.innerHTML = '<span class="acabado-chip inactive">Sin acabados especiales</span>';
  }

  // Observaciones
  document.getElementById('detail-observaciones').textContent =
    selectedOT.observaciones_produccion || 'Sin observaciones';

  // Pre-llenar prioridad
  const prioridadMap = { 'urgente': '1', 'alta': '3', 'normal': '5', 'baja': '7' };
  document.getElementById('assign-prioridad').value = prioridadMap[selectedOT.urgencia] || '5';
}

// ==================== ASIGNACIÓN ====================

async function assignOT() {
  if (!selectedOT) return;

  const btn = document.getElementById('btn-assign');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Asignando...';

  try {
    const prioridad = parseInt(document.getElementById('assign-prioridad').value);
    const fechaCompromiso = document.getElementById('assign-fecha').value;
    const notas = document.getElementById('assign-notas').value;

    // Obtener la estación de Almacén (siguiente después de Diseño)
    const { data: estacionAlmacen, error: estacionError } = await db
      .from('estaciones')
      .select('id')
      .eq('codigo', 'ALM')
      .single();

    // Si no existe estación ALM, usar la siguiente en el flujo
    let nuevaEstacionId = estacionAlmacen?.id;

    if (!nuevaEstacionId) {
      // Buscar estación de Corte como fallback
      const { data: estacionCorte } = await db
        .from('estaciones')
        .select('id')
        .eq('codigo', 'COR')
        .single();

      nuevaEstacionId = estacionCorte?.id || selectedOT.estacion_actual;
    }

    // Actualizar la OT
    const { error: updateError } = await db
      .from('ordenes_trabajo')
      .update({
        estado: 'asignada',
        prioridad: prioridad,
        fecha_compromiso: fechaCompromiso,
        notas_jefe: notas,
        asignada_por: currentOperador.id,
        fecha_asignacion: new Date().toISOString(),
        estacion_actual: nuevaEstacionId
      })
      .eq('id', selectedOT.id);

    if (updateError) throw updateError;

    // Crear registro en ot_estaciones si existe la estación
    if (nuevaEstacionId && nuevaEstacionId !== selectedOT.estacion_actual) {
      await db
        .from('ot_estaciones')
        .insert({
          orden_trabajo_id: selectedOT.id,
          estacion_id: nuevaEstacionId,
          estado: 'pendiente'
        });
    }

    showToast('OT asignada correctamente', 'success');

    // Limpiar selección y recargar
    selectedOT = null;
    document.getElementById('detail-empty').classList.remove('hidden');
    document.getElementById('detail-content').classList.add('hidden');
    document.getElementById('assign-section').classList.add('hidden');
    document.getElementById('assign-notas').value = '';

    await loadPendingOTs();

  } catch (err) {
    console.error('Error asignando OT:', err);
    showToast('Error al asignar OT', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
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

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Exponer funciones globales
window.selectOT = selectOT;
window.loadPendingOTs = loadPendingOTs;
