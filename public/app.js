const API_BASE = '';

const pageTitles = {
  dashboard: 'Beranda',
  add: 'Tambah Catatan',
  food: 'Analisis Makanan',
  history: 'Riwayat',
  chart: 'Grafik & Tren',
  reminder: 'Pengingat',
  profile: 'Profil & Laporan'
};

let token = localStorage.getItem('gulatrack_token') || '';
let currentUser = null;
let readings = [];
let reminders = [];
let foodLogs = [];
let foodCatalog = [];
let selectedFoods = [];

const el = {
  authPage: document.getElementById('authPage'),
  appShell: document.getElementById('appShell'),
  loginTab: document.getElementById('loginTab'),
  registerTab: document.getElementById('registerTab'),
  loginForm: document.getElementById('loginForm'),
  registerForm: document.getElementById('registerForm'),
  logoutBtn: document.getElementById('logoutBtn'),
  pageTitle: document.getElementById('pageTitle'),
  navItems: document.querySelectorAll('.nav-item'),
  pages: document.querySelectorAll('.page'),
  readingForm: document.getElementById('readingForm'),
  foodForm: document.getElementById('foodForm'),
  recentList: document.getElementById('recentList'),
  historyList: document.getElementById('historyList'),
  searchInput: document.getElementById('searchInput'),
  statusFilter: document.getElementById('statusFilter'),
  reminderList: document.getElementById('reminderList'),
  toast: document.getElementById('toast'),
  chart: document.getElementById('glucoseChart'),
  insightText: document.getElementById('insightText'),
  selectedFoods: document.getElementById('selectedFoods'),
  foodResult: document.getElementById('foodResult'),
  foodLogList: document.getElementById('foodLogList')
};

function showToast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('show');
  setTimeout(() => el.toast.classList.remove('show'), 2400);
}

function initials(name) {
  return String(name || 'GT')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() || '')
    .join('') || 'GT';
}

function formatDate(dateString) {
  if (!dateString) return '-';
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(dateString));
}

function setTodayForm() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5);
  document.getElementById('date').value = date;
  document.getElementById('time').value = time;
  document.getElementById('foodDate').value = date;
  document.getElementById('foodTime').value = time;
}

async function request(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) forceLogout(false);
    throw new Error(data?.message || 'Terjadi kesalahan server.');
  }
  return data;
}

function showAuth(mode = 'login') {
  el.authPage.classList.remove('hidden');
  el.appShell.classList.add('hidden');
  const isLogin = mode === 'login';
  el.loginForm.classList.toggle('hidden', !isLogin);
  el.registerForm.classList.toggle('hidden', isLogin);
  el.loginTab.classList.toggle('active', isLogin);
  el.registerTab.classList.toggle('active', !isLogin);
}

function showApp() {
  el.authPage.classList.add('hidden');
  el.appShell.classList.remove('hidden');
}

function forceLogout(showMessage = true) {
  token = '';
  currentUser = null;
  readings = [];
  reminders = [];
  foodLogs = [];
  selectedFoods = [];
  localStorage.removeItem('gulatrack_token');
  showAuth('login');
  if (showMessage) showToast('Berhasil logout.');
}

function openPage(pageId) {
  el.pages.forEach(page => page.classList.remove('active-page'));
  document.getElementById(pageId).classList.add('active-page');

  el.navItems.forEach(item => item.classList.toggle('active', item.dataset.page === pageId));
  el.pageTitle.textContent = pageTitles[pageId] || 'GulaTrack';
  if (pageId === 'chart') drawChart();
}

async function loadAll() {
  if (!token) return showAuth('login');
  try {
    currentUser = await request('/api/me');
    showApp();
    await Promise.all([loadReadings(), loadReminders(), loadFoods(), loadCatalog()]);
    renderUser();
    renderAll();
  } catch (error) {
    showToast(error.message);
  }
}

function renderUser() {
  if (!currentUser) return;
  const userInitials = initials(currentUser.name);
  document.getElementById('miniAvatar').textContent = userInitials;
  document.getElementById('profileAvatar').textContent = userInitials;
  document.getElementById('miniName').textContent = currentUser.name;
  document.getElementById('sideName').textContent = currentUser.name;
  document.getElementById('sideEmail').textContent = currentUser.email;
  document.getElementById('welcomeName').textContent = currentUser.name;
  document.getElementById('profileName').textContent = currentUser.name;
  document.getElementById('profileEmail').textContent = currentUser.email;
  document.getElementById('profilePhone').textContent = currentUser.phone || '-';
  document.getElementById('editName').value = currentUser.name || '';
  document.getElementById('editPhone').value = currentUser.phone || '';
  document.getElementById('targetBeforeMin').value = currentUser.targetBeforeMin || 80;
  document.getElementById('targetBeforeMax').value = currentUser.targetBeforeMax || 130;
  document.getElementById('targetAfterMax').value = currentUser.targetAfterMax || 180;
  document.getElementById('targetBefore').textContent = `${currentUser.targetBeforeMin || 80} - ${currentUser.targetBeforeMax || 130} mg/dL`;
  document.getElementById('targetAfter').textContent = `< ${currentUser.targetAfterMax || 180} mg/dL`;
}

async function loadReadings() {
  const [list, summary] = await Promise.all([
    request('/api/readings'),
    request('/api/readings/summary')
  ]);
  readings = list;
  renderSummary(summary);
}

async function loadReminders() {
  reminders = await request('/api/reminders');
}

async function loadFoods() {
  foodLogs = await request('/api/foods/logs');
}

async function loadCatalog() {
  foodCatalog = await request('/api/foods/catalog');
  const datalist = document.getElementById('foodOptions');
  datalist.innerHTML = foodCatalog.map(item => `<option value="${item.name}"></option>`).join('');
}

function renderSummary(summary) {
  if (summary.latest) {
    document.getElementById('latestValue').textContent = `${summary.latest.value} mg/dL`;
    document.getElementById('latestMeta').textContent = `${summary.latest.status} • ${summary.latest.context} • ${formatDate(summary.latest.date)} ${summary.latest.time}`;
  } else {
    document.getElementById('latestValue').textContent = '-';
    document.getElementById('latestMeta').textContent = 'Belum ada catatan';
  }
  document.getElementById('avgValue').textContent = summary.average;
  document.getElementById('highestValue').textContent = summary.highest;
  document.getElementById('lowestValue').textContent = summary.lowest;
  document.getElementById('normalCount').textContent = summary.normal;
  document.getElementById('highCount').textContent = summary.high;
  document.getElementById('lowCount').textContent = summary.low;
}

function createReadingItem(item, withDelete = false) {
  const div = document.createElement('div');
  div.className = 'reading-item';
  div.innerHTML = `
    <div>
      <h4>${item.context}</h4>
      <p>${formatDate(item.date)} • ${item.time}${item.note ? ` • ${item.note}` : ''}</p>
    </div>
    <div class="reading-value">${item.value}<small> mg/dL</small></div>
    <div class="status-badge status-${item.status}">${item.status}</div>
  `;

  if (withDelete) {
    const button = document.createElement('button');
    button.className = 'delete-btn';
    button.textContent = 'Hapus';
    button.addEventListener('click', () => deleteReading(item.id));
    div.appendChild(button);
  }
  return div;
}

function renderRecent() {
  el.recentList.innerHTML = '';
  const latest = readings.slice(0, 5);
  if (latest.length === 0) {
    el.recentList.textContent = 'Belum ada catatan.';
    el.recentList.classList.add('empty-list');
    return;
  }
  el.recentList.classList.remove('empty-list');
  latest.forEach(item => el.recentList.appendChild(createReadingItem(item)));
}

function renderHistory() {
  const keyword = el.searchInput.value.toLowerCase().trim();
  const status = el.statusFilter.value;
  const filtered = readings.filter(item => {
    const text = `${item.context} ${item.status} ${item.note}`.toLowerCase();
    const matchKeyword = text.includes(keyword);
    const matchStatus = status === 'all' || item.status === status;
    return matchKeyword && matchStatus;
  });

  el.historyList.innerHTML = '';
  if (filtered.length === 0) {
    el.historyList.textContent = 'Tidak ada catatan yang sesuai.';
    el.historyList.classList.add('empty-list');
    return;
  }
  el.historyList.classList.remove('empty-list');
  filtered.forEach(item => el.historyList.appendChild(createReadingItem(item, true)));
}

function renderReminders() {
  el.reminderList.innerHTML = '';
  if (reminders.length === 0) {
    el.reminderList.textContent = 'Belum ada pengingat.';
    el.reminderList.classList.add('empty-list');
    return;
  }
  el.reminderList.classList.remove('empty-list');
  reminders.forEach(item => {
    const div = document.createElement('div');
    div.className = 'reminder-item';
    div.innerHTML = `
      <div class="reminder-icon">${item.icon || '🔔'}</div>
      <div><h4>${item.title}</h4><p>${item.schedule}</p></div>
      <button class="toggle ${item.active ? 'active' : ''}" type="button"><span></span></button>
    `;
    div.querySelector('.toggle').addEventListener('click', () => toggleReminder(item.id));
    el.reminderList.appendChild(div);
  });
}

function renderSelectedFoods() {
  el.selectedFoods.innerHTML = '';
  if (selectedFoods.length === 0) {
    el.selectedFoods.textContent = 'Belum ada makanan dipilih.';
    el.selectedFoods.classList.add('empty-list');
    return;
  }
  el.selectedFoods.classList.remove('empty-list');
  selectedFoods.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'food-chip';
    div.innerHTML = `<span><strong>${item.name}</strong> • ${item.portion} porsi${item.carbs ? ` • ${item.carbs}g karbo/porsi` : ''}</span>`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Hapus';
    button.addEventListener('click', () => {
      selectedFoods.splice(index, 1);
      renderSelectedFoods();
    });
    div.appendChild(button);
    el.selectedFoods.appendChild(div);
  });
}

function renderFoodResult(log) {
  if (!log) {
    el.foodResult.textContent = 'Belum ada analisis.';
    el.foodResult.classList.add('empty-list');
    return;
  }

  const a = log.analysis;
  el.foodResult.classList.remove('empty-list');
  el.foodResult.innerHTML = `
    <p><strong>${formatDate(log.date)} • ${log.time}</strong></p>
    <div class="food-result-grid">
      <div class="food-mini-stat"><span>Total Karbo</span><b>${a.totalCarbs}g</b></div>
      <div class="food-mini-stat"><span>Estimasi Naik</span><b>+${a.estimatedRise}</b></div>
      <div class="food-mini-stat"><span>Risiko</span><b class="risk-${a.risk}">${a.risk}</b></div>
    </div>
    <p>${a.recommendation}</p>
    <p class="muted">Makanan: ${a.details.map(item => `${item.name} (${item.category})`).join(', ')}</p>
  `;
}

function renderFoodLogs() {
  el.foodLogList.innerHTML = '';
  if (foodLogs.length === 0) {
    el.foodLogList.textContent = 'Belum ada riwayat makanan.';
    el.foodLogList.classList.add('empty-list');
    renderFoodResult(null);
    return;
  }
  el.foodLogList.classList.remove('empty-list');
  renderFoodResult(foodLogs[0]);

  foodLogs.forEach(log => {
    const div = document.createElement('div');
    div.className = 'food-log-item';
    div.innerHTML = `
      <div>
        <h4>${formatDate(log.date)} • ${log.time}</h4>
        <p>${log.items.map(item => `${item.name} (${item.carbs}g karbo)`).join(', ')}</p>
        <p class="risk-${log.analysis.risk}">Risiko ${log.analysis.risk} • estimasi kenaikan +${log.analysis.estimatedRise} mg/dL</p>
      </div>
      <div class="status-badge">${log.analysis.totalCarbs}g karbo</div>
    `;
    const button = document.createElement('button');
    button.className = 'delete-btn';
    button.textContent = 'Hapus';
    button.addEventListener('click', () => deleteFoodLog(log.id));
    div.appendChild(button);
    el.foodLogList.appendChild(div);
  });
}

function renderAll() {
  renderRecent();
  renderHistory();
  renderReminders();
  renderSelectedFoods();
  renderFoodLogs();
  drawChart();
}

function drawChart() {
  const canvas = el.chart;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fffaf7';
  ctx.fillRect(0, 0, width, height);

  const data = [...readings].sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime)).slice(-7);
  if (data.length === 0) {
    ctx.fillStyle = '#856d72';
    ctx.font = '20px Arial';
    ctx.fillText('Belum ada data untuk grafik.', 40, 80);
    el.insightText.textContent = 'Tambahkan beberapa catatan untuk melihat pola gula darah.';
    return;
  }

  const padding = 55;
  const values = data.map(item => Number(item.value));
  const maxValue = Math.max(220, ...values) + 10;
  const minValue = Math.min(40, ...values) - 10;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const x = index => data.length === 1 ? padding + plotWidth / 2 : padding + (index * plotWidth) / (data.length - 1);
  const y = value => padding + ((maxValue - value) / (maxValue - minValue)) * plotHeight;

  ctx.fillStyle = 'rgba(19, 138, 67, 0.10)';
  ctx.fillRect(padding, y(currentUser?.targetBeforeMax || 130), plotWidth, y(currentUser?.targetBeforeMin || 80) - y(currentUser?.targetBeforeMax || 130));

  ctx.strokeStyle = '#f1d7dc';
  ctx.lineWidth = 1;
  [60, 100, 140, 180, 220].forEach(mark => {
    ctx.beginPath();
    ctx.moveTo(padding, y(mark));
    ctx.lineTo(width - padding, y(mark));
    ctx.stroke();
    ctx.fillStyle = '#856d72';
    ctx.font = '13px Arial';
    ctx.fillText(mark, 14, y(mark) + 4);
  });

  ctx.strokeStyle = '#8b1028';
  ctx.lineWidth = 4;
  ctx.beginPath();
  data.forEach((item, index) => {
    const px = x(index);
    const py = y(item.value);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  data.forEach((item, index) => {
    const px = x(index);
    const py = y(item.value);
    ctx.fillStyle = '#8b1028';
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#520915';
    ctx.font = '12px Arial';
    ctx.fillText(item.value, px - 12, py - 12);
    ctx.fillStyle = '#856d72';
    ctx.fillText(item.date.slice(5), px - 16, height - 22);
  });

  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const high = Math.max(...values);
  const low = Math.min(...values);
  el.insightText.textContent = `Rata-rata ${avg} mg/dL. Nilai tertinggi ${high} mg/dL dan terendah ${low} mg/dL dari ${data.length} catatan terakhir.`;
}

async function refreshData() {
  await Promise.all([loadReadings(), loadReminders(), loadFoods()]);
  renderAll();
}

async function deleteReading(id) {
  try {
    await request(`/api/readings/${id}`, { method: 'DELETE' });
    showToast('Catatan berhasil dihapus.');
    await refreshData();
  } catch (error) { showToast(error.message); }
}

async function deleteFoodLog(id) {
  try {
    await request(`/api/foods/logs/${id}`, { method: 'DELETE' });
    showToast('Analisis makanan berhasil dihapus.');
    await refreshData();
  } catch (error) { showToast(error.message); }
}

async function toggleReminder(id) {
  try {
    await request(`/api/reminders/${id}/toggle`, { method: 'PATCH' });
    await loadReminders();
    renderReminders();
  } catch (error) { showToast(error.message); }
}

function buildReport() {
  const lines = [];
  lines.push('LAPORAN GULATRACK');
  lines.push(`Nama: ${currentUser?.name || '-'}`);
  lines.push(`Email: ${currentUser?.email || '-'}`);
  lines.push(`Target puasa/sebelum makan: ${currentUser?.targetBeforeMin || 80}-${currentUser?.targetBeforeMax || 130} mg/dL`);
  lines.push(`Target sesudah makan: < ${currentUser?.targetAfterMax || 180} mg/dL`);
  lines.push('');
  lines.push('RIWAYAT GULA DARAH');
  readings.forEach(item => lines.push(`${item.date} ${item.time} | ${item.context} | ${item.value} mg/dL | ${item.status} | ${item.note || '-'}`));
  lines.push('');
  lines.push('RIWAYAT ANALISIS MAKANAN');
  foodLogs.forEach(log => lines.push(`${log.date} ${log.time} | ${log.items.map(item => item.name).join(', ')} | total karbo ${log.analysis.totalCarbs}g | risiko ${log.analysis.risk} | estimasi +${log.analysis.estimatedRise} mg/dL`));
  return lines.join('\n');
}

// Auth events
el.loginTab.addEventListener('click', () => showAuth('login'));
el.registerTab.addEventListener('click', () => showAuth('register'));

el.loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const data = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: document.getElementById('loginEmail').value, password: document.getElementById('loginPassword').value })
    });
    token = data.token;
    localStorage.setItem('gulatrack_token', token);
    showToast('Login berhasil.');
    await loadAll();
  } catch (error) { showToast(error.message); }
});

el.registerForm.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const data = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('registerName').value,
        email: document.getElementById('registerEmail').value,
        phone: document.getElementById('registerPhone').value,
        password: document.getElementById('registerPassword').value
      })
    });
    token = data.token;
    localStorage.setItem('gulatrack_token', token);
    showToast('Register berhasil.');
    await loadAll();
  } catch (error) { showToast(error.message); }
});

el.logoutBtn.addEventListener('click', async () => {
  try { if (token) await request('/api/auth/logout', { method: 'POST' }); } catch (_) {}
  forceLogout(true);
});

// Navigation
el.navItems.forEach(item => item.addEventListener('click', () => openPage(item.dataset.page)));
document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => openPage(button.dataset.open)));

// Reading form
el.readingForm.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await request('/api/readings', {
      method: 'POST',
      body: JSON.stringify({
        value: document.getElementById('value').value,
        date: document.getElementById('date').value,
        time: document.getElementById('time').value,
        context: document.getElementById('context').value,
        note: document.getElementById('note').value
      })
    });
    el.readingForm.reset();
    setTodayForm();
    showToast('Catatan gula darah tersimpan.');
    await refreshData();
    openPage('dashboard');
  } catch (error) { showToast(error.message); }
});

// Food analysis
 document.getElementById('addFoodItem').addEventListener('click', () => {
  const name = document.getElementById('foodName').value.trim();
  const portion = Number(document.getElementById('foodPortion').value || 1);
  const carbsValue = document.getElementById('foodCarbs').value;
  if (!name) return showToast('Nama makanan wajib diisi.');
  selectedFoods.push({ name, portion, carbs: carbsValue ? Number(carbsValue) : undefined });
  document.getElementById('foodName').value = '';
  document.getElementById('foodPortion').value = 1;
  document.getElementById('foodCarbs').value = '';
  renderSelectedFoods();
});

el.foodForm.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    if (selectedFoods.length === 0) return showToast('Tambahkan minimal 1 makanan dulu.');
    await request('/api/foods/analyze', {
      method: 'POST',
      body: JSON.stringify({
        date: document.getElementById('foodDate').value,
        time: document.getElementById('foodTime').value,
        note: document.getElementById('foodNote').value,
        items: selectedFoods
      })
    });
    selectedFoods = [];
    document.getElementById('foodNote').value = '';
    renderSelectedFoods();
    showToast('Analisis makanan berhasil disimpan.');
    await refreshData();
  } catch (error) { showToast(error.message); }
});

// Filters
el.searchInput.addEventListener('input', renderHistory);
el.statusFilter.addEventListener('change', renderHistory);

// Profile
 document.getElementById('profileForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    currentUser = await request('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name: document.getElementById('editName').value,
        phone: document.getElementById('editPhone').value,
        targetBeforeMin: Number(document.getElementById('targetBeforeMin').value),
        targetBeforeMax: Number(document.getElementById('targetBeforeMax').value),
        targetAfterMax: Number(document.getElementById('targetAfterMax').value)
      })
    });
    renderUser();
    showToast('Profil berhasil diperbarui.');
  } catch (error) { showToast(error.message); }
});

 document.getElementById('downloadReport').addEventListener('click', () => {
  const blob = new Blob([buildReport()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `laporan-gulatrack-${currentUser?.name || 'user'}.txt`;
  link.click();
  URL.revokeObjectURL(url);
});

 document.getElementById('copyReport').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(buildReport());
    showToast('Ringkasan disalin.');
  } catch (error) {
    showToast('Gagal menyalin ringkasan.');
  }
});

setTodayForm();
loadAll();
