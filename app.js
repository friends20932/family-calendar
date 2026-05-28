// ============================================================
// app.js — Main application logic
// ============================================================

import { CalendarRenderer, formatTime } from './calendar.js?v=4';
import {
  loadEvents, saveEvents, createEvent, updateEvent, deleteEvent,
  getEventsForDate, toDateStr
} from './events.js?v=2';
import {
  loadMembers, saveMembers, addMember, updateMember, deleteMember
} from './members.js?v=2';
import {
  loadCategories, saveCategories, addCategory, updateCategory,
  deleteCategory, getCategoryColor, DEFAULT_CATEGORIES
} from './categories.js?v=2';
import {
  initNotifications, getNotificationPermission,
  requestNotificationPermission, scheduleLocalReminders, startPeriodicCheck
} from './notifications.js?v=2';

// ── State ───────────────────────────────────────────────────
let cal;
let editingEventId = null;
let editingEvent = null;
let editingEventInstanceDate = null;
let selectedDate = toDateStr(new Date());

// ── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  computeScrollbarWidth();
  await initNotifications();
  setupCalendar();
  setupSidebar();
  updateNotifBadge();
  scheduleAllReminders();
  renderUpcoming();
  pullFromGitHub();
});

function computeScrollbarWidth() {
  const scrollDiv = document.createElement('div');
  scrollDiv.style.cssText = 'width: 100px; height: 100px; overflow: scroll; position: absolute; top: -9999px;';
  document.body.appendChild(scrollDiv);
  const scrollbarWidth = scrollDiv.offsetWidth - scrollDiv.clientWidth;
  document.body.removeChild(scrollDiv);
  document.documentElement.style.setProperty('--scrollbar-w', `${scrollbarWidth}px`);
}

// ── Calendar Setup ──────────────────────────────────────────
function setupCalendar() {
  const container = document.getElementById('calendar-container');
  cal = new CalendarRenderer({
    container,
    onDateClick: (dateStr) => {
      selectedDate = dateStr;
      showDayPanel(dateStr);
    },
    onEventClick: (ev) => openEventViewModal(ev),
    onNewEvent: (dateStr, datetime, endDatetime, allDay) => {
      selectedDate = dateStr;
      openNewEventModal(dateStr, datetime, endDatetime, allDay);
    },
  });
  cal.render();
  updateHeaderTitle();

  document.getElementById('btn-prev').addEventListener('click', () => {
    cal.navigate(-1); updateHeaderTitle();
  });
  document.getElementById('btn-next').addEventListener('click', () => {
    cal.navigate(1); updateHeaderTitle();
  });
  
  let isWheeling = false;
  document.getElementById('calendar-container').addEventListener('wheel', (e) => {
    if (cal.view !== 'month') return; // Only apply to month view
    if (isWheeling || Math.abs(e.deltaY) < 15) return;
    
    isWheeling = true;
    cal.navigate(e.deltaY > 0 ? 1 : -1);
    updateHeaderTitle();
    
    setTimeout(() => { isWheeling = false; }, 500); // 500ms cooldown for smooth trackpad experience
  }, { passive: true });

  document.getElementById('btn-today').addEventListener('click', () => {
    cal.goToday(); updateHeaderTitle();
  });
  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      cal.setView(btn.dataset.view);
      updateHeaderTitle();
    });
  });
  document.getElementById('btn-add-event').addEventListener('click', () => {
    openNewEventModal(selectedDate);
  });
}

function updateHeaderTitle() {
  const titleEl = document.getElementById('cal-title');
  if (!titleEl || !cal) return;
  const MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  if (cal.view === 'month') {
    titleEl.textContent = `${cal.year} 年 ${MONTHS[cal.month]}`;
  } else if (cal.view === 'week') {
    const d = cal.cursor;
    const start = new Date(d); start.setDate(d.getDate() - d.getDay());
    const end = new Date(start); end.setDate(start.getDate() + 6);
    titleEl.textContent = `${start.getMonth()+1}/${start.getDate()} – ${end.getMonth()+1}/${end.getDate()}`;
  } else {
    titleEl.textContent = `${cal.cursor.getFullYear()}/${cal.cursor.getMonth()+1}/${cal.cursor.getDate()}`;
  }
}

// ── Sidebar ──────────────────────────────────────────────────
function setupSidebar() {
  renderMiniCalendar();
  renderUpcoming();
}

function renderMiniCalendar() {
  const el = document.getElementById('mini-calendar');
  if (!el) return;
  const now = new Date();
  const year = now.getFullYear(); const month = now.getMonth();
  const DAYS = ['日','一','二','三','四','五','六'];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

  let html = `<div class="mini-cal-title">${year} 年 ${MONTHS[month]}</div>`;
  html += `<div class="mini-cal-grid">`;
  DAYS.forEach((d) => { html += `<div class="mini-cal-head">${d}</div>`; });
  for (let i = 0; i < firstDay; i++) html += `<div></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = toDateStr(new Date(year, month, d));
    html += `<div class="mini-cal-day${d === now.getDate() ? ' today' : ''}" data-date="${ds}">${d}</div>`;
  }
  html += '</div>';
  el.innerHTML = html;
  el.querySelectorAll('.mini-cal-day').forEach((cell) => {
    cell.addEventListener('click', () => {
      selectedDate = cell.dataset.date;
      cal.goToDate(cell.dataset.date);
      updateHeaderTitle();
      showDayPanel(cell.dataset.date);
    });
  });
}

function renderUpcoming() {
  const el = document.getElementById('upcoming-list');
  if (!el) return;
  const members = loadMembers();
  const now = new Date();
  const upcoming = [];

  for (let i = 0; i < 14; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    const ds = toDateStr(d);
    getEventsForDate(ds).forEach((ev) => {
      const evTime = new Date(ev.datetime);
      if (evTime >= now || ev.allDay) upcoming.push({ ...ev, _ds: ds });
    });
  }

  if (!upcoming.length) {
    el.innerHTML = '<div class="upcoming-empty">未來 2 週無活動</div>'; return;
  }

  let lastDate = ''; let html = '';
  upcoming.slice(0, 10).forEach((ev) => {
    const evMembers = members.filter((m) => ev.memberIds?.includes(m.id));
    const firstMember = evMembers[0];
    const color = ev.color || firstMember?.color || getCategoryColor(ev.category);
    if (ev._ds !== lastDate) {
      const d = new Date(ev._ds + 'T12:00:00');
      const label = ev._ds === toDateStr(now) ? '今天' : `${d.getMonth()+1}/${d.getDate()}`;
      html += `<div class="upcoming-date-label">${label}</div>`;
      lastDate = ev._ds;
    }
    html += `
      <div class="upcoming-item" data-id="${ev.id}" data-ds="${ev._ds}" style="--ev-color:${color}">
        <div class="upcoming-dot"></div>
        <div class="upcoming-info">
          <div class="upcoming-title">${escapeHtml(ev.title)}</div>
          <div class="upcoming-time">${ev.allDay ? '整天' : formatTime(ev.datetime)}${ev.location ? ' · '+escapeHtml(ev.location) : ''}</div>
        </div>
        ${evMembers.length ? `<div style="display:flex; gap:4px; margin-left:auto;">${evMembers.map(m => `<div class="upcoming-avatar" style="background:${m.color}">${m.emoji}</div>`).join('')}</div>` : ''}
      </div>`;
  });

  el.innerHTML = html;
  el.querySelectorAll('.upcoming-item').forEach((item) => {
    item.addEventListener('click', () => {
      const ev = loadEvents().find((e) => e.id === item.dataset.id)
        || getEventsForDate(item.dataset.ds).find((e) => e.id === item.dataset.id);
      if (ev) openEventViewModal(ev);
    });
  });
}

// ── Day Panel ─────────────────────────────────────────────────
function showDayPanel(dateStr) {
  const panel = document.getElementById('day-panel');
  const title = document.getElementById('day-panel-title');
  const list  = document.getElementById('day-panel-list');
  if (!panel) return;

  const d = new Date(dateStr + 'T12:00:00');
  const WD = ['週日','週一','週二','週三','週四','週五','週六'];
  title.textContent = `${d.getMonth()+1} 月 ${d.getDate()} 日 ${WD[d.getDay()]}`;

  const events  = getEventsForDate(dateStr);
  const members = loadMembers();

  if (!events.length) {
    list.innerHTML = '<div class="day-panel-empty">這天沒有活動<br><small>雙擊日期格子快速新增</small></div>';
  } else {
    list.innerHTML = '';
    events.forEach((ev) => {
      const evMembers = members.filter((m) => ev.memberIds?.includes(m.id));
      const firstMember = evMembers[0];
      const color  = ev.color || firstMember?.color || getCategoryColor(ev.category);
      const item   = document.createElement('div');
      item.className = 'day-panel-event';
      item.style.setProperty('--ev-color', color);
      item.innerHTML = `
        <div class="dp-color-bar"></div>
        <div class="dp-info">
          <div class="dp-title">${escapeHtml(ev.title)}</div>
          <div class="dp-meta">${ev.allDay ? '整天' : formatTime(ev.datetime)}${ev.location ? ' · '+escapeHtml(ev.location) : ''}</div>
          ${ev.url ? `<div class="dp-url" style="margin-top: 4px; font-size: 12px;"><a href="${escapeHtml(ev.url)}" target="_blank" style="color: var(--accent); text-decoration: none;">🔗 連結網址</a></div>` : ''}
          ${evMembers.length ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">${evMembers.map(m => `<div class="dp-member" style="color:${m.color}">${m.emoji} ${escapeHtml(m.name)}</div>`).join('')}</div>` : ''}
        </div>`;
      item.addEventListener('click', () => openEventViewModal(ev));
      list.appendChild(item);
    });
  }

  panel.classList.add('open');
  document.getElementById('day-panel-add').onclick = () => openNewEventModal(dateStr);
  document.getElementById('day-panel-close').onclick = () => panel.classList.remove('open');
}

// ── Event Modal ───────────────────────────────────────────────
function openEventViewModal(ev) {
  const body = document.getElementById('event-view-body');
  if (!body) return;
  const members = loadMembers();
  const evMembers = members.filter((m) => ev.memberIds?.includes(m.id));
  const firstMember = evMembers[0];
  const color = ev.color || firstMember?.color || 'var(--accent)';

  // Format date string like "5月28日（星期四）"
  const WEEKDAYS_ZH = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  const startDt = new Date(ev.datetime);
  const dateLabel = `${startDt.getMonth()+1}月${startDt.getDate()}日（${WEEKDAYS_ZH[startDt.getDay()]}）`;

  // Format time string
  let timeRow = '';
  if (ev.allDay) {
    if (ev.endDatetime && ev.endDatetime.slice(0,10) !== ev.datetime.slice(0,10)) {
      const endDt = new Date(ev.endDatetime);
      const endLabel = `${endDt.getMonth()+1}月${endDt.getDate()}日（${WEEKDAYS_ZH[endDt.getDay()]}）`;
      timeRow = `${dateLabel} - ${endLabel} · 整天`;
    } else {
      timeRow = `${dateLabel} · 整天`;
    }
  } else {
    const startTime = formatTime(ev.datetime);
    const endTime   = ev.endDatetime ? ' - ' + formatTime(ev.endDatetime) : '';
    timeRow = `${dateLabel} · ${startTime}${endTime}`;
  }

  // Calendar name
  const calName = localStorage.getItem('family_calendar_name') || '家庭行事曆';

  body.innerHTML = `
    <div class="popup-title-row">
      <span class="popup-color-dot" style="background:${color};"></span>
      <span class="popup-title">${escapeHtml(ev.title)}</span>
    </div>

    <div class="popup-info-rows">
      <div class="popup-info-row">
        <span class="popup-info-icon">🕐</span>
        <span>${timeRow}</span>
      </div>

      ${ev.location ? `
      <div class="popup-info-row">
        <span class="popup-info-icon">📍</span>
        <span>${escapeHtml(ev.location)}</span>
      </div>` : ''}

      ${ev.url ? `
      <div class="popup-info-row">
        <span class="popup-info-icon">🔗</span>
        <a href="${escapeHtml(ev.url)}" target="_blank">${escapeHtml(ev.url)}</a>
      </div>` : ''}

      ${ev.description ? `
      <div class="popup-info-row">
        <span class="popup-info-icon">📝</span>
        <div style="white-space:pre-wrap; line-height:1.5;">${escapeHtml(ev.description)}</div>
      </div>` : ''}

      ${evMembers.length ? `
      <div class="popup-info-row">
        <span class="popup-info-icon">👥</span>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${evMembers.map(m => `
          <span class="popup-member-chip" style="
            background: color-mix(in srgb, ${m.color} 12%, white);
            color: ${m.color};
            border-color: color-mix(in srgb, ${m.color} 25%, white);
          ">
            ${m.emoji} ${escapeHtml(m.name)}
          </span>`).join('')}
        </div>
      </div>` : ''}
    </div>

    <hr class="popup-divider">

    <div class="popup-footer">
      <span>📅</span>
      <span>${escapeHtml(calName)}</span>
    </div>
  `;

  // Edit button
  document.getElementById('btn-edit-event').onclick = () => {
    closeModal('event-view-modal');
    openEventModal(ev);
  };

  // Delete button
  document.getElementById('btn-delete-event-view').onclick = () => {
    if (ev.repeat && ev.repeat !== 'none') {
      editingEventId = ev.id;
      editingEvent = ev;
      editingEventInstanceDate = ev._displayDate || (ev.datetime || '').slice(0, 10);
      promptRepeatAction('delete', null);
    } else {
      if (!confirm(`確定要刪除「${ev.title}」嗎？`)) return;
      deleteEvent(ev.id);
      closeModal('event-view-modal');
      showToast('活動已刪除');
      refreshAll();
      syncToGitHub(true);
    }
  };

  openModal('event-view-modal');
}

function openNewEventModal(dateStr, datetime, endDatetime, allDay = false) {
  editingEventId = null;
  editingEvent = null;
  editingEventInstanceDate = null;
  const defaultDt = datetime || `${dateStr}T09:00`;
  populateEventForm({ 
    datetime: defaultDt, 
    endDatetime: endDatetime || '', 
    allDay: allDay, 
    title: '', url: '',
    description: '', location: '', category: 'family', reminder: '30', repeat: 'none',
    repeatEndType: 'never', repeatEndDate: '', repeatEndCount: 10, repeatWeeklyDays: [], repeatMonthlyDate: 1, memberIds: [] 
  });
  document.getElementById('modal-title').textContent = '新增活動';
  document.getElementById('btn-delete-event').style.display = 'none';
  openModal('event-modal');
}

function openEventModal(ev) {
  editingEventId = ev.id;
  editingEvent = ev;
  editingEventInstanceDate = ev._displayDate || (ev.datetime || '').slice(0, 10);
  populateEventForm(ev);
  document.getElementById('modal-title').textContent = '編輯活動';
  document.getElementById('btn-delete-event').style.display = 'flex';
  openModal('event-modal');
}

function populateEventForm(ev) {
  document.getElementById('ev-title').value       = ev.title || '';
  document.getElementById('ev-url').value         = ev.url || '';
  
  let formStartDt = ev.datetime || '';
  let formEndDt = ev.endDatetime || '';
  if (editingEventInstanceDate && ev.repeat && ev.repeat !== 'none') {
    formStartDt = editingEventInstanceDate + formStartDt.slice(10);
    if (formEndDt) {
      const origStart = new Date((ev.datetime||'').slice(0,10));
      const origEnd = new Date(formEndDt.slice(0,10));
      const diffDays = Math.round((origEnd - origStart) / 86400000);
      const newEnd = new Date(editingEventInstanceDate + 'T12:00:00');
      newEnd.setDate(newEnd.getDate() + diffDays);
      formEndDt = toDateStr(newEnd) + formEndDt.slice(10);
    }
  }

  document.getElementById('ev-datetime').value    = formStartDt.slice(0, 16);
  document.getElementById('ev-end-datetime').value = formEndDt.slice(0, 16);
  document.getElementById('ev-allday').checked    = ev.allDay || false;
  document.getElementById('ev-description').value = ev.description || '';
  document.getElementById('ev-location').value    = ev.location || '';
  
  // All-day date fields
  const startDate = formStartDt.slice(0, 10);
  const endDate   = formEndDt.slice(0, 10);
  const alStart = document.getElementById('ev-allday-start');
  const alEnd   = document.getElementById('ev-allday-end');
  if (alStart) alStart.value = startDate;
  if (alEnd)   alEnd.value   = endDate;
  
  const rem = ev.reminder || '30';
  if (rem === 'none') {
    document.getElementById('ev-reminder-toggle').value = 'none';
    document.getElementById('ev-reminder-value').style.display = 'none';
    document.getElementById('ev-reminder-unit').style.display = 'none';
  } else {
    document.getElementById('ev-reminder-toggle').value = 'custom';
    document.getElementById('ev-reminder-value').style.display = 'block';
    document.getElementById('ev-reminder-unit').style.display = 'block';
    let minutes = parseInt(rem) || 0;
    if (minutes % 1440 === 0 && minutes !== 0) {
      document.getElementById('ev-reminder-value').value = minutes / 1440;
      document.getElementById('ev-reminder-unit').value = '1440';
    } else if (minutes % 60 === 0 && minutes !== 0) {
      document.getElementById('ev-reminder-value').value = minutes / 60;
      document.getElementById('ev-reminder-unit').value = '60';
    } else {
      document.getElementById('ev-reminder-value').value = minutes;
      document.getElementById('ev-reminder-unit').value = '1';
    }
  }
  
  document.getElementById('ev-repeat').value      = ev.repeat || 'none';
  const endType = ev.repeatEndType || 'never';
  document.querySelector(`input[name="ev-repeat-end-type"][value="${endType}"]`).checked = true;
  document.getElementById('ev-repeat-end-date').value = ev.repeatEndDate || '';
  document.getElementById('ev-repeat-end-count').value = ev.repeatEndCount || 10;
  document.getElementById('ev-repeat-monthly-date').value = ev.repeatMonthlyDate || 1;
  
  const weeklyDays = ev.repeatWeeklyDays || [];
  document.querySelectorAll('#repeat-weekly-days input[type="checkbox"]').forEach(cb => {
    cb.checked = weeklyDays.includes(parseInt(cb.value));
  });

  toggleAllDay(ev.allDay);
  renderCategoryPills(ev.category || 'family');
  renderMemberCheckboxes(ev.memberIds || []);
  
  // Trigger UI updates
  document.getElementById('ev-repeat').dispatchEvent(new Event('change'));
  document.querySelector(`input[name="ev-repeat-end-type"][value="${endType}"]`).dispatchEvent(new Event('change'));
}

function renderCategoryPills(activeCatId) {
  const cats = loadCategories();
  const container = document.getElementById('cat-pills-container');
  if (!container) return;
  container.innerHTML = '';
  cats.forEach((cat) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-pill' + (cat.id === activeCatId ? ' active' : '');
    btn.dataset.cat = cat.id;
    btn.style.setProperty('--cat-color', cat.color);
    btn.textContent = `${cat.emoji} ${cat.label}`;
    btn.addEventListener('click', () => {
      container.querySelectorAll('.cat-pill').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
    });
    container.appendChild(btn);
  });
}

function toggleAllDay(isAllDay) {
  const tf = document.getElementById('time-fields');
  const af = document.getElementById('allday-fields');
  if (tf) tf.style.display = isAllDay ? 'none' : 'flex';
  if (af) af.style.display = isAllDay ? 'flex' : 'none';
}

function renderMemberCheckboxes(selectedIds) {
  const members = loadMembers();
  const container = document.getElementById('member-checkboxes');
  if (!container) return;
  container.innerHTML = '';
  members.forEach((m) => {
    const label = document.createElement('label');
    label.className = 'member-checkbox-label';
    label.style.setProperty('--m-color', m.color);
    label.innerHTML = `
      <input type="checkbox" value="${m.id}" ${selectedIds.includes(m.id) ? 'checked' : ''}>
      <span class="member-chip">${m.emoji} ${m.name}</span>`;
    container.appendChild(label);
  });
}

function getFormData() {
  const title = document.getElementById('ev-title').value.trim();
  if (!title) { showToast('請輸入活動標題', 'error'); return null; }
  const allDay = document.getElementById('ev-allday').checked;
  let datetime, endDatetime;
  if (allDay) {
    const startD = document.getElementById('ev-allday-start').value;
    const endD   = document.getElementById('ev-allday-end').value;
    if (!startD) { showToast('請選擇開始日期', 'error'); return null; }
    datetime    = startD + 'T00:00';
    endDatetime = endD ? endD + 'T00:00' : null;
  } else {
    datetime = document.getElementById('ev-datetime').value;
    if (!datetime) { showToast('請選擇日期時間', 'error'); return null; }
    endDatetime = document.getElementById('ev-end-datetime').value || null;
  }
  const category  = document.querySelector('#cat-pills-container .cat-pill.active')?.dataset.cat || 'family';
  const memberIds = [...document.querySelectorAll('#member-checkboxes input:checked')].map((c) => c.value);
  const repeatEndType = document.querySelector('input[name="ev-repeat-end-type"]:checked').value;
  const repeatWeeklyDays = [...document.querySelectorAll('#repeat-weekly-days input[type="checkbox"]:checked')].map(c => parseInt(c.value));
  
  const reminderToggle = document.getElementById('ev-reminder-toggle').value;
  let reminder = 'none';
  if (reminderToggle === 'custom') {
    const val = parseInt(document.getElementById('ev-reminder-value').value) || 0;
    const unit = parseInt(document.getElementById('ev-reminder-unit').value) || 1;
    reminder = String(val * unit);
  }

  return {
    title, allDay,
    url: document.getElementById('ev-url').value.trim(),
    datetime,
    endDatetime,
    description: document.getElementById('ev-description').value.trim(),
    location:    document.getElementById('ev-location').value.trim(),
    category, reminder,
    repeat: document.getElementById('ev-repeat').value,
    repeatEndType,
    repeatEndDate: document.getElementById('ev-repeat-end-date').value,
    repeatEndCount: document.getElementById('ev-repeat-end-count').value,
    repeatWeeklyDays,
    repeatMonthlyDate: document.getElementById('ev-repeat-monthly-date').value,
    memberIds,
  };
}

// ── Category Modal ────────────────────────────────────────────
function renderCategoryList() {
  const container = document.getElementById('category-list');
  if (!container) return;
  const cats = loadCategories();
  const defaultIds = DEFAULT_CATEGORIES.map((c) => c.id);
  container.innerHTML = '';

  cats.forEach((cat) => {
    const isDefault = defaultIds.includes(cat.id);
    const item = document.createElement('div');
    item.className = 'category-list-item';
    item.dataset.id = cat.id;
    item.innerHTML = `
      <div class="category-color-dot" style="background:${cat.color}"></div>
      <span class="category-emoji">${cat.emoji}</span>
      <span class="category-name">${escapeHtml(cat.label)}</span>
      ${isDefault ? '<span class="category-is-default">預設</span>' : ''}
      <button class="category-edit-btn" data-id="${cat.id}" title="編輯">✏️</button>
      <button class="category-delete-btn" data-id="${cat.id}" title="刪除" ${isDefault ? 'disabled style="opacity:.35;cursor:not-allowed"' : ''}>🗑</button>
    `;
    container.appendChild(item);
  });

  // Edit
  container.querySelectorAll('.category-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => startCategoryEdit(btn.dataset.id));
  });
  // Delete
  container.querySelectorAll('.category-delete-btn:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (confirm('確定刪除此分類？\n已使用此分類的活動將保留原分類 ID')) {
        deleteCategory(btn.dataset.id);
        renderCategoryList();
        refreshAll();
        syncToGitHub(true);
        showToast('分類已刪除');
      }
    });
  });
}

function startCategoryEdit(id) {
  const cats = loadCategories();
  const cat = cats.find((c) => c.id === id);
  if (!cat) return;
  const container = document.getElementById('category-list');
  const item = container.querySelector(`[data-id="${id}"]`);
  if (!item) return;

  item.classList.add('editing');
  const editRow = document.createElement('div');
  editRow.className = 'cat-edit-row';
  editRow.innerHTML = `
    <input type="text"  class="form-input cat-edit-label" value="${escapeHtml(cat.label)}" maxlength="16" placeholder="名稱" style="width:90px">
    <input type="text"  class="form-input cat-edit-emoji" value="${cat.emoji}" maxlength="2" placeholder="😀" style="width:52px;text-align:center;font-size:18px">
    <input type="color" class="member-color-input cat-edit-color" value="${cat.color}" style="width:40px;height:34px">
    <button class="cat-save-btn">儲存</button>
    <button class="cat-cancel-btn">取消</button>
  `;
  item.appendChild(editRow);

  editRow.querySelector('.cat-save-btn').addEventListener('click', () => {
    const label = editRow.querySelector('.cat-edit-label').value.trim();
    const emoji = editRow.querySelector('.cat-edit-emoji').value.trim() || cat.emoji;
    const color = editRow.querySelector('.cat-edit-color').value;
    if (!label) { showToast('請輸入分類名稱', 'error'); return; }
    updateCategory(id, { label, emoji, color });
    renderCategoryList();
    refreshAll();
    syncToGitHub(true);
    showToast('分類已更新 ✓');
  });
  editRow.querySelector('.cat-cancel-btn').addEventListener('click', () => {
    item.classList.remove('editing');
    editRow.remove();
  });
}

// ── Member Panel ──────────────────────────────────────────────
function renderMemberList() {
  const container = document.getElementById('member-list');
  if (!container) return;
  container.innerHTML = '';
  loadMembers().forEach((m) => {
    const item = document.createElement('div');
    item.className = 'member-list-item';
    item.dataset.id = m.id;
    item.innerHTML = `
      <div class="member-avatar" style="background:${m.color}">${m.emoji}</div>
      <div class="member-name">${escapeHtml(m.name)}</div>
      <button class="btn-icon member-edit" data-id="${m.id}" title="編輯">✏️</button>
      <button class="btn-icon member-delete" data-id="${m.id}" title="刪除" style="font-size:13px;">✕</button>`;
    container.appendChild(item);
  });

  container.querySelectorAll('.member-edit').forEach((btn) => {
    btn.addEventListener('click', () => startMemberEdit(btn.dataset.id));
  });
  container.querySelectorAll('.member-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (confirm('確定刪除此成員？')) {
        deleteMember(btn.dataset.id);
        renderMemberList();
        refreshAll();
        syncToGitHub(true);
        showToast('成員已刪除');
      }
    });
  });
}

function startMemberEdit(id) {
  const members = loadMembers();
  const m = members.find((x) => x.id === id);
  if (!m) return;
  const container = document.getElementById('member-list');
  const item = container.querySelector(`[data-id="${id}"]`);
  if (!item || item.classList.contains('editing')) return;

  item.classList.add('editing');
  const editRow = document.createElement('div');
  editRow.className = 'cat-edit-row';
  editRow.innerHTML = `
    <input type="text" class="form-input mem-edit-name" value="${escapeHtml(m.name)}" maxlength="20" placeholder="名稱" style="width:90px">
    <input type="text" class="form-input mem-edit-emoji" value="${m.emoji}" maxlength="2" placeholder="😀" style="width:52px;text-align:center;font-size:18px">
    <input type="color" class="member-color-input mem-edit-color" value="${m.color}" style="width:40px;height:34px">
    <button class="cat-save-btn">儲存</button>
    <button class="cat-cancel-btn">取消</button>
  `;
  item.appendChild(editRow);

  // Live preview avatar
  const avatar = item.querySelector('.member-avatar');
  editRow.querySelector('.mem-edit-emoji').addEventListener('input', (e) => {
    avatar.textContent = e.target.value || m.emoji;
  });
  editRow.querySelector('.mem-edit-color').addEventListener('input', (e) => {
    avatar.style.background = e.target.value;
  });

  editRow.querySelector('.cat-save-btn').addEventListener('click', () => {
    const name  = editRow.querySelector('.mem-edit-name').value.trim();
    const emoji = editRow.querySelector('.mem-edit-emoji').value.trim() || m.emoji;
    const color = editRow.querySelector('.mem-edit-color').value;
    if (!name) { showToast('請輸入成員名稱', 'error'); return; }
    updateMember(id, { name, emoji, color });
    renderMemberList();
    refreshAll();
    syncToGitHub(true);
    showToast('成員已更新 ✓');
  });
  editRow.querySelector('.cat-cancel-btn').addEventListener('click', () => {
    item.classList.remove('editing');
    editRow.remove();
    // Restore avatar
    avatar.textContent = m.emoji;
    avatar.style.background = m.color;
  });
}

// ── Refresh helper ────────────────────────────────────────────
function refreshAll() {
  cal.render();
  renderUpcoming();
  scheduleAllReminders();
  
  // 如果側邊欄（每日行程）開著，也順便更新它
  const dayPanel = document.getElementById('day-panel');
  if (dayPanel && dayPanel.classList.contains('open') && selectedDate) {
    showDayPanel(selectedDate);
  }
}

// ── Notification ──────────────────────────────────────────────
function updateNotifBadge() {
  const btn = document.getElementById('btn-notif');
  if (!btn) return;
  const perm = getNotificationPermission();
  btn.classList.toggle('notif-off', perm !== 'granted');
  btn.title = perm === 'granted' ? '推播通知已開啟' : '點擊開啟推播通知';
}

function scheduleAllReminders() {
  const events = loadEvents();
  scheduleLocalReminders(events);
  startPeriodicCheck(events);
}

// ── Modal helpers ─────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
  document.getElementById('modal-overlay')?.classList.add('open');
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  document.getElementById('modal-overlay')?.classList.remove('open');
}
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast toast-${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2800);
}
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Event Listeners ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Calendar Name
  const calNameDisplay = document.getElementById('calendar-name-display');
  if (calNameDisplay) {
    const savedName = localStorage.getItem('family_calendar_name') || '家庭行事曆';
    calNameDisplay.textContent = savedName;
    document.title = `${savedName} 📅`;
  }

  document.getElementById('header-logo-btn')?.addEventListener('click', () => {
    const currentName = calNameDisplay.textContent;
    const newName = prompt('請輸入新的行事曆名稱：', currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
      calNameDisplay.textContent = newName.trim();
      localStorage.setItem('family_calendar_name', newName.trim());
      document.title = `${newName.trim()} 📅`;
      showToast('名稱已更新');
    }
  });

  // Overlay close
  document.getElementById('modal-overlay')?.addEventListener('click', () => {
    closeModal('event-view-modal');
    closeModal('event-modal');
    closeModal('member-modal');
    closeModal('category-modal');
    document.getElementById('day-panel')?.classList.remove('open');
  });

  document.getElementById('btn-close-view-modal')?.addEventListener('click', () => {
    closeModal('event-view-modal');
  });

  // Event modal save
  document.getElementById('btn-save-event')?.addEventListener('click', () => {
    const data = getFormData(); if (!data) return;
    
    if (editingEventId) {
      if (editingEvent && editingEvent.repeat && editingEvent.repeat !== 'none') {
        promptRepeatAction('save', data);
      } else {
        updateEvent(editingEventId, data); 
        showToast('活動已更新 ✓');
        closeModal('event-modal');
        refreshAll();
        syncToGitHub(true);
      }
    } else { 
      createEvent(data); 
      showToast('活動已新增 ✓'); 
      closeModal('event-modal');
      refreshAll();
      syncToGitHub(true);
    }
  });

  // Event modal delete
  document.getElementById('btn-delete-event')?.addEventListener('click', () => {
    if (editingEventId) {
      if (editingEvent && editingEvent.repeat && editingEvent.repeat !== 'none') {
        promptRepeatAction('delete', null);
      } else {
        if (confirm('確定要刪除這個活動嗎？')) {
          deleteEvent(editingEventId);
          showToast('活動已刪除');
          closeModal('event-modal');
          refreshAll();
          syncToGitHub(true);
        }
      }
    }
  });

  // Event modal close
  document.getElementById('btn-close-modal')?.addEventListener('click', () => closeModal('event-modal'));
  document.getElementById('btn-close-modal-footer')?.addEventListener('click', () => closeModal('event-modal'));

  // Custom reminder toggle
  document.getElementById('ev-reminder-toggle')?.addEventListener('change', (e) => {
    const show = e.target.value === 'custom';
    document.getElementById('ev-reminder-value').style.display = show ? 'block' : 'none';
    document.getElementById('ev-reminder-unit').style.display = show ? 'block' : 'none';
  });

  // All-day toggle
  document.getElementById('ev-allday')?.addEventListener('change', (e) => toggleAllDay(e.target.checked));

  // Repeat options toggles
  document.getElementById('ev-repeat')?.addEventListener('change', (e) => {
    const val = e.target.value;
    const adv = document.getElementById('advanced-repeat-options');
    const weekly = document.getElementById('repeat-weekly-days');
    const monthly = document.getElementById('repeat-monthly-date');
    if (val === 'none') {
      adv.style.display = 'none';
    } else {
      adv.style.display = 'flex';
      weekly.style.display = val === 'weekly' ? 'flex' : 'none';
      monthly.style.display = val === 'monthly' ? 'flex' : 'none';
    }
  });

  document.querySelectorAll('input[name="ev-repeat-end-type"]').forEach(r => {
    r.addEventListener('change', (e) => {
      document.getElementById('ev-repeat-end-date').disabled = e.target.value !== 'date';
      document.getElementById('ev-repeat-end-count').disabled = e.target.value !== 'count';
    });
  });

  // Notification
  document.getElementById('btn-notif')?.addEventListener('click', async () => {
    const result = await requestNotificationPermission();
    updateNotifBadge();
    if (result === 'granted') { showToast('推播通知已開啟 🔔'); scheduleAllReminders(); }
    else if (result === 'denied') showToast('通知已被封鎖，請在瀏覽器設定中允許', 'error');
  });

  // Member modal
  document.getElementById('btn-open-members')?.addEventListener('click', () => {
    renderMemberList(); openModal('member-modal');
  });
  document.getElementById('btn-close-member-modal')?.addEventListener('click', () => closeModal('member-modal'));
  document.getElementById('btn-add-member')?.addEventListener('click', () => {
    const name  = document.getElementById('new-member-name').value.trim();
    const emoji = document.getElementById('new-member-emoji').value.trim() || '👤';
    const color = document.getElementById('new-member-color').value;
    if (!name) { showToast('請輸入成員名稱', 'error'); return; }
    addMember({ name, emoji, color });
    document.getElementById('new-member-name').value = '';
    renderMemberList();
    showToast(`已新增：${name} ✓`);
    refreshAll();
    syncToGitHub(true);
  });

  // Category modal
  document.getElementById('btn-open-categories')?.addEventListener('click', () => {
    renderCategoryList(); openModal('category-modal');
  });
  document.getElementById('btn-close-category-modal')?.addEventListener('click', () => closeModal('category-modal'));

  document.getElementById('btn-add-category')?.addEventListener('click', () => {
    const label = document.getElementById('new-cat-label').value.trim();
    const emoji = document.getElementById('new-cat-emoji').value.trim() || '🏷️';
    const color = document.getElementById('new-cat-color').value;
    if (!label) { showToast('請輸入分類名稱', 'error'); return; }
    addCategory({ label, emoji, color });
    document.getElementById('new-cat-label').value = '';
    renderCategoryList();
    showToast(`已新增分類：${label} ✓`);
    refreshAll();
    syncToGitHub(true);
  });

  // Sidebar toggle
  document.getElementById('btn-sidebar')?.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      document.getElementById('sidebar')?.classList.toggle('open');
    } else {
      document.body.classList.toggle('sidebar-closed');
    }
  });

  // Reset categories to default
  document.getElementById('btn-reset-categories')?.addEventListener('click', () => {
    if (confirm('確定要重置為預設分類嗎？自訂分類將被刪除。')) {
      saveCategories([...DEFAULT_CATEGORIES]);
      renderCategoryList();
      refreshAll();
      showToast('已重置為預設分類');
    }
  });

  // ── GitHub Sync ──────────────────────────────────────────────
  document.getElementById('btn-github-sync')?.addEventListener('click', manualSync);
});

// ── GitHub Sync to GitHub repo ───────────────────────────────
const GITHUB_OWNER = 'friends20932';
const GITHUB_REPO  = 'family-calendar';
const GITHUB_PATH  = 'data/events.json';
const GITHUB_CONFIG_PATH = 'data/config.json';

// Pull members & categories from separate config.json (unaffected by event sync)
async function pullConfigFromGitHub() {
  const pat = localStorage.getItem('github_pat');
  if (!pat) return false;
  try {
    const headers = { 'Authorization': `token ${pat}`, 'Accept': 'application/vnd.github.v3+json' };
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_CONFIG_PATH}`;
    const resp = await fetch(apiUrl + '?t=' + Date.now(), { headers, cache: 'no-store' });
    if (!resp.ok) return false;
    const data = await resp.json();
    if (data.content) {
      const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
      const config = JSON.parse(decoded);
      if (config.members && config.members.length > 0) saveMembers(config.members);
      if (config.categories && config.categories.length > 0) saveCategories(config.categories);
      refreshAll();
      return true;
    }
  } catch(e) { console.error('pullConfig error:', e); }
  return false;
}

// Push members & categories to separate config.json
async function pushConfigToGitHub() {
  const pat = localStorage.getItem('github_pat');
  if (!pat) return false;
  try {
    const headers = { 'Authorization': `token ${pat}`, 'Accept': 'application/vnd.github.v3+json' };
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_CONFIG_PATH}`;
    
    // Get SHA
    let sha = null;
    const getResp = await fetch(apiUrl + '?t=' + Date.now(), { headers, cache: 'no-store' });
    if (getResp.ok) {
      const existing = await getResp.json();
      sha = existing.sha;
    }

    const configData = {
      members: loadMembers(),
      categories: loadCategories()
    };
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(configData, null, 2))));

    const body = {
      message: `sync: update config.json (${new Date().toLocaleString('zh-TW')})`,
      content,
      ...(sha ? { sha } : {}),
    };
    const putResp = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(body) });
    return putResp.ok;
  } catch (e) {
    console.error('pushConfig error:', e);
    return false;
  }
}

async function pullFromGitHub() {
  const pat = localStorage.getItem('github_pat');
  if (!pat) return { success: false, error: 'no_pat' };
  try {
    const headers = { 'Authorization': `token ${pat}`, 'Accept': 'application/vnd.github.v3+json' };
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
    const resp = await fetch(apiUrl + '?t=' + Date.now(), { headers, cache: 'no-store' });
    if (!resp.ok) {
      if (resp.status === 401) localStorage.removeItem('github_pat');
      return { success: false, error: `fetch_failed_${resp.status}` };
    }
    const data = await resp.json();
    if (data.content) {
      const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
      const remoteData = JSON.parse(decoded);
      if (Array.isArray(remoteData)) {
        saveEvents(remoteData);
        await pullConfigFromGitHub();
      } else if (remoteData && typeof remoteData === 'object') {
        if (remoteData.events) saveEvents(remoteData.events);
        if (remoteData.categories) saveCategories(remoteData.categories);
        if (remoteData.members) saveMembers(remoteData.members);
        await pullConfigFromGitHub();
      }
      refreshAll();
      return { success: true };
    }
    return { success: false, error: 'no_content_in_response' };
  } catch (e) {
    console.error('Auto-pull error:', e);
    return { success: false, error: 'catch_' + e.message };
  }
}

async function manualSync() {
  let pat = localStorage.getItem('github_pat');
  if (!pat) {
    pat = prompt('請輸入 GitHub Personal Access Token (PAT) 以連接雲端：');
    if (!pat) return;
    localStorage.setItem('github_pat', pat.trim());
  }

  const btn    = document.getElementById('btn-github-sync');
  const status = document.getElementById('sync-status');
  const icon   = document.getElementById('sync-icon');
  if (btn) btn.disabled = true;
  if (icon) icon.textContent = '⏳';
  if (status) {
    status.textContent = '下載中…';
    status.className = 'sync-status syncing';
  }

  const result = await pullFromGitHub();
  
  if (btn) btn.disabled = false;
  if (result && result.success) {
    if (icon) icon.textContent = '✅';
    if (status) {
      status.textContent = '已更新至最新資料';
      status.className = 'sync-status success';
    }
    showToast('✅ 已成功從雲端載入最新資料');
  } else {
    if (icon) icon.textContent = '❌';
    if (status) {
      status.textContent = '下載失敗，請重試';
      status.className = 'sync-status error';
    }
    const errMsg = result ? result.error : 'unknown';
    alert('同步失敗詳細錯誤：' + errMsg);
  }
  setTimeout(() => { if (icon) icon.textContent = '☁️'; }, 3000);
}

async function syncToGitHub(silent = false) {
  if (typeof silent !== 'boolean') silent = false;
  const btn    = document.getElementById('btn-github-sync');
  const status = document.getElementById('sync-status');
  const icon   = document.getElementById('sync-icon');

  // Always pull first to get latest remote data (including locked members/categories)
  // Only then decide whether to push
  let pat = localStorage.getItem('github_pat');
  let isNewPat = false;
  if (!pat) {
    if (silent) return;
    pat = prompt(
      '請輸入 GitHub Personal Access Token (PAT)\n\n' +
      '取得方式：GitHub → Settings → Developer settings\n' +
      '→ Personal access tokens → Tokens (classic)\n' +
      '→ Generate new token → 勾選 repo → 複製'
    );
    if (!pat || !pat.trim()) return;
    localStorage.setItem('github_pat', pat.trim());
    pat = pat.trim();
    isNewPat = true;
  }

  // If this is a new device (just entered PAT), we should pull first to avoid overwriting remote data with an empty local calendar!
  if (isNewPat) {
    btn.disabled = true;
    icon.textContent = '⏳';
    status.textContent = '正在下載雲端行程…';
    status.className = 'sync-status syncing';
    
    const success = await pullFromGitHub();
    
    btn.disabled = false;
    if (success) {
      icon.textContent = '✅';
      status.textContent = '已成功載入雲端行程！';
      status.className = 'sync-status success';
      showToast('✅ 已成功從 GitHub 載入最新行程');
    } else {
      icon.textContent = '❌';
      status.textContent = '載入失敗，可能無雲端資料';
      status.className = 'sync-status error';
    }
    setTimeout(() => { icon.textContent = '☁️'; }, 3000);
    return;
  }

  // Update UI
  btn.disabled = true;
  icon.textContent = '⏳';
  status.textContent = '同步中…';
  status.className = 'sync-status syncing';

  try {
    let events  = loadEvents();
    let categories = loadCategories();
    let members = loadMembers();

    // Detect default members (only the 3 built-in ones, meaning data was never customized or was wiped)
    const DEFAULT_MEMBER_IDS = ['member-1', 'member-2', 'member-3'];
    const hasOnlyDefaultMembers = members.length === 3 &&
      members.every(m => DEFAULT_MEMBER_IDS.includes(m.id));

    // Safety check: if local members are still default, AUTO-PULL from remote first before deciding what to do
    if (hasOnlyDefaultMembers && !isNewPat) {
      // Auto pull — do NOT prompt, just pull silently to restore correct remote members/categories
      const success = await pullFromGitHub();
      btn.disabled = false;
      if (success) {
        icon.textContent = '✅';
        status.textContent = '已從 GitHub 還原成員及分類！';
        status.className = 'sync-status success';
        if (!silent) showToast('✅ 已從 GitHub 還原成員及分類');
      } else {
        icon.textContent = '❌';
        status.textContent = '下載失敗，請再試一次';
        status.className = 'sync-status error';
      }
      setTimeout(() => { icon.textContent = '☁️'; }, 3000);
      return;
    }

    // If local events are empty, confirm before potentially wiping remote
    if (events.length === 0 && !isNewPat) {
      if (confirm('本機沒有任何行程，要從 GitHub 下載嗎？\n(按「取消」會將 GitHub 上的資料清空)')) {
        const success = await pullFromGitHub();
        btn.disabled = false;
        if (success) {
          icon.textContent = '✅';
          status.textContent = '已成功載入雲端資料！';
          status.className = 'sync-status success';
          if (!silent) showToast('✅ 已成功從 GitHub 載入最新資料');
        } else {
          icon.textContent = '❌';
          status.textContent = '載入失敗或雲端無資料';
          status.className = 'sync-status error';
        }
        setTimeout(() => { icon.textContent = '☁️'; }, 3000);
        return;
      }
    }

    const syncData = { events, categories, members };
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(syncData, null, 2))));
    const headers = {
      'Authorization': `token ${pat}`,
      'Accept':        'application/vnd.github.v3+json',
      'Content-Type':  'application/json',
    };
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`;

    // Get current SHA (needed for update)
    let sha = null;
    const getResp = await fetch(apiUrl + '?t=' + Date.now(), { headers, cache: 'no-store' });
    if (getResp.ok) {
      const existing = await getResp.json();
      sha = existing.sha;
      // If remote has locked members, merge them in so we don't wipe custom data
      try {
        const remoteDecoded = decodeURIComponent(escape(atob(existing.content.replace(/\n/g, ''))));
        const remoteData = JSON.parse(remoteDecoded);
        if (remoteData && remoteData._lockedMembers && remoteData.members && remoteData.members.length > 0) {
          // Remote has authoritative members — use them instead of local defaults
          const DEFAULT_MEMBER_IDS = ['member-1', 'member-2', 'member-3'];
          const localHasDefaults = members.length === 3 && members.every(m => DEFAULT_MEMBER_IDS.includes(m.id));
          if (localHasDefaults) {
            members = remoteData.members;
            saveMembers(members);
          }
          if (remoteData.categories && remoteData.categories.length > categories.length) {
            categories = remoteData.categories;
            saveCategories(categories);
          }
        }
      } catch(e) { /* ignore parse errors */ }
    } else if (getResp.status !== 404) {
      const err = await getResp.json();
      if (err.message?.includes('Bad credentials')) {
        localStorage.removeItem('github_pat');
        throw new Error('PAT 無效，請重新設定');
      }
      throw new Error(err.message || '無法取得檔案資訊');
    }

    // Create or update file
    const body = {
      message: `sync: update events.json (${new Date().toLocaleString('zh-TW')})`,
      content,
      ...(sha ? { sha } : {}),
    };
    const putResp = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });

    if (!putResp.ok) {
      const err = await putResp.json();
      throw new Error(err.message || '更新失敗');
    }

    // Push config.json as well to keep members/categories synced
    await pushConfigToGitHub();

    icon.textContent = '✅';
    status.textContent = `已同步 ${events.length} 筆行程`;
    status.className = 'sync-status success';
    if (!silent) showToast(`✅ 已同步 ${events.length} 筆行程到 GitHub`);

  } catch (e) {
    console.error('Sync error:', e);
    icon.textContent = '❌';
    status.textContent = e.message || '同步失敗';
    status.className = 'sync-status error';
    if (!silent) showToast('❌ 同步失敗：' + (e.message || '未知錯誤'), 'error');
  } finally {
    btn.disabled = false;
    setTimeout(() => {
      icon.textContent = '☁️';
      if (status.className.includes('success')) {
        status.className = 'sync-status';
      }
    }, 5000);
  }
}

// ============================================================
// Auto Background Sync
// ============================================================

// 1. Pull on visibility change (e.g., coming back to the app from another tab/app)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // Auto download latest on startup
    setTimeout(() => {
      pullFromGitHub();
    }, 1000);
  }
});

// 2. Poll every 5 minutes while the app is open
setInterval(() => {
  pullFromGitHub();
}, 5 * 60 * 1000);

// ── Repeat Event Action Logic ─────────────────────────────────
let pendingRepeatAction = null; 
let pendingRepeatData = null;

function promptRepeatAction(action, data) {
  pendingRepeatAction = action;
  pendingRepeatData = data;
  openModal('repeat-action-modal');
}

document.getElementById('btn-repeat-only-this')?.addEventListener('click', () => executeRepeatAction('only-this'));
document.getElementById('btn-repeat-following')?.addEventListener('click', () => executeRepeatAction('following'));
document.getElementById('btn-repeat-all')?.addEventListener('click', () => executeRepeatAction('all'));
document.getElementById('btn-repeat-cancel')?.addEventListener('click', () => closeModal('repeat-action-modal'));

function executeRepeatAction(scope) {
  closeModal('repeat-action-modal');
  if (!editingEventId || !editingEvent) return;
  
  if (pendingRepeatAction === 'delete') {
    if (scope === 'all') {
      deleteEvent(editingEventId);
    } else if (scope === 'only-this') {
      const excludes = editingEvent.excludeDates || [];
      if (!excludes.includes(editingEventInstanceDate)) excludes.push(editingEventInstanceDate);
      updateEvent(editingEventId, { excludeDates: excludes });
    } else if (scope === 'following') {
      const prevDate = new Date(editingEventInstanceDate + 'T12:00:00');
      prevDate.setDate(prevDate.getDate() - 1);
      updateEvent(editingEventId, { repeatEndType: 'date', repeatEndDate: toDateStr(prevDate) });
    }
    showToast('活動已刪除');
  } else if (pendingRepeatAction === 'save') {
    const data = pendingRepeatData;
    if (scope === 'all') {
      const formDateStr = data.datetime.slice(0, 10);
      if (formDateStr !== editingEventInstanceDate) {
        const diffDays = Math.round((new Date(formDateStr) - new Date(editingEventInstanceDate)) / 86400000);
        const origD = new Date(editingEvent.datetime.slice(0,10) + 'T12:00:00');
        origD.setDate(origD.getDate() + diffDays);
        data.datetime = toDateStr(origD) + data.datetime.slice(10);
        
        if (data.endDatetime && editingEvent.endDatetime) {
          const origEndD = new Date(editingEvent.endDatetime.slice(0,10) + 'T12:00:00');
          origEndD.setDate(origEndD.getDate() + diffDays);
          data.endDatetime = toDateStr(origEndD) + data.endDatetime.slice(10);
        }
      } else {
        data.datetime = editingEvent.datetime.slice(0, 10) + data.datetime.slice(10);
        if (data.endDatetime && editingEvent.endDatetime) {
          data.endDatetime = editingEvent.endDatetime.slice(0, 10) + data.endDatetime.slice(10);
        }
      }
      updateEvent(editingEventId, data);
    } else if (scope === 'only-this') {
      const excludes = editingEvent.excludeDates || [];
      if (!excludes.includes(editingEventInstanceDate)) excludes.push(editingEventInstanceDate);
      updateEvent(editingEventId, { excludeDates: excludes });
      data.repeat = 'none';
      createEvent(data);
    } else if (scope === 'following') {
      const prevDate = new Date(editingEventInstanceDate + 'T12:00:00');
      prevDate.setDate(prevDate.getDate() - 1);
      updateEvent(editingEventId, { repeatEndType: 'date', repeatEndDate: toDateStr(prevDate) });
      createEvent(data);
    }
    showToast('活動已更新 ✓');
  }
  
  closeModal('event-modal');
  closeModal('event-view-modal');
  refreshAll();
  syncToGitHub(true);
}
