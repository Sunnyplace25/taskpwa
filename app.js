'use strict';

const APP_VERSION = '1.04';

// ── Storage ──────────────────────────────────────────────
const STORAGE_KEY = 'taskpwa_tasks';
let tasks = [];
let currentView = 'today';
let editingTaskId = null;

function loadTasks() {
  try {
    tasks = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    tasks = [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  render();
}

// ── Task CRUD ─────────────────────────────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function addTask(data) {
  tasks.push({
    id: genId(),
    title: data.title,
    priority: data.priority || 'medium',
    repeat: data.repeat || 'none',
    dueDate: data.dueDate || null,
    dueTime: data.dueTime || null,
    memo: data.memo || '',
    completed: false,
    createdAt: Date.now(),
  });
  saveTasks();
}

function updateTask(id, data) {
  const i = tasks.findIndex(t => t.id === id);
  if (i !== -1) tasks[i] = { ...tasks[i], ...data };
  saveTasks();
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
}

function toggleComplete(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  if (!task.completed) showPraise(); // 完了時だけ褒める

  if (!task.completed && task.repeat !== 'none' && task.dueDate) {
    // Mark current as done, create next occurrence
    const next = { ...task, id: genId(), completed: false, createdAt: Date.now(), dueDate: nextDueDate(task) };
    tasks = tasks.map(t => t.id === id ? { ...t, completed: true } : t);
    tasks.push(next);
  } else {
    tasks = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
  }
  saveTasks();
}

function nextDueDate(task) {
  const d = new Date(task.dueDate + 'T00:00:00');
  if (task.repeat === 'daily')   d.setDate(d.getDate() + 1);
  if (task.repeat === 'weekly')  d.setDate(d.getDate() + 7);
  if (task.repeat === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// ── Date helpers ──────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function isToday(dateStr) {
  return dateStr === todayStr();
}

function isOverdue(task) {
  if (!task.dueDate || task.completed) return false;
  const dueMs = new Date(task.dueDate + (task.dueTime ? `T${task.dueTime}` : 'T23:59:59')).getTime();
  return dueMs < Date.now();
}

function formatDue(task) {
  if (!task.dueDate) return null;
  const d = new Date(task.dueDate + 'T00:00:00');
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);

  let label;
  if (isToday(task.dueDate)) label = '今日';
  else if (task.dueDate === tomorrow.toISOString().slice(0, 10)) label = '明日';
  else label = `${d.getMonth() + 1}/${d.getDate()}`;

  return task.dueTime ? `${label} ${task.dueTime}` : label;
}

function getTodayTasks() {
  return tasks.filter(t => !t.completed);
}

// ── Notifications ─────────────────────────────────────────
// ── 起動時タスク期限チェック ──────────────────────────────
function checkDueOnOpen() {
  const now = Date.now();
  const soon = 60 * 60 * 1000; // 1時間以内

  const overdue = tasks.filter(t =>
    !t.completed && t.dueDate && isOverdue(t)
  );
  const dueSoon = tasks.filter(t => {
    if (t.completed || !t.dueDate) return false;
    const dueMs = new Date(t.dueDate + (t.dueTime ? `T${t.dueTime}` : 'T23:59:59')).getTime();
    return dueMs > now && dueMs - now <= soon;
  });

  if (overdue.length > 0) {
    const chara = CHARACTERS[currentBg];
    const msgs = {
      'bg.jpg':  `……${overdue.length}件、期限が過ぎてる。<br>一緒に確認しよう`,
      'bg2.jpg': `おい！${overdue.length}件、期限切れだぞ！<br>早めに片付けよう！`,
      'bg3.jpg': `${overdue.length}件、期限オーバーだ。<br>確認しろ`,
    };
    const msg = msgs[currentBg] || `期限切れのタスクが${overdue.length}件あります`;
    if (chara) setTimeout(() => showOverlay(msg, chara.image, 5000), 1200);
  } else if (dueSoon.length > 0) {
    const chara = CHARACTERS[currentBg];
    const msgs = {
      'bg.jpg':  `……もうすぐ期限のタスクがある。<br>無理しないで、ひとつずつ`,
      'bg2.jpg': `もうすぐ期限くるやつあるよ！<br>確認しといて！`,
      'bg3.jpg': `もうすぐ期限だ。<br>忘れるな`,
    };
    const msg = msgs[currentBg] || `期限が近いタスクが${dueSoon.length}件あります`;
    if (chara) setTimeout(() => showOverlay(msg, chara.image, 4500), 1200);
  }
}

// ── Rendering ─────────────────────────────────────────────
const PRIORITY_LABEL = { high: '高', medium: '中', low: '低' };
const REPEAT_LABEL   = { none: '', daily: '毎日', weekly: '毎週', monthly: '毎月' };

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sortTasks(list) {
  const p = { high: 0, medium: 1, low: 2 };
  return [...list].sort((a, b) => {
    const ao = isOverdue(a), bo = isOverdue(b);
    if (ao !== bo) return ao ? -1 : 1;
    if (p[a.priority] !== p[b.priority]) return p[a.priority] - p[b.priority];
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.createdAt - b.createdAt;
  });
}

function makeCard(task) {
  const div = document.createElement('div');
  div.className = `task-card priority-${task.priority}${task.completed ? ' completed' : ''}`;
  div.dataset.id = task.id;

  const due = formatDue(task);
  const overdue = isOverdue(task);
  const todayDue = task.dueDate && isToday(task.dueDate) && !overdue;
  const repeatLabel = REPEAT_LABEL[task.repeat] || '';

  div.innerHTML = `
    <div class="task-checkbox${task.completed ? ' checked' : ''}" data-action="toggle" role="checkbox" aria-checked="${task.completed}"></div>
    <div class="task-body">
      <div class="task-title">${esc(task.title)}</div>
      <div class="task-meta">
        <span class="badge badge-${task.priority}">${PRIORITY_LABEL[task.priority]}</span>
        ${due ? `<span class="task-due${overdue ? ' overdue' : todayDue ? ' today' : ''}">${overdue ? '⚠️ ' : '📅 '}${esc(due)}</span>` : ''}
        ${repeatLabel ? `<span class="task-repeat">🔁 ${repeatLabel}</span>` : ''}
      </div>
      ${task.memo ? `<div class="task-memo">${esc(task.memo)}</div>` : ''}
    </div>
    <div class="task-actions">
      <button class="task-btn" data-action="edit" title="編集">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="task-btn delete" data-action="delete" title="削除">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>
  `;

  div.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'toggle') { toggleComplete(task.id); }
    else if (action === 'edit') { openEditModal(task.id); }
    else if (action === 'delete') {
      if (confirm(`「${task.title}」を削除しますか？`)) deleteTask(task.id);
    }
  });

  return div;
}

function renderList(listEl, emptyEl, items, completedItems) {
  listEl.innerHTML = '';
  if (items.length === 0 && completedItems.length === 0) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  if (items.length > 0) {
    const h = document.createElement('div');
    h.className = 'section-header';
    h.textContent = `未完了 (${items.length})`;
    listEl.appendChild(h);
    sortTasks(items).forEach(t => listEl.appendChild(makeCard(t)));
  }
  if (completedItems.length > 0) {
    const h = document.createElement('div');
    h.className = 'section-header';
    h.textContent = `完了 (${completedItems.length})`;
    listEl.appendChild(h);
    completedItems.forEach(t => listEl.appendChild(makeCard(t)));
  }
}

function render() {
  if (currentView === 'today') {
    const active = getTodayTasks();
    const done = tasks.filter(t => t.completed);
    renderList(
      document.getElementById('todayList'),
      document.getElementById('todayEmpty'),
      active, done
    );
  } else {
    renderList(
      document.getElementById('allList'),
      document.getElementById('allEmpty'),
      tasks.filter(t => !t.completed),
      tasks.filter(t => t.completed)
    );
  }
}

// ── Modal ─────────────────────────────────────────────────
function todayInputStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function openAddModal() {
  editingTaskId = null;
  document.getElementById('modalTitle').textContent = 'タスクを追加';
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskPriority').value = 'medium';
  document.getElementById('taskRepeat').value = 'none';
  document.getElementById('taskDate').value = todayInputStr();
  document.getElementById('taskTime').value = '';

  document.getElementById('taskMemo').value = '';
  showModal();
}

function openEditModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  editingTaskId = id;
  document.getElementById('modalTitle').textContent = 'タスクを編集';
  document.getElementById('taskTitle').value = task.title;
  document.getElementById('taskPriority').value = task.priority;
  document.getElementById('taskRepeat').value = task.repeat;
  document.getElementById('taskDate').value = task.dueDate || '';
  document.getElementById('taskTime').value = task.dueTime || '';

  document.getElementById('taskMemo').value = task.memo || '';
  showModal();
}

function showModal() {
  document.getElementById('modalOverlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('taskTitle').focus(), 80);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  editingTaskId = null;
}

function saveTask() {
  const titleEl = document.getElementById('taskTitle');
  const title = titleEl.value.trim();
  if (!title) {
    titleEl.classList.add('error');
    titleEl.focus();
    setTimeout(() => titleEl.classList.remove('error'), 1500);
    return;
  }

  const data = {
    title,
    priority: document.getElementById('taskPriority').value,
    repeat: document.getElementById('taskRepeat').value,
    dueDate: document.getElementById('taskDate').value || null,
    dueTime: document.getElementById('taskTime').value || null,

    memo: document.getElementById('taskMemo').value.trim(),
  };

  if (editingTaskId) updateTask(editingTaskId, data);
  else addTask(data);

  closeModal();
}

// ── BGM ──────────────────────────────────────────────────
const bgm = new Audio('置いた音 _Game Sound (1).mp3');
bgm.loop = true; bgm.volume = 0.5;

const bgmSweets = new Audio('SWEETs _Bitter（Vo.Hayate）_Game sound (1).mp3');
bgmSweets.loop = true; bgmSweets.volume = 0.5;

let sweetsUnlocked = localStorage.getItem('sweetsUnlocked') === 'true';
let bgmMode = localStorage.getItem('bgmMode') || 'oki'; // 'oki'|'sweets'|'random'|'muted'
let activeBgm = bgm;
let _bgmFadeTimer = null;

function updateBgmBtn() {
  const btn = document.getElementById('bgmBtn');
  if (!btn) return;
  if (!sweetsUnlocked) { btn.textContent = bgm.muted ? '🔇' : '🎵'; return; }
  btn.textContent = { oki: '🎵', sweets: '🎶', random: '🔀', muted: '🔇' }[bgmMode] ?? '🎵';
}

function bgmPlay(fromStart = false) {
  if (_bgmFadeTimer) { clearInterval(_bgmFadeTimer); _bgmFadeTimer = null; }
  if (bgmMode === 'muted') { bgmPause(); return; }
  let track;
  if (!sweetsUnlocked || bgmMode === 'oki') track = bgm;
  else if (bgmMode === 'sweets') track = bgmSweets;
  else track = Math.random() < 0.5 ? bgm : bgmSweets;
  if (activeBgm !== track) { activeBgm.pause(); activeBgm = track; }
  if (fromStart) activeBgm.currentTime = 0;
  activeBgm.volume = 0.5;
  activeBgm.muted = false;
  activeBgm.play().catch(() => {});
}

function bgmPause() { bgm.pause(); bgmSweets.pause(); }

function bgmFadeOut(duration = 1800) {
  if (_bgmFadeTimer) clearInterval(_bgmFadeTimer);
  const target = activeBgm;
  const step = target.volume / (duration / 50);
  _bgmFadeTimer = setInterval(() => {
    if (target.volume > step) {
      target.volume = Math.max(0, target.volume - step);
    } else {
      target.volume = 0;
      target.pause();
      clearInterval(_bgmFadeTimer);
      _bgmFadeTimer = null;
    }
  }, 50);
}

function bgmToggle() {
  if (!sweetsUnlocked) {
    bgm.muted = !bgm.muted;
    updateBgmBtn();
    return;
  }
  const modes = ['oki', 'sweets', 'muted'];
  bgmMode = modes[(modes.indexOf(bgmMode) + 1) % modes.length];
  localStorage.setItem('bgmMode', bgmMode);
  updateBgmBtn();
  if (currentView === 'game' && !pgDead) { bgmPause(); if (bgmMode !== 'muted') bgmPlay(false); }
}

// ── Puyo Puyo ────────────────────────────────────────────
const PG_COLS = 5;
const PG_ROWS = 10; // row 0 は隠れたスポーン行
const PG_VIS  = 9;  // 表示行数

const PUYO_PIECES = [
  { key: 'hinata', bg: '#93c5fd', bgGlass: 'rgba(147,197,253,0.22)', img: 'chara_hinata.png' },
  { key: 'hayate', bg: '#fde68a', bgGlass: 'rgba(253,230,138,0.22)', img: 'chara_hayate.png' },
  { key: 'kouta',  bg: '#fca5a5', bgGlass: 'rgba(252,165,165,0.22)', img: 'chara_kouta.png'  },
  { key: 'snow',   bg: null,      bgGlass: null,                      img: null               },
];
const PG_N = PUYO_PIECES.length;

// 特別❄：type 4=特別ヒナタ(青)、5=特別ハヤテ(黄)、6=特別コウタ(ピンク)
const PG_SPECIAL_OFFSET = PG_N; // = 4
// baseType で通常ピースと同じ色として扱う
function baseType(t) { return (t !== null && t >= PG_SPECIAL_OFFSET) ? t - PG_SPECIAL_OFFSET : t; }
function isSpecial(t) { return t !== null && t >= PG_SPECIAL_OFFSET; }

// rotation → sub のオフセット [dx, dy]
const PG_OFF = [[0,-1],[1,0],[0,1],[-1,0]];

let pgBest = Number(localStorage.getItem('pgBest') || 0);

function updateBest() {
  if (pgScore > pgBest) {
    pgBest = pgScore;
    localStorage.setItem('pgBest', pgBest);
  }
  const el = document.getElementById('pgBest');
  if (el) el.textContent = pgBest;
}

let pgBoard    = [];
let pgCur      = null;
let pgNext     = null;
let pgScore    = 0;
let pgTimer    = null;
let pgCountdown = null;
let pgTimeLeft  = 90;
let pgDead     = false;
let pgLocking  = false;
let pgCollected = { hinata: false, hayate: false, kouta: false };

function pgRandType() {
  // 15% の確率で特別❄（types 0〜2 の特別版）を出す
  if (Math.random() < 0.15) {
    return PG_SPECIAL_OFFSET + Math.floor(Math.random() * 3);
  }
  return Math.floor(Math.random() * PG_N);
}

function pgNewPair() {
  return { main: pgRandType(), sub: pgRandType(), x: 2, y: 1, rot: 0 };
}

function pgSubPos(p) {
  const [dx,dy] = PG_OFF[p.rot];
  return { x: p.x+dx, y: p.y+dy };
}

function pgInBoard(x,y) {
  return x>=0 && x<PG_COLS && y>=0 && y<PG_ROWS;
}

function pgFree(x,y) {
  return pgInBoard(x,y) && pgBoard[y][x]===null;
}

function pgCanMove(p, dx=0, dy=0) {
  const s = pgSubPos(p);
  return pgFree(p.x+dx, p.y+dy) && pgFree(s.x+dx, s.y+dy);
}

function pgInit() {
  pgBoard = Array.from({length: PG_ROWS}, () => Array(PG_COLS).fill(null));
  pgScore = 0; pgTimeLeft = 90; pgDead = false; pgLocking = false;
  pgCollected = { hinata: false, hayate: false, kouta: false };
  pgRenderCollected();
  renderGsKeys();
  updateBest();
  pgNext = pgNewPair();
  pgSpawn();
  pgStartTimer();
  pgStartCountdown();
  const timerEl = document.getElementById('pgTimer');
  if (timerEl) { timerEl.textContent = 90; timerEl.classList.remove('pg-timer-low'); }
  pgRender();
}

function pgSpawn() {
  pgCur = { ...pgNext, x:2, y:1, rot:0 };
  pgNext = pgNewPair();
  if (!pgCanMove(pgCur)) {
    pgDead = true;
    pgStopTimer();
    bgmFadeOut(1800);
    updateBest();
    pgRender();
    setTimeout(showRefresh, 400);
  }
}

function pgStartTimer() {
  pgStopTimer();
  pgTimer = setInterval(() => { if(!pgDead && !pgLocking) pgStep(); }, 700);
}

function pgStopTimer() {
  if (pgTimer) { clearInterval(pgTimer); pgTimer = null; }
}

function pgStartCountdown() {
  pgStopCountdown();
  const el = document.getElementById('pgTimer');
  pgCountdown = setInterval(() => {
    if (pgDead) { pgStopCountdown(); return; }
    pgTimeLeft--;
    if (el) {
      el.textContent = pgTimeLeft;
      el.classList.toggle('pg-timer-low', pgTimeLeft <= 10);
    }
    if (pgTimeLeft <= 0) {
      pgStopCountdown();
      pgDead = true;
      pgStopTimer();
      bgmFadeOut(1800);
      updateBest();
      pgRender();
      setTimeout(showRefresh, 400);
    }
  }, 1000);
}

function pgStopCountdown() {
  if (pgCountdown) { clearInterval(pgCountdown); pgCountdown = null; }
}

function pgStep() {
  if (pgCanMove(pgCur, 0, 1)) {
    pgCur.y++;
    pgRender();
  } else {
    pgLock();
  }
}

function pgLock() {
  pgLocking = true;
  pgStopTimer();
  const s = pgSubPos(pgCur);
  if (pgInBoard(pgCur.x, pgCur.y)) pgBoard[pgCur.y][pgCur.x] = pgCur.main;
  if (pgInBoard(s.x, s.y))         pgBoard[s.y][s.x]         = pgCur.sub;
  pgCur = null;
  pgGravity();
  pgRender();
  setTimeout(() => pgResolve(0), 120);
}

function pgGravity() {
  for (let c=0; c<PG_COLS; c++) {
    const stack = [];
    for (let r=PG_ROWS-1; r>=0; r--) if(pgBoard[r][c]!==null) stack.push(pgBoard[r][c]);
    for (let r=PG_ROWS-1; r>=0; r--) pgBoard[r][c] = stack.length ? stack.shift() : null;
  }
}

function pgFlood(r,c,t,vis) {
  if (!pgInBoard(c,r) || vis.has(`${r},${c}`) || pgBoard[r][c]===null) return [];
  // 特別❄は同じ基本色として扱う
  if (baseType(pgBoard[r][c]) !== baseType(t)) return [];
  vis.add(`${r},${c}`);
  return [[r,c],
    ...pgFlood(r-1,c,t,vis), ...pgFlood(r+1,c,t,vis),
    ...pgFlood(r,c-1,t,vis), ...pgFlood(r,c+1,t,vis)];
}

function pgResolve(chain) {
  const vis = new Set(), remove = [];
  let newCollect = false;

  for (let r=0; r<PG_ROWS; r++)
    for (let c=0; c<PG_COLS; c++)
      if (pgBoard[r][c]!==null) {
        const g = pgFlood(r,c,pgBoard[r][c],new Set());
        if (g.length>=4 && !g.some(([gr,gc])=>vis.has(`${gr},${gc}`))) {
          g.forEach(([gr,gc]) => {
            vis.add(`${gr},${gc}`);
            // グループ特定の瞬間に特別❄を検出（board値が確実に有効なタイミング）
            const t = pgBoard[gr][gc];
            if (isSpecial(t)) {
              const key = PUYO_PIECES[baseType(t)].key;
              if (!pgCollected[key]) { pgCollected[key] = true; newCollect = true; }
            }
          });
          remove.push(...g);
        }
      }

  if (!remove.length) {
    pgLocking = false;
    pgRender();
    if (!pgDead) { pgSpawn(); pgStartTimer(); pgRender(); }
    return;
  }

  const bonus = chain===0 ? 1 : chain*3;
  pgScore += remove.length * remove.length * bonus;
  if (chain + 1 >= 2) showChain(chain + 1);
  if (newCollect) pgRenderCollected(true);

  // ❄玉カウント
  const snowCleared = remove.filter(([r,c]) => pgBoard[r][c] === 3).length;
  addSnowCount(snowCleared);

  pgRender(remove);

  // 消えるセルから音符を飛ばす
  const board = document.getElementById('puyoBoard');
  if (board) {
    remove.forEach(([r, c]) => {
      const idx = (r - 1) * PG_COLS + c; // row 0は非表示なので-1
      const cell = board.children[idx];
      if (cell && !cell.classList.contains('empty')) spawnNoteParticles(cell);
    });
  }

  setTimeout(() => {
    remove.forEach(([r,c])=>{ pgBoard[r][c]=null; });
    pgGravity();
    pgRender();
    const allClear = pgBoard.every(row => row.every(c => c === null));
    if (allClear) {
      pgScore += 200;
      showAllClear();
    }
    setTimeout(() => pgResolve(chain+1), 150);
  }, 350);
}

// ── キーワード鍵 ──────────────────────────────────────────
// GS_KEYWORDS[i] と gsKey-{i} スロットは常に対応固定
// 0=残る(ヒナタ) 1=半分(コウタ) 2=重なる(ハヤテ)
const GS_KEYWORDS = ['残る', '半分', '重なる'];
function getKeyThresholds() {
  return sweetsUnlocked ? [50, 100, 150] : [30, 65, 100];
}
const GS_BG_FIRST = { 'bg.jpg': 0, 'bg3.jpg': 1, 'bg2.jpg': 2, 'sweets_hinata.jpg': 0, 'sweets_kouta.jpg': 1, 'sweets_hayate.jpg': 2 };
const SPECIAL_BG_IMGS  = ['sweets_hinata.jpg', 'sweets_kouta.jpg', 'sweets_hayate.jpg'];
const SPECIAL_BG_NAMES = ['ヒナタ', 'コウタ', 'ハヤテ'];
let specialBgUnlocked = JSON.parse(localStorage.getItem('specialBgUnlocked') || '[false,false,false]');
// v1.03 fix: stale specialBgUnlocked after old reset → clear once
if (localStorage.getItem('specialBgMigrated103') !== '1') {
  specialBgUnlocked = [false, false, false];
  localStorage.removeItem('specialBgUnlocked');
  localStorage.setItem('specialBgMigrated103', '1');
}
function bgBaseKey(bg) {
  if (bg === 'sweets_hinata.jpg') return 'bg.jpg';
  if (bg === 'sweets_kouta.jpg')  return 'bg3.jpg';
  if (bg === 'sweets_hayate.jpg') return 'bg2.jpg';
  return bg;
}

const EPISODE_DAY_LIMIT_MSG = {
  'bg.jpg':  { img: 'chara_hinata.png', msg: '今日はもう読んだ。また明日来て' },
  'bg3.jpg': { img: 'chara_kouta.png',  msg: '今日の分は読んだ。明日また来い' },
  'bg2.jpg': { img: 'chara_hayate.png', msg: '今日はもう読んだよ！また明日ね！' },
};

const GS_KEY_CHARA = [
  { img: 'chara_hinata.png', color: '#93c5fd', msg: (w) => `<span style="color:#93c5fd;font-weight:700">${w}</span>、か。<br>覚えておいて。`, bgMsg: '新しい景色になった' },
  { img: 'chara_kouta.png',  color: '#fca5a5', msg: (w) => `<span style="color:#fca5a5;font-weight:700">${w}</span>、見えた。<br>使ってみろ。`, bgMsg: 'これで行く' },
  { img: 'chara_hayate.png', color: '#fde68a', textColor: '#fb923c', msg: (w) => `<span style="color:#fb923c;font-weight:700">${w}</span>、でた！<br>やったじゃん！`, bgMsg: 'わー！背景変わった！' },
];
let gsKeyRevealed = JSON.parse(localStorage.getItem('gsKeyRevealed') || '[false,false,false]');
let gsSnowCount = Number(localStorage.getItem('gsSnowCount') || 0);
let gsRound = Number(localStorage.getItem('gsRound') || 0);

function getKeyOrder() {
  const first = GS_BG_FIRST[favBg] ?? -1;
  if (first === -1) return [0, 1, 2];
  return [first, ...[0, 1, 2].filter(i => i !== first)];
}

function renderGsKeys() {
  const order = getKeyOrder();
  GS_KEYWORDS.forEach((word, i) => {
    const el = document.getElementById(`gsKey-${i}`);
    if (!el) return;
    if (gsKeyRevealed[i]) {
      el.className = 'gs-key-slot unlocked';
      el.textContent = '🔓';
      el.style.background = GS_KEY_CHARA[i].color + '55';
      el.onclick = () => {
        const kc = GS_KEY_CHARA[i];
        document.getElementById('praiseText').innerHTML =
          `キーワードは<br><span style="color:${kc.textColor || kc.color};font-weight:700;font-size:18px">「${word}」</span>`;
        document.getElementById('praiseChara').src = kc.img;
        const popup = document.getElementById('praisePopup');
        popup.classList.remove('hidden');
        popup.style.animation = 'none';
        popup.offsetHeight;
        popup.style.animation = '';
        if (praiseTimer) clearTimeout(praiseTimer);
        praiseTimer = setTimeout(() => popup.classList.add('hidden'), 3000);
      };
    } else {
      const rank = order.indexOf(i);
      const prev = rank === 0 ? 0 : getKeyThresholds()[rank - 1];
      const cur = getKeyThresholds()[rank];
      const progress = Math.max(0, Math.min(gsSnowCount, cur) - prev);
      const total = cur - prev;
      el.className = 'gs-key-slot locked';
      el.style.background = '';
      el.textContent = `🔒 ${progress}/${total}`;
      el.onclick = null;
    }
  });
}

function addSnowCount(n) {
  if (!n) return;
  gsSnowCount += n;
  localStorage.setItem('gsSnowCount', gsSnowCount);
  const order = getKeyOrder();
  let newUnlock = false;
  getKeyThresholds().forEach((threshold, rank) => {
    const keyIdx = order[rank];
    if (!gsKeyRevealed[keyIdx] && gsSnowCount >= threshold) {
      gsKeyRevealed[keyIdx] = true;
      newUnlock = true;
      setTimeout(() => {
        const el = document.getElementById(`gsKey-${keyIdx}`);
        if (el) { el.classList.add('key-pop'); el.addEventListener('animationend', () => el.classList.remove('key-pop'), { once: true }); }
        const kc = GS_KEY_CHARA[keyIdx];
        document.getElementById('praiseText').innerHTML = `<span style="font-weight:700">🔑 キーワード解放！</span><br>${kc.msg(GS_KEYWORDS[keyIdx])}`;
        document.getElementById('praiseChara').src = kc.img;
        const popup = document.getElementById('praisePopup');
        popup.classList.remove('hidden');
        popup.style.animation = 'none';
        popup.offsetHeight;
        popup.style.animation = '';
        if (praiseTimer) clearTimeout(praiseTimer);
        praiseTimer = setTimeout(() => popup.classList.add('hidden'), 4000);
      }, rank * 300);
    }
  });
  if (newUnlock) {
    localStorage.setItem('gsKeyRevealed', JSON.stringify(gsKeyRevealed));
    // 全鍵解放後、自動リセット
    if (gsKeyRevealed.every(v => v)) {
      setTimeout(() => {
        const lastIdx = order[2];
        const kc = GS_KEY_CHARA[lastIdx];
        queuePopup(kc.img, 'また❄を集めよう！', 3000);
        gsKeyRevealed = [false, false, false];
        gsSnowCount = 0;
        gsRound++;
        localStorage.setItem('gsRound', gsRound);
        localStorage.setItem('gsKeyRevealed', JSON.stringify(gsKeyRevealed));
        localStorage.removeItem('gsSnowCount');
        renderGsKeys();
      }, 4500);
    }
  }
  // 2巡目50❄で背景解放
  if (gsRound >= 1 && gsSnowCount >= 50 && !specialBgUnlocked.every(v => v)) {
    specialBgUnlocked = [true, true, true];
    localStorage.setItem('specialBgUnlocked', JSON.stringify(specialBgUnlocked));
    const bgCharIdx = order[0];
    const kc = GS_KEY_CHARA[bgCharIdx];
    const bgImg = SPECIAL_BG_IMGS[bgCharIdx];
    setTimeout(() => {
      currentBg = bgImg;
      const el = document.getElementById('bgImg');
      if (el) el.style.backgroundImage = `url('${bgImg}')`;
      queuePopup(kc.img, `✨ ${kc.bgMsg}`, 4000);
    }, 1000);
  }
  renderGsKeys();
}

let _allClearTimer = null;
function showAllClear() {
  const el = document.getElementById('chainDisplay');
  if (!el) return;
  if (_chainTimer) clearTimeout(_chainTimer);
  if (_allClearTimer) clearTimeout(_allClearTimer);
  el.textContent = '✨ 全消し!';
  el.className = 'chain-display chain-visible all-clear-visible';
  _allClearTimer = setTimeout(() => {
    el.classList.remove('chain-visible', 'all-clear-visible');
  }, 1800);
}

let _chainTimer = null;
function showChain(n) {
  const el = document.getElementById('chainDisplay');
  if (!el) return;
  if (_chainTimer) clearTimeout(_chainTimer);
  el.textContent = `${n}連鎖!`;
  el.className = 'chain-display chain-pop';
  void el.offsetWidth; // reflow
  el.classList.add('chain-visible');
  _chainTimer = setTimeout(() => {
    el.classList.remove('chain-visible');
  }, 900);
}

const NOTE_CHARS = ['♪','♫','♩','♬','♪','♫'];

function spawnNoteParticles(cellEl) {
  const rect = cellEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const count = 4 + Math.floor(Math.random() * 3);

  for (let i = 0; i < count; i++) {
    const note = document.createElement('div');
    note.className = 'note-particle';
    note.textContent = NOTE_CHARS[Math.floor(Math.random() * NOTE_CHARS.length)];

    const angle  = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.8;
    const dist   = 40 + Math.random() * 60;
    const tx     = Math.cos(angle) * dist;
    const ty     = Math.sin(angle) * dist - 20;
    const rot    = (Math.random() - 0.5) * 180 + 'deg';
    const dur    = (0.5 + Math.random() * 0.35).toFixed(2) + 's';

    Object.assign(note.style, {
      left: cx + 'px',
      top:  cy + 'px',
      '--tx': tx + 'px',
      '--ty': ty + 'px',
      '--rot': rot,
      '--dur': dur,
      marginLeft: '-9px',
      marginTop:  '-9px',
      color: ['#6366f1','#f59e0b','#ef4444','#10b981','#ec4899'][Math.floor(Math.random()*5)],
    });

    document.body.appendChild(note);
    note.addEventListener('animationend', () => note.remove());
  }
}

function pgMakeCell(typeIdx, isPopping=false) {
  const cell = document.createElement('div');
  if (typeIdx===null) {
    cell.className = 'puyo-cell empty';
    return cell;
  }
  const base = baseType(typeIdx);
  const special = isSpecial(typeIdx);
  const p = PUYO_PIECES[base];

  if (special) {
    // 特別❄: ガラス調の背景に大きい❄を表示
    cell.className = `puyo-cell special-cell${isPopping?' popping':''}`;
    cell.style.background = p.bg;
    const ov = document.createElement('div');
    ov.className = 'special-snow-overlay';
    ov.textContent = '❄';
    cell.appendChild(ov);
  } else if (p.img) {
    cell.className = `puyo-cell${isPopping?' popping':''}`;
    cell.style.background = p.bg;
    const img = document.createElement('img');
    img.src = p.img; img.className = 'game-cell-img';
    cell.appendChild(img);
  } else {
    cell.className = `puyo-cell game-cell-snow${isPopping?' popping':''}`;
    cell.textContent = '❄';
  }
  return cell;
}

function pgRenderCollected(animate=false) {
  ['hinata','hayate','kouta'].forEach(key => {
    const slot = document.getElementById(`slot-${key}`);
    if (!slot) return;
    const wasLocked = slot.classList.contains('locked');
    slot.classList.toggle('locked', !pgCollected[key]);
    if (animate && wasLocked && pgCollected[key]) {
      slot.classList.add('collect-pop');
      slot.addEventListener('animationend', () => slot.classList.remove('collect-pop'), {once:true});
    }
  });
}

function pgRender(popping=[]) {
  const board = document.getElementById('puyoBoard');
  const scoreEl = document.getElementById('pgScore');
  const nextEl  = document.getElementById('puyoNext');
  if (!board) return;

  board.innerHTML = '';
  scoreEl.textContent = pgScore;

  const poppingSet = new Set(popping.map(([r,c])=>`${r},${c}`));

  // 表示用グリッドにcurを重ねる
  const disp = pgBoard.map(row=>[...row]);
  if (pgCur) {
    const s = pgSubPos(pgCur);
    if (pgInBoard(pgCur.x,pgCur.y)) disp[pgCur.y][pgCur.x] = pgCur.main;
    if (pgInBoard(s.x,s.y))         disp[s.y][s.x]         = pgCur.sub;
  }

  // row 1〜 を描画（row 0は非表示）
  for (let r=1; r<PG_ROWS; r++) {
    for (let c=0; c<PG_COLS; c++) {
      board.appendChild(pgMakeCell(disp[r][c], poppingSet.has(`${r},${c}`)));
    }
  }

  if (pgDead) {
    const ov = document.createElement('div');
    ov.className = 'pg-game-over';
    ov.innerHTML = `<p>リフレッシュ！</p><p>スコア: ${pgScore}</p>`;
    board.style.position = 'relative';
    board.appendChild(ov);
  }

  // ネクスト
  if (nextEl && pgNext) {
    nextEl.innerHTML = '';
    [pgNext.main, pgNext.sub].forEach(t => nextEl.appendChild(pgMakeNextCell(t)));
  }
}

function pgMakeNextCell(typeIdx) {
  const div = document.createElement('div');
  div.className = 'pg-next-piece';
  const base = baseType(typeIdx);
  const special = isSpecial(typeIdx);
  const p = PUYO_PIECES[base];

  if (special) {
    // 特別❄: ガラス調の背景に❄
    div.classList.add('special-cell');
    div.style.background = p.bgGlass;
    const ov = document.createElement('div');
    ov.className = 'special-snow-overlay';
    ov.textContent = '❄';
    div.appendChild(ov);
  } else if (p.img) {
    div.style.background = p.bg;
    const img = document.createElement('img');
    img.src = p.img; img.className = 'game-cell-img';
    div.appendChild(img);
  } else {
    div.className += ' game-cell-snow';
    div.textContent = '❄';
  }
  return div;
}

function gameReady() {
  // ボードだけリセットしてオーバーレイを表示
  pgBoard = Array.from({length: PG_ROWS}, () => Array(PG_COLS).fill(null));
  pgScore = 0; pgTimeLeft = 90; pgDead = false; pgLocking = false; pgCur = null;
  pgStopTimer();
  pgStopCountdown();
  const timerElR = document.getElementById('pgTimer');
  if (timerElR) { timerElR.textContent = 90; timerElR.classList.remove('pg-timer-low'); }
  renderGsKeys();
  pgRender();
  document.getElementById('gameStartOverlay').classList.remove('hidden');
}

function gameStart() {
  document.getElementById('gameStartOverlay').classList.add('hidden');
  pgGameCount++;
  if (pgGameCount >= 5 && pgGameCount % 5 === 0) {
    const chara = CHARACTERS[currentBg];
    if (chara?.worry) showPopup(chara.worry, 4500);
  }
  pgInit();
  bgmPlay(true);
}

function gameInit() {
  document.getElementById('gameStartOverlay').classList.add('hidden');
  pgGameCount++;
  if (pgGameCount >= 5 && pgGameCount % 5 === 0) {
    const chara = CHARACTERS[currentBg];
    if (chara?.worry) showPopup(chara.worry, 4500);
  }
  pgInit();
  bgmPlay();
}

// ── Navigation ────────────────────────────────────────────
// ── Week view ─────────────────────────────────────────────
function getWeekDays() {
  const today = new Date();
  const dow = today.getDay(); // 0=日
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function dateToStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const DAY_LABELS = ['月','火','水','木','金','土','日'];

function renderWeekView() {
  const list  = document.getElementById('weekList');
  const empty = document.getElementById('weekEmpty');
  const calDate = document.getElementById('emptyCalDate');
  if (calDate) calDate.textContent = new Date().getDate();
  list.innerHTML = '';

  const days = getWeekDays();
  const weekDates = new Set(days.map(dateToStr));
  const today = todayStr();
  let hasAny = false;

  // 期限切れタスク（今週より前・未完了）
  const overdue = sortTasks(tasks.filter(t =>
    !t.completed && t.dueDate && isOverdue(t) && !weekDates.has(t.dueDate)
  ));
  if (overdue.length > 0) {
    hasAny = true;
    const block = document.createElement('div');
    block.className = 'week-day-block';
    const header = document.createElement('div');
    header.className = 'week-day-header';
    header.innerHTML = `<span class="week-day-label" style="color:var(--high)">⚠️</span><span class="week-day-date" style="color:var(--high);font-weight:700">期限切れ</span><div class="week-day-line" style="background:var(--high-light)"></div>`;
    block.appendChild(header);
    overdue.forEach(t => block.appendChild(makeCard(t)));
    list.appendChild(block);
  }

  days.forEach((day, i) => {
    const ds = dateToStr(day);
    const dayTasks = sortTasks(tasks.filter(t => t.dueDate === ds));
    if (dayTasks.length > 0) hasAny = true;

    const block = document.createElement('div');
    block.className = 'week-day-block';

    const header = document.createElement('div');
    header.className = `week-day-header${ds === today ? ' is-today' : ''}`;
    header.innerHTML = `
      <span class="week-day-label">${DAY_LABELS[i]}${ds === today ? ' ●' : ''}</span>
      <span class="week-day-date">${day.getMonth()+1}/${day.getDate()}</span>
      <div class="week-day-line"></div>
    `;
    block.appendChild(header);

    if (dayTasks.length === 0) {
      const none = document.createElement('div');
      none.className = 'week-no-tasks';
      none.textContent = 'なし';
      block.appendChild(none);
    } else {
      dayTasks.forEach(t => block.appendChild(makeCard(t)));
    }

    list.appendChild(block);
  });

  // 日付なしタスク
  const noDates = sortTasks(tasks.filter(t => !t.dueDate && !t.completed));
  if (noDates.length > 0) {
    hasAny = true;
    const block = document.createElement('div');
    block.className = 'week-day-block week-no-date-block';
    const header = document.createElement('div');
    header.className = 'week-day-header';
    header.innerHTML = `<span class="week-day-label">—</span><span class="week-day-date">日付なし</span><div class="week-day-line"></div>`;
    block.appendChild(header);
    noDates.forEach(t => block.appendChild(makeCard(t)));
    list.appendChild(block);
  }

  empty.hidden = hasAny;
  list.hidden = !hasAny;
}

function switchView(view) {
  currentView = view;
  document.querySelector('.main').classList.toggle('game-mode', view === 'game');
  document.body.style.overflow = view === 'game' ? 'hidden' : '';
  document.getElementById('todayView').classList.toggle('hidden', view !== 'today');
  document.getElementById('weekView').classList.toggle('hidden', view !== 'week');
  document.getElementById('allView').classList.toggle('hidden', view !== 'all');
  document.getElementById('gameView').classList.toggle('hidden', view !== 'game');
  document.getElementById('settingsView').classList.toggle('hidden', view !== 'settings');
  document.getElementById('todayNavBtn').classList.toggle('active', view === 'today');
  document.getElementById('weekNavBtn').classList.toggle('active', view === 'week');
  document.getElementById('allNavBtn').classList.toggle('active', view === 'all');
  document.getElementById('settingsNavBtn').classList.toggle('active', view === 'settings');
  document.getElementById('gameNavBtn').classList.toggle('active', view === 'game');
  document.getElementById('fabBtn').classList.toggle('hidden', view === 'game' || view === 'settings');
  const titles = { today: '今日のタスク', week: '今週のタスク', all: 'すべてのタスク', game: 'ゲーム', settings: '設定' };
  document.getElementById('viewTitle').textContent = titles[view] ?? '';
  if (view === 'game') { gameReady(); }
  else { bgmPause(); pgGameCount = 0; }
  if (view === 'settings') setRandomBg(true); // 設定ページはランダム背景
  if (view === 'week') renderWeekView();
  else if (view !== 'game') render();
}

// ── Service Worker ────────────────────────────────────────
function registerSW() {
  // SW登録はindex.htmlで行う
}

// ── Praise ───────────────────────────────────────────────
const CHARACTERS = {
  'bg.jpg': {
    image: 'chara_hinata.png',
    worry: '……そろそろ戻る？<br>無理しなくていいけど',
    greeting: '無理しなくていい。<br>今日も、ちゃんと進めばそれでいい',
    refresh: [
      '少し整ったね。<br>この感じで、またいこう',
      'いい区切りになった。<br>ここからで大丈夫',
    ],
    messages: [
      'ちゃんと届いてる。<br>いいと思う',
      '無理してないのがいい。<br>今の、好きだ',
      'そのままでいい。<br>ちゃんとできてる',
    ],
  },
  'bg2.jpg': {
    image: 'chara_hayate.png',
    worry: '楽しいのはわかるけど、<br>そろそろ戻ろ！',
    greeting: 'よし、いこう！<br>今日もいい日にしようぜ！',
    refresh: [
      'いいリフレッシュ！<br>次、もう一回いけるっしょ！',
      '気分変わったな！<br>このままもう一回いこう！',
    ],
    messages: [
      'うわ、めっちゃいいじゃん！今の！',
      'それそれ、それだよ！最高！',
      'やば、今の普通に好きなんだけど！',
    ],
  },
  'bg3.jpg': {
    image: 'chara_kouta.png',
    worry: '遊びすぎ。<br>やること残ってるだろ',
    greeting: 'やることやればいい。<br>それで十分だ',
    refresh: [
      '十分だな。<br>頭、切り替わった',
      '悪くない。<br>今の、いいリセットになった',
    ],
    messages: [
      '悪くない',
      'ちゃんと形になってる',
      '今の、いい線いってる',
    ],
  },
};

let currentBg = 'bg.jpg';
let praiseTimer = null;
let pgGameCount = 0;

// ── Popup queue ───────────────────────────────────────────
let _popupQueue = [];
let _popupBusy = false;

function _flushPopupQueue() {
  if (_popupBusy || _popupQueue.length === 0) return;
  _popupBusy = true;
  const { img, text, duration } = _popupQueue.shift();
  const popup = document.getElementById('praisePopup');
  document.getElementById('praiseText').innerHTML = text;
  document.getElementById('praiseChara').src = img;
  popup.classList.remove('hidden');
  popup.style.animation = 'none';
  popup.offsetHeight;
  popup.style.animation = '';
  if (praiseTimer) clearTimeout(praiseTimer);
  praiseTimer = setTimeout(() => {
    popup.classList.add('hidden');
    _popupBusy = false;
    setTimeout(_flushPopupQueue, 400);
  }, duration);
}

function queuePopup(img, text, duration = 3500) {
  _popupQueue.push({ img, text, duration });
  _flushPopupQueue();
}

function showPopup(msg, duration = 3500) {
  const chara = CHARACTERS[currentBg];
  if (!chara) return;
  queuePopup(chara.image, msg, duration);
}

const CHARA_REC = {
  'bg.jpg': {
    img: 'chara_hinata.png',
    items: [
      { cls: 'rec-narou',  label: '📖 小説を読む', line: 'ここにいる。続き、来ればわかる' },
      { cls: 'rec-insta',  label: '📷 Instagram',  line: '更新してる。見ててほしい' },
      { cls: 'rec-yt',     label: '▶ YouTube',     line: '音で残してる。聴いてほしい' },
      { cls: 'rec-kindle', label: '📚 Kindle',     line: '形にしてある。持っててくれたら嬉しい' },
    ],
  },
  'bg3.jpg': {
    img: 'chara_kouta.png',
    items: [
      { cls: 'rec-narou',  label: '📖 小説を読む', line: '気になるなら、ここ。ゆっくり読めばいい' },
      { cls: 'rec-insta',  label: '📷 Instagram',  line: 'フォローしてくれたら助かる。ゆるく見てくれ' },
      { cls: 'rec-yt',     label: '▶ YouTube',     line: '一回聴いてみてくれ。合うと思う' },
      { cls: 'rec-kindle', label: '📚 Kindle',     line: 'まとめて読むならこれ。手元にあってもいい' },
    ],
  },
  'bg2.jpg': {
    img: 'chara_hayate.png',
    items: [
      { cls: 'rec-narou',  label: '📖 小説を読む', line: 'ほんとよくて！読んでほしい！' },
      { cls: 'rec-insta',  label: '📷 Instagram',  line: 'フォローして！絶対楽しいから！' },
      { cls: 'rec-yt',     label: '▶ YouTube',     line: 'いいから聴いてみて！！' },
      { cls: 'rec-kindle', label: '📚 Kindle',     line: '本になってんの！すごくない！？' },
    ],
  },
};

const _recQueues = new Map();
function _nextRecItem(key, items) {
  if (!_recQueues.has(key) || _recQueues.get(key).length === 0) {
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    _recQueues.set(key, shuffled);
  }
  return _recQueues.get(key).shift();
}

function showCharaRec(bg) {
  if (!bg) {
    const hakoshi = [
      { img: 'chara_hinata.png', msg: '……残ったなら、いいねと登録で応援してほしい。ちゃんと受け取る' },
      { img: 'chara_kouta.png',  msg: '残ったなら、いいねと登録で応援してくれ。三人で続ける' },
      { img: 'chara_hayate.png', msg: 'いいなって思ったら、いいねと登録で応援して！めっちゃ励みになるから！' },
    ];
    const pick = _nextRecItem('hakoshi', hakoshi);
    setTimeout(() => showOverlay(pick.msg, pick.img, 5500), 80);
    return;
  }
  const rec = CHARA_REC[bg];
  if (!rec) return;
  const i = _nextRecItem(bg, rec.items);
  setTimeout(() => queuePopup(rec.img, `<span class="rec-tag ${i.cls}">${i.label}</span>${i.line}`, 4000), 80);
}

const EPISODE_UNLOCK_MSG = {
  hinata: { img: 'chara_hinata.png', msg: '……見つけたんだ。<br>気が向いたら、読んでみて' },
  kouta:  { img: 'chara_kouta.png',  msg: '……まあ、ありがとな。<br>時間あるときでいいから' },
  hayate: { img: 'chara_hayate.png', msg: 'エピソード解放！<br>気に入ったらさ、他のもいってみて！' },
};

const SPECIAL_UNLOCK_MSG = {
  hinata: { img: 'chara_hinata.png', msg: '……こういうの、慣れてない。<br>でも、見てほしい' },
  kouta:  { img: 'chara_kouta.png',  msg: '誰にでもじゃない。<br>⋯⋯ちゃんと選んだ' },
  hayate: { img: 'chara_hayate.png', msg: 'なんかさ、これ。<br>見てもらいたいなって思って！' },
};

const MUSIC_UNLOCK_MSG = {
  hinata: { img: 'chara_hinata.png', msg: '……聴いてみて。<br>言葉より、伝わるかもしれない' },
  kouta:  { img: 'chara_kouta.png',  msg: '解放された。<br>聴いてみろ' },
  hayate: { img: 'chara_hayate.png', msg: 'やば！曲きた！！<br>早く聴いてみてよ！' },
};

function showSpecialUnlockPopup(key) {
  const m = SPECIAL_UNLOCK_MSG[key];
  if (!m) return;
  queuePopup(m.img, `🖼️ ${m.msg}`, 4000);
}

function showMusicUnlockPopup(key) {
  const m = MUSIC_UNLOCK_MSG[key];
  if (!m) return;
  queuePopup(m.img, `🎵 ${m.msg}`, 4500);
}

function showPraise() {
  const chara = CHARACTERS[currentBg];
  if (!chara) return;
  const msg = chara.messages[Math.floor(Math.random() * chara.messages.length)];
  showPopup(msg);
}

function showOverlay(text, imageSrc, duration) {
  const overlay = document.getElementById('greetingOverlay');
  document.getElementById('greetingText').innerHTML = text;
  document.getElementById('greetingChara').src = imageSrc;
  overlay.style.display = 'flex';
  overlay.classList.remove('hidden', 'fading');

  const dismiss = () => {
    overlay.style.display = 'none';
    overlay.classList.add('hidden');
    document.removeEventListener('touchend', dismiss);
    document.removeEventListener('click', dismiss);
  };
  document.addEventListener('touchend', dismiss, { once: true, passive: true });
  document.addEventListener('click', dismiss, { once: true });
  setTimeout(dismiss, duration);
}

function showRefresh() {
  const chara = CHARACTERS[currentBg];
  if (!chara?.refresh) return;
  const msg = chara.refresh[Math.floor(Math.random() * chara.refresh.length)];
  showOverlay(msg, chara.image, 4000);
}

function showGreeting() {
  const chara = CHARACTERS[currentBg];
  if (!chara) return;
  showOverlay(chara.greeting, chara.image, 4500);
}

// ── Background ───────────────────────────────────────────
let favBg = localStorage.getItem('favBg') || '';

function setFavBg(bg) {
  favBg = bg;
  localStorage.setItem('favBg', bg);
  _recQueues.delete(bg); // キャラ変更時にキューをリセット
  updateCharaBtns();
}

function setRandomBg(forceRandom = false) {
  let images;
  if (!forceRandom && favBg) {
    // 推しキャラモード: 通常bg + 解放済みsweets bgからランダム
    const idx = GS_BG_FIRST[favBg];
    images = [favBg];
    if (idx !== undefined && specialBgUnlocked[idx]) images.push(SPECIAL_BG_IMGS[idx]);
  } else {
    // 箱推しモード: 全bg + 解放済みsweets bg
    images = ['bg.jpg', 'bg2.jpg', 'bg3.jpg'];
    SPECIAL_BG_IMGS.forEach((img, i) => { if (specialBgUnlocked[i]) images.push(img); });
  }
  const picked = images[Math.floor(Math.random() * images.length)];
  currentBg = picked;
  document.getElementById('bgImg').style.backgroundImage = `url('${picked}')`;
}

function updateCharaBtns() {
  document.querySelectorAll('.settings-chara-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.bg === favBg);
  });
}

// ── Init ──────────────────────────────────────────────────
function init() {
  setRandomBg();
  setTimeout(showGreeting, 300);
  loadTasks();
  registerSW();
  const _calDate = document.getElementById('emptyCalDate');
  if (_calDate) _calDate.textContent = new Date().getDate();

  function addBtn(id, fn) {
    const el = document.getElementById(id);
    let lastFired = 0;
    el.addEventListener('touchend', e => {
      e.preventDefault();
      lastFired = Date.now();
      fn();
    }, { passive: false });
    el.addEventListener('click', () => {
      if (Date.now() - lastFired < 600) return;
      fn();
    });
  }

  addBtn('fabBtn', openAddModal);
  addBtn('modalClose', closeModal);
  addBtn('cancelBtn', closeModal);
  addBtn('saveBtn', saveTask);
  // ゲーム中は2回タップで離脱確認ダイアログ
  let pendingView = null;
  let navTapView = null;
  let navTapTimer = null;

  function showLeaveDialog(view) {
    pendingView = view;
    pgStopTimer();
    pgStopCountdown();
    bgmFadeOut(600);
    const overlay = document.getElementById('leaveOverlay');
    overlay.classList.remove('hidden');
    // ダイアログ表示中はナビバーをロック
    document.querySelector('.bottom-nav').style.pointerEvents = 'none';
  }

  function closeLeaveDialog() {
    document.getElementById('leaveOverlay').classList.add('hidden');
    document.querySelector('.bottom-nav').style.pointerEvents = '';
  }

  function clearNavLock() {
    clearTimeout(navTapTimer);
    navTapView = null;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('nav-locked'));
  }

  function isGamePlaying() {
    return currentView === 'game' && !pgDead &&
      document.getElementById('gameStartOverlay').classList.contains('hidden');
  }

  function navTo(view) {
    if (isGamePlaying() && view !== 'game') {
      if (navTapView !== null) {
        // 2回目タップ（どのボタンでも）→ ダイアログ表示
        clearNavLock();
        showLeaveDialog(view);
      } else {
        // 1回目タップ → ロック状態を視覚表示
        navTapView = view;
        const btn = document.querySelector(`[data-view="${view}"]`);
        btn?.classList.add('nav-locked');
        navTapTimer = setTimeout(clearNavLock, 2000);
      }
    } else {
      clearNavLock();
      switchView(view);
    }
  }
  addBtn('todayNavBtn',    () => navTo('today'));
  addBtn('weekNavBtn',     () => navTo('week'));
  addBtn('allNavBtn',      () => navTo('all'));
  addBtn('gameNavBtn',     () => navTo('game'));
  addBtn('settingsNavBtn', () => { navTo('settings'); updateCharaBtns(); });

  // 推しキャラ選択
  document.querySelectorAll('.settings-chara-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setFavBg(btn.dataset.bg);
      showCharaRec(btn.dataset.bg);
    });
  });
  updateCharaBtns();

  addBtn('leaveOkBtn', () => {
    closeLeaveDialog();
    switchView(pendingView);
    pendingView = null;
  });
  addBtn('leaveCancelBtn', () => {
    closeLeaveDialog();
    // スタート画面でなく実際にゲーム中だったときだけ再開
    if (!pgDead && pgCur && document.getElementById('gameStartOverlay').classList.contains('hidden')) {
      pgStartTimer(); pgStartCountdown(); bgmPlay();
    }
    pendingView = null;
  });
  addBtn('gameResetBtn', gameInit);
  addBtn('gameStartBtn', gameStart);
  addBtn('bgmBtn', bgmToggle);
  updateBgmBtn();

  // ── ギャラリー ─────────────────────────────────
  const GALLERY_IMAGES = [
    { src: 'bg.jpg',  label: 'ヒナタ' },
    { src: 'bg3.jpg', label: 'コウタ' },
    { src: 'bg2.jpg', label: 'ハヤテ' },
  ];
  let galleryIdx = 0;
  let touchStartX = 0;

  function galleryShow(idx) {
    galleryIdx = (idx + GALLERY_IMAGES.length) % GALLERY_IMAGES.length;
    document.getElementById('galleryImg').src = GALLERY_IMAGES[galleryIdx].src;
    // ドット更新
    const dots = document.getElementById('galleryDots');
    dots.innerHTML = GALLERY_IMAGES.map((_, i) =>
      `<span class="gallery-dot${i === galleryIdx ? ' active' : ''}"></span>`
    ).join('');
  }

  function galleryOpen() {
    document.getElementById('galleryOverlay').classList.remove('hidden');
    galleryShow(0);
  }

  function galleryClose() {
    document.getElementById('galleryOverlay').classList.add('hidden');
  }

  addBtn('galleryBtn', galleryOpen);
  addBtn('galleryClose', galleryClose);
  addBtn('galleryPrev', () => galleryShow(galleryIdx - 1));
  addBtn('galleryNext', () => galleryShow(galleryIdx + 1));

  const wrap = document.getElementById('galleryImgWrap');
  wrap.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  wrap.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) galleryShow(galleryIdx + (dx < 0 ? 1 : -1));
  });

  // ── スペシャル合言葉 ──────────────────────────────
  const SPECIAL_CODES = {
    '残る':   { key: 'hinata', img: 'sweets_hinata.jpg', name: 'ヒナタ' },
    '半分':   { key: 'kouta',  img: 'sweets_kouta.jpg',  name: 'コウタ' },
    '重なる': { key: 'hayate', img: 'sweets_hayate.jpg', name: 'ハヤテ' },
  };
  let specialUnlocked = JSON.parse(localStorage.getItem('specialUnlocked') || '{}');

  function renderSpecialSlots() {
    const container = document.getElementById('specialSlots');
    if (!container) return;
    container.innerHTML = '';
    ['hinata','kouta','hayate'].forEach(key => {
      const info = Object.values(SPECIAL_CODES).find(v => v.key === key);
      const unlocked = specialUnlocked[key];
      const slot = document.createElement('div');
      slot.className = `special-slot${unlocked ? '' : ' locked'}`;
      slot.innerHTML = unlocked
        ? `<img src="${info.img}" alt="${info.name}"><span>${info.name}</span>`
        : `<span class="special-lock">🔒</span><span>${info.name}</span>`;
      if (unlocked) {
        slot.addEventListener('click', () => {
          document.getElementById('galleryImg').src = info.img;
          document.getElementById('galleryOverlay').classList.remove('hidden');
          document.getElementById('galleryDots').innerHTML = '';
          document.getElementById('galleryPrev').style.display = 'none';
          document.getElementById('galleryNext').style.display = 'none';
        });
      }
      container.appendChild(slot);
    });
  }

  const RESET_CODE = '甘いの、行く？';
  const GAME_KEY_RESET_CODE = 'SWEETs';
  let wrongCount = 0;

  function checkSweetsUnlock() {
    if (sweetsUnlocked) return;
    if (['hinata','kouta','hayate'].every(k => specialUnlocked[k])) {
      sweetsUnlocked = true;
      localStorage.setItem('sweetsUnlocked', 'true');
      updateBgmBtn();
      setTimeout(() => showPopup('🎶 SWEETs BGM 解放！<br>ゲームで切り替えられるよ', 5000), 500);
    }
  }

  function checkWrongHint() {
    wrongCount++;
    if (wrongCount >= 5) {
      wrongCount = 0;
      showPopup('ことりさんに<br>聞いてみる……？', 4000);
    }
  }

  function resetAllSpecial(hint) {
    specialUnlocked = {};
    episodeUnlocked = {};
    musicPopupShown = {};
    episodeRead = {};
    localStorage.removeItem('specialUnlocked');
    localStorage.removeItem('episodeUnlocked');
    localStorage.removeItem('musicPopupShown');
    localStorage.removeItem('episodeRead');
    sweetsUnlocked = false;
    localStorage.removeItem('sweetsUnlocked');
    specialBgUnlocked = [false, false, false];
    localStorage.removeItem('specialBgUnlocked');
    gsRound = 0;
    localStorage.removeItem('gsRound');
    setRandomBg();
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    currentTrack = null;
    renderSpecialSlots();
    renderEpisodeSlots();
    renderMusicList();
    updateBgmBtn();
    hint.textContent = 'すべてリセットしました';
    hint.style.color = '#94a3b8';
  }

  function resetBest(hint) {
    pgBest = 0;
    localStorage.removeItem('pgBest');
    const el = document.getElementById('pgBest');
    if (el) el.textContent = 0;
    hint.textContent = 'ベストスコアをリセットしました';
    hint.style.color = '#94a3b8';
  }

  function resetGameKeys(hint) {
    gsKeyRevealed = [false, false, false];
    gsSnowCount = 0;
    localStorage.removeItem('gsKeyRevealed');
    localStorage.removeItem('gsSnowCount');
    renderGsKeys();
    hint.textContent = '鍵をリセットしました';
    hint.style.color = '#94a3b8';
  }

  function unlockAll(hint) {
    ['hinata','kouta','hayate'].forEach(k => {
      specialUnlocked[k] = true;
      episodeUnlocked[k] = true;
    });
    localStorage.setItem('specialUnlocked', JSON.stringify(specialUnlocked));
    localStorage.setItem('episodeUnlocked', JSON.stringify(episodeUnlocked));
    sweetsUnlocked = true;
    localStorage.setItem('sweetsUnlocked', 'true');
    gsKeyRevealed = [true, true, true];
    gsSnowCount = getKeyThresholds()[getKeyThresholds().length - 1];
    localStorage.setItem('gsKeyRevealed', JSON.stringify(gsKeyRevealed));
    localStorage.setItem('gsSnowCount', gsSnowCount);
    renderSpecialSlots();
    renderEpisodeSlots();
    renderMusicList();
    renderGsKeys();
    updateBgmBtn();
    hint.textContent = 'すべての機能が解放されました！';
    hint.style.color = '#6366f1';
  }

  function checkCode() {
    const input = document.getElementById('codeInput');
    const hint  = document.getElementById('codeHint');
    const val = input.value.trim();
    if (val === 'n9009lo') {
      input.value = '';
      unlockAll(hint);
      setTimeout(() => { hint.textContent = ''; }, 3000);
      return;
    }
    if (val === RESET_CODE) {
      input.value = '';
      resetAllSpecial(hint);
      setTimeout(() => { hint.textContent = ''; }, 2500);
      return;
    }
    if (val === GAME_KEY_RESET_CODE) {
      input.value = '';
      resetGameKeys(hint);
      setTimeout(() => { hint.textContent = ''; }, 2500);
      return;
    }
    if (val === '悪くない') {
      input.value = '';
      resetBest(hint);
      setTimeout(() => { hint.textContent = ''; }, 2500);
      return;
    }
    const match = SPECIAL_CODES[val];
    if (match) {
      if (specialUnlocked[match.key]) {
        hint.textContent = 'すでに解放済みです';
        hint.style.color = '#94a3b8';
      } else {
        specialUnlocked[match.key] = true;
        localStorage.setItem('specialUnlocked', JSON.stringify(specialUnlocked));
        renderSpecialSlots();
        renderEpisodeSlots();
        renderMusicList();
        hint.textContent = `${match.name}のスペシャル画像が解放されました！`;
        hint.style.color = '#6366f1';
        checkSweetsUnlock();
        showSpecialUnlockPopup(match.key);
      }
    } else {
      hint.textContent = 'キーワードが違います';
      hint.style.color = '#ef4444';
      checkWrongHint();
    }
    input.value = '';
    setTimeout(() => { hint.textContent = ''; }, 2500);
  }

  renderSpecialSlots();
  addBtn('codeSubmit', checkCode);
  document.getElementById('codeInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') checkCode();
  });

  // ── エピソード合言葉 ──────────────────────────────
  const EPISODE_CODES = {
    'チョコ':   { key: 'hinata', name: 'ヒナタ', title: 'チョコ', bgImg: 'sweets_hinata.jpg', text: `何の飾りもない板チョコを、ヒナタは指で割る。
乾いた音が小さく残る。

そのかけらを少しかじって、ふっと笑う。

「チョコを食べると幸せになるらしい」

前にハヤテが、そんなことを言っていた気がする。
確かめるみたいに、もう一口。

甘さが舌の上でゆっくり溶けていく。

張っていたものが、少しだけほどける。
けれど、全部が消えるわけじゃない。
奥のほうに、言葉にならないまま残っている。

「確かに、残る」

小さくつぶやいて、もう一欠片だけ口に入れる。

甘さが重なる。
さっきよりも、少しやわらかい。

半分くらい、軽くなる。

割ったときの音と、今の静けさがどこかで重なっている。
きれいには揃わないまま、そのまま残る。

指先に残った甘さを、軽く拭ってから。

ヒナタはギターを手に取る。

一音だけ、鳴らす。

やわらいだ音が、そのまま残った。` },
    'マカロン': { key: 'kouta',  name: 'コウタ', title: 'マカロン', bgImg: 'sweets_kouta.jpg', text: `地方遠征の夜、ホテルの部屋。

机の上に置かれた差し入れの箱を、コウタが開ける。
中には色の揃ったマカロンが並んでいる。

ひとつつまんで、ハヤテが先に口に入れる。

「うま」

短く言って、もう一つに手を伸ばす。

ヒナタは少し間を置いてから口に運ぶ。

「……うん」

わずかに表情が緩む。

コウタも一つ取る。
指に触れる感触がやわらかい。

半分でいい、と思って、端を少しかじる。

「甘いな……」

小さく言って、残りを見る。
整った色とクリーム。さっきの甘さが、まだ舌に残っている。

そのまま、残りも全部口に入れる。

甘さが一気に広がる。
少しだけ強い。でも、嫌ではない。

遠征の疲れと、さっきまでの空気が、ゆるくほどけていく。

飲み込んだあとも、舌の奥に少し残る。

コウタはわずかに笑う。

「悪くない」` },
    'パフェ':   { key: 'hayate', name: 'ハヤテ', title: 'パフェ',   bgImg: 'sweets_hayate.jpg', text: `ハヤテは迷わず、季節限定のパフェを選ぶ。

背の高いグラスの中で、色がいくつも重なっている。
しばらくそれを眺めてから、ようやくスプーンを入れた。

「こういうの、いいよな。重なってるの」

ひと口ごとに味が変わる。
甘さが混ざっていくたびに、小さく頷く。

量は多い。
最初から、ひとりで食べ切るつもりがないみたいな頼み方だ。

少し食べて、ふっと顔を上げる。

「なあ、半分食べる？」

返事は待たない。
もうひと匙すくって、差し出す。

上の層が崩れて、色がにじむ。
それでも下には、まだ崩れていない層が残っている。

全部は、混ざらない。

差し出したスプーンが戻ってくる。
少しだけ減っている。

それを見て、ハヤテは小さく笑う。

半分には、ならない。

それでもいい、という顔で、またひと口運ぶ。

「これくらいが、ちょうどいい」

整えるんじゃなくて、
崩れたままを、そのままにしておくみたいに。

グラスの底には、最後まで混ざりきらない甘さが残る。

それを確かめるように、ゆっくりと食べていく。` },
  };
  let episodeUnlocked   = JSON.parse(localStorage.getItem('episodeUnlocked')   || '{}');
  let musicPopupShown   = JSON.parse(localStorage.getItem('musicPopupShown')   || '{}');
  let episodeRead       = JSON.parse(localStorage.getItem('episodeRead')       || '{}');
  let lastEpisodeDate   = localStorage.getItem('lastEpisodeDate') || '';

  const EPISODE_HINT_MSG = {
    hinata: { img: 'chara_hinata.png', msg: '……俺が食べていたのは？' },
    kouta:  { img: 'chara_kouta.png',  msg: '俺が食べていたのは？' },
    hayate: { img: 'chara_hayate.png', msg: '俺が食べていたのは？！' },
  };

  function renderEpisodeSlots() {
    const container = document.getElementById('episodeSlots');
    if (!container) return;
    container.innerHTML = '';
    const allSpecial = ['hinata','kouta','hayate'].every(k => specialUnlocked[k]);
    ['hinata','kouta','hayate'].forEach(key => {
      const info = Object.values(EPISODE_CODES).find(v => v.key === key);
      const unlocked = episodeUnlocked[key];
      const slot = document.createElement('div');
      slot.className = `special-slot${unlocked ? '' : ' locked'}`;
      slot.innerHTML = unlocked
        ? `<span class="episode-icon">📖</span><span>${info.name}</span>`
        : `<span class="special-lock">🔒</span><span>${info.name}</span>`;
      if (unlocked && info.text) {
        slot.addEventListener('click', () => {
          if (lastEpisodeDate === todayStr()) {
            const m = EPISODE_DAY_LIMIT_MSG[bgBaseKey(currentBg)] || EPISODE_DAY_LIMIT_MSG['bg.jpg'];
            queuePopup(m.img, m.msg, 3500);
            return;
          }
          showEpisode(info);
        });
      } else if (!unlocked && allSpecial) {
        slot.addEventListener('click', () => {
          const m = EPISODE_HINT_MSG[key];
          queuePopup(m.img, m.msg, 3500);
        });
      }
      container.appendChild(slot);
    });
  }

  let _currentEpisodeKey = null;

  function showEpisode(info) {
    _currentEpisodeKey = info.key;
    document.getElementById('episodeViewerName').textContent = info.title;
    const body = document.getElementById('episodeViewerBody');
    body.innerHTML =
      info.text.split('\n').map(l => l ? `<p>${esc(l)}</p>` : '<br>').join('') +
      `<div class="episode-narou-link"><a href="https://mypage.syosetu.com/2212173/" target="_blank" rel="noopener">物語の続きはこちらからも読めます</a></div>`;
    const inner = document.getElementById('episodeViewer').querySelector('.episode-viewer-inner');
    inner.style.backgroundImage = info.bgImg ? `url('${info.bgImg}')` : '';
    inner.scrollTop = 0;
    document.getElementById('episodeViewer').classList.remove('hidden');
  }

  document.getElementById('episodeViewerClose').addEventListener('click', () => {
    document.getElementById('episodeViewer').classList.add('hidden');
    if (_currentEpisodeKey) {
      const wasRead = episodeRead[_currentEpisodeKey];
      // エピソードを読んだ記録
      episodeRead[_currentEpisodeKey] = true;
      localStorage.setItem('episodeRead', JSON.stringify(episodeRead));
      lastEpisodeDate = todayStr();
      localStorage.setItem('lastEpisodeDate', lastEpisodeDate);
      // 初めて読み終えた＆両方解放済みなら曲解放
      if (!wasRead && isMusicUnlocked(_currentEpisodeKey) && !musicPopupShown[_currentEpisodeKey]) {
        const key = _currentEpisodeKey;
        musicPopupShown[key] = true;
        localStorage.setItem('musicPopupShown', JSON.stringify(musicPopupShown));
        renderMusicList();
        setTimeout(() => showMusicUnlockPopup(key), 400);
      }
    }
    _currentEpisodeKey = null;
  });

  function checkEpisodeCode() {
    const input = document.getElementById('episodeCodeInput');
    const hint  = document.getElementById('episodeCodeHint');
    const val = input.value.trim();
    if (val === RESET_CODE) {
      input.value = '';
      resetAllSpecial(hint);
      setTimeout(() => { hint.textContent = ''; }, 2500);
      return;
    }
    const match = EPISODE_CODES[val];
    if (match) {
      if (episodeUnlocked[match.key]) {
        hint.textContent = 'すでに解放済みです';
        hint.style.color = '#94a3b8';
      } else {
        episodeUnlocked[match.key] = true;
        localStorage.setItem('episodeUnlocked', JSON.stringify(episodeUnlocked));
        renderEpisodeSlots();
        renderMusicList();
        hint.textContent = `${match.name}のエピソードが解放されました！`;
        hint.style.color = '#6366f1';
        // エピソード解放の一言ポップアップ（ミュージックは初回開封時に表示）
        const em = EPISODE_UNLOCK_MSG[match.key];
        if (em) queuePopup(em.img, `📖 ${em.msg}`, 4000);
      }
    } else {
      hint.textContent = 'キーワードが違います';
      hint.style.color = '#ef4444';
      checkWrongHint();
    }
    input.value = '';
    setTimeout(() => { hint.textContent = ''; }, 2500);
  }

  renderEpisodeSlots();
  addBtn('episodeCodeSubmit', checkEpisodeCode);
  document.getElementById('episodeCodeInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') checkEpisodeCode();
  });

  // ── ミュージック ──────────────────────────────
  const MUSIC_TRACKS = [
    { title: 'SWEETs（Vo.ヒナタ）', file: 'Snow flakes - SWEETs_MASTER02.mp3', key: 'hinata' },
    { title: 'SWEETs（Vo.コウタ）', file: 'SWEETs（Vo.Kouta）.mp3',             key: 'kouta'  },
    { title: 'SWEETs（Vo.ハヤテ）', file: 'SWEETs（Vo.Hayate).mp3',             key: 'hayate' },
  ];
  let currentTrack = null;
  let currentAudio = null;

  function isMusicUnlocked(key) {
    return specialUnlocked[key] && episodeUnlocked[key] && episodeRead[key];
  }

  function renderMusicList() {
    const list = document.getElementById('musicList');
    if (!list) return;
    list.innerHTML = '';
    MUSIC_TRACKS.forEach((track, i) => {
      const unlocked = isMusicUnlocked(track.key);
      const row = document.createElement('div');
      row.className = `music-row${unlocked ? '' : ' locked'}`;
      row.id = `music-row-${i}`;
      if (unlocked) {
        row.innerHTML = `
          <button class="music-play-btn" id="music-btn-${i}">▶</button>
          <span class="music-title">${track.title}</span>
        `;
        row.querySelector(`#music-btn-${i}`).addEventListener('click', () => toggleTrack(i));
      } else {
        const charaName = { hinata: 'ヒナタ', kouta: 'コウタ', hayate: 'ハヤテ' }[track.key];
        row.innerHTML = `
          <span class="music-lock">🔒</span>
          <div>
            <span class="music-title locked-title">${track.title}</span>
            <p class="music-unlock-hint">${charaName}のスペシャル＋エピソードを解放</p>
          </div>
        `;
      }
      list.appendChild(row);
    });
    const ytLink = document.createElement('a');
    ytLink.href = 'https://music.youtube.com/channel/UCac5FTmiZPeFuTa_bYI0Kjw';
    ytLink.target = '_blank';
    ytLink.rel = 'noopener';
    ytLink.className = 'music-yt-link';
    ytLink.textContent = '楽曲はこちらからも聴けます';
    list.appendChild(ytLink);
  }

  function toggleTrack(i) {
    if (currentTrack === i && currentAudio && !currentAudio.paused) {
      currentAudio.pause();
      document.getElementById(`music-btn-${i}`).textContent = '▶';
      return;
    }
    if (currentAudio) {
      currentAudio.pause();
      if (currentTrack !== null) document.getElementById(`music-btn-${currentTrack}`)?.textContent === '▶' || (document.getElementById(`music-btn-${currentTrack}`).textContent = '▶');
    }
    currentTrack = i;
    currentAudio = new Audio(MUSIC_TRACKS[i].file);
    currentAudio.volume = 0.8;
    currentAudio.play().catch(() => {});
    currentAudio.addEventListener('ended', () => {
      document.getElementById(`music-btn-${i}`).textContent = '▶';
    });
    document.getElementById(`music-btn-${i}`).textContent = '■';
  }

  renderMusicList();

  // ギャラリーを通常に戻す（スペシャル単体表示から戻る）
  document.getElementById('galleryClose')?.addEventListener('click', () => {
    document.getElementById('galleryPrev').style.display = '';
    document.getElementById('galleryNext').style.display = '';
  });

  // キャラクタープロフィール
  const CHARA_PROFILE = {
    hinata: { name: 'ヒナタ', role: 'ギター・ボーカル', bio: '静かに鳴らす、言葉の代わりに。' },
    kouta:  { name: 'コウタ', role: 'ベース',           bio: '崩さない、全部ちゃんと意味がある。' },
    hayate: { name: 'ハヤテ', role: 'ドラム',           bio: '軽く叩く、空気に合わせて。' },
  };

  // コレクションスロット：タップで全画面表示
  ['hinata','kouta','hayate'].forEach(key => {
    const slot = document.getElementById(`slot-${key}`);
    if (!slot) return;
    function onSlotTap(e) {
      e.preventDefault();
      if (!pgCollected[key]) return;
      const p = CHARA_PROFILE[key];
      document.getElementById('charaViewerImg').src  = slot.dataset.img;
      document.getElementById('charaViewerName').textContent = p.name;
      document.getElementById('charaViewerRole').textContent = p.role;
      document.getElementById('charaViewerBio').textContent  = p.bio;
      document.getElementById('charaViewer').classList.remove('hidden');
    }
    slot.addEventListener('touchend', onSlotTap, { passive: false });
    slot.addEventListener('click', onSlotTap);
  });

  // キャラビュワーを閉じる
  const viewer = document.getElementById('charaViewer');
  function closeCharaViewer() { viewer.classList.add('hidden'); }
  viewer.addEventListener('click', closeCharaViewer);
  viewer.addEventListener('touchend', e => { e.preventDefault(); closeCharaViewer(); }, { passive: false });

  function bindGameBtn(id, fn) {
    const el = document.getElementById(id);
    let touched = false;
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      touched = true;
      fn();
    }, { passive: false });
    el.addEventListener('click', () => {
      if (touched) { touched = false; return; } // touchstart で処理済
      fn();
    });
  }

  bindGameBtn('pgLeft', () => { if(pgCur&&!pgDead&&!pgLocking){pgCur.x--;if(!pgCanMove(pgCur))pgCur.x++;pgRender();} });
  bindGameBtn('pgRight', () => { if(pgCur&&!pgDead&&!pgLocking){pgCur.x++;if(!pgCanMove(pgCur))pgCur.x--;pgRender();} });
  bindGameBtn('pgRotate', () => {
    if (!pgCur||pgDead||pgLocking) return;
    const nr=(pgCur.rot+1)%4, tmp={...pgCur,rot:nr};
    if(pgCanMove(tmp)) pgCur.rot=nr;
    else if(pgCanMove({...tmp,x:tmp.x-1})){pgCur.rot=nr;pgCur.x--;}
    else if(pgCanMove({...tmp,x:tmp.x+1})){pgCur.rot=nr;pgCur.x++;}
    pgRender();
  });
  bindGameBtn('pgDrop', () => { if(pgCur&&!pgDead&&!pgLocking) pgStep(); });

  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target.id === 'modalOverlay') closeModal();
  });

  document.getElementById('taskTitle').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveTask();
  });

  render();
  checkDueOnOpen();

  // アプリがバックグラウンド・非表示になったら音を止める
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) bgmPause();
  });

  // バージョン番号を自動表示
  const verNum = document.getElementById('appVerNum');
  if (verNum) verNum.textContent = APP_VERSION;

  // バージョン表示タップで強制リロード（SW再登録 → 最新取得）
  document.getElementById('versionBtn')?.addEventListener('click', async () => {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    location.reload(true);
  });
}

document.addEventListener('DOMContentLoaded', init);
