'use strict';
/* Nông Trại Vui Vẻ — server (Express + WebSocket + MongoDB + Discord bot) */
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto');

// ====== .env (chỉ dùng khi chạy local; trên Render dùng Environment Variables) ======
try {
  for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] !== '' && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) { /* không có .env */ }

const E = process.env;
const PORT = +E.PORT || 3000;
const GCID = E.GOOGLE_CLIENT_ID || '';
const DEV = E.DEV_LOGIN === '1';
const DATA = E.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });
const MONGO_URL = E.MONGO_URL || E.MONGODB_URI || '';
const INVITE = E.DISCORD_INVITE || 'https://discord.gg/TZRfuhbqJA';
const BASE_URL = (E.PUBLIC_URL || E.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const list = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);
const OWNER_EMAILS = list(E.OWNER_EMAILS).map(x => x.toLowerCase());
const OWNER_DISCORD = list(E.DISCORD_OWNER_IDS).concat(list(E.DISCORD_ADMIN_ID));
const LV = { player: 0, vip: 1, mod: 2, admin: 3, owner: 4 };

const express = require('express');
const { WebSocketServer } = require('ws');
const { CUTE_TITLES } = require('./catalog');
let oa = null;
if (GCID) { const { OAuth2Client } = require('google-auth-library'); oa = new OAuth2Client(GCID); }

process.on('unhandledRejection', e => console.error('⚠️ unhandledRejection:', e && e.message || e));
process.on('uncaughtException', e => console.error('⚠️ uncaughtException:', e && e.stack || e));

// ====== DỮ LIỆU (RAM + file + MongoDB) ======
const DBF = path.join(DATA, 'db.json');
let db = { users: {}, sessions: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DBF, 'utf8'))); } catch (e) { /* mới */ }
const byCode = {}, byDiscord = {};
const index = u => { byCode[u.code] = u; if (u.discordId) byDiscord[u.discordId] = u; };
Object.values(db.users).forEach(index);

let usersCol = null, sessCol = null, metaCol = null;
const dirtyUsers = new Set(), dirtySess = new Set();
let fileDirty = false;
const markU = u => { if (u) { dirtyUsers.add(u.sub); fileDirty = true; } };

const strip = o => { const c = Object.assign({}, o); delete c._id; return c; };
async function flushAll() {
  if (fileDirty) {
    fileDirty = false;
    try { fs.writeFileSync(DBF + '.tmp', JSON.stringify(db)); fs.renameSync(DBF + '.tmp', DBF); } catch (e) { fileDirty = true; }
  }
  if (usersCol && dirtyUsers.size) {
    const subs = [...dirtyUsers]; dirtyUsers.clear();
    try {
      await usersCol.bulkWrite(subs.filter(s => db.users[s]).map(s => ({
        updateOne: { filter: { sub: s }, update: { $set: strip(db.users[s]) }, upsert: true }
      })));
    } catch (e) { subs.forEach(s => dirtyUsers.add(s)); console.error('Mongo ghi users lỗi:', e.message); }
  }
  if (sessCol && dirtySess.size) {
    const toks = [...dirtySess]; dirtySess.clear();
    try {
      await sessCol.bulkWrite(toks.filter(t => db.sessions[t]).map(t => ({
        updateOne: { filter: { token: t }, update: { $set: { token: t, ...db.sessions[t] } }, upsert: true }
      })));
    } catch (e) { toks.forEach(t => dirtySess.add(t)); console.error('Mongo ghi sessions lỗi:', e.message); }
  }
}

async function initMongo() {
  if (!MONGO_URL) { console.log('⚠️ Không có MONGO_URL — chỉ lưu file local'); return; }
  const { MongoClient } = require('mongodb');
  const mc = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 15000 });
  await mc.connect();
  const mdb = mc.db(E.MONGO_DB || 'nongtrai');
  usersCol = mdb.collection('users'); sessCol = mdb.collection('sessions'); metaCol = mdb.collection('meta');
  console.log('✅ Đã kết nối MongoDB Atlas');
  const all = await usersCol.find({}).toArray();
  all.forEach(d => { const u = strip(d); db.users[u.sub] = u; index(u); });
  const ss = await sessCol.find({}).toArray();
  ss.forEach(d => { db.sessions[d.token] = { sub: d.sub, ts: d.ts }; });
  console.log('✅ Đã load', all.length, 'users,', ss.length, 'phiên từ MongoDB');
}
setInterval(() => flushAll().catch(() => {}), 4000);
const shutdown = () => flushAll().finally(() => process.exit(0));
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);

// ====== TIỆN ÍCH ======
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const newCode = () => { for (;;) { const c = crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); if (!byCode[c]) return c; } };
const isOwnerIdentity = (email, discordId) =>
  (email && OWNER_EMAILS.includes(String(email).toLowerCase())) || (discordId && OWNER_DISCORD.includes(discordId));

function getOrCreate(sub, email, name, discordId) {
  let u = db.users[sub];
  if (!u && email) u = Object.values(db.users).find(x => x.email && x.email === email);
  if (!u && discordId) u = byDiscord[discordId];
  if (!u) {
    u = db.users[sub] = {
      sub, email: email || '', code: newCode(), name: clean(name, 14) || 'Nông dân', role: 'player', title: '',
      save: null, look: null, friends: [], reqIn: [], pending: [], banned: false, mutedUntil: 0,
      discordId: discordId || null, lastCheckin: '', createdAt: Date.now()
    };
  }
  if (email && !u.email) u.email = email;
  if (discordId && !u.discordId) u.discordId = discordId;
  if (isOwnerIdentity(email || u.email, discordId || u.discordId) && u.role !== 'owner') u.role = 'owner';
  u.friends = u.friends || []; u.reqIn = u.reqIn || []; u.pending = u.pending || [];
  index(u); markU(u);
  return u;
}
const pub = u => ({ code: u.code, name: u.name, role: u.role, title: u.title || '', save: u.save, look: u.look, lastCheckin: u.lastCheckin || '' });
const sessionUser = t => { const s = t && db.sessions[t]; return s ? db.users[s.sub] || null : null; };
function newSession(u) {
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = { sub: u.sub, ts: Date.now() };
  dirtySess.add(token); fileDirty = true;
  return token;
}

const conns = new Map();
const sendWs = (ws, o) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(o)); } catch (e) { /* bỏ */ } };
const sendTo = (code, o) => { const c = conns.get(code); if (c) sendWs(c.ws, o); };
const bcast = (o, except) => { for (const [code, c] of conns) if (code !== except) sendWs(c.ws, o); };
let bridge = {};
const br = (fn, ...a) => { try { const r = bridge[fn] && bridge[fn](...a); if (r && r.catch) r.catch(() => {}); } catch (e) { /* bỏ */ } };

function friendsPayload(u) {
  const row = c => { const f = byCode[c]; return f && { code: f.code, name: f.name, role: f.role, lv: (f.save && f.save.lv) || 1, online: conns.has(f.code) }; };
  return {
    list: (u.friends || []).map(row).filter(Boolean),
    reqIn: (u.reqIn || []).map(c => byCode[c]).filter(Boolean).map(f => ({ code: f.code, name: f.name }))
  };
}
const pushFriends = u => sendTo(u.code, Object.assign({ t: 'friends' }, friendsPayload(u)));

function addPending(u, item) {
  item = Object.assign({ id: crypto.randomBytes(6).toString('hex'), from: 'Hệ thống' }, item);
  u.pending.push(item); markU(u);
  sendTo(u.code, { t: 'pending', items: [item] });
}

const GROUP = { seed: 'seeds', crop: 'crops', furn: 'furn', good: 'goods', cloth: 'clothes', shoe: 'shoes', bag: 'bags' };
const PERM = {
  info: 2, mute: 2, kick: 2,
  coins: 3, item: 3, mail: 3, ban: 3, unban: 3, announce: 3, settitle: 3,
  setlevel: 3, addlevel: 3,
  setrole: 4
};

// Hàm đảm bảo save object có đủ field
function ensureSave(u) {
  if (!u.save) u.save = {
    coins: 0, lv: 1, xp: 0, map: 1,
    inv: { seeds: { carrot: 8 }, crops: {}, goods: {}, furn: {}, clothes: [], shoes: [], bags: [] },
    sel: 'carrot', houseLv: 0, veh: 0, vehOwned: [0], pet: -1, petOwned: [],
    maps: {}, friends: [], mail: [], lastDaily: '', led: true,
    settings: { music: 0.5, sfx: 0.7 }
  };
  if (!u.save.inv) u.save.inv = { seeds:{carrot:8}, crops:{}, goods:{}, furn:{}, clothes:[], shoes:[], bags:[] };
  if (!u.save.lv) u.save.lv = 1;
  if (typeof u.save.xp !== 'number') u.save.xp = 0;
  return u.save;
}

function adminDo(actor, cmd, a) {
  a = a || {};
  const need = PERM[cmd];
  if (need === undefined) return { ok: false, msg: 'Lệnh không tồn tại' };
  if ((LV[actor && actor.role] || 0) < need) return { ok: false, msg: 'Bạn không đủ quyền cho lệnh này' };
  if (cmd === 'announce') {
    const text = clean(a.text, 200);
    if (!text) return { ok: false, msg: 'Thiếu nội dung' };
    bcast({ t: 'announce', text }); br('announce', text);
    return { ok: true, msg: 'Đã gửi thông báo' };
  }
  const key = String(a.target || '').trim();
  const u = byCode[key.toUpperCase()] || byDiscord[key];
  if (!u) return { ok: false, msg: 'Không tìm thấy người chơi: ' + key };
  const amount = Math.trunc(+a.amount) || 0;
  if (['kick', 'ban', 'mute', 'setrole'].includes(cmd) && LV[u.role] >= LV[actor.role] && actor.role !== 'owner')
    return { ok: false, msg: 'Không thể tác động lên người cùng/cao quyền hơn' };
  switch (cmd) {
    case 'info':
      ensureSave(u);
      return { ok: true, msg: `${u.name} [${u.code}] role=${u.role} Lv.${u.save.lv} xu=${u.save.coins} ${conns.has(u.code) ? '🟢 online' : '⚪ offline'}${u.banned ? ' ⛔ bị khóa' : ''}` };

    case 'coins':
      if (!amount) return { ok: false, msg: 'Số xu phải khác 0' };
      addPending(u, { title: amount > 0 ? 'Quà xu từ Admin 🪙' : 'Điều chỉnh xu', body: `${actor.label || 'Admin'}: ${amount > 0 ? '+' : ''}${amount} xu`, gift: { coins: amount }, auto: true });
      return { ok: true, msg: `Đã ${amount > 0 ? 'cộng' : 'trừ'} ${Math.abs(amount)} xu cho ${u.name}` };

    case 'item': {
      const [g, id] = String(a.item || '').split(':');
      if (!GROUP[g] || !/^[a-z0-9_]{1,24}$/i.test(id || '') || amount <= 0) return { ok: false, msg: 'Vật phẩm/số lượng không hợp lệ' };
      addPending(u, { title: 'Quà vật phẩm 🎁', body: `${actor.label || 'Admin'} tặng bạn ${amount} × ${id}`, gift: { [GROUP[g]]: { [id]: amount } }, auto: true });
      return { ok: true, msg: `Đã tặng ${amount} ${id} cho ${u.name}` };
    }

    case 'mail': {
      const gift = {}; if (amount) gift.coins = amount;
      addPending(u, { title: clean(a.title, 60) || 'Thư từ Admin', body: clean(a.text, 200), gift: amount ? gift : null, from: 'Admin' });
      return { ok: true, msg: 'Đã gửi thư cho ' + u.name };
    }

    case 'setrole': {
      const r = String(a.role || '');
      if (!(r in LV)) return { ok: false, msg: 'Role không hợp lệ' };
      u.role = r; markU(u); sendTo(u.code, { t: 'role', role: r, title: u.title || '' });
      return { ok: true, msg: `Đã đặt role ${r} cho ${u.name}` };
    }

    case 'settitle': {
      const t = String(a.title || '');
      if (t && !CUTE_TITLES[t]) return { ok: false, msg: 'Danh hiệu không hợp lệ' };
      u.title = t; markU(u); sendTo(u.code, { t: 'role', role: u.role, title: t });
      return { ok: true, msg: t ? `Đã cấp danh hiệu ${CUTE_TITLES[t].n} cho ${u.name}` : 'Đã gỡ danh hiệu của ' + u.name };
    }

    // ====== CẤP / TẶNG LEVEL ======
    case 'setlevel': {
      ensureSave(u);
      const lv = Math.max(1, Math.min(99, Math.trunc(+a.amount) || 1));
      u.save.lv = lv;
      u.save.xp = 0;
      markU(u);
      sendTo(u.code, { t: 'update_level', lv });
      return { ok: true, msg: `Đã đặt Level ${lv} cho ${u.name}` };
    }
    case 'addlevel': {
      ensureSave(u);
      const add = Math.trunc(+a.amount) || 1;
      const newLv = Math.max(1, Math.min(99, u.save.lv + add));
      u.save.lv = newLv;
      u.save.xp = 0;
      markU(u);
      sendTo(u.code, { t: 'update_level', lv: newLv });
      return { ok: true, msg: `Đã tặng ${add} Level cho ${u.name} (giờ là Lv.${newLv})` };
    }

    case 'kick':
      sendTo(u.code, { t: 'kick', reason: 'Bạn đã bị đưa ra khỏi game bởi admin' });
      { const c = conns.get(u.code); if (c) setTimeout(() => c.ws.close(4003), 300); }
      return { ok: true, msg: 'Đã kick ' + u.name };
    case 'ban': u.banned = true; markU(u); sendTo(u.code, { t: 'kick', reason: 'Tài khoản bị khóa' }); return { ok: true, msg: 'Đã khóa ' + u.name };
    case 'unban': u.banned = false; markU(u); return { ok: true, msg: 'Đã mở khóa ' + u.name };
    case 'mute': {
      const mins = Math.max(0, Math.trunc(+a.minutes) || 0);
      u.mutedUntil = mins ? Date.now() + mins * 60e3 : 0; markU(u);
      return { ok: true, msg: mins ? `Đã cấm chat ${u.name} ${mins} phút` : 'Đã bỏ cấm chat ' + u.name };
    }
  }
  return { ok: false, msg: 'Lệnh không hỗ trợ' };
}

// Điểm danh tự động cộng 1 level
function checkinByCode(code, discordId) {
  const u = byCode[String(code || '').trim().toUpperCase()];
  if (!u) return { ok: false, msg: 'Mã không đúng. Vào game bấm 📅 để xem mã 6 ký tự.' };
  if (u.banned) return { ok: false, msg: 'Tài khoản đang bị khóa.' };
  if (u.lastCheckin === today()) return { ok: false, msg: `${u.name} hôm nay đã điểm danh rồi.` };
  u.lastCheckin = today();
  ensureSave(u);
  const coins = 80 + u.save.lv * 12;
  // Cộng 1 level mỗi lần điểm danh
  u.save.lv = Math.min(99, u.save.lv + 1);
  u.save.xp = 0;
  sendTo(u.code, { t: 'update_level', lv: u.save.lv });
  addPending(u, { title: 'Điểm danh 🎁', body: 'Xu + giày + 1 Level!', gift: { coins, shoes: { s_checkin: 1 } }, auto: true });
  br('checkin', u, `điểm danh nhận ${coins} xu + 1 Level` + (discordId ? ' (qua Discord)' : ''));
  return { ok: true, msg: `Điểm danh thành công cho ${u.name}: +${coins} xu + giày + 1 Level (giờ Lv.${u.save.lv}).` };
}

function linkDiscord(code, discordId) {
  const u = byCode[String(code || '').trim().toUpperCase()];
  if (!u) return null;
  if (u.discordId && u.discordId !== discordId) return null;
  u.discordId = discordId; byDiscord[discordId] = u; markU(u);
  if (OWNER_DISCORD.includes(discordId) && u.role !== 'owner') { u.role = 'owner'; sendTo(u.code, { t: 'role', role: 'owner', title: u.title || '' }); }
  return u;
}

// ====== HTTP ======
const app = express();
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '100kb' }));
const origin = req => BASE_URL || `${req.protocol}://${req.get('host')}`;
const DC_ID = E.DISCORD_CLIENT_ID || '', DC_SECRET = E.DISCORD_CLIENT_SECRET || '';

app.get('/healthz', (req, res) => res.send('ok'));
app.get('/config.js', (req, res) => {
  const cfg = { googleClientId: GCID, discord: !!(DC_ID && DC_SECRET), server: '', dev: DEV, invite: INVITE, titles: CUTE_TITLES };
  res.type('js').set('Cache-Control', 'no-store').send('window.CFG=' + JSON.stringify(cfg) + ';');
});

const dcRedirect = req => {
  const r = E.DISCORD_REDIRECT_URI || '';
  if (r && !/localhost|127\.0\.0\.1/.test(r)) return r;
  return origin(req) + '/api/auth/discord/callback';
};
app.get('/auth/discord', (req, res) => {
  if (!DC_ID || !DC_SECRET) return res.redirect('/?err=discord');
  const q = new URLSearchParams({ client_id: DC_ID, redirect_uri: dcRedirect(req), response_type: 'code', scope: 'identify email' });
  res.redirect('https://discord.com/oauth2/authorize?' + q);
});
app.get('/api/auth/discord/callback', async (req, res) => {
  try {
    if (!req.query.code) return res.redirect('/?err=discord');
    const tr = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: DC_ID, client_secret: DC_SECRET, grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: dcRedirect(req) })
    });
    const tj = await tr.json();
    if (!tj.access_token) throw new Error('token: ' + JSON.stringify(tj));
    const d = await (await fetch('https://discord.com/api/users/@me', { headers: { Authorization: 'Bearer ' + tj.access_token } })).json();
    if (!d.id) throw new Error('không lấy được user');
    const u = getOrCreate('discord:' + d.id, d.verified ? d.email : '', d.global_name || d.username, d.id);
    if (u.banned) return res.redirect('/?err=banned');
    const token = newSession(u);
    br('login', u, 'Discord');
    res.redirect('/?token=' + token);
  } catch (e) { console.error('Discord login lỗi:', e.message); res.redirect('/?err=discord'); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { credential, dev } = req.body || {};
    let sub, email, name;
    if (credential) {
      if (!oa) return res.status(500).json({ error: 'Server chưa cấu hình GOOGLE_CLIENT_ID' });
      const tk = await oa.verifyIdToken({ idToken: String(credential), audience: GCID });
      const p = tk.getPayload();
      sub = 'google:' + p.sub; email = p.email_verified ? p.email : ''; name = p.name || (p.email || '').split('@')[0];
    } else if (dev && DEV) {
      sub = 'dev:' + String(dev).toLowerCase().slice(0, 20); name = String(dev);
    } else return res.status(400).json({ error: 'Yêu cầu đăng nhập hợp lệ' });
    const u = getOrCreate(sub, email, name, null);
    if (u.banned) return res.status(403).json({ error: 'Tài khoản bị khóa' });
    const token = newSession(u);
    br('login', u, credential ? 'Google' : 'Thử nghiệm');
    res.json({ token, user: pub(u) });
  } catch (e) {
    console.error('Login lỗi:', e.message);
    res.status(401).json({ error: 'Đăng nhập thất bại: ' + e.message });
  }
});

app.get('/api/me', (req, res) => {
  const u = sessionUser((req.headers.authorization || '').replace('Bearer ', ''));
  if (!u) return res.status(401).json({ error: 'Chưa đăng nhập' });
  if (u.banned) return res.status(403).json({ error: 'Tài khoản bị khóa' });
  res.json({ user: pub(u) });
});

app.get('/api/health', (req, res) => res.json({ ok: true, online: conns.size }));
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 * 1024 });

wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://x').searchParams.get('token') || '';
  const u = sessionUser(token);
  if (!u || u.banned) { ws.close(4001); return; }
  const old = conns.get(u.code);
  if (old) { sendWs(old.ws, { t: 'kick', reason: 'Tài khoản đăng nhập ở nơi khác' }); try { old.ws.close(4003); } catch (e) { /* */ } }
  const c = { ws, u, lv: 1, lastChat: 0, lastPos: 0 };
  conns.set(u.code, c);
  const fp = friendsPayload(u);
  sendWs(ws, { t: 'init', role: u.role, title: u.title || '', online: conns.size, friends: fp.list, reqIn: fp.reqIn, lastCheckin: u.lastCheckin || '' });
  if (u.pending.length) sendWs(ws, { t: 'pending', items: u.pending });
  (u.friends || []).forEach(f => pushFriends(byCode[f] || { code: '' }));

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const now = Date.now();
    switch (m.t) {
      case 'profile':
        u.name = clean(m.name, 14) || u.name; if (m.look && typeof m.look === 'object') u.look = m.look; markU(u); break;
      case 'save':
        if (m.data && typeof m.data === 'object') { u.save = m.data; u.save.id = u.code; c.lv = +m.data.lv || 1; markU(u); }
        break;
      case 'pos':
        if (now - c.lastPos < 100) break;
        c.lastPos = now; c.lv = +m.lv || c.lv;
        bcast({ t: 'pos', id: u.code, name: u.name, role: u.role, title: u.title || '', look: m.look, map: m.map, x: m.x, y: m.y, dir: m.dir, veh: m.veh, led: m.led, lv: m.lv }, u.code);
        break;
      case 'chat': {
        if (now < (u.mutedUntil || 0)) { sendWs(ws, { t: 'chat', name: 'Hệ thống', text: 'Bạn đang bị cấm chat.', lv: 0, role: 'owner', sys: true }); break; }
        if (now - c.lastChat < 800) break;
        c.lastChat = now;
        const text = clean(m.text, 120); if (!text) break;
        bcast({ t: 'chat', name: u.name, role: u.role, lv: c.lv, text }, u.code);
        br('chat', u.name, u.role, text);
        break;
      }
      case 'checkin': {
        const r = checkinByCode(u.code);
        sendWs(ws, { t: 'adm_res', msg: r.msg });
        break;
      }
      case 'fr_req': {
        const t = byCode[String(m.to || '').trim().toUpperCase()];
        if (!t || t === u) { sendWs(ws, { t: 'adm_res', msg: 'Không tìm thấy mã người chơi' }); break; }
        if (u.friends.includes(t.code)) { sendWs(ws, { t: 'adm_res', msg: 'Đã là bạn bè' }); break; }
        if (!t.reqIn.includes(u.code)) { t.reqIn.push(u.code); markU(t); pushFriends(t); }
        sendWs(ws, { t: 'adm_res', msg: '💌 Đã gửi lời mời kết bạn cho ' + t.name });
        break;
      }
      case 'fr_acc': {
        const t = byCode[m.id];
        if (t && u.reqIn.includes(t.code)) {
          u.reqIn = u.reqIn.filter(x => x !== t.code);
          if (!u.friends.includes(t.code)) u.friends.push(t.code);
          if (!t.friends.includes(u.code)) t.friends.push(u.code);
          markU(u); markU(t); pushFriends(u); pushFriends(t);
        }
        break;
      }
      case 'fr_rej': u.reqIn = u.reqIn.filter(x => x !== m.id); markU(u); pushFriends(u); break;
      case 'fr_del': {
        u.friends = u.friends.filter(x => x !== m.id); markU(u); pushFriends(u);
        const t = byCode[m.id]; if (t) { t.friends = (t.friends || []).filter(x => x !== u.code); markU(t); pushFriends(t); }
        break;
      }
      case 'gift': {
        const t = byCode[String(m.to || '').toUpperCase()];
        if (t && u.friends.includes(t.code)) addPending(t, { title: 'Quà từ bạn bè 🎁', body: u.name + ' tặng bạn 50 xu!', gift: { coins: 50 }, from: u.name });
        break;
      }
      case 'ack': {
        const ids = new Set(Array.isArray(m.ids) ? m.ids : []);
        if (ids.size) { u.pending = u.pending.filter(p => !ids.has(p.id)); markU(u); }
        break;
      }
      case 'adm': {
        const r = adminDo({ role: u.role, label: u.name }, String(m.cmd), m.args);
        sendWs(ws, { t: 'adm_res', msg: (r.ok ? '✅ ' : '❌ ') + r.msg });
        break;
      }
    }
  });
  ws.on('close', () => {
    if (conns.get(u.code) === c) { conns.delete(u.code); bcast({ t: 'left', id: u.code }, u.code); }
  });
  ws.on('error', () => {});
});

// ====== CTX CHO DISCORD BOT ======
const ctx = {
  DATA, adminDo, checkinByCode, linkDiscord,
  roleOfDiscord: id => (OWNER_DISCORD.includes(id) ? 'owner' : (byDiscord[id] ? byDiscord[id].role : 'player')),
  online: () => [...conns.values()].map(c => ({ name: c.u.name, code: c.u.code, role: c.u.role, lv: c.lv })),
  top: n => Object.values(db.users).filter(u => u.save).sort((a, b) => (b.save.lv || 1) - (a.save.lv || 1)).slice(0, n)
    .map(u => ({ name: u.name, code: u.code, lv: u.save.lv || 1, coins: u.save.coins || 0, role: u.role })),
  setBridge: b => { bridge = b; },
  chatFromDiscord: (name, text) => bcast({ t: 'chat', name: '💬 ' + clean(name, 20), text: clean(text, 120), lv: 0, role: 'discord' }),
  setTitleByDiscord: (discordId, tid) => {
    const u = byDiscord[discordId]; if (!u) return false;
    u.title = tid; markU(u); sendTo(u.code, { t: 'role', role: u.role, title: tid }); return true;
  },
  initialSetup: null,
  saveSetup: s => { if (metaCol) metaCol.updateOne({ _id: 'discord-setup' }, { $set: { value: s } }, { upsert: true }).catch(() => {}); },
  privileged: { members: true, content: true }
};

// ====== PREFLIGHT VỚI TIMEOUT 5 GIÂY ======
async function discordPreflight() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const r = await fetch('https://discord.com/api/v10/applications/@me', {
      headers: { Authorization: 'Bot ' + E.DISCORD_TOKEN },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (r.status === 401) {
      console.error('❌ DISCORD_TOKEN SAI/ĐÃ BỊ RESET — vào Developer Portal > Bot > Reset Token');
      return true;
    }
    const a = await r.json();
    const f = a.flags || 0;
    ctx.privileged.members = !!(f & (1 << 14) || f & (1 << 15));
    ctx.privileged.content = !!(f & (1 << 18) || f & (1 << 19));
    if (!ctx.privileged.members) console.warn('⚠️ Chưa bật SERVER MEMBERS INTENT');
    if (!ctx.privileged.content) console.warn('⚠️ Chưa bật MESSAGE CONTENT INTENT');
  } catch (e) {
    console.warn('Preflight Discord lỗi (bỏ qua):', e.message);
  }
  return true;
}

// ====== KHỞI ĐỘNG ======
(async () => {
  try { await initMongo(); } catch (e) { console.error('❌ Lỗi MongoDB:', e.message); }
  if (metaCol) { try { const d = await metaCol.findOne({ _id: 'discord-setup' }); if (d) ctx.initialSetup = d.value; } catch (e) { /* */ } }

  server.listen(PORT, '0.0.0.0', () => console.log(`🌱 Server Nông Trại chạy cổng ${PORT}`));

  if (E.DISCORD_TOKEN) {
    console.log('🔑 DISCORD_TOKEN: CÓ (' + E.DISCORD_TOKEN.length + ' ký tự)');
    await discordPreflight();
    console.log('🚀 Đang khởi động bot Discord...');
    try {
      require('./discord')(ctx);
      console.log('✅ Đã gọi module discord.js');
    } catch (e) {
      console.error('❌ Lỗi khởi động bot Discord:', e.stack || e.message);
    }
  } else {
    console.warn('⚠️ Không có DISCORD_TOKEN — bot Discord tắt');
  }

  const self = BASE_URL;
  if (self) setInterval(() => fetch(self + '/healthz').catch(() => {}), 9 * 60e3);
})();

module.exports = { adminDo };
