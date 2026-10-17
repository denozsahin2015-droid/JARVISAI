import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 3030);
const MODEL = process.env.OPENAI_MODEL || 'gpt-6-astra';
let sessionApiKey = '';
let fireUseDate = '';
let fireUses = 0;
const LIMITS_FILE = path.join(ROOT, '.local-limits.json');

const platformId = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
const platformName = platformId === 'windows' ? 'Windows' : platformId === 'macos' ? 'macOS' : 'Pardus / Linux';
const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/extras.css', ['extras.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);

function send(res, status, payload, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  });
  res.end(type.startsWith('application/json') ? JSON.stringify(payload) : payload);
}

function localRequest(req) {
  const host = req.headers.host;
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return false;
  const origin = req.headers.origin;
  return !origin || origin === `http://${host}`;
}

async function readJson(req, maxBytes = 256_000) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > maxBytes) throw new Error('Request is too large.');
  }
  return JSON.parse(data || '{}');
}

function apiKey() {
  return sessionApiKey || process.env.OPENAI_API_KEY || '';
}

function launchAllowedApp(app) {
  if (platformId === 'windows') {
    const commands = { 'text-editor': 'notepad.exe', calculator: 'calc.exe', 'file-manager': 'explorer.exe' };
    const executable = commands[app];
    if (!executable) throw new Error('Bu uygulama Windows izin listesinde değil.');
    const child = spawn(executable, [], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    return;
  }
  if (platformId === 'macos') {
    const apps = { 'text-editor': 'TextEdit', calculator: 'Calculator', 'file-manager': 'Finder' };
    const appName = apps[app];
    if (!appName) throw new Error('Bu uygulama macOS izin listesinde değil.');
    const child = spawn('open', ['-a', appName], { detached: true, stdio: 'ignore' });
    child.unref();
    return;
  }

  const candidates = {
    'text-editor': ['mousepad', 'xed', 'gnome-text-editor', 'gedit', 'kate'],
    calculator: ['galculator', 'gnome-calculator', 'kcalc'],
    'file-manager': ['thunar', 'nemo', 'dolphin', 'nautilus'],
  }[app];
  if (!candidates) throw new Error('Bu uygulama Pardus / Linux izin listesinde değil.');
  const executable = candidates.find((candidate) => spawnSync('which', [candidate], { stdio: 'ignore' }).status === 0);
  if (!executable) throw new Error('Bu uygulama bulunamadı. Eşdeğer bir Linux uygulaması kurulu olmalı.');
  const child = spawn(executable, [], { detached: true, stdio: 'ignore' });
  child.unref();
}

function openExternal(kind) {
  const destinations = {
    youtube: 'https://www.youtube.com/',
    fire: `https://www.youtube.com/results?search_query=${encodeURIComponent('Iron Man missile firing scene')}`,
    meme: `https://www.youtube.com/results?search_query=${encodeURIComponent('iki gözümün çiçeği şuraları aydınlat hele divalar yemek yapmaz yapay zeka bomba videosu')}`,
  };
  const target = destinations[kind];
  if (!target) throw new Error('Bu bağlantı izin listesinde değil.');
  let child;
  if (platformId === 'windows') child = spawn('explorer.exe', [target], { detached: true, stdio: 'ignore', windowsHide: true });
  else if (platformId === 'macos') child = spawn('open', [target], { detached: true, stdio: 'ignore' });
  else child = spawn('xdg-open', [target], { detached: true, stdio: 'ignore' });
  child.unref();
}

async function openDesktopFolder(folderName) {
  if (typeof folderName !== 'string' || !folderName.trim() || folderName.length > 80 || /[\\/:*?"<>|]/.test(folderName) || folderName.includes('..')) {
    throw new Error('Masaüstünde yalnızca klasör adını yaz; yol veya üst klasör kullanılamaz.');
  }
  const desktop = path.join(os.homedir(), 'Desktop');
  const target = path.resolve(desktop, folderName.trim());
  if (path.dirname(target) !== path.resolve(desktop)) throw new Error('Yalnızca doğrudan Masaüstündeki klasörler açılabilir.');
  const info = await stat(target).catch(() => null);
  if (!info?.isDirectory()) throw new Error(`Masaüstünde “${folderName}” adlı klasör bulunamadı.`);
  let child;
  if (platformId === 'windows') child = spawn('explorer.exe', [target], { detached: true, stdio: 'ignore', windowsHide: true });
  else if (platformId === 'macos') child = spawn('open', [target], { detached: true, stdio: 'ignore' });
  else child = spawn('xdg-open', [target], { detached: true, stdio: 'ignore' });
  child.unref();
}

async function loadDailyLimit() {
  try {
    const saved = JSON.parse(await readFile(LIMITS_FILE, 'utf8'));
    if (saved.date === new Date().toISOString().slice(0, 10) && Number.isInteger(saved.uses)) {
      fireUseDate = saved.date;
      fireUses = Math.max(0, Math.min(2, saved.uses));
    }
  } catch { /* First run or unreadable state: start today's counter at zero. */ }
}

function extractText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n');
}

const server = http.createServer(async (req, res) => {
  try {
    if (!localRequest(req)) return send(res, 403, { error: 'Local-only request rejected.' });
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res, 200, {
        online: true,
        apiKeyConfigured: Boolean(apiKey()),
        model: MODEL,
        platformId,
        platformName,
        desktopBridge: `${platformName} local bridge ready`,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/key') {
      const body = await readJson(req, 8_000);
      const key = typeof body.key === 'string' ? body.key.trim() : '';
      if (key.length < 20 || key.length > 500 || /\s/.test(key)) {
        return send(res, 400, { error: 'API anahtarı biçimi geçersiz görünüyor.' });
      }
      sessionApiKey = key;
      return send(res, 200, { ok: true, message: 'Anahtar bu sunucu açık kaldığı sürece bellekte tutulacak.' });
    }

    if (req.method === 'POST' && url.pathname === '/api/key/clear') {
      sessionApiKey = '';
      return send(res, 200, { ok: true, apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY) });
    }

    if (req.method === 'POST' && url.pathname === '/api/open-app') {
      const body = await readJson(req, 2_000);
      if (body.platform !== platformId) return send(res, 409, { error: `Bu bilgisayar ${platformName} çalıştırıyor. Üstteki seçimi Auto Detect yap veya eşleşen platformu seç.` });
      try {
        launchAllowedApp(body.app);
      } catch (error) {
        return send(res, 404, { error: error.message });
      }
      return send(res, 200, { ok: true, message: `${body.app} açılıyor.` });
    }

    if (req.method === 'POST' && url.pathname === '/api/open-link') {
      const body = await readJson(req, 2_000);
      if (body.kind === 'fire') {
        const today = new Date().toISOString().slice(0, 10);
        if (fireUseDate !== today) { fireUseDate = today; fireUses = 0; }
        if (fireUses >= 2) return send(res, 429, { error: '“Ateşle!” bugünkü iki kullanım hakkını doldurdu. Sayaç UTC gece yarısında yenilenir.', remaining: 0 });
        fireUses += 1;
        await mkdir(ROOT, { recursive: true });
        await writeFile(LIMITS_FILE, JSON.stringify({ date: today, uses: fireUses }), { mode: 0o600 });
      }
      try { openExternal(body.kind); }
      catch (error) { return send(res, 500, { error: `Tarayıcı açılamadı: ${error.message}` }); }
      return send(res, 200, { ok: true, remaining: body.kind === 'fire' ? Math.max(0, 2 - fireUses) : undefined });
    }

    if (req.method === 'POST' && url.pathname === '/api/open-desktop-folder') {
      const body = await readJson(req, 2_000);
      try { await openDesktopFolder(body.name); }
      catch (error) { return send(res, 400, { error: error.message }); }
      return send(res, 200, { ok: true, message: `Masaüstündeki “${body.name}” klasörü açılıyor.` });
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const key = apiKey();
      if (!key) return send(res, 428, { error: 'Önce sağ üstten OpenAI API anahtarını ekle.' });
      const body = await readJson(req);
      if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 20) {
        return send(res, 400, { error: 'Mesaj geçmişi geçersiz.' });
      }
      const messages = body.messages.map((message) => {
        if (!['user', 'assistant'].includes(message?.role) || typeof message.content !== 'string' || message.content.length > 4_000) {
          throw new Error('Mesaj biçimi geçersiz.');
        }
        return { role: message.role, content: message.content };
      });
      const languageCode = typeof body.language === 'string' && /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(body.language) ? body.language : 'en';
      const languageName = new Intl.DisplayNames([languageCode], { type: 'language' }).of(languageCode) || 'English';
      const upstream = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          instructions: `You are J.A.R.V.I.S., a warm, capable desktop assistant with a concise, confident tone. Reply in ${languageName}. Be clear about what you can and cannot do. Never claim you have changed desktop files or settings unless a connected tool explicitly reports success. Ask before destructive actions or sending private information anywhere.`,
          input: messages,
          max_output_tokens: 700,
        }),
      });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        const detail = data?.error?.message || `OpenAI API error (${upstream.status}).`;
        return send(res, upstream.status, { error: detail });
      }
      const text = extractText(data);
      if (!text) return send(res, 502, { error: 'API yanıt verdi ama metin bulunamadı.' });
      return send(res, 200, { text });
    }

    if (req.method === 'GET' && staticFiles.has(url.pathname)) {
      const [file, type] = staticFiles.get(url.pathname);
      const contents = await readFile(path.join(ROOT, 'public', file), 'utf8');
      return send(res, 200, contents, type);
    }

    return send(res, 404, { error: 'Not found.' });
  } catch (error) {
    const message = error instanceof SyntaxError ? 'JSON isteği okunamadı.' : error.message || 'Beklenmeyen sunucu hatası.';
    return send(res, 400, { error: message });
  }
});

await loadDailyLimit();
server.listen(PORT, HOST, () => {
  console.log(`J.A.R.V.I.S. local interface: http://${HOST}:${PORT}`);
  console.log('API keys are kept in memory for this process and are never written to source files.');
});

process.on('SIGINT', () => {
  sessionApiKey = '';
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  sessionApiKey = '';
  server.close(() => process.exit(0));
});
