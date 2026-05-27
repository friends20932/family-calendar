// ============================================================
// notifications.js — Web Push + reminder scheduling
// ============================================================

let swRegistration = null;

export async function initNotifications() {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    console.warn('Notifications not supported');
    return false;
  }
  try {
    swRegistration = await navigator.serviceWorker.register('./sw.js');
    console.log('Service Worker registered:', swRegistration);
    return true;
  } catch (err) {
    console.error('SW registration failed:', err);
    return false;
  }
}

export function getNotificationPermission() {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'denied';
  const result = await Notification.requestPermission();
  return result;
}

export function scheduleLocalReminders(events) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  // Clear old timers
  if (window._reminderTimers) {
    window._reminderTimers.forEach(clearTimeout);
  }
  window._reminderTimers = [];

  const now = Date.now();
  events.forEach((ev) => {
    if (!ev.reminder || ev.reminder === 'none') return;
    const reminderMs = parseInt(ev.reminder, 10) * 60 * 1000;
    const eventTime = new Date(ev.datetime).getTime();
    const triggerTime = eventTime - reminderMs;
    const delay = triggerTime - now;

    if (delay > 0 && delay < 7 * 24 * 60 * 60 * 1000) {
      // Schedule within 7 days
      const timer = setTimeout(() => {
        showLocalNotification(ev);
      }, delay);
      window._reminderTimers.push(timer);
    }
  });
}

function showLocalNotification(ev) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reminderLabel = getReminderLabel(ev.reminder);
  const notif = new Notification(`⏰ ${ev.title}`, {
    body: `${reminderLabel}後開始${ev.location ? '\n📍 ' + ev.location : ''}`,
    icon: './icon-192.png',
    tag: `event-${ev.id}`,
    requireInteraction: false,
  });
  notif.onclick = () => {
    window.focus();
    notif.close();
  };
}

function getReminderLabel(minutes) {
  const m = parseInt(minutes, 10);
  if (m < 60) return `${m} 分鐘`;
  if (m === 60) return `1 小時`;
  if (m < 1440) return `${m / 60} 小時`;
  return `${m / 1440} 天`;
}

// Periodic check via SW message
export function startPeriodicCheck(events) {
  if (!navigator.serviceWorker.controller) return;
  setInterval(() => {
    navigator.serviceWorker.controller?.postMessage({
      type: 'SCHEDULE_CHECK',
      events,
    });
  }, 60000); // every minute
}
