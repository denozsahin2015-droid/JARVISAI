const $ = (selector) => document.querySelector(selector);
const state = { host: null, selected: localStorage.getItem('jarvis-platform') || 'auto', language: localStorage.getItem('jarvis-language') || 'tr', voice: localStorage.getItem('jarvis-voice') === 'on', history: [], startedAt: Date.now(), busy: false, wordList: [], wordLast: '', wordScore: 0, usedWords: new Set(), secret: Math.floor(Math.random() * 100) + 1, guesses: 0, shortcuts: [] };
const platformSelect = $('#platform-select');
const platformNames = { windows: 'Windows', linux: 'Pardus / Linux', macos: 'macOS' };
const languageCodes = 'aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ik io is it iu ja jv ka kg ki kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt ug uk ur uz ve vi vo wa wo xh yi yo za zh zu'.split(' ');
const labels = {
  windows: { editor: ['Notepad', 'Open Notepad'], files: ['File Explorer', 'Browse files yourself'] },
  linux: { editor: ['Text editor', 'Open the installed text editor'], files: ['File manager', 'Browse files yourself'] },
  macos: { editor: ['TextEdit', 'Open TextEdit'], files: ['Finder', 'Browse files yourself'] },
};

function populateLanguages() {
  if (!languageCodes.includes(state.language)) state.language = 'en';
  const display = new Intl.DisplayNames([state.language], { type: 'language' });
  const selects = [$('#language-select'), $('#language-select-settings')];
  for (const select of selects) {
    select.replaceChildren();
    for (const code of languageCodes) {
      const option = document.createElement('option'); option.value = code;
      option.textContent = `${display.of(code) || code} · ${code.toUpperCase()}`;
      select.append(option);
    }
    select.value = languageCodes.includes(state.language) ? state.language : 'en';
  }
  document.documentElement.lang = state.language;
}
function setVoice(enabled) {
  state.voice = enabled; localStorage.setItem('jarvis-voice', enabled ? 'on' : 'off');
  for (const button of [$('#voice-toggle'), $('#voice-settings-toggle')]) {
    button.setAttribute('aria-pressed', String(enabled));
    button.classList.toggle('voice-on', enabled);
  }
  $('#voice-toggle').textContent = enabled ? '◖ VOICE ON' : '◖ VOICE OFF';
  $('#voice-settings-toggle').textContent = enabled ? 'VOICE ANSWERS: ON' : 'VOICE ANSWERS: OFF';
  if (!enabled && window.speechSynthesis) window.speechSynthesis.cancel();
}
function speak(text) {
  if (!state.voice || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = state.language; utterance.rate = 1; utterance.pitch = 1;
  const voice = speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith(state.language.toLowerCase()));
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}
function setLanguage(code) {
  state.language = languageCodes.includes(code) ? code : 'en';
  localStorage.setItem('jarvis-language', state.language);
  populateLanguages();
  addDiagnostic(`Reply language changed · ${state.language}`);
}

function effectivePlatform() { return state.selected === 'auto' ? state.host : state.selected; }
function addDiagnostic(text, kind = 'info') {
  const line = document.createElement('p');
  const time = new Date().toLocaleTimeString('tr-TR', { hour12: false });
  line.textContent = `[${time}] ${kind.toUpperCase()} · ${text}`;
  const box = $('#diagnostics');
  box.prepend(line);
  while (box.children.length > 35) box.lastElementChild.remove();
}
function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3000);
}
function updatePlatform() {
  const platform = effectivePlatform();
  const profile = labels[platform] || labels.windows;
  $('[data-label="editor"]').textContent = profile.editor[0];
  $('[data-desc="editor"]').textContent = profile.editor[1];
  $('[data-label="files"]').textContent = profile.files[0];
  $('[data-desc="files"]').textContent = profile.files[1];
  $('[data-quick="editor"]').textContent = profile.editor[0].toUpperCase();
  $('[data-quick="files"]').textContent = profile.files[0].toUpperCase();
  $('[data-desc="calculator"]').textContent = platform === 'macos' ? 'Open Calculator' : platform === 'linux' ? 'Open an installed calculator' : 'Open Windows Calculator';
  const actual = state.host && platform === state.host;
  document.querySelectorAll('[data-app]').forEach((button) => {
    button.classList.toggle('disabled-profile', !actual);
    button.title = actual ? `Open on ${platformNames[platform]}` : `This computer runs ${platformNames[state.host] || 'an unknown platform'}; choose Auto Detect to open apps.`;
  });
  const connection = $('#connection-label');
  connection.textContent = state.host ? `LOCAL SYSTEM · ${platformNames[state.host].toUpperCase()} · ${actual ? 'READY' : `PREVIEW: ${platformNames[platform].toUpperCase()}`}` : 'LOCAL SYSTEM · INITIALIZING';
}
function setKeyStatus(configured) {
  const indicator = $('#api-indicator');
  indicator.textContent = configured ? 'API KEY · CONNECTED' : 'API KEY · NOT SET';
  indicator.classList.toggle('ready', configured);
  $('#status-api').textContent = configured ? 'CONNECTED' : 'WAITING';
  $('#status-api').style.color = configured ? 'var(--green)' : '';
  $('#ai-state').textContent = configured ? 'CONNECTED' : 'STANDBY';
  $('#core-state').textContent = configured ? 'ONLINE' : 'STANDBY';
  $('#key-title').textContent = configured ? 'Replace your API key.' : 'Connect your AI core.';
  $('#key-modal-copy').textContent = configured
    ? 'Paste a new OpenAI API key and save it to replace the key currently held by this local server. The current key cannot be displayed again. Use Remove Key to clear it.'
    : 'Paste your OpenAI API key. It is held in local server memory only and is never added to this website’s source files. It clears when the server stops.';
}
async function getHealth() {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error('Local bridge unavailable');
    const data = await response.json();
    state.host = data.platformId;
    if (!['auto', 'windows', 'linux', 'macos'].includes(state.selected)) state.selected = 'auto';
    platformSelect.value = state.selected;
    updatePlatform();
    $('#bridge-state').textContent = 'ONLINE';
    $('#model-name').textContent = data.model;
    $('#connection-label').textContent = `LOCAL SYSTEM · ${data.platformName.toUpperCase()} · READY`;
    setKeyStatus(data.apiKeyConfigured);
    addDiagnostic(`Local bridge online · ${data.platformName}`);
    addDiagnostic(`Responses API model · ${data.model}`);
  } catch (error) {
    $('#bridge-state').textContent = 'OFFLINE';
    $('#connection-label').textContent = 'LOCAL SYSTEM · BRIDGE OFFLINE';
    addDiagnostic(error.message, 'error');
  }
}
function appendMessage(role, text, pending = false) {
  const article = document.createElement('article');
  article.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
  const avatar = document.createElement('div'); avatar.className = 'message-avatar'; avatar.textContent = role === 'user' ? 'U' : 'J';
  const content = document.createElement('div'); content.className = 'message-content';
  const meta = document.createElement('div'); meta.className = 'message-meta'; meta.textContent = role === 'user' ? 'YOU' : 'J.A.R.V.I.S.';
  if (role === 'assistant') { const status = document.createElement('span'); status.textContent = pending ? ' · PROCESSING' : ' · RESPONSE'; meta.append(status); }
  const paragraph = document.createElement('p'); paragraph.textContent = text;
  content.append(meta, paragraph); article.append(avatar, content); $('#messages').append(article);
  $('#messages').scrollTop = $('#messages').scrollHeight;
  return { article, paragraph, meta };
}
async function openLink(kind) {
  try {
    const response = await fetch('/api/open-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Bağlantı açılamadı.');
    const note = kind === 'fire' ? `Ateşle! başlatıldı. Bugün ${data.remaining} hakkın kaldı.` : 'Varsayılan tarayıcıda YouTube açıldı.';
    appendMessage('assistant', note); addDiagnostic(`External link action · ${kind}`); toast(note);
  } catch (error) { appendMessage('assistant', error.message); addDiagnostic(error.message, 'error'); toast(error.message); }
}
async function openFolder(name) {
  try {
    const response = await fetch('/api/open-desktop-folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Klasör açılamadı.');
    appendMessage('assistant', data.message); addDiagnostic(data.message); toast(data.message);
  } catch (error) { appendMessage('assistant', error.message); addDiagnostic(error.message, 'error'); toast(error.message); }
}
async function runAction(action, payload = '') {
  if (action === 'youtube') return openLink('youtube');
  if (action === 'fire') return openLink('fire');
  if (action === 'meme') return openLink('meme');
  if (action === 'folder') return openFolder(payload);
  if (action === 'word-game' || action === 'number-game') { setView('fun'); toast(action === 'word-game' ? 'Kelime türetme hazır.' : 'Sayı oyunu hazır.'); return; }
  if (action === 'joke') return sendMessage('Tell me one short, clean joke.', { skipLocal: true });
}
async function handleLocalCommand(prompt) {
  const normalized = prompt.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\byoutube\b/.test(normalized) && /(ac|open)/.test(normalized)) { await openLink('youtube'); return true; }
  if (/^(atesle|fire)\W*$/.test(normalized)) { await openLink('fire'); return true; }
  if (normalized.includes('iki gozumun cicegi') || normalized.includes('suralari aydinlat hele')) { await openLink('meme'); return true; }
  const folderMatch = prompt.match(/(?:masa\s*üstündeki|masaüstünde)\s+(.+?)\s+klasör(?:ünü|unu|ü|u)?\s+aç/i);
  if (folderMatch) { await openFolder(folderMatch[1].trim()); return true; }
  if (normalized.includes('kelime turetme') || normalized.includes('kelime oyunu')) { setView('fun'); $('#word-input').focus(); appendMessage('assistant', 'Kelime türetme oyunu hazır. Son harfle devam et.'); return true; }
  if (/\b(oyun oyna|oyunlar|game)\b/.test(normalized)) { setView('fun'); appendMessage('assistant', 'Oyun modülleri açıldı. Kelime zinciri veya sayı tahminini seç.'); return true; }
  return false;
}
async function sendMessage(text, options = {}) {
  const prompt = text.trim();
  if (!prompt || state.busy) return;
  if (!state.host) { toast('Yerel bağlantı kurulamadı.'); return; }
  if (!options.skipLocal) {
    const localUser = appendMessage('user', prompt);
    if (await handleLocalCommand(prompt)) return;
    localUser.article.remove();
  }
  if (!$('#api-indicator').classList.contains('ready')) { $('#key-modal').classList.remove('hidden'); $('#api-key').focus(); toast('Önce API anahtarını bağla.'); return; }
  state.busy = true;
  appendMessage('user', prompt);
  state.history.push({ role: 'user', content: prompt });
  const pending = appendMessage('assistant', 'Working on it…', true);
  $('#send-button')?.setAttribute('disabled', '');
  $('#core-state').textContent = 'THINKING';
  addDiagnostic('Assistant request sent');
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: state.history.slice(-20), language: state.language }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    pending.paragraph.textContent = data.text;
    pending.meta.lastChild.textContent = ' · RESPONSE';
    state.history.push({ role: 'assistant', content: data.text });
    state.history = state.history.slice(-20);
    speak(data.text);
    addDiagnostic('Assistant response received');
  } catch (error) {
    pending.article.remove();
    if (error.message.includes('API anahtar')) { state.history.pop(); $('#key-modal').classList.remove('hidden'); }
    else appendMessage('assistant', `Connection issue: ${error.message}`);
    addDiagnostic(error.message, 'error');
    toast(error.message);
  } finally {
    state.busy = false; $('#core-state').textContent = $('#api-indicator').classList.contains('ready') ? 'ONLINE' : 'STANDBY';
    $('#send-button')?.removeAttribute('disabled'); $('#prompt').focus();
  }
}
async function connectKey() {
  const input = $('#api-key'); const key = input.value.trim();
  $('#key-error').textContent = '';
  if (!key) { $('#key-error').textContent = 'API anahtarı boş olamaz.'; return; }
  $('#key-save').disabled = true;
  try {
    const response = await fetch('/api/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Anahtar eklenemedi.');
    input.value = '';
    $('#key-modal').classList.add('hidden'); setKeyStatus(true);
    addDiagnostic('API key connected in local memory'); toast('API anahtarı bağlandı.');
  } catch (error) { $('#key-error').textContent = error.message; }
  finally { $('#key-save').disabled = false; }
}
async function clearKey() {
  try {
    await fetch('/api/key/clear', { method: 'POST' });
    setKeyStatus(false); state.history = []; $('#api-key').value = '';
    addDiagnostic('API key cleared from local server memory'); toast('API anahtarı temizlendi.');
  } catch (error) { $('#key-error').textContent = error.message; }
}
async function launchApp(app) {
  const platform = effectivePlatform();
  if (!state.host || platform !== state.host) { toast('Önce bu bilgisayarın işletim sistemini seç veya Auto Detect yap.'); return; }
  try {
    const response = await fetch('/api/open-app', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app, platform }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Uygulama açılamadı.');
    addDiagnostic(`${app} launched on ${platformNames[platform]}`); toast(data.message);
  } catch (error) { addDiagnostic(error.message, 'error'); toast(error.message); }
}
function setView(view) {
  document.querySelectorAll('.rail-button[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  document.querySelectorAll('.view').forEach((section) => { section.classList.toggle('active-view', section.id === `${view}-view`); section.classList.toggle('hidden-view', section.id !== `${view}-view`); });
  const titles = { chat: 'Good evening.', systems: 'System overview.', tools: 'Desktop tools.', fun: 'Games & fun.', settings: 'Control settings.' };
  $('#view-title').textContent = titles[view] || 'Good evening.';
}

const actionNames = { youtube: 'Open YouTube', joke: 'Tell a joke', 'word-game': 'Word chain', 'number-game': 'Number game', fire: 'Ateşle!', meme: 'Meme search', folder: 'Open Desktop folder' };
function loadShortcuts() {
  try { const saved = JSON.parse(localStorage.getItem('jarvis-shortcuts') || '[]'); state.shortcuts = Array.isArray(saved) ? saved.filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.key === 'string' && actionNames[x.action]) : []; }
  catch { state.shortcuts = []; }
  renderShortcuts();
}
function renderShortcuts() {
  const box = $('#shortcut-list'); box.replaceChildren();
  if (!state.shortcuts.length) { const empty = document.createElement('p'); empty.className = 'empty-shortcuts'; empty.textContent = 'Henüz kısayol eklenmedi.'; box.append(empty); return; }
  for (const item of state.shortcuts) {
    const row = document.createElement('div'); row.className = 'shortcut-row';
    const name = document.createElement('b'); name.textContent = item.name;
    const key = document.createElement('kbd'); key.textContent = item.key;
    const action = document.createElement('span'); action.textContent = actionNames[item.action] + (item.action === 'folder' ? ` · ${item.payload}` : '');
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete-shortcut'; remove.textContent = 'REMOVE'; remove.addEventListener('click', () => { state.shortcuts = state.shortcuts.filter((shortcut) => shortcut.id !== item.id); localStorage.setItem('jarvis-shortcuts', JSON.stringify(state.shortcuts)); renderShortcuts(); });
    row.append(name, key, action, remove); box.append(row);
  }
}
function eventShortcut(event) {
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [event.ctrlKey ? 'Ctrl' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', key].filter(Boolean).join('+');
}
function startWordGame() {
  const words = state.language.startsWith('tr') ? ['elma', 'armut', 'kitap', 'kalem', 'uçak', 'orman', 'masa'] : ['apple', 'river', 'train', 'night', 'table', 'music', 'cloud'];
  state.wordList = []; state.usedWords = new Set(); state.wordScore = 0;
  state.wordLast = words[Math.floor(Math.random() * words.length)].toLocaleLowerCase(state.language);
  state.wordList.push(state.wordLast); state.usedWords.add(state.wordLast);
  renderWordGame();
}
function renderWordGame() {
  const lastLetter = [...state.wordLast].at(-1) || 'a';
  const status = $('#word-status'); status.replaceChildren();
  const score = document.createElement('b'); score.textContent = String(state.wordScore);
  const letter = document.createElement('b'); letter.textContent = lastLetter.toLocaleUpperCase(state.language);
  status.append('Kelime: ', score, ' · Sıradaki harf: ', letter);
  const chain = $('#word-chain'); chain.replaceChildren();
  for (const word of state.wordList) { const chip = document.createElement('span'); chip.className = 'word-chip'; chip.textContent = word; chain.append(chip); }
  $('#word-input').placeholder = `${lastLetter.toLocaleUpperCase(state.language)} harfiyle başlayan kelime…`;
}
function newNumberGame() { state.secret = Math.floor(Math.random() * 100) + 1; state.guesses = 0; $('#number-status').textContent = 'Yeni oyun hazır. 1 ile 100 arasında bir sayı seç.'; $('#number-status').classList.remove('won'); $('#number-input').value = ''; }
function runShortcut(item) {
  if (item.action === 'folder' && !item.payload) { toast('Kısayol düzeninde Masaüstü klasör adını belirt.'); setView('settings'); return; }
  runAction(item.action, item.payload);
}

$('#platform-select').addEventListener('change', (event) => {
  state.selected = event.target.value; localStorage.setItem('jarvis-platform', state.selected); updatePlatform();
  addDiagnostic(`Interface profile changed · ${state.selected === 'auto' ? 'Auto Detect' : platformNames[state.selected]}`);
});
document.querySelectorAll('.rail-button[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelectorAll('[data-app]').forEach((button) => button.addEventListener('click', () => launchApp(button.dataset.app)));
$('#key-open').addEventListener('click', () => $('#key-modal').classList.remove('hidden'));
$('#key-save').addEventListener('click', connectKey);
$('#key-clear').addEventListener('click', clearKey);
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => $(`#${button.dataset.close}`).classList.add('hidden')));
$('#key-visibility').addEventListener('click', () => { const input = $('#api-key'); const show = input.type === 'password'; input.type = show ? 'text' : 'password'; $('#key-visibility').textContent = show ? 'HIDE' : 'SHOW'; });
$('#language-select').addEventListener('change', (event) => setLanguage(event.target.value));
$('#language-select-settings').addEventListener('change', (event) => setLanguage(event.target.value));
$('#voice-toggle').addEventListener('click', () => setVoice(!state.voice));
$('#voice-settings-toggle').addEventListener('click', () => setVoice(!state.voice));
$('#chat-form').addEventListener('submit', (event) => { event.preventDefault(); const input = $('#prompt'); const value = input.value; input.value = ''; input.style.height = '38px'; sendMessage(value); });
$('#prompt').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#chat-form').requestSubmit(); } });
$('#prompt').addEventListener('input', (event) => { event.target.style.height = '38px'; event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`; });
$('#mic-button').addEventListener('click', () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { toast('Bu tarayıcı sesle yazmayı desteklemiyor.'); return; }
  const recognition = new SpeechRecognition(); recognition.lang = state.language; recognition.interimResults = false;
  recognition.onstart = () => toast('Dinliyorum…');
  recognition.onerror = () => toast('Mikrofon izni veya ses tanıma hatası.');
  recognition.onresult = (event) => { $('#prompt').value = event.results[0][0].transcript; $('#prompt').focus(); };
  recognition.start();
});
$('#api-key').addEventListener('keydown', (event) => { if (event.key === 'Enter') connectKey(); });
$('#shortcut-action').addEventListener('change', (event) => $('#shortcut-folder-wrap').classList.toggle('hidden', event.target.value !== 'folder'));
$('#shortcut-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const item = { id: crypto.randomUUID(), name: $('#shortcut-name').value.trim(), key: $('#shortcut-key').value, action: $('#shortcut-action').value, payload: $('#shortcut-action').value === 'folder' ? $('#shortcut-folder').value.trim() : '' };
  if (item.action === 'folder' && !item.payload) { toast('Önce açılacak Masaüstü klasörünün adını yaz.'); return; }
  if (state.shortcuts.some((shortcut) => shortcut.key === item.key)) { toast('Bu tuş başka bir kısayola atanmış.'); return; }
  state.shortcuts.push(item); localStorage.setItem('jarvis-shortcuts', JSON.stringify(state.shortcuts)); renderShortcuts();
  $('#shortcut-name').value = ''; $('#shortcut-folder').value = ''; toast(`“${item.name}” kısayolu eklendi.`);
});
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
  const combo = eventShortcut(event); const item = state.shortcuts.find((shortcut) => shortcut.key.toLowerCase() === combo.toLowerCase());
  if (item) { event.preventDefault(); runShortcut(item); }
});
$('#word-form').addEventListener('submit', (event) => {
  event.preventDefault(); const input = $('#word-input'); const word = input.value.trim().toLocaleLowerCase(state.language);
  if (!word) return;
  const required = [...state.wordLast].at(-1);
  if ([...word][0] !== required) { toast(`Kelime ${required.toLocaleUpperCase(state.language)} harfiyle başlamalı.`); return; }
  if (state.usedWords.has(word)) { toast('Bu kelime daha önce kullanıldı.'); return; }
  state.wordLast = word; state.wordList.push(word); state.usedWords.add(word); state.wordScore += 1; input.value = ''; renderWordGame();
});
$('#word-reset').addEventListener('click', startWordGame);
$('#number-form').addEventListener('submit', (event) => { event.preventDefault(); const value = Number($('#number-input').value); if (!Number.isInteger(value) || value < 1 || value > 100) { toast('1 ile 100 arasında bir sayı gir.'); return; } state.guesses += 1; $('#number-status').textContent = value === state.secret ? `Bildin! ${state.guesses} tahminde buldun.` : value < state.secret ? 'Daha büyük bir sayı dene.' : 'Daha küçük bir sayı dene.'; if (value === state.secret) $('#number-status').classList.add('won'); });
$('#number-reset').addEventListener('click', newNumberGame);
$('#joke-button').addEventListener('click', () => runAction('joke'));
document.querySelectorAll('.example-command').forEach((button) => button.addEventListener('click', () => sendMessage(button.dataset.command)));
$('#shortcut-action').dispatchEvent(new Event('change'));
populateLanguages(); setVoice(state.voice); loadShortcuts(); startWordGame(); newNumberGame();
setInterval(() => { const elapsed = Math.floor((Date.now() - state.startedAt) / 1000); $('#session-id').textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`; }, 1000);
getHealth();
