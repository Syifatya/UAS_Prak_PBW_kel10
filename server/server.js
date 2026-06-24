const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { nanoid } = require('nanoid');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const PUBLIC_PATH = path.join(__dirname, '..', 'public');

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_PATH));

function defaultDB() {
  return {
    users: [],
    sessions: [],
    readings: [],
    foodLogs: [],
    reminders: []
  };
}

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) return defaultDB();
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    return {
      users: parsed.users || [],
      sessions: parsed.sessions || [],
      readings: parsed.readings || [],
      foodLogs: parsed.foodLogs || [],
      reminders: parsed.reminders || []
    };
  } catch (error) {
    return defaultDB();
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    targetBeforeMin: user.targetBeforeMin || 80,
    targetBeforeMax: user.targetBeforeMax || 130,
    targetAfterMax: user.targetAfterMax || 180,
    createdAt: user.createdAt
  };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Silakan login terlebih dahulu.' });
  }

  const db = readDB();
  const session = db.sessions.find(item => item.token === token);
  if (!session) {
    return res.status(401).json({ message: 'Sesi tidak valid. Silakan login ulang.' });
  }

  const user = db.users.find(item => item.id === session.userId);
  if (!user) {
    return res.status(401).json({ message: 'Akun tidak ditemukan.' });
  }

  req.user = user;
  req.token = token;
  req.db = db;
  next();
}

function getStatus(value, context, user) {
  const glucose = Number(value);
  const beforeMin = Number(user?.targetBeforeMin || 80);
  const beforeMax = Number(user?.targetBeforeMax || 130);
  const afterMax = Number(user?.targetAfterMax || 180);

  if (Number.isNaN(glucose)) return 'Tidak Valid';
  if (glucose < 70) return 'Rendah';

  if (context === 'Sesudah Makan') {
    return glucose <= afterMax ? 'Normal' : 'Tinggi';
  }

  if (glucose >= beforeMin && glucose <= beforeMax) return 'Normal';
  if (glucose > beforeMax) return 'Tinggi';
  return 'Rendah';
}

const foodDatabase = {
  'nasi putih': { carbs: 40, gi: 73 },
  'nasi merah': { carbs: 35, gi: 55 },
  'mie instan': { carbs: 55, gi: 65 },
  'roti putih': { carbs: 25, gi: 75 },
  'roti gandum': { carbs: 22, gi: 50 },
  'kentang': { carbs: 30, gi: 78 },
  'ubi': { carbs: 27, gi: 54 },
  'pisang': { carbs: 27, gi: 51 },
  'apel': { carbs: 20, gi: 36 },
  'teh manis': { carbs: 24, gi: 65 },
  'susu': { carbs: 12, gi: 34 },
  'ayam': { carbs: 0, gi: 0 },
  'telur': { carbs: 1, gi: 0 },
  'sayur': { carbs: 8, gi: 20 }
};

function estimateFoodImpact(items) {
  const normalized = Array.isArray(items) ? items : [];

  const details = normalized.map(raw => {
    const name = String(raw.name || '').trim();
    const key = name.toLowerCase();
    const base = foodDatabase[key] || null;
    const portion = Math.max(Number(raw.portion || 1), 0.1);
    const carbs = Number(raw.carbs || base?.carbs || 20) * portion;
    const gi = Number(raw.gi || base?.gi || 55);
    const glycemicLoad = Math.round((carbs * gi) / 100);
    let category = 'Sedang';
    if (glycemicLoad < 10) category = 'Rendah';
    if (glycemicLoad > 19) category = 'Tinggi';

    return {
      name,
      portion,
      carbs: Math.round(carbs),
      gi,
      glycemicLoad,
      category,
      source: base ? 'database' : 'estimasi manual'
    };
  });

  const totalCarbs = details.reduce((sum, item) => sum + item.carbs, 0);
  const totalGL = details.reduce((sum, item) => sum + item.glycemicLoad, 0);

  // Estimasi kasar untuk prototype: karbohidrat dan glycemic load dipakai sebagai indikator kenaikan.
  // Ini bukan hitungan medis final karena respons tubuh tiap orang berbeda.
  const estimatedRise = Math.round(totalCarbs * 1.2 + totalGL * 0.8);

  let risk = 'Rendah';
  if (estimatedRise >= 45) risk = 'Sedang';
  if (estimatedRise >= 80) risk = 'Tinggi';

  let recommendation = 'Porsi makanan terlihat cukup aman. Tetap catat hasil gula darah setelah makan.';
  if (risk === 'Sedang') recommendation = 'Dampak gula diperkirakan sedang. Perhatikan porsi karbohidrat dan cek gula darah 2 jam setelah makan.';
  if (risk === 'Tinggi') recommendation = 'Dampak gula diperkirakan tinggi. Kurangi porsi karbohidrat cepat serap dan diskusikan pola makan dengan tenaga kesehatan.';

  return { details, totalCarbs: Math.round(totalCarbs), totalGL, estimatedRise, risk, recommendation };
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'GulaTrack API berjalan' });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, phone } = req.body;
  const cleanEmail = normalizeEmail(email);

  if (!name || !cleanEmail || !password) {
    return res.status(400).json({ message: 'Nama, email, dan password wajib diisi.' });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ message: 'Password minimal 6 karakter.' });
  }

  const db = readDB();
  if (db.users.some(user => user.email === cleanEmail)) {
    return res.status(409).json({ message: 'Email sudah terdaftar. Silakan login.' });
  }

  const { salt, hash } = hashPassword(password);
  const user = {
    id: nanoid(12),
    name: String(name).trim(),
    email: cleanEmail,
    phone: phone || '',
    salt,
    passwordHash: hash,
    targetBeforeMin: 80,
    targetBeforeMax: 130,
    targetAfterMax: 180,
    createdAt: new Date().toISOString()
  };

  const defaultReminders = [
    { id: nanoid(10), userId: user.id, title: 'Cek Gula Darah', schedule: '07:00, 12:00, 19:00', active: true, icon: '💧' },
    { id: nanoid(10), userId: user.id, title: 'Obat / Insulin', schedule: '08:00, 20:00', active: true, icon: '💊' },
    { id: nanoid(10), userId: user.id, title: 'Makan', schedule: '08:00, 13:00, 19:00', active: true, icon: '🍽️' },
    { id: nanoid(10), userId: user.id, title: 'Olahraga', schedule: '17:00', active: false, icon: '🏃' }
  ];

  const token = nanoid(40);
  db.users.push(user);
  db.reminders.push(...defaultReminders);
  db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
  writeDB(db);

  res.status(201).json({ token, user: safeUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = normalizeEmail(email);
  const db = readDB();
  const user = db.users.find(item => item.email === cleanEmail);

  if (!user) {
    return res.status(401).json({ message: 'Email atau password salah.' });
  }

  const { hash } = hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    return res.status(401).json({ message: 'Email atau password salah.' });
  }

  const token = nanoid(40);
  db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
  writeDB(db);

  res.json({ token, user: safeUser(user) });
});

app.post('/api/auth/logout', auth, (req, res) => {
  const db = req.db;
  db.sessions = db.sessions.filter(item => item.token !== req.token);
  writeDB(db);
  res.json({ message: 'Berhasil logout.' });
});

app.get('/api/me', auth, (req, res) => {
  res.json(safeUser(req.user));
});

app.get('/api/readings', auth, (req, res) => {
  const sorted = req.db.readings
    .filter(item => item.userId === req.user.id)
    .sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
  res.json(sorted);
});

app.get('/api/readings/summary', auth, (req, res) => {
  const readings = req.db.readings.filter(item => item.userId === req.user.id);

  if (readings.length === 0) {
    return res.json({ latest: null, average: 0, highest: 0, lowest: 0, total: 0, normal: 0, high: 0, low: 0 });
  }

  const sorted = [...readings].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
  const values = readings.map(item => Number(item.value));
  const average = Math.round(values.reduce((sum, val) => sum + val, 0) / values.length);

  res.json({
    latest: sorted[0],
    average,
    highest: Math.max(...values),
    lowest: Math.min(...values),
    total: readings.length,
    normal: readings.filter(item => item.status === 'Normal').length,
    high: readings.filter(item => item.status === 'Tinggi').length,
    low: readings.filter(item => item.status === 'Rendah').length
  });
});

app.post('/api/readings', auth, (req, res) => {
  const { value, date, time, context, note, mealId } = req.body;

  if (!value || !date || !time || !context) {
    return res.status(400).json({ message: 'Nilai gula darah, tanggal, waktu, dan konteks wajib diisi.' });
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue) || numericValue <= 0) {
    return res.status(400).json({ message: 'Nilai gula darah harus berupa angka positif.' });
  }

  const db = req.db;
  const newReading = {
    id: nanoid(10),
    userId: req.user.id,
    value: numericValue,
    date,
    time,
    dateTime: `${date}T${time}`,
    context,
    note: note || '',
    mealId: mealId || null,
    status: getStatus(numericValue, context, req.user),
    createdAt: new Date().toISOString()
  };

  db.readings.push(newReading);
  writeDB(db);
  res.status(201).json(newReading);
});

app.delete('/api/readings/:id', auth, (req, res) => {
  const db = req.db;
  const before = db.readings.length;
  db.readings = db.readings.filter(item => !(item.id === req.params.id && item.userId === req.user.id));

  if (db.readings.length === before) {
    return res.status(404).json({ message: 'Catatan tidak ditemukan.' });
  }

  writeDB(db);
  res.json({ message: 'Catatan berhasil dihapus.' });
});

app.get('/api/foods/catalog', auth, (req, res) => {
  res.json(Object.entries(foodDatabase).map(([name, value]) => ({ name, ...value })));
});

app.post('/api/foods/analyze', auth, (req, res) => {
  const { items, date, time, note } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Minimal masukkan 1 makanan.' });
  }

  const analysis = estimateFoodImpact(items);
  const db = req.db;
  const foodLog = {
    id: nanoid(10),
    userId: req.user.id,
    date: date || new Date().toISOString().slice(0, 10),
    time: time || new Date().toTimeString().slice(0, 5),
    note: note || '',
    items: analysis.details,
    analysis,
    createdAt: new Date().toISOString()
  };

  db.foodLogs.push(foodLog);
  writeDB(db);
  res.status(201).json(foodLog);
});

app.get('/api/foods/logs', auth, (req, res) => {
  const logs = req.db.foodLogs
    .filter(item => item.userId === req.user.id)
    .sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));
  res.json(logs);
});

app.delete('/api/foods/logs/:id', auth, (req, res) => {
  const db = req.db;
  const before = db.foodLogs.length;
  db.foodLogs = db.foodLogs.filter(item => !(item.id === req.params.id && item.userId === req.user.id));

  if (db.foodLogs.length === before) {
    return res.status(404).json({ message: 'Analisis makanan tidak ditemukan.' });
  }

  writeDB(db);
  res.json({ message: 'Analisis makanan berhasil dihapus.' });
});

app.get('/api/reminders', auth, (req, res) => {
  res.json(req.db.reminders.filter(item => item.userId === req.user.id));
});

app.patch('/api/reminders/:id/toggle', auth, (req, res) => {
  const db = req.db;
  const reminder = db.reminders.find(item => item.id === req.params.id && item.userId === req.user.id);

  if (!reminder) {
    return res.status(404).json({ message: 'Pengingat tidak ditemukan.' });
  }

  reminder.active = !reminder.active;
  writeDB(db);
  res.json(reminder);
});

app.get('/api/profile', auth, (req, res) => {
  res.json(safeUser(req.user));
});

app.put('/api/profile', auth, (req, res) => {
  const db = req.db;
  const user = db.users.find(item => item.id === req.user.id);
  const allowed = ['name', 'phone', 'targetBeforeMin', 'targetBeforeMax', 'targetAfterMax'];

  allowed.forEach(key => {
    if (req.body[key] !== undefined) user[key] = req.body[key];
  });

  writeDB(db);
  res.json(safeUser(user));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_PATH, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`GulaTrack berjalan di http://localhost:${PORT}`);
});
