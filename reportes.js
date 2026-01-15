// FULLEMPAQUES Reportes - Dashboard de Produccion

const SUPABASE_URL = 'https://sjfhtopclyxbwzhslhwf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqZmh0b3BjbHl4Ynd6aHNsaHdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NzEyMTcsImV4cCI6MjA3NjU0NzIxN30.OWaCsPD2khL9PDMG8ZwbQkJNHe4U8bwx595cWWIxlp8';
const SUPERVISOR_PIN = '9999';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentPin = '';
let charts = {};

document.addEventListener('DOMContentLoaded', () => {
  initPinKeypad();
  initTabs();
  initDateFilters();
  if (sessionStorage.getItem('supervisor_auth')) {
    showReports();
  }
});

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

document.getElementById('btn-logout')?.addEventListener('click', () => {
  sessionStorage.removeItem('supervisor_auth');
  location.reload();
});

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

function initDateFilters() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  document.getElementById('filter-desde').value = firstDay.toISOString().split('T')[0];
  document.getElementById('filter-hasta').value = today.toISOString().split('T')[0];
}

async function loadReports() {
  const desde = document.getElementById('filter-desde').value;
  const hasta = document.getElementById('filter-hasta').value + 'T23:59:59';
  try {
    await Promise.all([
      loadOperadoresReport(desde, hasta),
      loadEstacionesReport(desde, hasta),
      loadOrdenesReport(desde, hasta)
    ]);
  } catch (err) {
    console.error('Error cargando reportes:', err);
    showToast('Error cargando reportes', 'error');
  }
}

async function loadOperadoresReport(desde, hasta) {
  const { data, error } = await db
    .from('ot_estaciones')
    .select(`id, operador_id, tiempo_efectivo_minutos, tiempo_total_minutos, cantidad_merma, estado, operadores (id, nombre)`)
    .gte('created_at', desde)
    .lte('created_at', hasta)
    .eq('estado', 'completada');
  if (error) throw error;

  const porOperador = {};
  data.forEach(item => {
    if (!item.operadores) return;
    const opId = item.operador_id;
    if (!porOperador[opId]) {
      porOperador[opId] = { nombre: item.operadores.nombre, completadas: 0, tiempoEfectivo: 0, tiempoTotal: 0, merma: 0 };
    }
    porOperador[opId].completadas++;
    porOperador[opId].tiempoEfectivo += item.tiempo_efectivo_minutos || 0;
    porOperador[opId].tiempoTotal += item.tiempo_total_minutos || 0;
    porOperador[opId].merma += item.cantidad_merma || 0;
  });

  const operadores = Object.values(porOperador);
  const totalCompletadas = operadores.reduce((sum, o) => sum + o.completadas, 0);
  const promedioEficiencia = operadores.length > 0
    ? Math.round(operadores.reduce((sum, o) => {
        const eff = o.tiempoTotal > 0 ? (o.tiempoEfectivo / o.tiempoTotal) * 100 : 100;
        return sum + eff;
      }, 0) / operadores.length)
    : 0;

  document.getElementById('stats-operadores').innerHTML = `
    <div class="stat-card"><div class="stat-value">${operadores.length}</div><div class="stat-label">Operadores Activos</div></div>
    <div class="stat-card"><div class="stat-value success">${totalCompletadas}</div><div class="stat-label">Estaciones Completadas</div></div>
    <div class="stat-card"><div class="stat-value ${promedioEficiencia >= 80 ? 'success' : promedioEficiencia >= 60 ? 'warning' : 'danger'}">${promedioEficiencia}%</div><div class="stat-label">Eficiencia Promedio</div></div>
  `;

  const tbody = document.querySelector('#table-operadores tbody');
  tbody.innerHTML = operadores.length === 0
    ? '<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">Sin datos en este periodo</td></tr>'
    : operadores.map(o => {
        const eficiencia = o.tiempoTotal > 0 ? Math.round((o.tiempoEfectivo / o.tiempoTotal) * 100) : 100;
        const tiempoPausas = o.tiempoTotal - o.tiempoEfectivo;
        return `<tr><td>${o.nombre}</td><td>${o.completadas}</td><td>${formatMinutes(o.tiempoEfectivo)}</td><td>${formatMinutes(tiempoPausas)}</td><td><span class="badge ${eficiencia >= 80 ? 'high' : eficiencia >= 60 ? 'medium' : 'low'}">${eficiencia}%</span></td><td>${o.merma.toLocaleString()}</td></tr>`;
      }).join('');

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
        { label: 'Tiempo Efectivo (min)', data: operadores.map(o => o.tiempoEfectivo), backgroundColor: 'rgba(72, 187, 120, 0.7)' },
        { label: 'Tiempo Pausas (min)', data: operadores.map(o => o.tiempoTotal - o.tiempoEfectivo), backgroundColor: 'rgba(237, 137, 54, 0.7)' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#a0aec0' } } },
      scales: {
        x: { stacked: true, ticks: { color: '#a0aec0' }, grid: { color: 'rgba(255,255,255,0.1)' } },
        y: { stacked: true, ticks: { color: '#a0aec0' }, grid: { color: 'rgba(255,255,255,0.1)' } }
      }
    }
  });
}

async function loadEstacionesReport(desde, hasta) {
  const { data, error } = await db
    .from('ot_estaciones')
    .select(`id, estacion_id, tiempo_efectivo_minutos, cantidad_entrada, cantidad_merma, porcentaje_merma, estado, estaciones (id, nombre)`)
    .gte('created_at', desde)
    .lte('created_at', hasta)
    .eq('estado', 'completada');
  if (error) throw error;

  const porEstacion = {};
  data.forEach(item => {
    if (!item.estaciones) return;
    const estId = item.estacion_id;
    if (!porEstacion[estId]) {
      porEstacion[estId] = { nombre: item.estaciones.nombre, veces: 0, tiempoTotal: 0, mermaTotal: 0, entradaTotal: 0 };
    }
    porEstacion[estId].veces++;
    porEstacion[estId].tiempoTotal += item.tiempo_efectivo_minutos || 0;
    porEstacion[estId].mermaTotal += item.cantidad_merma || 0;
    porEstacion[estId].entradaTotal += item.cantidad_entrada || 0;
  });

  const estaciones = Object.values(porEstacion);
  const estacionMasUsada = estaciones.reduce((max, e) => e.veces > (max?.veces || 0) ? e : max, null);
  const estacionMasMerma = estaciones.reduce((max, e) => {
    const pct = e.entradaTotal > 0 ? (e.mermaTotal / e.entradaTotal) * 100 : 0;
    const maxPct = max?.entradaTotal > 0 ? (max.mermaTotal / max.entradaTotal) * 100 : 0;
    return pct > maxPct ? e : max;
  }, null);

  document.getElementById('stats-estaciones').innerHTML = `
    <div class="stat-card"><div class="stat-value">${estaciones.length}</div><div class="stat-label">Estaciones Activas</div></div>
    <div class="stat-card"><div class="stat-value success">${estacionMasUsada?.nombre || '-'}</div><div class="stat-label">Mas Utilizada</div></div>
    <div class="stat-card"><div class="stat-value danger">${estacionMasMerma?.nombre || '-'}</div><div class="stat-label">Mayor Merma</div></div>
  `;

  const tbody = document.querySelector('#table-estaciones tbody');
  tbody.innerHTML = estaciones.length === 0
    ? '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">Sin datos en este periodo</td></tr>'
    : estaciones.map(e => {
        const tiempoPromedio = e.veces > 0 ? Math.round(e.tiempoTotal / e.veces) : 0;
        const mermaPromedio = e.veces > 0 ? Math.round(e.mermaTotal / e.veces) : 0;
        const pctMerma = e.entradaTotal > 0 ? ((e.mermaTotal / e.entradaTotal) * 100).toFixed(1) : 0;
        return `<tr><td>${e.nombre}</td><td>${e.veces}</td><td>${formatMinutes(tiempoPromedio)}</td><td>${mermaPromedio.toLocaleString()}</td><td><span class="badge ${pctMerma <= 2 ? 'high' : pctMerma <= 5 ? 'medium' : 'low'}">${pctMerma}%</span></td></tr>`;
      }).join('');

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
        backgroundColor: ['rgba(74, 144, 217, 0.8)', 'rgba(72, 187, 120, 0.8)', 'rgba(237, 137, 54, 0.8)', 'rgba(245, 101, 101, 0.8)', 'rgba(159, 122, 234, 0.8)', 'rgba(56, 178, 172, 0.8)', 'rgba(246, 173, 85, 0.8)', 'rgba(236, 72, 153, 0.8)', 'rgba(99, 179, 237, 0.8)']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: '#a0aec0' } } }
    }
  });
}

async function loadOrdenesReport(desde, hasta) {
  const { data, error } = await db
    .from('ordenes_trabajo')
    .select(`id, numero_ot, cliente_nombre, producto_descripcion, estado, ot_estaciones (id, estado, tiempo_efectivo_minutos, cantidad_merma)`)
    .gte('created_at', desde)
    .lte('created_at', hasta)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const completadas = data.filter(o => o.estado === 'completada').length;
  const enProceso = data.filter(o => o.estado === 'en_proceso').length;
  const pendientes = data.filter(o => o.estado === 'pendiente').length;

  document.getElementById('stats-ordenes').innerHTML = `
    <div class="stat-card"><div class="stat-value">${data.length}</div><div class="stat-label">Total OTs</div></div>
    <div class="stat-card"><div class="stat-value success">${completadas}</div><div class="stat-label">Completadas</div></div>
    <div class="stat-card"><div class="stat-value warning">${enProceso}</div><div class="stat-label">En Proceso</div></div>
    <div class="stat-card"><div class="stat-value">${pendientes}</div><div class="stat-label">Pendientes</div></div>
  `;

  const tbody = document.querySelector('#table-ordenes tbody');
  tbody.innerHTML = data.length === 0
    ? '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">Sin OTs en este periodo</td></tr>'
    : data.map(o => {
        const estaciones = o.ot_estaciones || [];
        const completadasEst = estaciones.filter(e => e.estado === 'completada').length;
        const tiempoTotal = estaciones.reduce((sum, e) => sum + (e.tiempo_efectivo_minutos || 0), 0);
        const mermaTotal = estaciones.reduce((sum, e) => sum + (e.cantidad_merma || 0), 0);
        const estadoBadge = { 'pendiente': 'medium', 'en_proceso': 'high', 'completada': 'high', 'cancelada': 'low' };
        return `<tr><td><strong>${o.numero_ot}</strong></td><td>${o.cliente_nombre || '-'}</td><td>${(o.producto_descripcion || '-').substring(0, 30)}...</td><td><span class="badge ${estadoBadge[o.estado] || ''}">${o.estado}</span></td><td>${completadasEst}/${estaciones.length}</td><td>${formatMinutes(tiempoTotal)}</td><td>${mermaTotal.toLocaleString()}</td></tr>`;
      }).join('');
}

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