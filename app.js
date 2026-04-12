/* ============================================= */
/*  MSc Informatik — Academic Intelligence App   */
/*  Complete Rebuild v2                           */
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

const TRACK_COLORS = {
  AL: '#f59e0b', GVA: '#06b6d4', ICM: '#10b981', IS: '#6366f1'
};

// ============ INIT ============

async function init() {
  try {
    const res = await fetch('data/summer2026_complete.json');
    DB = await res.json();
  } catch (e) {
    console.error('Failed to load database:', e);
    return;
  }

  // Load saved selections
  const saved = localStorage.getItem('selectedCourses');
  if (saved) {
    try { selectedCourses = new Set(JSON.parse(saved)); } catch(e) {}
  }

  renderCourses();
  renderPlanner();
  renderScheduler();
  renderProfessors();
  renderLabs();
  updateStats();
  bindEvents();
}

// ============ EVENTS ============

function bindEvents() {
  // Nav tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  // Search
  document.getElementById('filter-search').addEventListener('input', renderCourses);

  // Track filters
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentTrack = pill.dataset.track;
      renderCourses();
    });
  });

  // Type filters
  document.querySelectorAll('.type-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.type-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentType = pill.dataset.type;
      renderCourses();
    });
  });

  // Offered toggle
  document.getElementById('toggle-offered')?.addEventListener('change', (e) => {
    showOnlyOffered = e.target.checked;
    renderCourses();
  });

  // Clear planner
  document.getElementById('btn-clear-planner').addEventListener('click', () => {
    selectedCourses.clear();
    saveSelections();
    renderCourses();
    renderPlanner();
    updateStats();
  });

  // Modal close
  document.getElementById('course-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('course-modal')) closeModal();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // Professor search
  document.getElementById('prof-search').addEventListener('input', renderProfessors);

  // Scheduler track filters
  document.querySelectorAll('.sched-track-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const val = pill.dataset.strack;
      if (val === 'all') {
        schedTracks.clear();
        schedTracks.add('all');
      } else {
        schedTracks.delete('all');
        if (schedTracks.has(val)) schedTracks.delete(val);
        else schedTracks.add(val);
      }
      if (schedTracks.size === 0) schedTracks.add('all');

      document.querySelectorAll('.sched-track-pill').forEach(p => {
        p.classList.toggle('active', schedTracks.has(p.dataset.strack));
      });
      renderScheduler();
    });
  });

  // Scheduler type filters
  document.querySelectorAll('.sched-type-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const val = pill.dataset.stype;
      if (val === 'all') {
        schedTypes.clear();
        schedTypes.add('all');
      } else {
        schedTypes.delete('all');
        if (schedTypes.has(val)) schedTypes.delete(val);
        else schedTypes.add(val);
      }
      if (schedTypes.size === 0) schedTypes.add('all');

      document.querySelectorAll('.sched-type-pill').forEach(p => {
        p.classList.toggle('active', schedTypes.has(p.dataset.stype));
      });
      renderScheduler();
    });
  });

  // Scheduler day filter
  document.getElementById('sched-day-select')?.addEventListener('change', (e) => {
    schedDay = e.target.value;
    renderScheduler();
  });

  // Scheduler course filter
  document.getElementById('sched-course-search')?.addEventListener('input', (e) => {
    schedCourseQuery = e.target.value.toLowerCase().trim();
    renderScheduler();
  });
}

// ============ COURSE EXPLORER ============

function renderCourses() {
  const search = document.getElementById('filter-search').value.toLowerCase();
  const grid = document.getElementById('course-grid');
  const count = document.getElementById('course-count');

  let filtered = DB.courses.filter(c => {
    if (currentTrack !== 'all' && c.track !== currentTrack) return false;
    if (currentType !== 'all' && c.type !== currentType) return false;
    if (showOnlyOffered && !c.offeredSummer2026) return false;
    if (search) {
      const haystack = `${c.name} ${c.code} ${c.professor} ${c.track} ${c.type} ${c.contents || ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  count.textContent = filtered.length + ' course' + (filtered.length !== 1 ? 's' : '');

  grid.innerHTML = filtered.map(c => {
    const isSelected = selectedCourses.has(c.id);
    const schedStr = c.schedule && c.schedule.length > 0
      ? c.schedule.map(s => `${s.day} ${s.time}`).join(' · ')
      : 'Schedule TBD';
    const trackColor = TRACK_COLORS[c.track] || '#6366f1';
    const hasContent = c.contents && c.contents.length > 10;

    return `
      <div class="course-card ${isSelected ? 'selected' : ''}" style="--card-track-color: ${trackColor}" onclick="openModal('${c.id}')">
        <div class="card-top">
          <span class="card-code">${c.code}</span>
          <div style="display:flex;gap:0.3rem;align-items:center">
            ${c.offeredSummer2026 ? '<span class="offered-dot" title="Offered Summer 2026">●</span>' : ''}
            <span class="card-ects">${c.ects} ECTS</span>
          </div>
        </div>
        <div class="card-name">${c.name}</div>
        <div class="card-prof">👨‍🏫 <strong>${c.professor || 'See BASIS'}</strong></div>
        ${c.offeredSummer2026 ? `<div class="card-schedule-preview">📅 ${schedStr}</div>` : ''}
        ${hasContent ? `<div class="card-content-preview">${truncate(c.contents, 100)}</div>` : ''}
        <div class="card-bottom">
          <span class="card-badge track" style="--badge-r: ${hexToRgb(trackColor).r}; --badge-g: ${hexToRgb(trackColor).g}; --badge-b: ${hexToRgb(trackColor).b}">${DB.tracks[c.track]?.name || c.track}</span>
          <span class="card-badge type">${c.type}</span>
          <button class="card-add-btn" onclick="event.stopPropagation(); toggleCourse('${c.id}')">
            ${isSelected ? '✕ Remove' : '+ Add'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function truncate(str, len) {
  if (!str) return '';
  const clean = str.replace(/\n/g, ' ').replace(/\s+/g, ' ');
  return clean.length > len ? clean.substring(0, len) + '…' : clean;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16)
  } : { r: 99, g: 102, b: 241 };
}

// ============ TOGGLE COURSE ============

function toggleCourse(id) {
  if (selectedCourses.has(id)) selectedCourses.delete(id);
  else selectedCourses.add(id);
  saveSelections();
  renderCourses();
  renderPlanner();
  renderScheduler();
  updateStats();
}

function saveSelections() {
  localStorage.setItem('selectedCourses', JSON.stringify([...selectedCourses]));
}

// ============ MODAL ============

function openModal(id) {
  const c = DB.courses.find(x => x.id === id);
  if (!c) return;
  const isSelected = selectedCourses.has(c.id);
  const trackColor = TRACK_COLORS[c.track] || '#6366f1';

  // Find professor info
  const profKey = Object.keys(DB.professors || {}).find(k => {
    const p = DB.professors[k];
    const lastName = p.name.split(' ').pop();
    return c.professor && c.professor.includes(lastName);
  });
  const prof = profKey ? DB.professors[profKey] : null;

  const body = document.getElementById('modal-body');
  body.innerHTML = `
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-code">${c.code}</div>
    <div class="modal-title">${c.name}</div>
    <div class="modal-meta">
      <span class="card-badge track" style="background: ${trackColor}22; color: ${trackColor}">${DB.tracks[c.track]?.name || c.track}</span>
      <span class="card-badge type">${c.type}</span>
      <span class="card-ects">${c.ects} ECTS</span>
      <span style="font-size:0.72rem;color:var(--text-muted)">${c.workload}h workload</span>
      <span style="font-size:0.72rem;color:var(--text-muted)">${c.language || 'English'}</span>
      <span style="font-size:0.72rem;color:var(--text-muted)">${c.frequency}</span>
      ${c.offeredSummer2026 ? '<span class="offered-badge">✓ Summer 2026</span>' : '<span style="font-size:0.72rem;color:var(--text-muted);opacity:0.5">Not offered this semester</span>'}
    </div>

    <!-- PROFESSOR -->
    <div class="modal-section">
      <h3>👨‍🏫 Professor / Coordinator</h3>
      <p><strong>${c.professor || c.coordinator || 'See BASIS'}</strong></p>
      ${prof ? `<p style="color:var(--accent-secondary);font-size:0.82rem;margin-top:0.2rem">${prof.group}</p>` : ''}
      ${prof && prof.website ? `<p style="margin-top:0.3rem"><a href="${prof.website}" target="_blank" style="color:var(--accent-primary-light);text-decoration:none;font-size:0.82rem">${prof.website} →</a></p>` : ''}
      ${prof ? `<div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-top:0.5rem">${prof.research.map(r => `<span class="prof-tag">${r}</span>`).join('')}</div>` : ''}
    </div>

    <!-- SCHEDULE -->
    ${c.schedule && c.schedule.length > 0 ? `
    <div class="modal-section">
      <h3>📅 Schedule (Summer 2026)</h3>
      <table class="modal-schedule-table">
        <thead><tr><th>Day</th><th>Time</th><th>Type</th><th>Room</th></tr></thead>
        <tbody>
          ${c.schedule.map(s => `<tr><td>${s.day}</td><td>${s.time}</td><td>${s.type}</td><td>${s.room}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- CONTENTS / SYLLABUS -->
    ${c.contents ? `
    <div class="modal-section">
      <h3>📜 Course Contents / Syllabus</h3>
      <div class="modal-text-block">${formatText(c.contents)}</div>
    </div>
    ` : ''}

    <!-- LEARNING GOALS -->
    ${c.learningGoals?.technical ? `
    <div class="modal-section">
      <h3>🎯 Learning Goals — Technical</h3>
      <div class="modal-text-block">${formatText(c.learningGoals.technical)}</div>
    </div>
    ` : ''}
    ${c.learningGoals?.soft ? `
    <div class="modal-section">
      <h3>🤝 Learning Goals — Soft Skills</h3>
      <div class="modal-text-block">${formatText(c.learningGoals.soft)}</div>
    </div>
    ` : ''}

    <!-- PREREQUISITES -->
    ${c.prerequisites ? `
    <div class="modal-section">
      <h3>📋 Prerequisites</h3>
      <div class="modal-text-block">${formatText(c.prerequisites)}</div>
    </div>
    ` : ''}

    <!-- EXAM -->
    ${c.examType ? `
    <div class="modal-section">
      <h3>📝 Examination</h3>
      <p>${c.examType}</p>
    </div>
    ` : ''}

    <!-- LITERATURE -->
    ${c.literature && c.literature.length > 0 ? `
    <div class="modal-section">
      <h3>📚 Literature</h3>
      <ul class="modal-lit-list">
        ${c.literature.map(l => `<li>${l}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    <button class="modal-add-btn ${isSelected ? 'remove' : ''}" onclick="toggleCourse('${c.id}'); closeModal();">
      ${isSelected ? '✕ Remove from My Planner' : '+ Add to My Planner'}
    </button>
  `;

  document.getElementById('course-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function formatText(text) {
  if (!text) return '';
  // Convert bullet points and line breaks to HTML
  let html = text
    .replace(/•\s*/g, '<li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  // If contains <li>, wrap in <ul>
  if (html.includes('<li>')) {
    html = '<ul>' + html + '</ul>';
  }
  return `<p>${html}</p>`;
}

function closeModal() {
  document.getElementById('course-modal').style.display = 'none';
  document.body.style.overflow = '';
}

// ============ FULL SCHEDULER ============

function renderScheduler() {
  const gridEl = document.getElementById('scheduler-grid');
  const statsEl = document.getElementById('scheduler-stats');
  const legendEl = document.getElementById('scheduler-legend');
  const arrangementEl = document.getElementById('scheduler-arrangement');
  const unschedEl = document.getElementById('scheduler-unscheduled');

  // Get all offered courses, filtered
  let offered = DB.courses.filter(c => c.offeredSummer2026);
  if (!schedTracks.has('all')) {
    offered = offered.filter(c => schedTracks.has(c.track));
  }
  if (!schedTypes.has('all')) {
    offered = offered.filter(c => schedTypes.has(c.type));
  }
  if (schedCourseQuery) {
    offered = offered.filter(c => 
      c.name.toLowerCase().includes(schedCourseQuery) || 
      c.code.toLowerCase().includes(schedCourseQuery)
    );
  }

  // Legend
  legendEl.innerHTML = `
    <div class="sched-legend-row">
      <span class="sched-legend-item"><span class="sched-legend-dot" style="background:#f59e0b"></span>Algorithmics</span>
      <span class="sched-legend-item"><span class="sched-legend-dot" style="background:#06b6d4"></span>GVA</span>
      <span class="sched-legend-item"><span class="sched-legend-dot" style="background:#10b981"></span>ICM</span>
      <span class="sched-legend-item"><span class="sched-legend-dot" style="background:#6366f1"></span>Intelligent Systems</span>
      <span class="sched-legend-item sched-legend-overlap"><span class="sched-legend-dot" style="background:#ef4444"></span>Time Overlap</span>
    </div>
  `;

  // Build event map for the weekly grid with finer granularity
  const allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const days = schedDay === 'all' ? allDays : [schedDay];
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

  // Parse time to get start/end hours
  function parseTime(timeStr) {
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return { startH: parseInt(match[1]), startM: parseInt(match[2]), endH: parseInt(match[3]), endM: parseInt(match[4]) };
  }

  // Build events: [{course, slot, color, startH, endH, span}]
  const dayEvents = {};
  days.forEach(d => { dayEvents[d] = []; });

  const byArrangement = [];
  const noSchedule = [];

  offered.forEach(c => {
    const trackColor = TRACK_COLORS[c.track] || '#6366f1';
    if (!c.schedule || c.schedule.length === 0) {
      noSchedule.push(c);
      return;
    }
    c.schedule.forEach(s => {
      if (s.day === 'By arrangement' || !days.includes(s.day)) {
        byArrangement.push({ course: c, slot: s, color: trackColor });
        return;
      }
      const t = parseTime(s.time);
      if (!t) return;
      const span = t.endH - t.startH;
      dayEvents[s.day].push({
        course: c, slot: s, color: trackColor,
        startH: t.startH, endH: t.endH, span: span || 2
      });
    });
  });

  // Count stats
  let totalScheduled = 0;
  let totalOverlaps = 0;
  const overlapSlots = new Set();
  days.forEach(d => {
    totalScheduled += dayEvents[d].length;
    // detect overlaps
    const evts = dayEvents[d];
    for (let i = 0; i < evts.length; i++) {
      for (let j = i + 1; j < evts.length; j++) {
        if (evts[i].startH < evts[j].endH && evts[j].startH < evts[i].endH) {
          overlapSlots.add(`${d}-${i}-${j}`);
        }
      }
    }
  });
  totalOverlaps = overlapSlots.size;

  statsEl.innerHTML = `
    <div class="sched-stat"><span class="sched-stat-num">${offered.length}</span><span class="sched-stat-label">Courses This Semester</span></div>
    <div class="sched-stat"><span class="sched-stat-num">${totalScheduled}</span><span class="sched-stat-label">Scheduled Sessions</span></div>
    <div class="sched-stat sched-stat-warn"><span class="sched-stat-num">${totalOverlaps}</span><span class="sched-stat-label">Time Overlaps</span></div>
    <div class="sched-stat"><span class="sched-stat-num">${byArrangement.length + noSchedule.length}</span><span class="sched-stat-label">By Arrangement / TBD</span></div>
  `;

  // Build the visual grid using absolute positioning within each day column
  const minHour = 8;
  const maxHour = 20;
  const rowH = 60; // px per hour

  let html = '<div class="sched-row">';
  // Time column
  html += '<div class="sched-time-col">';
  html += '<div class="sched-day-header sched-time-header">&nbsp;</div>';
  for (let h = minHour; h < maxHour; h++) {
    html += `<div class="sched-time-label" style="height:${rowH}px">${String(h).padStart(2, '0')}:00</div>`;
  }
  html += '</div>';

  // Day columns
  days.forEach(d => {
    const evts = dayEvents[d];
    const totalHeight = (maxHour - minHour) * rowH;
    html += `<div class="sched-day-col">`;
    html += `<div class="sched-day-header">${d}</div>`;
    html += `<div class="sched-day-body" style="height:${totalHeight}px; position:relative">`;

    // Draw hour lines
    for (let h = minHour; h < maxHour; h++) {
      const top = (h - minHour) * rowH;
      html += `<div class="sched-hour-line" style="top:${top}px"></div>`;
    }

    // Detect overlaps for layout: group overlapping events
    const sorted = [...evts].sort((a, b) => a.startH - b.startH || a.endH - b.endH);
    // Assign columns using greedy interval coloring
    const columns = [];
    sorted.forEach(ev => {
      let placed = false;
      for (let col = 0; col < columns.length; col++) {
        const lastInCol = columns[col];
        if (lastInCol.endH <= ev.startH) {
          columns[col] = ev;
          ev._col = col;
          placed = true;
          break;
        }
      }
      if (!placed) {
        ev._col = columns.length;
        columns.push(ev);
      }
    });
    const maxCols = columns.length || 1;

    // Second pass: compute actual widths by finding overlapping group max cols at each event's time
    sorted.forEach(ev => {
      // Find how many events overlap with this event
      let concurrentMax = 0;
      sorted.forEach(other => {
        if (other.startH < ev.endH && ev.startH < other.endH) {
          concurrentMax = Math.max(concurrentMax, other._col + 1);
        }
      });
      ev._maxCols = concurrentMax;
    });

    sorted.forEach(ev => {
      const top = (ev.startH - minHour) * rowH + 1;
      const height = ev.span * rowH - 2;
      const colCount = ev._maxCols || maxCols;
      const width = (100 / colCount);
      const left = ev._col * width;

      // Check if this event overlaps with any other
      const hasOverlap = sorted.some(other => other !== ev && other.startH < ev.endH && ev.startH < other.endH);

      const overlapClass = hasOverlap ? 'sched-ev-overlap' : '';
      const isSelected = selectedCourses.has(ev.course.id);
      const profShort = (ev.course.professor || '').split(',')[0].replace(/Prof\. Dr\./g, '').replace(/Dr\./g, '').replace(/JProf\./g, '').trim();
      const profDisplay = profShort.length > 22 ? profShort.substring(0, 20) + '…' : profShort;

      html += `<div class="sched-event ${overlapClass} ${isSelected ? 'sched-ev-selected' : ''}" 
        style="top:${top}px; height:${height}px; left:${left}%; width:${width}%; --sev-color:${ev.color}" 
        onclick="openModal('${ev.course.id}')" 
        title="${ev.course.code} ${ev.course.name}\n${ev.course.professor}\n${ev.slot.time} ${ev.slot.type}\n${ev.slot.room || ''}">`;
      html += `<div class="sev-track-bar"></div>`;
      html += `<div class="sev-content">`;
      html += `<div class="sev-code">${ev.course.code}</div>`;
      html += `<div class="sev-name">${ev.course.name.length > 30 ? ev.course.name.substring(0, 28) + '…' : ev.course.name}</div>`;
      html += `<div class="sev-prof">${profDisplay}</div>`;
      html += `<div class="sev-meta"><span class="sev-type sev-type-${ev.slot.type.toLowerCase()}">${ev.slot.type}</span><span class="sev-time">${ev.slot.time}</span></div>`;
      if (ev.slot.room && height > 70) {
        html += `<div class="sev-room">${ev.slot.room.split(',')[0]}</div>`;
      }
      html += `</div></div>`;
    });

    html += '</div></div>'; // close sched-day-body and sched-day-col
  });

  html += '</div>'; // close sched-row
  gridEl.innerHTML = html;

  // By arrangement courses
  // Deduplicate
  const uniqueBA = [];
  const seenBA = new Set();
  byArrangement.forEach(ev => {
    const key = ev.course.id;
    if (!seenBA.has(key)) {
      uniqueBA.push(ev);
      seenBA.add(key);
    }
  });

  if (uniqueBA.length > 0) {
    arrangementEl.innerHTML = `
      <h3 class="sched-section-title">📌 By Arrangement (${uniqueBA.length} courses)</h3>
      <div class="sched-ba-grid">
        ${uniqueBA.map(ev => {
          const profShort = (ev.course.professor || 'TBD').split(',')[0].replace(/Prof\. Dr\./g, '').replace(/Dr\./g, '').trim();
          return `<div class="sched-ba-card" style="--sba-color:${ev.color}" onclick="openModal('${ev.course.id}')">
            <div class="sba-code">${ev.course.code}</div>
            <div class="sba-name">${ev.course.name}</div>
            <div class="sba-prof">${profShort}</div>
            <span class="sba-badge">${ev.course.type}</span>
          </div>`;
        }).join('')}
      </div>`;
  } else {
    arrangementEl.innerHTML = '';
  }

  // Unscheduled courses (no schedule data at all)
  if (noSchedule.length > 0) {
    unschedEl.innerHTML = `
      <h3 class="sched-section-title">⏳ Schedule TBD (${noSchedule.length} courses)</h3>
      <div class="sched-ba-grid">
        ${noSchedule.map(c => {
          const trackColor = TRACK_COLORS[c.track] || '#6366f1';
          const profShort = (c.professor || 'TBD').split(',')[0].replace(/Prof\. Dr\./g, '').replace(/Dr\./g, '').trim();
          return `<div class="sched-ba-card sched-ba-tbd" style="--sba-color:${trackColor}" onclick="openModal('${c.id}')">
            <div class="sba-code">${c.code}</div>
            <div class="sba-name">${c.name}</div>
            <div class="sba-prof">${profShort}</div>
            <span class="sba-badge">${c.type}</span>
          </div>`;
        }).join('')}
      </div>`;
  } else {
    unschedEl.innerHTML = '';
  }
}

// ============ PLANNER ============

function renderPlanner() {
  const selectedList = document.getElementById('planner-selected');
  const plannerGrid = document.getElementById('planner-grid');
  const plannerEcts = document.getElementById('planner-ects');

  const selected = DB.courses.filter(c => selectedCourses.has(c.id));
  const totalEcts = selected.reduce((sum, c) => sum + c.ects, 0);
  plannerEcts.textContent = totalEcts;

  // Selected chips
  if (selected.length === 0) {
    selectedList.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;font-style:italic">No courses selected yet. Go to "All Courses" tab and click "+ Add" on courses you\'re interested in.</p>';
  } else {
    selectedList.innerHTML = selected.map(c => {
      const trackColor = TRACK_COLORS[c.track] || '#6366f1';
      return `<div class="planner-chip" style="--chip-color: ${trackColor}">
        <span>${c.code} — ${c.name}</span>
        <span class="chip-remove" onclick="toggleCourse('${c.id}')">✕</span>
      </div>`;
    }).join('');
  }

  // "By arrangement" courses
  const byArrangement = selected.filter(c => !c.schedule || c.schedule.length === 0 || c.schedule.every(s => s.day === 'By arrangement'));
  
  // Build weekly grid
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const times = ['08:00','10:00','12:00','14:00','16:00','18:00'];
  const timeLabels = ['8–10', '10–12', '12–14', '14–16', '16–18', '18–20'];

  // Build event map
  const eventMap = {};
  selected.forEach(c => {
    const trackColor = TRACK_COLORS[c.track] || '#6366f1';
    if (!c.schedule) return;
    c.schedule.forEach(s => {
      if (!days.includes(s.day)) return;
      const startMatch = s.time.match(/(\d{1,2}):(\d{2})/);
      if (!startMatch) return;
      const startHour = parseInt(startMatch[1]);
      const slotIdx = times.findIndex(t => parseInt(t) === startHour);
      if (slotIdx === -1) return;
      const key = `${s.day}-${times[slotIdx]}`;
      if (!eventMap[key]) eventMap[key] = [];
      eventMap[key].push({ course: c, slot: s, color: trackColor });
    });
  });

  let conflicts = 0;
  Object.values(eventMap).forEach(evts => { if (evts.length > 1) conflicts++; });
  document.getElementById('stat-conflicts').textContent = conflicts;

  let html = '';
  html += '<div class="pg-header"></div>';
  days.forEach(d => { html += `<div class="pg-header">${d}</div>`; });

  timeLabels.forEach((label, i) => {
    html += `<div class="pg-time">${label}</div>`;
    days.forEach(d => {
      const key = `${d}-${times[i]}`;
      const evts = eventMap[key] || [];
      const isConflict = evts.length > 1;
      html += `<div class="pg-cell ${isConflict ? 'pg-conflict' : ''}">`;
      evts.forEach(ev => {
        html += `<div class="pg-event" style="--event-color: ${ev.color}; background: ${ev.color}11" onclick="openModal('${ev.course.id}')">
          <div class="ev-code">${ev.course.code}</div>
          <div class="ev-name">${ev.course.name.substring(0, 25)}${ev.course.name.length > 25 ? '…' : ''}</div>
          <div class="ev-room">${ev.slot.room ? ev.slot.room.split(',')[0] : ''}</div>
        </div>`;
      });
      html += '</div>';
    });
  });

  plannerGrid.innerHTML = html;

  // Render by-arrangement section
  const baContainer = document.getElementById('by-arrangement');
  if (baContainer) {
    if (byArrangement.length > 0) {
      baContainer.innerHTML = `
        <h3 style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.75rem;">📌 Courses by Arrangement (not on grid)</h3>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
          ${byArrangement.map(c => {
            const trackColor = TRACK_COLORS[c.track] || '#6366f1';
            return `<div class="planner-chip" style="--chip-color: ${trackColor};cursor:pointer" onclick="openModal('${c.id}')">
              ${c.code} — ${c.name} (${c.ects} ECTS)
            </div>`;
          }).join('')}
        </div>
      `;
    } else {
      baContainer.innerHTML = '';
    }
  }
}

// ============ PROFESSORS ============

function renderProfessors() {
  const search = (document.getElementById('prof-search')?.value || '').toLowerCase();
  const grid = document.getElementById('professors-grid');
  if (!DB.professors) { grid.innerHTML = ''; return; }

  let profs = Object.entries(DB.professors)
    .map(([key, p]) => ({ ...p, key }))
    .filter(p => {
      if (search) {
        const haystack = `${p.name} ${p.group} ${p.track} ${p.research.join(' ')}`.toLowerCase();
        return haystack.includes(search);
      }
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  grid.innerHTML = profs.map(p => {
    const trackColor = TRACK_COLORS[p.track] || '#6366f1';
    const courseDetails = (p.courses || [])
      .map(cid => DB.courses.find(c => c.id === cid))
      .filter(Boolean);

    return `
      <div class="prof-card">
        <div class="prof-name">${p.name}</div>
        <div class="prof-group">${p.group}</div>
        <span class="prof-track-badge" style="background: ${trackColor}22; color: ${trackColor}">${DB.tracks[p.track]?.name || p.track}</span>

        <div class="prof-research">
          <h4>Research Areas</h4>
          <div class="prof-research-tags">
            ${p.research.map(r => `<span class="prof-tag">${r}</span>`).join('')}
          </div>
        </div>

        <div class="prof-courses">
          <h4>Courses (${courseDetails.length})</h4>
          <div class="prof-course-list">
            ${courseDetails.map(c => `
              <div class="prof-course-item" onclick="openModal('${c.id}')">
                ${c.code} — ${c.name} <span style="opacity:0.6">(${c.type}, ${c.ects} ECTS)</span>
              </div>
            `).join('')}
            ${courseDetails.length === 0 ? '<div style="color:var(--text-muted);font-size:0.78rem;font-style:italic">No courses listed</div>' : ''}
          </div>
        </div>

        ${p.email ? `<div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.5rem">✉️ ${p.email}</div>` : ''}
        ${p.website ? `<a href="${p.website}" target="_blank" class="prof-link">Visit Website →</a>` : ''}
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
    p.research.forEach(r => {
      if (!labMap[p.group].research.includes(r)) labMap[p.group].research.push(r);
    });
    (p.courses || []).forEach(cid => {
      const c = DB.courses.find(x => x.id === cid);
      if (c && !labMap[p.group].courses.find(x => x.id === cid)) labMap[p.group].courses.push(c);
    });
  });

  const labs = Object.values(labMap).sort((a, b) => a.name.localeCompare(b.name));

  grid.innerHTML = labs.map(lab => {
    const trackColor = TRACK_COLORS[lab.track] || '#6366f1';
    return `
      <div class="lab-card" style="border-left: 4px solid ${trackColor}">
        <div class="lab-name">${lab.name}</div>
        <div class="lab-prof">${lab.professors.map(p => `<strong>${p.name}</strong>`).join(', ')}</div>
        <span class="prof-track-badge" style="background: ${trackColor}22; color: ${trackColor}; margin-bottom: 0.75rem">${DB.tracks[lab.track]?.name || lab.track}</span>

        <div class="lab-tags">
          ${lab.research.map(r => `<span class="lab-tag">${r}</span>`).join('')}
        </div>

        <div class="lab-courses-section">
          <h4>Courses (${lab.courses.length})</h4>
          <div class="lab-course-chips">
            ${lab.courses.map(c => `<span class="lab-course-chip" onclick="openModal('${c.id}')">${c.code} — ${c.name} (${c.type})</span>`).join('')}
          </div>
        </div>

        ${lab.website ? `<a href="${lab.website}" target="_blank" class="lab-link">Visit Lab Website →</a>` : ''}
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

// ============ BOOT ============

document.addEventListener('DOMContentLoaded', init);
