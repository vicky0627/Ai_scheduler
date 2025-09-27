// ---------- Utilities ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const fmt = (d) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
const pad = (n) => String(n).padStart(2, '0');

function toLocalDatetimeValue(date = new Date()) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

if ($('#tz')) {
  $('#tz').textContent = `Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
}

// ---------- Data Layer ----------
const KEY = 'ai-scheduler-items-v2';
const state = { items: load(), timers: new Map() };

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function persist() { localStorage.setItem(KEY, JSON.stringify(state.items)); }

function addItem(item) {
  item.id = crypto.randomUUID();
  state.items.push(item);
  persist();
  scheduleReminder(item);
  render();
  return item;
}

function updateItem(id, patch) {
  const i = state.items.findIndex(x => x.id === id);
  if (i > -1) {
    state.items[i] = { ...state.items[i], ...patch };
    persist();
    clearReminder(state.items[i]);
    scheduleReminder(state.items[i]);
    render();
  }
}

function deleteItem(id) {
  const i = state.items.findIndex(x => x.id === id);
  if (i > -1) {
    clearReminder(state.items[i]);
    state.items.splice(i, 1);
    persist();
    render();
  }
}

// ---------- Reminders ----------
async function ensureNotifPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const p = await Notification.requestPermission();
    return p === 'granted';
  }
  return false;
}

function scheduleReminder(item) {
  if (!item.remind || item.remind === 'none') return;
  const minutes = Number(item.remind);
  if (Number.isNaN(minutes)) return;
  const start = new Date(item.start).getTime();
  const when = start - minutes * 60 * 1000;
  const delay = when - Date.now();
  if (delay <= 0) return;

  clearReminder(item);
  const t = setTimeout(async () => {
    if (await ensureNotifPermission()) {
      new Notification('Reminder: ' + item.title, {
        body: `${fmt(item.start)} — ${item.who || ''}`
      });
    }
  }, Math.min(delay, 2 ** 31 - 1));
  state.timers.set(item.id, t);
}

function clearReminder(item) {
  const t = state.timers.get(item.id);
  if (t) {
    clearTimeout(t);
    state.timers.delete(item.id);
  }
}

state.items.forEach(scheduleReminder);

// ---------- Rendering ----------
function render() {
  const byStart = [...state.items].sort((a, b) => new Date(a.start) - new Date(b.start));
  const now = Date.now();
  const soon = byStart.filter(x => new Date(x.start) > now && new Date(x.start) - now < 14 * 24 * 60 * 60 * 1000);
  renderList('#upcoming', '#upcoming-empty', soon);
  renderList('#all', '#all-empty', byStart, true);
}

function renderList(listSel, emptySel, items, editable = false) {
  const list = $(listSel);
  if (!list) return;
  list.innerHTML = '';

  const empty = $(emptySel);
  if (empty) empty.style.display = items.length ? 'none' : 'block';

  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'task' + (item.done ? ' done' : '');
    el.innerHTML = `
      <div>
        <div class="title">${escapeHtml(item.title)}</div>
        <div class="meta">${fmt(item.start)}${item.end ? ' → ' + fmt(item.end) : ''} ${item.who ? ' • with ' + escapeHtml(item.who) : ''}</div>
        <div class="chips">${item.repeat && item.repeat !== 'none' ? `<span class="chip ok">${item.repeat}</span>` : ''}${item.remind && item.remind !== 'none' ? `<span class="chip warn">remind ${item.remind}m</span>` : ''}</div>
      </div>
      <div style="display:flex; gap:6px; align-items:center;">
        ${editable ? `<button class="btn ghost" data-edit="${item.id}">Edit</button>` : ''}
        <button class="btn ghost" data-done="${item.id}">${item.done ? 'Undo' : 'Done'}</button>
        <button class="btn ghost" data-del="${item.id}">✕</button>
      </div>`;
    list.appendChild(el);
  });
}

// Single event listener for actions
['#upcoming', '#all'].forEach(sel => {
  const container = $(sel);
  if (container) {
    container.addEventListener('click', e => {
      const id = e.target.getAttribute('data-del');
      if (id) return deleteItem(id);

      const did = e.target.getAttribute('data-done');
      if (did) {
        const it = state.items.find(x => x.id === did);
        return updateItem(did, { done: !it.done });
      }

      const eid = e.target.getAttribute('data-edit');
      if (eid) {
        const it = state.items.find(x => x.id === eid);
        if (!it) return;
        $('#task-id').value = it.id;
        $('#title').value = it.title;
        $('#who').value = it.who || '';
        $('#start').value = toLocalDatetimeValue(it.start);
        $('#end').value = it.end ? toLocalDatetimeValue(it.end) : '';
        $('#repeat').value = it.repeat || 'none';
        $('#remind').value = it.remind || 'none';
        $('#notes').value = it.notes || '';
        $('#save-btn').textContent = 'Update';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }
});

function escapeHtml(str = '') {
  return str.replace(/[&<>"']/g, s => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[s]));
}

// ---------- Form ----------
$('#add-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = getFormData();
  if (!data.title || !data.start) return alert('Title and Start are required');
  const id = $('#task-id').value;
  if (id) updateItem(id, data); else addItem({ ...data, done: false });
  $('#add-form').reset();
  $('#task-id').value = '';
  $('#save-btn').textContent = 'Save';
});

$('#reset-btn')?.addEventListener('click', () => {
  $('#add-form').reset();
  $('#task-id').value = '';
  $('#save-btn').textContent = 'Save';
});

function getFormData() {
  return {
    title: $('#title').value.trim(),
    who: $('#who').value.trim(),
    start: new Date($('#start').value).toISOString(),
    end: $('#end').value ? new Date($('#end').value).toISOString() : null,
    repeat: $('#repeat').value,
    remind: $('#remind').value,
    notes: $('#notes').value.trim()
  };
}

// ---------- Chatbot ----------
const chatlog = $('#chatlog');
let chatHistory = [];

function pushMsg(text, who = 'bot') {
  const div = document.createElement('div');
  div.className = 'msg ' + who;
  div.textContent = text;
  chatlog.appendChild(div);
  chatlog.scrollTop = chatlog.scrollHeight;
}
function sys(text) { pushMsg(text, 'bot'); }

$('#send-btn')?.addEventListener('click', send);
$('#chat-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });

function send() {
  const t = $('#chat-input').value.trim();
  if (!t) return;
  pushMsg(t, 'user');
  $('#chat-input').value = '';
  handleUserText(t);
}

async function sendToAI(text, history) {
  try {
    const response = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        history,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    return await response.json();
  } catch (error) {
    console.error("Error sending to AI:", error);
    return { type: 'error', text: 'Could not connect to the server.' };
  }
}

async function handleUserText(text) {
  sys('Thinking...');
  const result = await sendToAI(text, chatHistory);

  // Update chatlog with bot's response
  chatlog.removeChild(chatlog.lastChild); // Remove "Thinking..."
  const botResponseText = result.text || `Event scheduled: ${result.data?.title}`;
  pushMsg(botResponseText, 'bot');
  
  // Update history
  chatHistory.push({ role: 'user', parts: [{ text }] });
  chatHistory.push({ role: 'model', parts: [{ text: botResponseText }] });

  if (result.type === 'schedule_success') {
    const { data } = result;
    const newItem = {
      title: data.title,
      who: data.participants,
      start: data.when,
      end: data.duration_min ? new Date(new Date(data.when).getTime() + data.duration_min * 60000).toISOString() : null,
      repeat: 'none',
      remind: '15',
      notes: `Scheduled via AI chat.`,
      done: false,
    };

    addItem(newItem);
    chatHistory = []; // Reset history for the next scheduling task
  } else if (result.type === 'error') {
    // Error message is already displayed, just log it.
    console.error("Received an error from server:", result.text);
  }
}

// ---------- Boot ----------
render();
if ($('#start')) $('#start').value = toLocalDatetimeValue(new Date(Date.now() + 60 * 60 * 1000));
sys('Hi, I can schedule things. Try: "schedule a meeting with John" and I\'ll ask for more details.');