// FULLEMPAQUES Reportes - Dashboard de Producción

// ========== CONFIGURACIÓN ==========
const SUPABASE_URL = 'https://sjfhtopclyxbwzhslhwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqZmh0b3BjbHl4Ynd6aHNsaHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NzEyMTcsImV4cCI6MjA3NjU0NzIxN30.OWaCsPD2khL9PDMG8ZwbQkJNHe4U8bwx595cWWIxlp8';
const SUPERVISOR_PIN = '9999'; // PIN hardcodeado

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========== ESTADO ==========
let currentPin = '';
let charts = {};
let evidenciasData = []; // Cache de evidencias para exportar
let currentPage = 1;
const ITEMS_PER_PAGE = 12;

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', () => {
  initPinKeypad();
  initTabs();
  initDateFilters();

  // Verificar sesión
  if (sessionStorage.getItem('supervisor_auth')) {
    showReports();
  }
});

// ========== PIN LOGIN ==========
function initPinKeypad() {
  document.querySelectorAll('.pin-key').forEach(key => {
    key.addEventListener('click', () => {
      const value = key.dataset.value;

      if (value === 'delete') {
        currentPin = currentPin.slice(0, -1);
      } else if (currentPin.length < 4) {
        currentPin += value;
      }

      updatePinDisplay();

      if (currentPin.length === 4) {
        validatePin();
      }
    });
  });
}

function updatePinDisplay() {
  document.querySelectorAll('.pin-dot').forEach((dot, i) => {
    dot.classList.toggle('filled', i < currentPin.length);
  });
}

function validatePin() {
  if (currentPin === SUPERVISOR_PIN) {
    sessionStorage.setItem('supervisor_auth', 'true');
    showReports();
  } else {
    document.getElementById('login-error').textContent = 'PIN incorrecto';
    document.querySelector('.pin-display').classList.add('shake');
    setTimeout(() => {
      document.querySelector('.pin-display').classList.remove('shake');
      currentPin = '';
      updatePinDisplay();
      document.getElementById('login-error').textContent = '';
    }, 500);
  }
}

function showReports() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('reports-screen').classList.remove('hidden');
  loadReports();
}

// ========== LOGOUT ==========
document.getElementById('btn-logout')?.addEventListener('click', () => {
  sessionStorage.removeItem('supervisor_auth');
  location.reload();
});

// ========== TABS ==========
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`tab-${tab}`).classList.add('active');
    });
  });
}

// ========== FILTROS ==========
function initDateFilters() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  document.getElementById('filter-desde').value = firstDay.toISOString().split('T')[0];
  document.getElementById('filter-hasta').value = today.toISOString().split('T')[0];
}

// ========== CARGAR REPORTES ==========
async function loadReports() {
  const desde = document.getElementById('filter-desde').value;
  const hasta = document.getElementById('filter-hasta').value + 'T23:59:59';

  try {
    await Promise.all([
      loadOperadoresReport(desde, hasta),
      loadEstacionesReport(desde, hasta),
      loadOrdenesReport(desde, hasta),
      loadEvidenciasReport()
    ]);
  } catch (err) {
    console.error('Error cargando reportes:', err);
    showToast('Error cargando reportes', 'error');
  }
}

// ========== REPORTE OPERADORES ==========
async function loadOperadoresReport(desde, hasta) {
  const { data, error } = await db
    .from('ot_estaciones')
    .select(`
      id,
      operador_id,
      tiempo_efectivo_minutos,
      tiempo_total_minutos,
      cantidad_merma,
      estado,
      operadores (id, nombre)
    `)
    .gte('created_at', desde)
    .lte('created_at', hasta)
    .eq('estado', 'completada');

  if (error) throw error;

  // Agrupar por operador
  const porOperador = {};
  data.forEach(item => {
    if (!item.operadores) return;
    const opId = item.operador_id;
    if (!porOperador[opId]) {
      porOperador[opId] = {
        nombre: item.operadores.nombre,
        completadas: 0,
        tiempoEfectivo: 0,
        tiempoTotal: 0,
        merma: 0
      };
    }
    porOperador[opId].completadas++;
    porOperador[opId].tiempoEfectivo += item.tiempo_efectivo_minutos || 0;
    porOperador[opId].tiempoTotal += item.tiempo_total_minutos || 0;
    porOperador[opId].merma += item.cantidad_merma || 0;
  });

  const operadores = Object.values(porOperador);

  // Stats
  const totalCompletadas = operadores.reduce((sum, o) => sum + o.completadas, 0);
  const promedioEficiencia = operadores.length > 0
    ? Math.round(operadores.reduce((sum, o) => {
        const eff = o.tiempoTotal > 0 ? (o.tiempoEfectivo / o.tiempoTotal) * 100 : 100;
        return sum + eff;
      }, 0) / operadores.length)
    : 0;

  document.getElementById('stats-operadores').innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${operadores.length}</div>
      <div class="stat-label">Operadores Activos</div>
    </div>
    <div class="stat-card">
      <div class="stat-value success">${totalCompletadas}</div>
      <div class="stat-label">Estaciones Completadas</div>
    </div>
    <div class="stat-card">
      <div class="stat-value ${promedioEficiencia >= 80 ? 'success' : promedioEficiencia >= 60 ? 'warning' : 'danger'}">${promedioEficiencia}%</div>
      <div class="stat-label">Eficiencia Promedio</div>
    </div>
  `;

  // Tabla
  const tbody = document.querySelector('#table-operadores tbody');
  tbody.innerHTML = operadores.length === 0
    ? '<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">Sin datos en este período</td></tr>'
    : operadores.map(o => {
        const eficiencia = o.tiempoTotal > 0 ? Math.round((o.tiempoEfectivo / o.tiempoTotal) * 100) : 100;
        const tiempoPausas = o.tiempoTotal - o.tiempoEfectivo;
        return `
          <tr>
            <td>${o.nombre}</td>
            <td>${o.completadas}</td>
            <td>${formatMinutes(o.tiempoEfectivo)}</td>
            <td>${formatMinutes(tiempoPausas)}</td>
            <td><span class="badge ${eficiencia >= 80 ? 'high' : eficiencia >= 60 ? 'medium' : 'low'}">${eficiencia}%</span></td>
            <td>${o.merma.toLocaleString()}</td>
          </tr>
        `;
      }).join('');

  // Gráfico
  renderOperadoresChart(operadores);
}

function renderOperadoresChart(operadores) {
  const ctx = document.getElementById('chart-operadores');
  if (charts.operadores) charts.operadores.destroy();

  charts.operadores = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: operadores.map(o => o.nombre),
      datasets: [
        {
          label: 'Tiempo Efectivo (min)',
          data: operadores.map(o => o.tiempoEfectivo),
          backgroundColor: 'rgba(72, 187, 120, 0.7)',
        },
        {
          label: 'Tiempo Pausas (min)',
          data: operadores.map(o => o.tiempoTotal - o.tiempoEfectivo),
          backgroundColor: 'rgba(237, 137, 54, 0.7)',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#a0aec0' } }
      },
      scales: {
        x: { stacked: true, ticks: { color: '#a0aec0' }, grid: { color: 'rgba(255,255,255,0.1)' } },
        y: { stacked: true, ticks: { color: '#a0aec0' }, grid: { color: 'rgba(255,255,255,0.1)' } }
      }
    }
  });
}

// ========== REPORTE ESTACIONES ==========
async function loadEstacionesReport(desde, hasta) {
  const { data, error } = await db
    .from('ot_estaciones')
    .select(`
      id,
      estacion_id,
      tiempo_efectivo_minutos,
      cantidad_entrada,
      cantidad_merma,
      porcentaje_merma,
      estado,
      estaciones (id, nombre)
    `)
    .gte('created_at', desde)
    .lte('created_at', hasta)
    .eq('estado', 'completada');

  if (error) throw error;

  // Agrupar por estación
  const porEstacion = {};
  data.forEach(item => {
    if (!item.estaciones) return;
    const estId = item.estacion_id;
    if (!porEstacion[estId]) {
      porEstacion[estId] = {
        nombre: item.estaciones.nombre,
        veces: 0,
        tiempoTotal: 0,
        mermaTotal: 0,
        entradaTotal: 0
      };
    }
    porEstacion[estId].veces++;
    porEstacion[estId].tiempoTotal += item.tiempo_efectivo_minutos || 0;
    porEstacion[estId].mermaTotal += item.cantidad_merma || 0;
    porEstacion[estId].entradaTotal += item.cantidad_entrada || 0;
  });

  const estaciones = Object.values(porEstacion);

  // Stats
  const estacionMasUsada = estaciones.reduce((max, e) => e.veces > (max?.veces || 0) ? e : max, null);
  const estacionMasMerma = estaciones.reduce((max, e) => {
    const pct = e.entradaTotal > 0 ? (e.mermaTotal / e.entradaTotal) * 100 : 0;
    const maxPct = max?.entradaTotal > 0 ? (max.mermaTotal / max.entradaTotal) * 100 : 0;
    return pct > maxPct ? e : max;
  }, null);

  document.getElementById('stats-estaciones').innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${estaciones.length}</div>
      <div class="stat-label">Estaciones Activas</div>
    </div>
    <div class="stat-card">
      <div class="stat-value success">${estacionMasUsada?.nombre || '-'}</div>
      <div class="stat-label">Más Utilizada</div>
    </div>
    <div class="stat-card">
      <div class="stat-value danger">${estacionMasMerma?.nombre || '-'}</div>
      <div class="stat-label">Mayor Merma</div>
    </div>
  `;

  // Tabla
  const tbody = document.querySelector('#table-estaciones tbody');
  tbody.innerHTML = estaciones.length === 0
    ? '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">Sin datos en este período</td></tr>'
    : estaciones.map(e => {
        const tiempoPromedio = e.veces > 0 ? Math.round(e.tiempoTotal / e.veces) : 0;
        const mermaPromedio = e.veces > 0 ? Math.round(e.mermaTotal / e.veces) : 0;
        const pctMerma = e.entradaTotal > 0 ? ((e.mermaTotal / e.entradaTotal) * 100).toFixed(1) : 0;
        return `
          <tr>
            <td>${e.nombre}</td>
            <td>${e.veces}</td>
            <td>${formatMinutes(tiempoPromedio)}</td>
            <td>${mermaPromedio.toLocaleString()}</td>
            <td><span class="badge ${pctMerma <= 2 ? 'high' : pctMerma <= 5 ? 'medium' : 'low'}">${pctMerma}%</span></td>
          </tr>
        `;
      }).join('');

  // Gráfico
  renderEstacionesChart(estaciones);
}

function renderEstacionesChart(estaciones) {
  const ctx = document.getElementById('chart-estaciones');
  if (charts.estaciones) charts.estaciones.destroy();

  charts.estaciones = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: estaciones.map(e => e.nombre),
      datasets: [{
        data: estaciones.map(e => e.veces),
        backgroundColor: [
          'rgba(74, 144, 217, 0.8)',
          'rgba(72, 187, 120, 0.8)',
          'rgba(237, 137, 54, 0.8)',
          'rgba(245, 101, 101, 0.8)',
          'rgba(159, 122, 234, 0.8)',
          'rgba(56, 178, 172, 0.8)',
          'rgba(246, 173, 85, 0.8)',
          'rgba(236, 72, 153, 0.8)',
          'rgba(99, 179, 237, 0.8)',
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#a0aec0' }
        }
      }
    }
  });
}

// ========== REPORTE ÓRDENES ==========
async function loadOrdenesReport(desde, hasta) {
  const { data, error } = await db
    .from('ordenes_trabajo')
    .select(`
      id,
      numero_ot,
      cliente_nombre,
      producto_descripcion,
      estado,
      ot_estaciones (
        id,
        estado,
        tiempo_efectivo_minutos,
        cantidad_merma
      )
    `)
    .gte('created_at', desde)
    .lte('created_at', hasta)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Stats
  const completadas = data.filter(o => o.estado === 'completada').length;
  const enProceso = data.filter(o => o.estado === 'en_proceso').length;
  const pendientes = data.filter(o => o.estado === 'pendiente').length;

  document.getElementById('stats-ordenes').innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${data.length}</div>
      <div class="stat-label">Total OTs</div>
    </div>
    <div class="stat-card">
      <div class="stat-value success">${completadas}</div>
      <div class="stat-label">Completadas</div>
    </div>
    <div class="stat-card">
      <div class="stat-value warning">${enProceso}</div>
      <div class="stat-label">En Proceso</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${pendientes}</div>
      <div class="stat-label">Pendientes</div>
    </div>
  `;

  // Tabla
  const tbody = document.querySelector('#table-ordenes tbody');
  tbody.innerHTML = data.length === 0
    ? '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">Sin OTs en este período</td></tr>'
    : data.map(o => {
        const estaciones = o.ot_estaciones || [];
        const completadasEst = estaciones.filter(e => e.estado === 'completada').length;
        const tiempoTotal = estaciones.reduce((sum, e) => sum + (e.tiempo_efectivo_minutos || 0), 0);
        const mermaTotal = estaciones.reduce((sum, e) => sum + (e.cantidad_merma || 0), 0);

        const estadoBadge = {
          'pendiente': 'medium',
          'en_proceso': 'high',
          'completada': 'high',
          'cancelada': 'low'
        };

        return `
          <tr>
            <td><strong>${o.numero_ot}</strong></td>
            <td>${o.cliente_nombre || '-'}</td>
            <td>${(o.producto_descripcion || '-').substring(0, 30)}...</td>
            <td><span class="badge ${estadoBadge[o.estado] || ''}">${o.estado}</span></td>
            <td>${completadasEst}/${estaciones.length}</td>
            <td>${formatMinutes(tiempoTotal)}</td>
            <td>${mermaTotal.toLocaleString()}</td>
          </tr>
        `;
      }).join('');
}

// ========== UTILIDADES ==========
function formatMinutes(minutes) {
  if (!minutes) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ========== REPORTE EVIDENCIAS DE MERMA ==========
async function loadEvidenciasReport() {
  const desde = document.getElementById('filter-desde').value;
  const hasta = document.getElementById('filter-hasta').value + 'T23:59:59';
  const filterEstacion = document.getElementById('filter-estacion')?.value || '';
  const filterOperador = document.getElementById('filter-operador')?.value || '';

  const container = document.getElementById('evidencias-container');
  const loadingEl = document.getElementById('evidencias-loading');
  const paginationEl = document.getElementById('evidencias-pagination');

  // Mostrar loading
  loadingEl.style.display = 'flex';
  container.innerHTML = '';
  paginationEl.innerHTML = '';

  try {
    // Construir query
    let query = db
      .from('ot_estaciones')
      .select(`
        id,
        estacion_id,
        operador_id,
        cantidad_entrada,
        cantidad_merma,
        evidencia_merma_url,
        observacion_merma,
        updated_at,
        estaciones (id, nombre),
        operadores (id, nombre),
        motivos_merma (nombre),
        ordenes_trabajo!inner (numero_ot, cliente, descripcion_producto)
      `)
      .not('evidencia_merma_url', 'is', null)
      .gte('updated_at', desde)
      .lte('updated_at', hasta);

    // Aplicar filtros
    if (filterEstacion) {
      query = query.eq('estacion_id', filterEstacion);
    }
    if (filterOperador) {
      query = query.eq('operador_id', filterOperador);
    }

    query = query.order('updated_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Error cargando evidencias:', error);
      throw error;
    }

    // Guardar en cache para exportar
    evidenciasData = data;

    // Cargar filtros (solo primera vez)
    await loadFiltersData();

    // Stats
    const totalEvidencias = data.length;
    const mermaTotal = data.reduce((sum, e) => sum + (e.cantidad_merma || 0), 0);
    const motivosFrecuentes = {};
    data.forEach(e => {
      const motivo = e.motivos_merma?.nombre || 'Sin motivo';
      motivosFrecuentes[motivo] = (motivosFrecuentes[motivo] || 0) + 1;
    });
    const motivoMasComun = Object.entries(motivosFrecuentes)
      .sort((a, b) => b[1] - a[1])[0];

    document.getElementById('stats-evidencias').innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${totalEvidencias}</div>
        <div class="stat-label">Evidencias con Foto</div>
      </div>
      <div class="stat-card">
        <div class="stat-value danger">${mermaTotal.toLocaleString()}</div>
        <div class="stat-label">Unidades Perdidas</div>
      </div>
      <div class="stat-card">
        <div class="stat-value warning">${motivoMasComun ? motivoMasComun[0] : '-'}</div>
        <div class="stat-label">Motivo Más Común</div>
      </div>
    `;

    // Ocultar loading
    loadingEl.style.display = 'none';

    if (data.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <h3>No hay evidencias en este período</h3>
          <p>Las fotos de merma aparecerán aquí cuando los operadores las capturen</p>
        </div>
      `;
      return;
    }

    // Paginación
    const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages) currentPage = 1;

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageData = data.slice(startIndex, endIndex);

    // Renderizar cards
    container.innerHTML = pageData.map(e => renderEvidenciaCard(e)).join('');

    // Renderizar paginación
    renderPagination(totalPages, data.length);

  } catch (err) {
    loadingEl.style.display = 'none';
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <h3>Error cargando evidencias</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}

// Renderizar card de evidencia
function renderEvidenciaCard(e) {
  const porcentaje = e.cantidad_entrada > 0
    ? ((e.cantidad_merma / e.cantidad_entrada) * 100).toFixed(1)
    : 0;
  const fecha = new Date(e.updated_at).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `
    <div class="evidencia-card">
      <img
        src="${e.evidencia_merma_url}"
        alt="Evidencia de merma"
        class="evidencia-img"
        onclick="openImgModal('${e.evidencia_merma_url}')"
        onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📷</text></svg>'"
      >
      <div class="evidencia-info">
        <div class="evidencia-header">
          <span class="evidencia-ot">${e.ordenes_trabajo?.numero_ot || 'Sin OT'}</span>
          <span class="evidencia-merma">${e.cantidad_merma?.toLocaleString()} uds (${porcentaje}%)</span>
        </div>
        <div class="evidencia-detail"><strong>Estación:</strong> ${e.estaciones?.nombre || '-'}</div>
        <div class="evidencia-detail"><strong>Operador:</strong> ${e.operadores?.nombre || '-'}</div>
        <div class="evidencia-detail"><strong>Producto:</strong> ${(e.ordenes_trabajo?.descripcion_producto || '-').substring(0, 40)}...</div>
        ${e.motivos_merma?.nombre ? `<div class="evidencia-motivo">${e.motivos_merma.nombre}</div>` : ''}
        ${e.observacion_merma ? `<div class="evidencia-detail" style="margin-top:8px;font-style:italic;">"${e.observacion_merma}"</div>` : ''}
        <div class="evidencia-fecha">${fecha}</div>
      </div>
    </div>
  `;
}

// Cargar datos para filtros
let filtersLoaded = false;
async function loadFiltersData() {
  if (filtersLoaded) return;

  try {
    // Cargar estaciones
    const { data: estaciones } = await db
      .from('estaciones')
      .select('id, nombre')
      .eq('activo', true)
      .order('orden');

    const selectEstacion = document.getElementById('filter-estacion');
    if (selectEstacion && estaciones) {
      selectEstacion.innerHTML = '<option value="">Todas</option>' +
        estaciones.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('');
    }

    // Cargar operadores
    const { data: operadores } = await db
      .from('operadores')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre');

    const selectOperador = document.getElementById('filter-operador');
    if (selectOperador && operadores) {
      selectOperador.innerHTML = '<option value="">Todos</option>' +
        operadores.map(o => `<option value="${o.id}">${o.nombre}</option>`).join('');
    }

    filtersLoaded = true;
  } catch (err) {
    console.error('Error cargando filtros:', err);
  }
}

// Renderizar paginación
function renderPagination(totalPages, totalItems) {
  const paginationEl = document.getElementById('evidencias-pagination');

  if (totalPages <= 1) {
    paginationEl.innerHTML = '';
    return;
  }

  let html = `
    <button class="pagination-btn" onclick="goToPage(1)" ${currentPage === 1 ? 'disabled' : ''}>
      « Primera
    </button>
    <button class="pagination-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
      ‹ Anterior
    </button>
  `;

  // Números de página
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);

  for (let i = startPage; i <= endPage; i++) {
    html += `
      <button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">
        ${i}
      </button>
    `;
  }

  html += `
    <button class="pagination-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
      Siguiente ›
    </button>
    <button class="pagination-btn" onclick="goToPage(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''}>
      Última »
    </button>
    <span class="pagination-info">
      ${(currentPage - 1) * ITEMS_PER_PAGE + 1}-${Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} de ${totalItems}
    </span>
  `;

  paginationEl.innerHTML = html;
}

// Navegar a página
function goToPage(page) {
  currentPage = page;
  loadEvidenciasReport();
  // Scroll al inicio del contenedor
  document.getElementById('tab-evidencias').scrollIntoView({ behavior: 'smooth' });
}

// ========== EXPORTAR A EXCEL ==========
function exportarEvidenciasExcel() {
  if (evidenciasData.length === 0) {
    showToast('No hay datos para exportar', 'error');
    return;
  }

  // Crear CSV
  const headers = ['OT', 'Cliente', 'Producto', 'Estación', 'Operador', 'Entrada', 'Merma', '% Merma', 'Motivo', 'Observación', 'Fecha', 'URL Evidencia'];

  const rows = evidenciasData.map(e => {
    const porcentaje = e.cantidad_entrada > 0
      ? ((e.cantidad_merma / e.cantidad_entrada) * 100).toFixed(1)
      : 0;
    const fecha = new Date(e.updated_at).toLocaleString('es-MX');

    return [
      e.ordenes_trabajo?.numero_ot || '',
      e.ordenes_trabajo?.cliente || '',
      (e.ordenes_trabajo?.descripcion_producto || '').replace(/"/g, '""'),
      e.estaciones?.nombre || '',
      e.operadores?.nombre || '',
      e.cantidad_entrada || 0,
      e.cantidad_merma || 0,
      porcentaje + '%',
      e.motivos_merma?.nombre || '',
      (e.observacion_merma || '').replace(/"/g, '""'),
      fecha,
      e.evidencia_merma_url || ''
    ];
  });

  // Construir CSV
  let csv = '\uFEFF'; // BOM para Excel
  csv += headers.map(h => `"${h}"`).join(',') + '\n';
  rows.forEach(row => {
    csv += row.map(cell => `"${cell}"`).join(',') + '\n';
  });

  // Descargar
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  const fechaExport = new Date().toISOString().split('T')[0];
  link.download = `evidencias_merma_${fechaExport}.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast('Archivo exportado correctamente', 'success');
}

// ========== MODAL IMAGEN ==========
function openImgModal(url) {
  document.getElementById('img-modal-src').src = url;
  document.getElementById('img-modal').classList.add('active');
}

function closeImgModal() {
  document.getElementById('img-modal').classList.remove('active');
}

// Exponer funciones globales necesarias
window.openImgModal = openImgModal;
window.closeImgModal = closeImgModal;
window.loadReports = loadReports;
window.loadEvidenciasReport = loadEvidenciasReport;
window.goToPage = goToPage;
window.exportarEvidenciasExcel = exportarEvidenciasExcel;
