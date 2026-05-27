// ============================================================
// calendar.js — Calendar rendering (month / week / day views)
// ============================================================

import { getEventsForMonth, getEventsForDate, loadEvents, toDateStr } from './events.js';
import { loadMembers } from './members.js';
import { getCategoryColor } from './categories.js';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS_ZH = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

export class CalendarRenderer {
  constructor({ container, onDateClick, onEventClick, onNewEvent }) {
    this.container = container;
    this.onDateClick = onDateClick;
    this.onEventClick = onEventClick;
    this.onNewEvent = onNewEvent;
    this.view = 'month'; // month | week | day
    this.today = new Date();
    this.cursor = new Date(); // currently viewed date
  }

  get year() { return this.cursor.getFullYear(); }
  get month() { return this.cursor.getMonth(); }

  setView(view) {
    this.view = view;
    this.render();
  }

  navigate(dir) {
    // dir: -1 (prev) | 1 (next)
    if (this.view === 'month') {
      this.cursor.setMonth(this.cursor.getMonth() + dir);
    } else if (this.view === 'week') {
      this.cursor.setDate(this.cursor.getDate() + dir * 7);
    } else {
      this.cursor.setDate(this.cursor.getDate() + dir);
    }
    this.render();
  }

  goToday() {
    this.cursor = new Date();
    this.render();
  }

  goToDate(dateStr) {
    this.cursor = new Date(dateStr + 'T12:00:00');
    this.render();
  }

  render() {
    this.container.innerHTML = '';
    if (this.view === 'month') this._renderMonth();
    else if (this.view === 'week') this._renderWeek();
    else this._renderDay();
  }

  // ── MONTH VIEW ─────────────────────────────────────────────
  _renderMonth() {
    const year = this.year;
    const month = this.month;
    const events = getEventsForMonth(year, month);
    const members = loadMembers();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();

    const grid = document.createElement('div');
    grid.className = 'cal-month-grid';

    // Weekday headers
    WEEKDAYS.forEach((d, i) => {
      const hd = document.createElement('div');
      hd.className = 'cal-weekday-header' + (i === 0 ? ' sunday' : i === 6 ? ' saturday' : '');
      hd.textContent = d;
      grid.appendChild(hd);
    });

    // Previous month's trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
      const cell = this._createDayCell(prevDays - i, null, true);
      grid.appendChild(cell);
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = toDateStr(new Date(year, month, d));
      const dayEvents = events.filter((e) => e._displayDate === dateStr);
      const isToday = dateStr === toDateStr(this.today);
      const cell = this._createDayCell(d, dateStr, false, isToday, dayEvents, members);
      grid.appendChild(cell);
    }

    // Next month's leading days
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    for (let i = 1; i <= totalCells - firstDay - daysInMonth; i++) {
      const cell = this._createDayCell(i, null, true);
      grid.appendChild(cell);
    }

    this.container.appendChild(grid);
  }

  _createDayCell(day, dateStr, faded, isToday = false, events = [], members = []) {
    const cell = document.createElement('div');
    cell.className = 'cal-day-cell' + (faded ? ' faded' : '') + (isToday ? ' today' : '');
    if (dateStr) {
      cell.addEventListener('click', (e) => {
        if (e.target === cell || e.target.classList.contains('cal-day-num')) {
          this.onDateClick?.(dateStr);
        }
      });
    }

    const numEl = document.createElement('span');
    numEl.className = 'cal-day-num';
    numEl.textContent = day;
    cell.appendChild(numEl);

    const evContainer = document.createElement('div');
    evContainer.className = 'cal-day-events';

    const maxVisible = 3;
    events.slice(0, maxVisible).forEach((ev) => {
      const pill = this._createEventPill(ev, members);
      evContainer.appendChild(pill);
    });

    if (events.length > maxVisible) {
      const more = document.createElement('div');
      more.className = 'cal-event-more';
      more.textContent = `+${events.length - maxVisible} 更多`;
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onDateClick?.(dateStr);
      });
      evContainer.appendChild(more);
    }

    cell.appendChild(evContainer);

    // Double-click to add event
    if (dateStr) {
      cell.addEventListener('dblclick', () => this.onNewEvent?.(dateStr));
    }

    return cell;
  }

  _createEventPill(ev, members) {
    const pill = document.createElement('div');
    pill.className = 'cal-event-pill';
    const member = members.find((m) => ev.memberIds?.includes(m.id));
    const color = ev.color || member?.color || getCategoryColor(ev.category);
    pill.style.setProperty('--ev-color', color);

    pill.innerHTML = `<span class="ev-dot"></span><span class="ev-title">${escapeHtml(ev.title)}</span>`;
    if (!ev.allDay) {
      const time = formatTime(ev.datetime);
      pill.innerHTML = `<span class="ev-dot"></span><span class="ev-time">${time}</span><span class="ev-title">${escapeHtml(ev.title)}</span>`;
    }

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onEventClick?.(ev);
    });
    return pill;
  }

  // ── WEEK VIEW ──────────────────────────────────────────────
  _renderWeek() {
    const startOfWeek = new Date(this.cursor);
    startOfWeek.setDate(this.cursor.getDate() - this.cursor.getDay());
    const members = loadMembers();

    const wrapper = document.createElement('div');
    wrapper.className = 'cal-week-wrapper';

    const header = document.createElement('div');
    header.className = 'cal-week-header';

    const timeLabelSpacer = document.createElement('div');
    timeLabelSpacer.className = 'cal-time-spacer';
    header.appendChild(timeLabelSpacer);

    const cols = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dateStr = toDateStr(d);
      const isToday = dateStr === toDateStr(this.today);

      const col = document.createElement('div');
      col.className = 'cal-week-day-header' + (isToday ? ' today' : '');
      col.innerHTML = `<div class="week-day-name">${WEEKDAYS[i]}</div><div class="week-day-num ${isToday ? 'today-badge' : ''}">${d.getDate()}</div>`;
      col.addEventListener('click', () => this.onDateClick?.(dateStr));
      header.appendChild(col);
      cols.push({ dateStr, isToday });
    }

    // ── All-day strip ──
    const allDayRow = this._buildWeekAllDayStrip(cols, members);

    const body = document.createElement('div');
    body.className = 'cal-week-body';

    // Time slots
    const timeCol = document.createElement('div');
    timeCol.className = 'cal-time-col';
    for (let h = 0; h < 24; h++) {
      const slot = document.createElement('div');
      slot.className = 'cal-time-label';
      slot.textContent = h === 0 ? '' : `${String(h).padStart(2, '0')}:00`;
      timeCol.appendChild(slot);
    }
    body.appendChild(timeCol);

    cols.forEach(({ dateStr, isToday }) => {
      const dayEvents = getEventsForDate(dateStr).filter((e) => !e.allDay);
      const dayCol = document.createElement('div');
      dayCol.className = 'cal-week-day-col' + (isToday ? ' today-col' : '');
      dayCol.addEventListener('dblclick', (e) => {
        const rect = dayCol.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const hour = Math.floor((relY / rect.height) * 24);
        const dt = `${dateStr}T${String(hour).padStart(2, '0')}:00`;
        this.onNewEvent?.(dateStr, dt);
      });

      // Hour lines
      for (let h = 0; h < 24; h++) {
        const line = document.createElement('div');
        line.className = 'cal-hour-line';
        dayCol.appendChild(line);
      }

      // Event blocks
      dayEvents.forEach((ev) => {
        const block = this._createWeekEventBlock(ev, members);
        dayCol.appendChild(block);
      });

      body.appendChild(dayCol);
    });

    // Current time indicator
    const nowLine = document.createElement('div');
    nowLine.className = 'cal-now-line';
    const nowPct = ((this.today.getHours() * 60 + this.today.getMinutes()) / 1440) * 100;
    nowLine.style.top = `${nowPct}%`;

    const todayColEl = body.querySelector('.today-col');
    if (todayColEl) todayColEl.appendChild(nowLine);

    wrapper.appendChild(header);
    if (allDayRow) wrapper.appendChild(allDayRow);
    wrapper.appendChild(body);
    this.container.appendChild(wrapper);

    // Scroll to current time
    setTimeout(() => {
      const scrollTo = (nowPct / 100) * body.scrollHeight - 100;
      body.scrollTop = Math.max(0, scrollTo);
    }, 50);
  }

  _buildWeekAllDayStrip(cols, members) {
    // Use midnight for all boundaries — avoids Math.round(3.9999) → 4 bug
    const weekStart = new Date(cols[0].dateStr + 'T00:00:00');
    const weekEnd   = new Date(cols[6].dateStr + 'T00:00:00');

    // Collect all-day events (non-repeating) that overlap this week
    const items = [];
    const seenIds = new Set();

    loadEvents().filter(ev => ev.allDay && (ev.repeat === 'none' || !ev.repeat)).forEach(ev => {
      const evStart = new Date(ev.datetime.slice(0, 10) + 'T00:00:00');
      // If no endDatetime, treat as same day (midnight of start day)
      const evEndStr = ev.endDatetime ? ev.endDatetime.slice(0, 10) : ev.datetime.slice(0, 10);
      const evEnd = new Date(evEndStr + 'T00:00:00');

      // Overlap check: event ends before week starts OR event starts after week ends
      if (evEnd < weekStart || evStart > weekEnd) return;

      const clampedStart = evStart < weekStart ? weekStart : evStart;
      const clampedEnd   = evEnd   > weekEnd   ? weekEnd   : evEnd;

      // Math.floor is safe since all values are exact midnight boundaries
      const startCol = Math.floor((clampedStart - weekStart) / 86400000);
      const endCol   = Math.floor((clampedEnd   - weekStart) / 86400000);
      const span = Math.max(1, endCol - startCol + 1);
      seenIds.add(ev.id);
      items.push({ ev, startCol, span });
    });

    // Also pick up repeating all-day events (each occurrence = 1 day)
    cols.forEach(({ dateStr }, colIdx) => {
      getEventsForDate(dateStr)
        .filter(ev => ev.allDay && ev.repeat && ev.repeat !== 'none' && !seenIds.has(ev.id))
        .forEach(ev => {
          seenIds.add(ev.id + '_' + colIdx);
          items.push({ ev, startCol: colIdx, span: 1 });
        });
    });

    if (!items.length) return null;

    // Greedy row stacking (no overlaps)
    items.sort((a, b) => a.startCol - b.startCol || b.span - a.span);
    const rows = [];
    items.forEach(item => {
      let placed = false;
      for (let r = 0; r < rows.length; r++) {
        const conflict = rows[r].some(it =>
          !(it.startCol + it.span <= item.startCol || item.startCol + item.span <= it.startCol)
        );
        if (!conflict) { item.row = r; rows[r].push(item); placed = true; break; }
      }
      if (!placed) { item.row = rows.length; rows.push([item]); }
    });

    const ROW_H = 22;
    const PAD   = 3;
    const totalH = rows.length * ROW_H + PAD * 2;

    const strip = document.createElement('div');
    strip.className = 'cal-week-allday-row';

    const label = document.createElement('div');
    label.className = 'cal-time-spacer cal-allday-label';
    label.textContent = '整天';
    strip.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'cal-allday-grid';
    grid.style.minHeight = totalH + 'px';

    // Background day columns
    cols.forEach(({ isToday }) => {
      const bg = document.createElement('div');
      bg.className = 'cal-allday-bg-cell' + (isToday ? ' today-col' : '');
      grid.appendChild(bg);
    });

    // Spanning event bars
    items.forEach(({ ev, startCol, span, row }) => {
      const member = members.find(m => ev.memberIds?.includes(m.id));
      const color  = ev.color || member?.color || getCategoryColor(ev.category);
      const bar = document.createElement('div');
      bar.className = 'cal-allday-event-bar';
      bar.style.cssText = [
        `left: calc(${startCol} / 7 * 100% + 2px)`,
        `width: calc(${span} / 7 * 100% - 6px)`,
        `top: ${PAD + row * ROW_H}px`,
        `--ev-color: ${color}`,
      ].join(';');
      bar.textContent = ev.title;
      bar.title = ev.title;
      bar.addEventListener('click', e => { e.stopPropagation(); this.onEventClick?.(ev); });
      grid.appendChild(bar);
    });

    strip.appendChild(grid);
    return strip;
  }

  _createWeekEventBlock(ev, members) {
    const start = new Date(ev.datetime);
    const end = ev.endDatetime ? new Date(ev.endDatetime) : new Date(start.getTime() + 60 * 60 * 1000);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = end.getHours() * 60 + end.getMinutes();
    const topPct = (startMin / 1440) * 100;
    const heightPct = Math.max(((endMin - startMin) / 1440) * 100, 2);

    const member = members.find((m) => ev.memberIds?.includes(m.id));
    const color = ev.color || member?.color || getCategoryColor(ev.category);

    const block = document.createElement('div');
    block.className = 'cal-week-event';
    block.style.top = `${topPct}%`;
    block.style.height = `${heightPct}%`;
    block.style.setProperty('--ev-color', color);
    block.innerHTML = `
      <div class="we-title">${escapeHtml(ev.title)}</div>
      <div class="we-time">${formatTime(ev.datetime)}</div>
    `;
    block.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onEventClick?.(ev);
    });
    return block;
  }

  // ── DAY VIEW ───────────────────────────────────────────────
  _renderDay() {
    const dateStr = toDateStr(this.cursor);
    const dayEvents = getEventsForDate(dateStr);
    const allDayEvents = dayEvents.filter((e) => e.allDay);
    const timedEvents = dayEvents.filter((e) => !e.allDay);
    const members = loadMembers();

    const wrapper = document.createElement('div');
    wrapper.className = 'cal-day-wrapper';

    // All-day section
    if (allDayEvents.length) {
      const allDay = document.createElement('div');
      allDay.className = 'cal-day-allday';
      allDayEvents.forEach((ev) => {
        const pill = this._createEventPill(ev, members);
        pill.classList.add('allday-pill');
        allDay.appendChild(pill);
      });
      wrapper.appendChild(allDay);
    }

    const body = document.createElement('div');
    body.className = 'cal-day-body';

    const timeCol = document.createElement('div');
    timeCol.className = 'cal-time-col';
    const evCol = document.createElement('div');
    evCol.className = 'cal-day-ev-col';

    for (let h = 0; h < 24; h++) {
      const label = document.createElement('div');
      label.className = 'cal-time-label';
      label.textContent = h === 0 ? '' : `${String(h).padStart(2, '0')}:00`;
      timeCol.appendChild(label);

      const row = document.createElement('div');
      row.className = 'cal-hour-row';
      row.addEventListener('dblclick', () => {
        const dt = `${dateStr}T${String(h).padStart(2, '0')}:00`;
        this.onNewEvent?.(dateStr, dt);
      });
      evCol.appendChild(row);
    }

    timedEvents.forEach((ev) => {
      const block = this._createWeekEventBlock(ev, members);
      block.style.width = '95%';
      evCol.appendChild(block);
    });

    // Now line
    if (dateStr === toDateStr(this.today)) {
      const nowLine = document.createElement('div');
      nowLine.className = 'cal-now-line';
      const nowPct = ((this.today.getHours() * 60 + this.today.getMinutes()) / 1440) * 100;
      nowLine.style.top = `${nowPct}%`;
      evCol.appendChild(nowLine);
    }

    body.appendChild(timeCol);
    body.appendChild(evCol);
    wrapper.appendChild(body);
    this.container.appendChild(wrapper);

    const nowPct = ((this.today.getHours() * 60 + this.today.getMinutes()) / 1440) * 100;
    setTimeout(() => {
      body.scrollTop = Math.max(0, (nowPct / 100) * body.scrollHeight - 100);
    }, 50);
  }
}

// ── Helpers ────────────────────────────────────────────────
export function formatTime(datetime) {
  const d = new Date(datetime);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
