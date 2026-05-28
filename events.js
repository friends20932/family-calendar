// ============================================================
// events.js — Event CRUD + localStorage
// ============================================================

const STORAGE_KEY = 'family_calendar_events';

export function loadEvents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

export function saveEvents(events) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

export function createEvent(data) {
  const events = loadEvents();
  const newEvent = {
    id: crypto.randomUUID(),
    title: data.title,
    datetime: data.datetime,
    endDatetime: data.endDatetime || null,
    allDay: data.allDay || false,
    url: data.url || '',
    description: data.description || '',
    location: data.location || '',
    category: data.category || 'family',
    color: data.color || null,
    memberIds: data.memberIds || [],
    reminder: data.reminder || '30',
    repeat: data.repeat || 'none',
    repeatEndType: data.repeatEndType || 'never', // never, date, count
    repeatEndDate: data.repeatEndDate || null,
    repeatEndCount: parseInt(data.repeatEndCount, 10) || 10,
    repeatWeeklyDays: Array.isArray(data.repeatWeeklyDays) ? data.repeatWeeklyDays.map(Number) : [],
    repeatMonthlyDate: parseInt(data.repeatMonthlyDate, 10) || 1,
    excludeDates: Array.isArray(data.excludeDates) ? data.excludeDates : [],
    createdAt: new Date().toISOString(),
  };
  events.push(newEvent);
  saveEvents(events);
  return newEvent;
}

export function updateEvent(id, data) {
  const events = loadEvents();
  const idx = events.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  events[idx] = { ...events[idx], ...data, id };
  saveEvents(events);
  return events[idx];
}

export function deleteEvent(id) {
  const events = loadEvents().filter((e) => e.id !== id);
  saveEvents(events);
}

// Generates instances of an event up to maxDateObj
function generateInstances(ev, maxDateObj) {
  const instances = [];
  const start = new Date(ev.datetime);
  const startD = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  
  let cursor = new Date(startD);
  let count = 0;
  
  const endType = ev.repeatEndType || 'never';
  const endCount = parseInt(ev.repeatEndCount, 10) || 10;
  
  // Handling legacy repeatUntil if present
  let endDateStr = ev.repeatEndDate || ev.repeatUntil;
  const endDate = endDateStr ? new Date(endDateStr + 'T23:59:59') : new Date('2099-12-31');
  
  const max = maxDateObj < endDate ? maxDateObj : endDate;
  
  if (ev.repeat === 'none' || !ev.repeat) {
    // Multi-day all-day event: return one instance per day in range
    if (ev.allDay && ev.endDatetime) {
      const evEndD = new Date(ev.endDatetime.slice(0, 10) + 'T00:00:00');
      const days = [];
      let cur = new Date(startD);
      while (cur <= maxDateObj && cur <= evEndD) {
        days.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
      return days;
    }
    if (startD <= max) return [startD];
    return [];
  }
  
  if (ev.repeat === 'daily') {
    while (cursor <= max && (endType !== 'count' || count < endCount)) {
      if (!ev.excludeDates?.includes(toDateStr(cursor))) {
        instances.push(new Date(cursor));
      }
      count++;
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (ev.repeat === 'weekly') {
    const days = ev.repeatWeeklyDays && ev.repeatWeeklyDays.length ? ev.repeatWeeklyDays : [start.getDay()];
    // sort days to ensure instances are generated in order within the week
    const sortedDays = [...days].sort((a,b) => a-b);
    cursor.setDate(cursor.getDate() - cursor.getDay()); // Start of week (Sunday)
    while (cursor <= max && (endType !== 'count' || count < endCount)) {
      for (let d of sortedDays) {
        const inst = new Date(cursor);
        inst.setDate(inst.getDate() + d);
        if (inst >= startD && inst <= max) {
          if (endType === 'count' && count >= endCount) break;
          if (!ev.excludeDates?.includes(toDateStr(inst))) {
            instances.push(inst);
          }
          count++;
        }
      }
      cursor.setDate(cursor.getDate() + 7);
    }
  } else if (ev.repeat === 'monthly') {
    const targetDate = ev.repeatMonthlyDate || start.getDate();
    cursor.setDate(1); 
    while (cursor <= max && (endType !== 'count' || count < endCount)) {
      const inst = new Date(cursor.getFullYear(), cursor.getMonth(), targetDate);
      if (inst >= startD && inst <= max && inst.getMonth() === cursor.getMonth()) {
        if (!ev.excludeDates?.includes(toDateStr(inst))) {
          instances.push(inst);
        }
        count++;
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else if (ev.repeat === 'yearly') {
    while (cursor <= max && (endType !== 'count' || count < endCount)) {
      if (!ev.excludeDates?.includes(toDateStr(cursor))) {
        instances.push(new Date(cursor));
      }
      count++;
      cursor.setFullYear(cursor.getFullYear() + 1);
    }
  }
  
  return instances;
}

export function getEventsForMonth(year, month) {
  const all = loadEvents();
  const results = [];
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);

  all.forEach((ev) => {
    const dates = generateInstances(ev, monthEnd);
    for (let d of dates) {
      if (d >= monthStart && d <= monthEnd) {
        const ds = toDateStr(d);
        const evDate = new Date(ev.datetime);
        const instDate = new Date(d);
        instDate.setHours(evDate.getHours(), evDate.getMinutes(), evDate.getSeconds());
        results.push({ ...ev, _displayDate: ds, _instanceDate: instDate.toISOString() });
      }
    }
  });
  return results;
}

export function getEventsForDate(dateStr) {
  const all = loadEvents();
  const results = [];
  const target = new Date(dateStr + 'T23:59:59');

  all.forEach((ev) => {
    const dates = generateInstances(ev, target);
    if (dates.some(d => toDateStr(d) === dateStr)) {
      results.push({ ...ev, _displayDate: dateStr });
    }
  });

  return results.sort((a, b) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    const timeA = a.datetime.slice(11) || "00:00";
    const timeB = b.datetime.slice(11) || "00:00";
    return timeA.localeCompare(timeB);
  });
}

export function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
