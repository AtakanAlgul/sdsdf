/**
 * Cloudflare Pages Functions - Unified API Router
 * Tüm endpoint'ler: /api/games, /api/status, /api/reviews, /api/settings, /api/stats, /api/admin/*
 * 
 * D1 Bağlama: wrangler.toml içinde DB = hileprofesoru-db
 */

const ADMIN_SECRET = 'hileprof_admin_2026'; // Admin paneli için basit token

// CORS headers
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  'Content-Type': 'application/json'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function unauthorized() {
  return json({ error: 'Yetkisiz erişim' }, 401);
}

function checkAdmin(request) {
  const token = request.headers.get('X-Admin-Token');
  return token === ADMIN_SECRET;
}

async function initDB(DB) {
  // Tabloları oluştur
  await DB.prepare(`CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, icon TEXT DEFAULT 'fa-solid fa-gamepad',
    link TEXT DEFAULT '', description TEXT DEFAULT '', color TEXT DEFAULT '#00ff66',
    status TEXT DEFAULT 'Aktif' CHECK(status IN ('Aktif', 'Bakımda', 'Kapalı')),
    features TEXT DEFAULT '[]', downloads INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')), created_at TEXT DEFAULT (datetime('now'))
  )`).run();
  
  await DB.prepare(`CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, tag TEXT DEFAULT '', text TEXT NOT NULL,
    stars INTEGER DEFAULT 5 CHECK(stars BETWEEN 1 AND 5),
    status TEXT DEFAULT 'Aktif' CHECK(status IN ('Aktif', 'Gizli')),
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
  
  await DB.prepare(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, balance REAL DEFAULT 0, token TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
  
  await DB.prepare(`CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT DEFAULT '')`).run();

  // İlk kurulum (Seed data)
  const check = await DB.prepare("SELECT value FROM config WHERE key = 'version'").first();
  if (!check) {
    const stmts = [
      DB.prepare("INSERT OR IGNORE INTO config (key, value) VALUES ('status_battleye', 'Aktif')"),
      DB.prepare("INSERT OR IGNORE INTO config (key, value) VALUES ('status_eac', 'Aktif')"),
      DB.prepare("INSERT OR IGNORE INTO config (key, value) VALUES ('status_vanguard', 'Aktif')"),
      DB.prepare("INSERT OR IGNORE INTO config (key, value) VALUES ('status_rockstar', 'Aktif')"),
      DB.prepare("INSERT OR IGNORE INTO config (key, value) VALUES ('version', 'v2.6.1')"),
      DB.prepare("INSERT OR IGNORE INTO config (key, value) VALUES ('pageviews', '0')"),
      
      DB.prepare(`INSERT OR IGNORE INTO games (id, name, slug, icon, link, description, color, status, features, downloads, sort_order)
      VALUES ('metin2hile', 'Metin2 Hile', 'metin2hile', 'fa-solid fa-dragon', 'https://dosya.co/akv2aw40usvr/Hunt2_Beta_V.1.10.rar.html', 'Metin2 için profesyonel hile aracı. SpeedHack, GodMode ve daha fazlası.', '#ff3333', 'Aktif', '["Speed Hack","God Mode","Otomatik Toplama","Teleport","Damage Hack"]', 0, 1)`),
      
      DB.prepare(`INSERT OR IGNORE INTO games (id, name, slug, icon, link, description, color, status, features, downloads, sort_order)
      VALUES ('robloxhile', 'Roblox Hile', 'robloxhile', 'fa-solid fa-cube', 'https://dosya.co/', 'Roblox exploitleri ve scriptler. Lua injector ile sınırsız oyun deneyimi.', '#00bfff', 'Aktif', '["Script Executor","ESP","Fly Hack","Speed Hack","Infinite Jump"]', 0, 2)`),
      
      DB.prepare(`INSERT OR IGNORE INTO games (id, name, slug, icon, link, description, color, status, features, downloads, sort_order)
      VALUES ('gtaonline', 'GTA Online Hile', 'gtaonline', 'fa-solid fa-car', '/gtaonline', 'GTA Online mod menüsü. Para, araç ve silah hileleri.', '#ffb703', 'Aktif', '["Money Drop","RP Hack","God Mode","Teleport","Vehicle Spawner"]', 0, 3)`),
      
      DB.prepare(`INSERT OR IGNORE INTO reviews (id, name, tag, text, stars, status) VALUES ('rev_001', 'Ahmet K.', 'Metin2 Oyuncusu', 'Metin2 botunu yaklaşık 3 haftadır aralıksız kullanıyorum. Henüz hiçbir şekilde ban yemedim. Otomatik balık tutma özelliği harika çalışıyor.', 5, 'Aktif')`),
      DB.prepare(`INSERT OR IGNORE INTO reviews (id, name, tag, text, stars, status) VALUES ('rev_002', 'Emre Y.', 'Roblox Developer', 'Roblox executor scriptlerini buradan indiriyorum. Delta sürümü sorunsuz inject ediliyor. Güncellemeleri YouTube''dan takip etmek çok kolay.', 5, 'Aktif')`),
      DB.prepare(`INSERT OR IGNORE INTO reviews (id, name, tag, text, stars, status) VALUES ('rev_003', 'Mert S.', 'GTA Online Üyesi', 'GTA Online para paketinden satın aldım. Yarım saatte hesabıma 150M GTA$ aktardılar. Hızlı işlem ve güvenilir destek için çok teşekkür ederim.', 5, 'Aktif')`)
    ];
    await DB.batch(stmts);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');

  // OPTIONS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const DB = env.DB;
  if (!DB) {
    return json({ error: 'Veritabanı bağlantısı bulunamadı. D1 bağlamasını kontrol edin.' }, 500);
  }

  // ─── Router ───
  try {
    // Tabloları oluştur (hata verirse catch bloğuna düşsün diye buraya alındı)
    await initDB(DB);

    // ── AUTH & USERS ──
    if (path === 'auth/register' && request.method === 'POST') return await registerUser(DB, request);
    if (path === 'auth/login' && request.method === 'POST') return await loginUser(DB, request);
    if (path === 'user/me' && request.method === 'GET') return await getMe(DB, request);
    if (path === 'admin/users' && request.method === 'GET') {
      if (!checkAdmin(request)) return unauthorized();
      return await getAdminUsers(DB);
    }
    if (path.match(/^admin\/users\/[^/]+\/balance$/) && request.method === 'PUT') {
      if (!checkAdmin(request)) return unauthorized();
      return await updateBalance(DB, request, path.split('/')[2]);
    }

    // GET /api/games
    if (path === 'games' && request.method === 'GET') {
      return await getGames(DB);
    }

    // POST /api/games (admin)
    if (path === 'games' && request.method === 'POST') {
      if (!checkAdmin(request)) return unauthorized();
      return await createGame(DB, request);
    }

    // PUT /api/games/:id (admin)
    if (path.startsWith('games/') && request.method === 'PUT') {
      if (!checkAdmin(request)) return unauthorized();
      const id = path.split('/')[1];
      return await updateGame(DB, request, id);
    }

    // DELETE /api/games/:id (admin)
    if (path.startsWith('games/') && request.method === 'DELETE') {
      if (!checkAdmin(request)) return unauthorized();
      const id = path.split('/')[1];
      return await deleteGame(DB, id);
    }

    // GET /api/status
    if (path === 'status' && request.method === 'GET') {
      return await getStatus(DB);
    }

    // PUT /api/status (admin)
    if (path === 'status' && request.method === 'PUT') {
      if (!checkAdmin(request)) return unauthorized();
      return await updateStatus(DB, request);
    }

    // GET /api/reviews
    if (path === 'reviews' && request.method === 'GET') {
      return await getReviews(DB);
    }

    // POST /api/reviews (admin)
    if (path === 'reviews' && request.method === 'POST') {
      if (!checkAdmin(request)) return unauthorized();
      return await createReview(DB, request);
    }

    // PUT /api/reviews/:id (admin)
    if (path.startsWith('reviews/') && request.method === 'PUT') {
      if (!checkAdmin(request)) return unauthorized();
      const id = path.split('/')[1];
      return await updateReview(DB, request, id);
    }

    // DELETE /api/reviews/:id (admin)
    if (path.startsWith('reviews/') && request.method === 'DELETE') {
      if (!checkAdmin(request)) return unauthorized();
      const id = path.split('/')[1];
      return await deleteReview(DB, id);
    }

    // GET /api/settings
    if (path === 'settings' && request.method === 'GET') {
      return await getSettings(DB);
    }

    // PUT /api/settings (admin)
    if (path === 'settings' && request.method === 'PUT') {
      if (!checkAdmin(request)) return unauthorized();
      return await updateSettings(DB, request);
    }

    // POST /api/stats/pageview (increment pageview)
    if (path === 'stats/pageview' && request.method === 'POST') {
      return await incrementPageview(DB);
    }

    // GET /api/stats
    if (path === 'stats' && request.method === 'GET') {
      return await getStats(DB);
    }

    // POST /api/games/:id/download (increment download counter)
    if (path.match(/^games\/(.+)\/download$/) && request.method === 'POST') {
      const id = path.split('/')[1];
      return await incrementDownload(DB, id);
    }

    return json({ error: 'Endpoint bulunamadı: ' + path }, 404);

  } catch (err) {
    console.error('API Error:', err);
    return json({ error: 'Sunucu hatası: ' + err.message }, 500);
  }
}

// ═══════════════════════════════════
//           GAMES
// ═══════════════════════════════════

async function getGames(DB) {
  const result = await DB.prepare('SELECT * FROM games ORDER BY sort_order ASC, created_at ASC').all();
  const games = {};
  for (const row of result.results) {
    games[row.id] = {
      name: row.name,
      slug: row.slug,
      icon: row.icon,
      link: row.link,
      description: row.description,
      color: row.color,
      status: row.status,
      features: JSON.parse(row.features || '[]'),
      downloads: row.downloads || 0,
      updatedAt: row.updated_at
    };
  }
  return json(games);
}

async function createGame(DB, request) {
  const data = await request.json();
  const { name, slug, icon, link, description, color, status, features } = data;
  if (!name || !slug) return json({ error: 'name ve slug zorunlu' }, 400);

  const id = slug + '_' + Date.now();
  await DB.prepare(
    `INSERT INTO games (id, name, slug, icon, link, description, color, status, features, downloads, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`
  ).bind(id, name, slug, icon || 'fa-solid fa-gamepad', link || '', description || '', color || '#00ff66', status || 'Aktif', JSON.stringify(features || [])).run();

  return json({ success: true, id });
}

async function updateGame(DB, request, id) {
  const data = await request.json();
  const { name, slug, icon, link, description, color, status, features } = data;

  await DB.prepare(
    `UPDATE games SET name=?, slug=?, icon=?, link=?, description=?, color=?, status=?, features=?, updated_at=datetime('now') WHERE id=?`
  ).bind(name, slug, icon || 'fa-solid fa-gamepad', link || '', description || '', color || '#00ff66', status || 'Aktif', JSON.stringify(features || []), id).run();

  return json({ success: true });
}

async function deleteGame(DB, id) {
  await DB.prepare('DELETE FROM games WHERE id=?').bind(id).run();
  return json({ success: true });
}

async function incrementDownload(DB, id) {
  await DB.prepare('UPDATE games SET downloads = downloads + 1 WHERE id=?').bind(id).run();
  return json({ success: true });
}

// ═══════════════════════════════════
//           STATUS
// ═══════════════════════════════════

async function getStatus(DB) {
  const result = await DB.prepare('SELECT key, value FROM config WHERE key LIKE "status_%"').all();
  const status = {};
  for (const row of result.results) {
    const k = row.key.replace('status_', '');
    status[k] = row.value;
  }
  return json(status);
}

async function updateStatus(DB, request) {
  const data = await request.json();
  const keys = ['battleye', 'eac', 'vanguard', 'rockstar'];
  for (const k of keys) {
    if (data[k] !== undefined) {
      await DB.prepare(
        `INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`
      ).bind('status_' + k, data[k]).run();
    }
  }
  await updateMeta(DB);
  return json({ success: true });
}

// ═══════════════════════════════════
//           REVIEWS
// ═══════════════════════════════════

async function getReviews(DB) {
  const result = await DB.prepare('SELECT * FROM reviews ORDER BY created_at DESC').all();
  const reviews = {};
  for (const row of result.results) {
    reviews[row.id] = {
      name: row.name,
      tag: row.tag,
      text: row.text,
      stars: row.stars,
      status: row.status
    };
  }
  return json(reviews);
}

async function createReview(DB, request) {
  const data = await request.json();
  const { name, tag, text, stars, status } = data;
  if (!name || !text) return json({ error: 'name ve text zorunlu' }, 400);

  const id = 'rev_' + Date.now();
  await DB.prepare(
    `INSERT INTO reviews (id, name, tag, text, stars, status, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(id, name, tag || '', text, stars || 5, status || 'Aktif').run();

  return json({ success: true, id });
}

async function updateReview(DB, request, id) {
  const data = await request.json();
  const { name, tag, text, stars, status } = data;

  await DB.prepare(
    'UPDATE reviews SET name=?, tag=?, text=?, stars=?, status=? WHERE id=?'
  ).bind(name, tag || '', text, stars || 5, status || 'Aktif', id).run();

  return json({ success: true });
}

async function deleteReview(DB, id) {
  await DB.prepare('DELETE FROM reviews WHERE id=?').bind(id).run();
  return json({ success: true });
}

// ═══════════════════════════════════
//           SETTINGS
// ═══════════════════════════════════

async function getSettings(DB) {
  const result = await DB.prepare('SELECT key, value FROM config WHERE key IN ("version", "announcement", "last_updated")').all();
  const settings = {};
  for (const row of result.results) {
    settings[row.key] = row.value;
  }
  return json({
    version: settings.version || 'v2.6.1',
    announcement: settings.announcement || '',
    lastUpdated: settings.last_updated || null
  });
}

async function updateSettings(DB, request) {
  const data = await request.json();
  const { version, announcement } = data;

  if (version !== undefined) {
    await DB.prepare(
      `INSERT INTO config (key, value) VALUES ('version', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`
    ).bind(version).run();
  }
  if (announcement !== undefined) {
    await DB.prepare(
      `INSERT INTO config (key, value) VALUES ('announcement', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`
    ).bind(announcement).run();
  }
  await updateMeta(DB);
  return json({ success: true });
}

// ═══════════════════════════════════
//           STATS
// ═══════════════════════════════════

async function incrementPageview(DB) {
  await DB.prepare(
    `INSERT INTO config (key, value) VALUES ('pageviews', '1') ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER) + 1 AS TEXT)`
  ).run();
  return json({ success: true });
}

async function getStats(DB) {
  const pv = await DB.prepare('SELECT value FROM config WHERE key="pageviews"').first();
  const games = await DB.prepare('SELECT COUNT(*) as count FROM games').first();
  const activeGames = await DB.prepare('SELECT COUNT(*) as count FROM games WHERE status="Aktif"').first();
  return json({
    pageviews: parseInt(pv?.value || 0),
    totalGames: games?.count || 0,
    activeGames: activeGames?.count || 0
  });
}

// ─── Helper ───
async function updateMeta(DB) {
  await DB.prepare(
    `INSERT INTO config (key, value) VALUES ('last_updated', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).bind(new Date().toISOString()).run();
}

// ═══════════════════════════════════
//           USERS & AUTH
// ═══════════════════════════════════

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateToken() {
  return crypto.randomUUID().replace(/-/g, '') + Date.now().toString(16);
}

async function registerUser(DB, request) {
  const data = await request.json();
  const { username, email, password } = data;
  if (!username || !email || !password) return json({ error: 'Eksik bilgi' }, 400);

  const existing = await DB.prepare('SELECT id FROM users WHERE username=? OR email=?').bind(username, email).first();
  if (existing) return json({ error: 'Bu kullanıcı adı veya e-posta zaten kullanımda.' }, 400);

  const id = 'usr_' + Date.now();
  const password_hash = await sha256(password);
  
  await DB.prepare(
    'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)'
  ).bind(id, username, email, password_hash).run();

  return json({ success: true, message: 'Kayıt başarılı! Giriş yapabilirsiniz.' });
}

async function loginUser(DB, request) {
  const data = await request.json();
  const { email, password } = data;
  if (!email || !password) return json({ error: 'Eksik bilgi' }, 400);

  const password_hash = await sha256(password);
  const user = await DB.prepare('SELECT id, username FROM users WHERE email=? AND password_hash=?').bind(email, password_hash).first();
  
  if (!user) return json({ error: 'E-posta veya şifre hatalı!' }, 401);

  const token = generateToken();
  await DB.prepare('UPDATE users SET token=? WHERE id=?').bind(token, user.id).run();

  return json({ success: true, token, username: user.username });
}

function getTokenFromAuthHeader(request) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.substring(7);
}

async function getMe(DB, request) {
  const token = getTokenFromAuthHeader(request);
  if (!token) return json({ error: 'Oturum bulunamadı' }, 401);

  const user = await DB.prepare('SELECT username, email, balance FROM users WHERE token=?').bind(token).first();
  if (!user) return json({ error: 'Geçersiz token' }, 401);

  return json({ success: true, user });
}

// ── ADMIN ──
async function getAdminUsers(DB) {
  const result = await DB.prepare('SELECT id, username, email, balance, created_at FROM users ORDER BY created_at DESC').all();
  return json(result.results);
}

async function updateBalance(DB, request, userId) {
  const data = await request.json();
  const { amount } = data; // Eklenecek miktar (eksi de olabilir)
  if (typeof amount !== 'number') return json({ error: 'Geçersiz miktar' }, 400);

  await DB.prepare('UPDATE users SET balance = balance + ? WHERE id=?').bind(amount, userId).run();
  return json({ success: true, message: 'Bakiye güncellendi.' });
}
