/* ============================================= */
/*  Informatik — Academic Planner                 */
/*  v3 — correctness + craft pass                 */
/* ============================================= */

let DB = {};
let selectedCourses = new Set();
let currentTrack = 'all';
let currentType = 'all';
let showOnlyOffered = false;
let schedTracks = new Set(['all']);
let schedTypes = new Set(['all']);
let schedDay = 'all';
let schedCourseQuery = '';
let modalInvoker = null;
let prevConflictCount = 0;

/* Single source of truth — mirrors the --track-* tokens in style.css */
const TRACK_COLORS = {
  AL: '#f0a84f', GVA: '#4fc4d9', ICM: '#4fd1a0', IS: '#8b8cf8'
};
const FALLBACK_TRACK = '#8b8cf8';
const TRACK_NAMES = { AL: 'Algorithmics', GVA: 'GVA', ICM: 'ICM', IS: 'Intelligent Systems' };

const MIN_MIN = 8 * 60;          /* 08:00 */
const MAX_MIN = 20 * 60;         /* 20:00 */
const DAY_RANGE = MAX_MIN - MIN_MIN;

function trackColor(t) { return TRACK_COLORS[t] || FALLBACK_TRACK; }

/* Minute-accurate time parsing */
function parseTime(timeStr) {
  const m = (timeStr || '').match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { start: (+m[1]) * 60 + (+m[2]), end: (+m[3]) * 60 + (+m[4]) };
}
function fmtMin(mins) {
  return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
}
function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// ============ INIT ============

async function init() {
  try {
    const res = await fetch('data/winter2027_complete.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    DB = await res.json();
  } catch (e) {
    document.getElementById('main-content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Data failed to load</div>
        <div class="empty-state-sub">The course database could not be fetched. This page must be served by a local web server — for example <code>python3 -m http.server</code> in the project folder — then opened via <code>localhost</code>, not by double-clicking the file.</div>
        <button onclick="location.reload()">Retry</button>
      </div>`;
    return;
  }

  const saved = localStorage.getItem('selectedCourses');
  if (saved) {
    try { selectedCourses = new Set(JSON.parse(saved)); } catch (e) {}
  }

  renderCourses(true);
  renderPlanner();
  renderScheduler();
  renderProfessors();
  renderLabs();
  updateStats();
  bindEvents();
}

// ============ EVENTS ============

const TAB_ALIASES = { schedule: 'scheduler', courses: 'explorer' };

function activateTab(name, push = true) {
  const tab = document.querySelector(`.nav-tab[data-tab="${name}"]`);
  if (!tab) return;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  window.scrollTo(0, 0);
  if (name === 'explorer') renderCourses(true);
  if (push) {
    history.pushState(null, '', name === 'explorer' ? location.pathname : '#' + name);
  }
}

function applyHashTab() {
  let name = location.hash.replace('#', '');
  name = TAB_ALIASES[name] || name;
  if (name && document.querySelector(`.nav-tab[data-tab="${name}"]`)) activateTab(name, false);
}

function bindEvents() {
  // Nav tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });
  window.addEventListener('popstate', applyHashTab);
  applyHashTab();

  // Search — no entrance animation on text-level re-renders
  document.getElementById('filter-search').addEventListener('input', () => renderCourses(false));

  // Track filters
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentTrack = pill.dataset.track;
      renderCourses(false);
    });
  });

  // Type filters
  document.querySelectorAll('.type-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.type-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentType = pill.dataset.type;
      renderCourses(false);
    });
  });

  // Offered toggle
  document.getElementById('toggle-offered')?.addEventListener('change', (e) => {
    showOnlyOffered = e.target.checked;
    renderCourses(false);
  });

  // Clear planner — with undo
  document.getElementById('btn-clear-planner').addEventListener('click', () => {
    if (selectedCourses.size === 0) return;
    const snapshot = [...selectedCourses];
    selectedCourses.clear();
    saveSelections();
    renderCourses(false); renderPlanner(); renderScheduler(); updateStats();
    showToast('Planner cleared', 'Undo', () => {
      selectedCourses = new Set(snapshot);
      saveSelections();
      renderCourses(false); renderPlanner(); renderScheduler(); updateStats();
    });
  });

  // Modal close on backdrop
  document.getElementById('course-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('course-modal')) closeModal();
  });

  // Professor search
  document.getElementById('prof-search').addEventListener('input', renderProfessors);

  // Scheduler track filters (multi-select)
  document.querySelectorAll('.sched-track-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const val = pill.dataset.strack;
      if (val === 'all') {
        schedTracks.clear(); schedTracks.add('all');
      } else {
        schedTracks.delete('all');
        if (schedTracks.has(val)) schedTracks.delete(val); else schedTracks.add(val);
      }
      if (schedTracks.size === 0) schedTracks.add('all');
      document.querySelectorAll('.sched-track-pill').forEach(p =>
        p.classList.toggle('active', schedTracks.has(p.dataset.strack)));
      renderScheduler();
    });
  });

  // Scheduler type filters (multi-select)
  document.querySelectorAll('.sched-type-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const val = pill.dataset.stype;
      if (val === 'all') {
        schedTypes.clear(); schedTypes.add('all');
      } else {
        schedTypes.delete('all');
        if (schedTypes.has(val)) schedTypes.delete(val); else schedTypes.add(val);
      }
      if (schedTypes.size === 0) schedTypes.add('all');
      document.querySelectorAll('.sched-type-pill').forEach(p =>
        p.classList.toggle('active', schedTypes.has(p.dataset.stype)));
      renderScheduler();
    });
  });

  document.getElementById('sched-day-select')?.addEventListener('change', (e) => {
    schedDay = e.target.value;
    renderScheduler();
  });
  document.getElementById('sched-course-search')?.addEventListener('input', (e) => {
    schedCourseQuery = e.target.value.toLowerCase().trim();
    renderScheduler();
  });

  // Global keys: "/" search, Cmd/Ctrl+K palette, Escape, modal Tab-trap
  document.addEventListener('keydown', (e) => {
    const cmdkOpen = !document.getElementById('cmdk').hidden;

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      cmdkOpen ? closeCmdk() : openCmdk();
      return;
    }
    if (cmdkOpen) return; // palette handles its own keys

    const modal = document.getElementById('course-modal');
    const modalOpen = modal.style.display !== 'none';

    if (e.key === 'Escape') { closeModal(); hideHovercard(); hideClusterPop(); return; }

    if (e.key === 'Tab' && modalOpen) {
      const f = [...modal.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
      return;
    }

    if (e.key === '/' && !modalOpen && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      activateTab('explorer');
      document.getElementById('filter-search').focus();
    }
  });

  bindHovercards();
  bindCmdk();
}

// ============ COURSE EXPLORER ============

function renderCourses(animate = false) {
  const search = document.getElementById('filter-search').value.toLowerCase();
  const grid = document.getElementById('course-grid');
  const count = document.getElementById('course-count');

  const filtered = DB.courses.filter(c => {
    if (currentTrack !== 'all' && c.track !== currentTrack) return false;
    if (currentType !== 'all' && c.type !== currentType) return false;
    if (showOnlyOffered && !c.offeredCurrent) return false;
    if (search) {
      const haystack = `${c.name} ${c.code} ${c.professor} ${c.track} ${c.type} ${c.contents || ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  count.textContent = filtered.length + ' course' + (filtered.length !== 1 ? 's' : '');

  if (filtered.length === 0) {
    grid.classList.remove('animate');
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Nothing matches</div>
        <div class="empty-state-sub">That combination of search and filters finds no course.</div>
        <button onclick="resetFilters()">Reset all filters</button>
      </div>`;
    return;
  }

  if (animate) {
    grid.classList.remove('animate');
    void grid.offsetWidth;              /* restart CSS animation cleanly */
    grid.classList.add('animate');
    clearTimeout(renderCourses._t);
    renderCourses._t = setTimeout(() => grid.classList.remove('animate'), 900);
  }

  grid.innerHTML = filtered.map(c => {
    const isSelected = selectedCourses.has(c.id);
    const schedStr = c.schedule && c.schedule.length > 0
      ? c.schedule.map(s => `${s.day} ${s.time}`).join(' · ')
      : 'Schedule to be determined';
    const tc = trackColor(c.track);
    const hasContent = c.contents && c.contents.length > 10;

    return `
      <div class="course-card ${isSelected ? 'selected' : ''}" style="--card-track-color: ${tc}">
        <button type="button" class="card-open" onclick="openModal('${c.id}')" aria-label="Open details: ${escAttr(c.name)}">
          <div class="card-top">
            <span class="card-code">${c.code}</span>
            <span class="card-top-right">
              ${c.offeredCurrent ? '<span class="offered-dot" title="Offered in Winter 2026/27">●</span>' : ''}
              <span class="card-ects">${c.ects} ECTS</span>
            </span>
          </div>
          <div class="card-name">${c.name}</div>
          <div class="card-prof"><strong>${c.professor || 'See BASIS'}</strong></div>
          ${c.offeredCurrent ? `<div class="card-schedule-preview">${schedStr}</div>` : ''}
          ${hasContent ? `<div class="card-content-preview">${truncate(c.contents, 100)}</div>` : ''}
          <span class="card-badges">
            <span class="card-badge track" style="--badge-r: ${hexToRgb(tc).r}; --badge-g: ${hexToRgb(tc).g}; --badge-b: ${hexToRgb(tc).b}">${DB.tracks[c.track]?.name || c.track}</span>
            <span class="card-badge type">${c.type}</span>
          </span>
        </button>
        <button type="button" class="card-add-btn" onclick="toggleCourse('${c.id}')">
          ${isSelected ? 'Remove' : 'Add'}
        </button>
      </div>
    `;
  }).join('');
}

function resetFilters() {
  currentTrack = 'all';
  currentType = 'all';
  showOnlyOffered = false;
  document.getElementById('filter-search').value = '';
  const offered = document.getElementById('toggle-offered');
  if (offered) offered.checked = false;
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p.dataset.track === 'all'));
  document.querySelectorAll('.type-pill').forEach(p => p.classList.toggle('active', p.dataset.type === 'all'));
  renderCourses(false);
}

function truncate(str, len) {
  if (!str) return '';
  const clean = str.replace(/\n/g, ' ').replace(/\s+/g, ' ');
  return clean.length > len ? clean.substring(0, len) + '…' : clean;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 139, g: 140, b: 248 };
}

// ============ TOGGLE COURSE ============

function toggleCourse(id) {
  if (selectedCourses.has(id)) selectedCourses.delete(id);
  else selectedCourses.add(id);
  saveSelections();
  renderCourses(false);
  renderPlanner();
  renderScheduler();
  updateStats();
}

/* Modal add/remove toggles in place — no forced modal round-trips */
function toggleCourseFromModal(id) {
  toggleCourse(id);
  const btn = document.querySelector('#modal-body .modal-add-btn');
  if (btn) {
    const selected = selectedCourses.has(id);
    btn.classList.toggle('remove', selected);
    btn.textContent = selected ? 'Remove from planner' : 'Add to planner';
  }
}

function saveSelections() {
  localStorage.setItem('selectedCourses', JSON.stringify([...selectedCourses]));
}

// ============ TOAST (undo surface) ============

let toastTimer = null;
function showToast(msg, actionLabel, action) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.innerHTML = `
    <span class="toast-msg">${msg}</span>
    ${actionLabel ? '<button type="button" class="toast-action" id="toast-action">' + actionLabel + '</button>' : ''}
  `;
  if (actionLabel && action) {
    toast.querySelector('#toast-action').addEventListener('click', () => { hideToast(); action(); });
  }
  requestAnimationFrame(() => toast.classList.add('visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 4000);
}
function hideToast() {
  const toast = document.getElementById('toast');
  if (toast) toast.classList.remove('visible');
}

// ============ MODAL ============

function openModal(id) {
  const c = DB.courses.find(x => x.id === id);
  if (!c) return;
  modalInvoker = document.activeElement;
  const isSelected = selectedCourses.has(c.id);
  const tc = trackColor(c.track);

  const profKey = Object.keys(DB.professors || {}).find(k => {
    const p = DB.professors[k];
    return c.professor && c.professor.includes(p.name.split(' ').pop());
  });
  const prof = profKey ? DB.professors[profKey] : null;

  const body = document.getElementById('modal-body');
  body.innerHTML = `
    <button type="button" class="modal-close" onclick="closeModal()" aria-label="Close">✕</button>
    <div class="modal-code">${c.code}</div>
    <div class="modal-title" id="modal-title">${c.name}</div>
    <div class="modal-meta">
      <span class="card-badge track" style="background: ${tc}22; color: ${tc}">${DB.tracks[c.track]?.name || c.track}</span>
      <span class="card-badge type">${c.type}</span>
      <span class="card-ects">${c.ects} ECTS</span>
      <span class="modal-meta-item">${c.workload}h workload</span>
      <span class="modal-meta-item">${c.language || 'English'}</span>
      <span class="modal-meta-item">${c.frequency}</span>
      ${c.offeredCurrent
        ? '<span class="offered-badge">✓ Winter 2026/27</span>'
        : '<span class="modal-meta-item modal-not-offered">Not offered this semester</span>'}
    </div>

    <div class="modal-section">
      <h3>Professor / Coordinator</h3>
      <p><strong>${c.professor || c.coordinator || 'See BASIS'}</strong></p>
      ${prof ? `<p class="modal-prof-group">${prof.group}</p>` : ''}
      ${prof && prof.website ? `<p class="modal-prof-link-wrap"><a href="${prof.website}" target="_blank" rel="noopener" class="modal-prof-link">${prof.website} →</a></p>` : ''}
      ${prof ? `<div class="modal-prof-tags">${prof.research.map(r => `<span class="prof-tag">${r}</span>`).join('')}</div>` : ''}
    </div>

    ${c.website ? `
    <div class="modal-section">
      <h3>Course website</h3>
      <p class="modal-prof-link-wrap"><a href="${c.website}" target="_blank" rel="noopener" class="modal-prof-link">${c.website} →</a></p>
    </div>` : ''}

    ${c.schedule && c.schedule.length > 0 ? `
    <div class="modal-section">
      <h3>Schedule — Winter 2026/27</h3>
      <table class="modal-schedule-table">
        <thead><tr><th>Day</th><th>Time</th><th>Type</th><th>Room</th></tr></thead>
        <tbody>
          ${c.schedule.map(s => `<tr><td>${s.day}</td><td>${s.time}</td><td>${s.type}</td><td>${s.room}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}

    ${c.contents ? `
    <div class="modal-section">
      <h3>Contents / Syllabus</h3>
      <div class="modal-text-block">${formatText(c.contents)}</div>
    </div>` : ''}

    ${c.learningGoals?.technical ? `
    <div class="modal-section">
      <h3>Learning goals — technical</h3>
      <div class="modal-text-block">${formatText(c.learningGoals.technical)}</div>
    </div>` : ''}
    ${c.learningGoals?.soft ? `
    <div class="modal-section">
      <h3>Learning goals — soft skills</h3>
      <div class="modal-text-block">${formatText(c.learningGoals.soft)}</div>
    </div>` : ''}

    ${c.prerequisites ? `
    <div class="modal-section">
      <h3>Prerequisites</h3>
      <div class="modal-text-block">${formatText(c.prerequisites)}</div>
    </div>` : ''}

    ${c.examType ? `
    <div class="modal-section">
      <h3>Examination</h3>
      <p>${c.examType}</p>
    </div>` : ''}

    ${c.literature && c.literature.length > 0 ? `
    <div class="modal-section">
      <h3>Literature</h3>
      <ul class="modal-lit-list">
        ${c.literature.map(l => `<li>${l}</li>`).join('')}
      </ul>
    </div>` : ''}

    <button type="button" class="modal-add-btn ${isSelected ? 'remove' : ''}" onclick="toggleCourseFromModal('${c.id}')">
      ${isSelected ? 'Remove from planner' : 'Add to planner'}
    </button>
  `;

  const modal = document.getElementById('course-modal');
  modal.classList.remove('closing');
  modal.style.display = 'flex';
  const card = modal.querySelector('.modal-content');
  card.setAttribute('tabindex', '-1');
  card.focus();
  document.body.style.overflow = 'hidden';
}

function formatText(text) {
  if (!text) return '';
  let html = text
    .replace(/•\s*/g, '<li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  if (html.includes('<li>')) html = '<ul>' + html + '</ul>';
  return `<p>${html}</p>`;
}

function closeModal() {
  const modal = document.getElementById('course-modal');
  if (modal.style.display === 'none') return;
  modal.classList.add('closing');
  const finish = () => {
    modal.classList.remove('closing');
    modal.style.display = 'none';
    document.body.style.overflow = '';
    if (modalInvoker) { modalInvoker.focus(); modalInvoker = null; }
  };
  const card = modal.querySelector('.modal-content');
  card.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, 220); /* safety net for reduced-motion: no animationend fires */
}

// ============ WEEK GRID ENGINE (shared by scheduler & planner) ============
/* Interval clustering: events are grouped into connected components by
   overlap chains, columns are greedy-packed, and out-of-capacity clusters
   collapse their excess into a "+N more" tile. */

function clusterEvents(evts) {
  const sorted = [...evts].sort((a, b) => a.start - b.start || a.end - b.end);
  const clusters = [];
  let cur = [], curEnd = -Infinity;
  sorted.forEach(ev => {
    if (cur.length === 0 || ev.start < curEnd) {
      cur.push(ev);
      curEnd = Math.max(curEnd, ev.end);
    } else {
      clusters.push(cur);
      cur = [ev]; curEnd = ev.end;
    }
  });
  if (cur.length) clusters.push(cur);
  return clusters;
}

/* Returns layout entries [{ev, leftPct, widthPct}] for `cols` visible columns;
   events that fit no column land in `overflow`. */
function layoutCluster(cluster, cols = 2) {
  if (cluster.length === 1) {
    return { entries: [{ ev: cluster[0], leftPct: 0.5, widthPct: 99 }], overflow: [] };
  }
  const colW = 100 / cols;
  const colEnds = new Array(cols).fill(-Infinity);
  const entries = [];
  const overflow = [];
  [...cluster].sort((a, b) => a.start - b.start || b.end - a.end).forEach(ev => {
    let placed = -1;
    for (let i = 0; i < cols; i++) {
      if (colEnds[i] <= ev.start) { placed = i; break; }
    }
    if (placed === -1) { overflow.push(ev); return; }
    colEnds[placed] = ev.end;
    entries.push({ ev, leftPct: placed * colW + 0.5, widthPct: colW - 1 });
  });
  return { entries, overflow };
}

function hourLinesHTML(rowH) {
  let html = '';
  for (let h = MIN_MIN; h < MAX_MIN; h += 60) {
    html += `<div class="sched-hour-line" style="top:${((h - MIN_MIN) / 60) * rowH}px"></div>`;
  }
  return html;
}

function timeColHTML(rowH) {
  let html = '<div class="sched-time-col"><div class="sched-day-header sched-time-header">&nbsp;</div>';
  for (let h = MIN_MIN; h < MAX_MIN; h += 60) {
    html += `<div class="sched-time-label" style="height:${rowH}px">${fmtMin(h)}</div>`;
  }
  return html + '</div>';
}

// ============ FULL SCHEDULER ============

let SCHED_HOVER_LOOKUP = {};   /* hover-key -> {course, slot} */
let CLUSTER_LOOKUP = {};       /* pop-key   -> [{course, slot}] */

function renderScheduler() {
  const gridEl = document.getElementById('scheduler-grid');
  const statsEl = document.getElementById('scheduler-stats');
  const legendEl = document.getElementById('scheduler-legend');
  const arrangementEl = document.getElementById('scheduler-arrangement');
  const unschedEl = document.getElementById('scheduler-unscheduled');

  let offered = DB.courses.filter(c => c.offeredCurrent);
  if (!schedTracks.has('all')) offered = offered.filter(c => schedTracks.has(c.track));
  if (!schedTypes.has('all')) offered = offered.filter(c => schedTypes.has(c.type));
  if (schedCourseQuery) {
    offered = offered.filter(c =>
      c.name.toLowerCase().includes(schedCourseQuery) ||
      c.code.toLowerCase().includes(schedCourseQuery));
  }

  /* Legend adapts to the active track filter — no red "overlap" noise */
  const legendTracks = schedTracks.has('all') ? Object.keys(TRACK_COLORS) : [...schedTracks];
  legendEl.innerHTML = `
    <div class="sched-legend-row">
      ${legendTracks.map(t => `
        <span class="sched-legend-item">
          <span class="sched-legend-dot" style="background:${trackColor(t)}"></span>${TRACK_NAMES[t] || t}
        </span>`).join('')}
    </div>`;

  const allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const days = schedDay === 'all' ? allDays : [schedDay];
  const rowH = 60;
  const dayEvents = {};
  days.forEach(d => { dayEvents[d] = []; });

  const byArrangement = [];
  const noSchedule = [];

  offered.forEach(c => {
    const tc = trackColor(c.track);
    if (!c.schedule || c.schedule.length === 0) { noSchedule.push(c); return; }
    c.schedule.forEach(s => {
      if (s.day === 'By arrangement' || !days.includes(s.day)) {
        byArrangement.push({ course: c, slot: s, color: tc });
        return;
      }
      const t = parseTime(s.time);
      if (!t) return;
      dayEvents[s.day].push({ course: c, slot: s, color: tc, start: t.start, end: t.end });
    });
  });

  let totalScheduled = 0, totalClusters = 0;
  days.forEach(d => {
    totalScheduled += dayEvents[d].length;
    totalClusters += clusterEvents(dayEvents[d]).filter(cl => cl.length > 1).length;
  });

  statsEl.innerHTML = `
    <div class="sched-stat"><span class="sched-stat-num">${offered.length}</span><span class="sched-stat-label">Courses this semester</span></div>
    <div class="sched-stat"><span class="sched-stat-num">${totalScheduled}</span><span class="sched-stat-label">Scheduled sessions</span></div>
    <div class="sched-stat"><span class="sched-stat-num">${totalClusters}</span><span class="sched-stat-label">Collision clusters</span></div>
    <div class="sched-stat"><span class="sched-stat-num">${byArrangement.length + noSchedule.length}</span><span class="sched-stat-label">By arrangement / TBD</span></div>`;

  const gridH = (DAY_RANGE / 60) * rowH;
  let html = '<div class="sched-row">';
  html += timeColHTML(rowH);
  SCHED_HOVER_LOOKUP = {};
  CLUSTER_LOOKUP = {};

  days.forEach(d => {
    html += `<div class="sched-day-col">`;
    html += `<div class="sched-day-header">${d}</div>`;
    html += `<div class="sched-day-body" style="height:${gridH}px">`;
    html += hourLinesHTML(rowH);

    const clusters = clusterEvents(dayEvents[d]);
    clusters.forEach((cluster, ci) => {
      const { entries, overflow } = layoutCluster(cluster, 2);
      entries.forEach(en => {
        const ev = en.ev;
        const top = ((ev.start - MIN_MIN) / 60) * rowH + 1;
        const height = ((ev.end - ev.start) / 60) * rowH - 2;
        const profShort = (ev.course.professor || '').split(',')[0]
          .replace(/Prof\. Dr\./g, '').replace(/Dr\./g, '').replace(/JProf\./g, '').trim();
        const profDisplay = profShort.length > 22 ? profShort.substring(0, 20) + '…' : profShort;
        const isSelected = selectedCourses.has(ev.course.id);
        const hkey = `${d}-${ci}-${ev.course.id}`;
        SCHED_HOVER_LOOKUP[hkey] = { course: ev.course, slot: ev.slot };

        html += `<div class="sched-event ${isSelected ? 'sched-ev-selected' : ''}"
          role="button" tabindex="0"
          style="top:${top}px; height:${Math.max(height, 18)}px; left:${en.leftPct}%; width:${en.widthPct}%; --sev-color:${ev.color}"
          data-hkey="${hkey}"
          onclick="openModal('${ev.course.id}')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openModal('${ev.course.id}')}">
          <div class="sev-track-bar"></div>
          <div class="sev-content">
            <div class="sev-code">${ev.course.code}</div>
            <div class="sev-name">${ev.course.name}</div>
            ${height > 44 ? `<div class="sev-prof">${profDisplay}</div>` : ''}
            <div class="sev-meta"><span class="sev-type">${ev.slot.type}</span><span class="sev-time">${ev.slot.time}</span></div>
            ${ev.slot.room && height > 72 ? `<div class="sev-room">${ev.slot.room.split(',')[0]}</div>` : ''}
          </div>
        </div>`;
      });

      if (overflow.length > 0) {
        const pkey = `${d}-${ci}`;
        CLUSTER_LOOKUP[pkey] = overflow;
        const clEnd = Math.max(...cluster.map(o => o.end));
        const tTop = ((clEnd - MIN_MIN) / 60) * rowH - 24;
        html += `<button type="button" class="sched-more-tile"
          style="top:${tTop}px; height:22px; left:50.5%; width:49%"
          data-pkey="${pkey}"
          onclick="event.stopPropagation(); openClusterPop('${pkey}', this)">+${overflow.length} more</button>`;
      }
    });

    html += '</div></div>';
  });
  html += '</div>';
  gridEl.innerHTML = html;

  /* By arrangement — deduped */
  const uniqueBA = [];
  const seenBA = new Set();
  byArrangement.forEach(ev => {
    if (!seenBA.has(ev.course.id)) { uniqueBA.push(ev); seenBA.add(ev.course.id); }
  });

  arrangementEl.innerHTML = uniqueBA.length === 0 ? '' : `
    <h3 class="sched-section-title">By arrangement — ${uniqueBA.length} courses</h3>
    <div class="sched-ba-grid">
      ${uniqueBA.map(ev => {
        const profShort = (ev.course.professor || 'TBD').split(',')[0].replace(/Prof\. Dr\./g, '').replace(/Dr\./g, '').trim();
        return `<button type="button" class="sched-ba-card" style="--sba-color:${ev.color}" onclick="openModal('${ev.course.id}')">
          <div class="sba-code">${ev.course.code}</div>
          <div class="sba-name">${ev.course.name}</div>
          <div class="sba-prof">${profShort}</div>
          <span class="sba-badge">${ev.course.type}</span>
        </button>`;
      }).join('')}
    </div>`;

  unschedEl.innerHTML = noSchedule.length === 0 ? '' : `
    <h3 class="sched-section-title">Schedule to be determined — ${noSchedule.length} courses</h3>
    <div class="sched-ba-grid">
      ${noSchedule.map(c => {
        const tc = trackColor(c.track);
        const profShort = (c.professor || 'TBD').split(',')[0].replace(/Prof\. Dr\./g, '').replace(/Dr\./g, '').trim();
        return `<button type="button" class="sched-ba-card sched-ba-tbd" style="--sba-color:${tc}" onclick="openModal('${c.id}')">
          <div class="sba-code">${c.code}</div>
          <div class="sba-name">${c.name}</div>
          <div class="sba-prof">${profShort}</div>
          <span class="sba-badge">${c.type}</span>
        </button>`;
      }).join('')}
    </div>`;
}

/* ---- "+N more" cluster popover ---- */

function getClusterPop() {
  let el = document.getElementById('cluster-pop');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cluster-pop';
    el.setAttribute('role', 'menu');
    document.body.appendChild(el);
    document.addEventListener('click', (e) => {
      if (!el.hidden && !el.contains(e.target) && !e.target.closest('.sched-more-tile')) hideClusterPop();
    });
  }
  return el;
}

function openClusterPop(pkey, anchor) {
  const items = CLUSTER_LOOKUP[pkey] || [];
  const el = getClusterPop();
  el.innerHTML = `
    <div class="cluster-pop-title">${items.length} concurrent sessions</div>
    ${items.map(o => `
      <button type="button" class="cluster-pop-item" onclick="hideClusterPop(); openModal('${o.course.id}')">
        <span class="cpi-time">${o.slot.time}</span>
        <span class="cpi-name">${o.course.name}</span>
        <span class="cpi-type">${o.slot.type}</span>
      </button>`).join('')}
  `;
  el.hidden = false;
  const r = anchor.getBoundingClientRect();
  const popW = 260;
  const left = Math.min(r.left, window.innerWidth - popW - 16);
  el.style.left = Math.max(8, left) + 'px';
  el.style.top = (r.bottom + window.scrollY + 6) + 'px';
}

function hideClusterPop() {
  const el = document.getElementById('cluster-pop');
  if (el) el.hidden = true;
}

/* ---- Rich hover card (replaces native title tooltips) ---- */

let hoverTimer = null;
let hoverSuppressUntil = 0;

function getHovercard() {
  let el = document.getElementById('hovercard');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hovercard';
    el.setAttribute('role', 'tooltip');
    document.body.appendChild(el);
  }
  return el;
}

function showHovercard(hkey, x, y) {
  const data = SCHED_HOVER_LOOKUP[hkey];
  if (!data) return;
  const { course, slot } = data;
  const el = getHovercard();
  el.innerHTML = `
    <div class="hc-code">${course.code}</div>
    <div class="hc-name">${course.name}</div>
    <div class="hc-meta">
      <span>${slot.type}</span> · <span>${slot.time}</span>
      ${slot.room ? ` · <span>${slot.room.split(',')[0]}</span>` : ''}
    </div>
    <div class="hc-prof">${course.professor || 'See BASIS'}</div>
    <button type="button" class="hc-open" onclick="hideHovercard(); openModal('${course.id}')">Open details →</button>
  `;
  el.hidden = false;
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = Math.min(x + 14, window.innerWidth - w - 12);
  let top = Math.min(y + 14, window.innerHeight + window.scrollY - h - 12);
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

function hideHovercard() {
  const el = document.getElementById('hovercard');
  if (el) el.hidden = true;
  clearTimeout(hoverTimer);
}

function bindHovercards() {
  document.addEventListener('mouseover', (e) => {
    const ev = e.target.closest('.sched-event');
    if (!ev || !ev.dataset.hkey) return;
    if (Date.now() < hoverSuppressUntil) return;
    clearTimeout(hoverTimer);
    const hkey = ev.dataset.hkey;
    const x = e.clientX, y = e.clientY;
    hoverTimer = setTimeout(() => showHovercard(hkey, x, y), 350);

    /* Narrow events expand on hover so the text becomes readable */
    requestAnimationFrame(() => {
      if (ev.offsetWidth < 92) {
        ev.dataset.origW = ev.style.width;
        ev.dataset.origL = ev.style.left;
        ev.classList.add('hc-expanded');
        const parent = ev.parentElement;
        const leftPx = ev.offsetLeft;
        ev.style.width = '148px';
        const minSpace = Math.min(150, parent.clientWidth * 0.5);
        if (leftPx + 150 > parent.clientWidth) {
          ev.style.left = Math.max(0, parent.clientWidth - minSpace - 2) + 'px';
        }
      }
    });
  });
  document.addEventListener('mouseout', (e) => {
    const ev = e.target.closest('.sched-event');
    if (!ev) return;
    if (e.relatedTarget && ev.contains(e.relatedTarget)) return;
    if (ev.classList.contains('hc-expanded')) {
      ev.classList.remove('hc-expanded');
      ev.style.width = ev.dataset.origW || '';
      ev.style.left = ev.dataset.origL || '';
      delete ev.dataset.origW; delete ev.dataset.origL;
    }
    hideHovercard();
  });
  document.addEventListener('click', () => { hoverSuppressUntil = Date.now() + 500; }, true);
}

// ============ PLANNER ============

function renderPlanner() {
  const selectedList = document.getElementById('planner-selected');
  const plannerGrid = document.getElementById('planner-grid');
  const plannerEcts = document.getElementById('planner-ects');

  const selected = DB.courses.filter(c => selectedCourses.has(c.id));
  const totalEcts = selected.reduce((sum, c) => sum + c.ects, 0);
  plannerEcts.textContent = totalEcts;

  /* Selected chips — body opens the modal, ✕ removes. Same affordance everywhere. */
  selectedList.innerHTML = selected.length === 0
    ? '<p class="planner-empty">Nothing selected yet — browse the courses tab and add what interests you.</p>'
    : selected.map(c => `
      <div class="planner-chip" style="--chip-color: ${trackColor(c.track)}">
        <button type="button" class="chip-open" onclick="openModal('${c.id}')">${c.code} — ${c.name}</button>
        <button type="button" class="chip-remove" onclick="toggleCourse('${c.id}')" aria-label="Remove ${escAttr(c.name)}">✕</button>
      </div>`).join('');

  const byArrangement = selected.filter(c =>
    !c.schedule || c.schedule.length === 0 || c.schedule.every(s => s.day === 'By arrangement'));

  /* Minute-accurate event map */
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const dayEvents = {};
  days.forEach(d => { dayEvents[d] = []; });
  selected.forEach(c => {
    if (!c.schedule) return;
    c.schedule.forEach(s => {
      if (!days.includes(s.day)) return;
      const t = parseTime(s.time);
      if (!t) return;
      dayEvents[s.day].push({ course: c, slot: s, color: trackColor(c.track), start: t.start, end: t.end });
    });
  });

  /* True interval conflicts (pairwise, minute-accurate) */
  const conflictPairs = [];
  days.forEach(d => {
    const evts = dayEvents[d];
    for (let i = 0; i < evts.length; i++) {
      for (let j = i + 1; j < evts.length; j++) {
        const a = evts[i], b = evts[j];
        const oStart = Math.max(a.start, b.start), oEnd = Math.min(a.end, b.end);
        if (oStart < oEnd) {
          const shorter = Math.min(a.end - a.start, b.end - b.start);
          conflictPairs.push({
            day: d, a, b,
            oStart, oEnd, mins: oEnd - oStart,
            full: (oEnd - oStart) >= shorter
          });
        }
      }
    }
  });
  conflictPairs.sort((x, y) => days.indexOf(x.day) - days.indexOf(y.day) || x.oStart - y.oStart);

  const conflictCount = conflictPairs.length;
  document.getElementById('stat-conflicts').textContent = conflictCount;
  const pill = document.querySelector('.stat-pill.accent');
  if (pill) {
    pill.classList.toggle('has-conflicts', conflictCount > 0);
    if (conflictCount > prevConflictCount) {
      pill.classList.remove('pulse');
      void pill.offsetWidth;
      pill.classList.add('pulse');
    }
  }
  prevConflictCount = conflictCount;

  const conflictsEl = document.getElementById('planner-conflicts');
  if (conflictsEl) {
    conflictsEl.innerHTML = conflictPairs.length === 0 ? '' : `
      <div class="planner-conflict-title">Scheduling conflicts — ${conflictPairs.length} collision${conflictPairs.length !== 1 ? 's' : ''}</div>
      ${conflictPairs.map(p => `
        <div class="planner-conflict-row">
          <span class="pcr-slot">${p.day} · ${fmtMin(p.oStart)}–${fmtMin(p.oEnd)}</span>
          <span class="pcr-names">${p.a.course.name} × ${p.b.course.name}</span>
          <span class="pcr-mins ${p.full ? 'pcr-full' : ''}">${p.mins} min overlap${p.full ? '' : ' (partial)'}</span>
        </div>`).join('')}
    `;
  }

  /* Finds every conflict an event participates in → visual state */
  function conflictClass(ev) {
    let full = false, partial = false;
    conflictPairs.forEach(p => {
      if (p.a === ev || p.b === ev) { p.full ? full = true : partial = true; }
    });
    return full ? 'is-conflict' : (partial ? 'is-partial' : '');
  }

  /* Week grid — same engine as the scheduler, condensed row height */
  const rowH = 64;
  const gridH = (DAY_RANGE / 60) * rowH;
  let html = '<div class="sched-row">';
  html += timeColHTML(rowH);
  days.forEach(d => {
    html += `<div class="sched-day-col"><div class="sched-day-header">${d}</div>`;
    html += `<div class="sched-day-body" style="height:${gridH}px">`;
    html += hourLinesHTML(rowH);
    const clusters = clusterEvents(dayEvents[d]);
    clusters.forEach(cluster => {
      /* Planner: never hide a selected course — every event gets a column */
      const { entries } = layoutCluster(cluster, Math.min(Math.max(cluster.length, 1), 4));
      entries.forEach(en => {
        const ev = en.ev;
        const top = ((ev.start - MIN_MIN) / 60) * rowH + 1;
        const height = Math.max(((ev.end - ev.start) / 60) * rowH - 2, 18);
        const cc = conflictClass(ev);
        const hkey = `pl-${d}-${ev.course.id}`;
        SCHED_HOVER_LOOKUP[hkey] = { course: ev.course, slot: ev.slot };
        html += `<div class="sched-event pl-event ${cc}"
          role="button" tabindex="0"
          style="top:${top}px; height:${height}px; left:${en.leftPct}%; width:${en.widthPct}%; --sev-color:${ev.color}"
          data-hkey="${hkey}"
          onclick="openModal('${ev.course.id}')"
          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openModal('${ev.course.id}')}">
          <div class="sev-track-bar"></div>
          <div class="sev-content">
            <div class="sev-code">${ev.course.code}</div>
            <div class="sev-name">${ev.course.name}</div>
            <div class="sev-meta"><span class="sev-type">${ev.slot.type}</span><span class="sev-time">${ev.slot.time}</span></div>
            ${ev.slot.room && height > 72 ? `<div class="sev-room">${ev.slot.room.split(',')[0]}</div>` : ''}
          </div>
        </div>`;
      });
    });
    html += '</div></div>';
  });
  html += '</div>';
  plannerGrid.innerHTML = html;

  /* By arrangement — rendered before the grid (decision-relevant) */
  const baContainer = document.getElementById('by-arrangement');
  if (baContainer) {
    baContainer.innerHTML = byArrangement.length === 0 ? '' : `
      <h3 class="sched-section-title">By arrangement — not on the grid</h3>
      <div class="sched-ba-grid">
        ${byArrangement.map(c => `
          <button type="button" class="sched-ba-card" style="--sba-color:${trackColor(c.track)}" onclick="openModal('${c.id}')">
            <div class="sba-code">${c.code}</div>
            <div class="sba-name">${c.name}</div>
            <div class="sba-prof">${c.ects} ECTS</div>
            <span class="sba-badge">${c.type}</span>
          </button>`).join('')}
      </div>`;
  }
}

// ============ PROFESSORS ============

function renderProfessors() {
  const search = (document.getElementById('prof-search')?.value || '').toLowerCase();
  const grid = document.getElementById('professors-grid');
  if (!DB.professors) { grid.innerHTML = ''; return; }

  const profs = Object.entries(DB.professors)
    .map(([key, p]) => ({ ...p, key }))
    .filter(p => {
      if (search) {
        const haystack = `${p.name} ${p.group} ${p.track} ${p.research.join(' ')}`.toLowerCase();
        return haystack.includes(search);
      }
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  if (profs.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">No professor found</div>
        <div class="empty-state-sub">“${search}” doesn't match any name, group, or research area.</div>
      </div>`;
    return;
  }

  grid.innerHTML = profs.map(p => {
    const tc = trackColor(p.track);
    const courseDetails = (p.courses || [])
      .map(cid => DB.courses.find(c => c.id === cid))
      .filter(Boolean);

    return `
      <div class="prof-card">
        <div class="prof-name">${p.name}</div>
        <div class="prof-group" style="color:${tc}">${p.group}</div>
        <span class="prof-track-badge" style="background: ${tc}1c; color: ${tc}">${DB.tracks[p.track]?.name || p.track}</span>

        <div class="prof-research">
          <h4>Research areas</h4>
          <div class="prof-research-tags">
            ${p.research.map(r => `<span class="prof-tag">${r}</span>`).join('')}
          </div>
        </div>

        <div class="prof-courses">
          <h4>Courses (${courseDetails.length})</h4>
          <div class="prof-course-list">
            ${courseDetails.map(c => `
              <button type="button" class="prof-course-item" onclick="openModal('${c.id}')">
                ${c.code} — ${c.name} <span class="pci-meta">(${c.type}, ${c.ects} ECTS)</span>
              </button>`).join('')}
            ${courseDetails.length === 0 ? '<div class="prof-no-courses">No courses listed</div>' : ''}
          </div>
        </div>

        ${p.email ? `<div class="prof-email"><a href="mailto:${p.email}">${p.email}</a></div>` : ''}
        ${p.website ? `<a href="${p.website}" target="_blank" rel="noopener" class="prof-link">Visit website →</a>` : ''}
      </div>
    `;
  }).join('');
}

// ============ LABS ============

function renderLabs() {
  const grid = document.getElementById('labs-grid');
  if (!DB.professors) { grid.innerHTML = ''; return; }

  const labMap = {};
  Object.entries(DB.professors).forEach(([key, p]) => {
    if (!p.group) return;
    if (!labMap[p.group]) {
      labMap[p.group] = { name: p.group, professors: [], courses: [], research: [], website: null, track: p.track };
    }
    labMap[p.group].professors.push(p);
    if (p.website) labMap[p.group].website = p.website;
    p.research.forEach(r => { if (!labMap[p.group].research.includes(r)) labMap[p.group].research.push(r); });
    (p.courses || []).forEach(cid => {
      const c = DB.courses.find(x => x.id === cid);
      if (c && !labMap[p.group].courses.find(x => x.id === cid)) labMap[p.group].courses.push(c);
    });
  });

  const labs = Object.values(labMap).sort((a, b) => a.name.localeCompare(b.name));

  grid.innerHTML = labs.map(lab => {
    const tc = trackColor(lab.track);
    return `
      <div class="lab-card">
        <div class="lab-name">${lab.name}</div>
        <div class="lab-prof">${lab.professors.map(p => `<strong>${p.name}</strong>`).join(', ')}</div>
        <span class="prof-track-badge" style="background: ${tc}1c; color: ${tc}; margin-bottom: 0.75rem">${DB.tracks[lab.track]?.name || lab.track}</span>

        <div class="lab-tags">
          ${lab.research.map(r => `<span class="lab-tag">${r}</span>`).join('')}
        </div>

        <div class="lab-courses-section">
          <h4>Courses (${lab.courses.length})</h4>
          <div class="lab-course-chips">
            ${lab.courses.map(c => `<button type="button" class="lab-course-chip" onclick="openModal('${c.id}')">${c.code} — ${c.name} (${c.type})</button>`).join('')}
          </div>
        </div>

        ${lab.website ? `<a href="${lab.website}" target="_blank" rel="noopener" class="lab-link">Visit lab website →</a>` : ''}
      </div>
    `;
  }).join('');
}

// ============ STATS ============

function updateStats() {
  document.getElementById('stat-total').textContent = DB.courses.length;
  const selected = DB.courses.filter(c => selectedCourses.has(c.id));
  document.getElementById('stat-selected').textContent = selected.reduce((sum, c) => sum + c.ects, 0);
}

// ============ ⌘K QUICK PALETTE ============

let cmdkIndex = 0;
let cmdkResults = [];

const CMDK_VIEWS = [
  { label: 'Courses', hint: 'Browse all 141 modules', tab: 'explorer' },
  { label: 'Schedule', hint: 'Full semester timetable', tab: 'scheduler' },
  { label: 'Planner', hint: 'Your weekly plan & conflicts', tab: 'planner' },
  { label: 'Professors', hint: 'Faculty directory', tab: 'professors' },
  { label: 'Labs', hint: 'Research groups', tab: 'labs' }
];

function openCmdk() {
  const el = document.getElementById('cmdk');
  el.hidden = false;
  const input = document.getElementById('cmdk-input');
  input.value = '';
  renderCmdkResults('');
  input.focus();
  document.body.style.overflow = 'hidden';
}

function closeCmdk() {
  document.getElementById('cmdk').hidden = true;
  document.body.style.overflow = '';
}

function renderCmdkResults(query) {
  const list = document.getElementById('cmdk-results');
  const q = query.toLowerCase().trim();
  cmdkResults = [];

  if (!q) {
    cmdkResults = CMDK_VIEWS.map(v => ({ kind: 'tab', ...v }));
  } else {
    CMDK_VIEWS.forEach(v => {
      if (v.label.toLowerCase().includes(q)) cmdkResults.push({ kind: 'tab', ...v });
    });
    DB.courses.forEach(c => {
      const code = c.code.toLowerCase(), name = c.name.toLowerCase();
      if (code.includes(q) || name.includes(q)) {
        const score = code.startsWith(q) ? 0 : (code.includes(q) ? 1 : (name.startsWith(q) ? 2 : 3));
        cmdkResults.push({ kind: 'course', course: c, score });
      }
    });
    cmdkResults.sort((a, b) => (a.score ?? -1) - (b.score ?? -1) || ((a.course?.name || '').localeCompare(b.course?.name || '')));
    cmdkResults = cmdkResults.slice(0, 9);
  }

  cmdkIndex = 0;
  list.innerHTML = cmdkResults.length === 0
    ? '<div class="cmdk-empty">No results</div>'
    : cmdkResults.map((r, i) => {
        if (r.kind === 'tab') {
          return `<button type="button" class="cmdk-item ${i === 0 ? 'active' : ''}" data-i="${i}">
            <span class="cmdk-item-label">Go to <strong>${r.label}</strong></span>
            <span class="cmdk-item-hint">${r.hint}</span>
          </button>`;
        }
        const tc = trackColor(r.course.track);
        return `<button type="button" class="cmdk-item ${i === 0 ? 'active' : ''}" data-i="${i}">
          <span class="cmdk-item-label"><span class="cmdk-code" style="color:${tc}">${r.course.code}</span> ${r.course.name}</span>
          <span class="cmdk-item-hint">${r.course.type} · ${r.course.ects} ECTS</span>
        </button>`;
      }).join('');
}

function bindCmdk() {
  const el = document.getElementById('cmdk');
  const input = document.getElementById('cmdk-input');
  const list = document.getElementById('cmdk-results');

  el.addEventListener('click', (e) => { if (e.target === el) closeCmdk(); });
  input.addEventListener('input', () => renderCmdkResults(input.value));

  input.addEventListener('keydown', (e) => {
    const items = list.querySelectorAll('.cmdk-item');
    if (e.key === 'Escape') { closeCmdk(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      cmdkIndex = (cmdkIndex + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((it, i) => it.classList.toggle('active', i === cmdkIndex));
      items[cmdkIndex].scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      activateCmdkResult(cmdkResults[cmdkIndex]);
    }
  });

  list.addEventListener('click', (e) => {
    const item = e.target.closest('.cmdk-item');
    if (!item) return;
    activateCmdkResult(cmdkResults[+item.dataset.i]);
  });
}

function activateCmdkResult(r) {
  if (!r) return;
  closeCmdk();
  if (r.kind === 'tab') activateTab(r.tab);
  else openModal(r.course.id);
}

// ============ BOOT ============

document.addEventListener('DOMContentLoaded', init);
