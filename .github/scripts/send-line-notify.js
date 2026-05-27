// ============================================================
// send-line-notify.js
// GitHub Actions 每日行程通知腳本 — LINE Messaging API
// ============================================================

const fs    = require('fs');
const https = require('https');

const TOKEN   = process.env.LINE_CHANNEL_TOKEN;

if (!TOKEN) {
  console.error('❌ 缺少 LINE_CHANNEL_TOKEN');
  process.exit(1);
}

// ── 讀取行程資料 ─────────────────────────────────────────────
let events = [];
try {
  const raw = fs.readFileSync('data/events.json', 'utf8');
  const parsed = JSON.parse(raw);
  events = parsed.events || [];
  console.log(`ℹ️  共讀取 ${events.length} 筆行程`);
} catch (e) {
  console.log('ℹ️  讀取 data/events.json 失敗，以空行程傳送通知:', e.message);
}

// ── 取得台灣今天的日期 (UTC+8) ───────────────────────────────
const nowUTC    = new Date();
const taiwanNow = new Date(nowUTC.getTime() + 8 * 3600000);
const todayStr  = taiwanNow.toISOString().slice(0, 10); // YYYY-MM-DD
const month     = taiwanNow.getUTCMonth() + 1;
const day       = taiwanNow.getUTCDate();
const WEEKDAYS  = ['日','一','二','三','四','五','六'];
const weekday   = WEEKDAYS[taiwanNow.getUTCDay()];

console.log(`📅 查詢日期：${todayStr}`);

// ── 判斷行程是否發生在今天 ───────────────────────────────────
function occursToday(ev) {
  const startStr = (ev.datetime || '').slice(0, 10);
  if (!startStr) return false;

  const startDate = new Date(startStr + 'T00:00:00Z');
  const todayDate = new Date(todayStr  + 'T00:00:00Z');

  // 重複結束日判斷
  if (ev.repeatEndType === 'date' && ev.repeatEndDate && todayStr > ev.repeatEndDate) return false;

  const repeat = ev.repeat || 'none';

  // 非重複事件
  if (repeat === 'none') {
    if (ev.allDay) {
      const endStr = ev.endDatetime ? ev.endDatetime.slice(0, 10) : startStr;
      return todayStr >= startStr && todayStr <= endStr;
    }
    return startStr === todayStr;
  }

  if (todayDate < startDate) return false;
  const diffDays = Math.round((todayDate - startDate) / 86400000);

  switch (repeat) {
    case 'daily':
      return true;
    case 'weekly':
      if (ev.repeatWeeklyDays && ev.repeatWeeklyDays.length > 0)
        return ev.repeatWeeklyDays.includes(taiwanNow.getUTCDay());
      return diffDays % 7 === 0;
    case 'monthly': {
      const target = ev.repeatMonthlyDate || startDate.getUTCDate();
      return taiwanNow.getUTCDate() === target;
    }
    case 'yearly':
      return taiwanNow.getUTCMonth() === startDate.getUTCMonth()
          && taiwanNow.getUTCDate()  === startDate.getUTCDate();
    default:
      return false;
  }
}

// ── 篩選並排序今日行程 ───────────────────────────────────────
const todayEvents = events
  .filter(occursToday)
  .sort((a, b) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    return (a.datetime || '').localeCompare(b.datetime || '');
  });

console.log(`✅ 今日行程：${todayEvents.length} 筆`);

// ── 組合訊息內容 ─────────────────────────────────────────────
let msg = `📅 ${month}月${day}日（星期${weekday}）\n\n`;

if (todayEvents.length === 0) {
  msg += '今天沒有行程，輕鬆的一天！😊\n\n';
} else {
  todayEvents.forEach(ev => {
    const timeStr = ev.allDay
      ? '整天'
      : (ev.datetime || '').slice(11, 16);
    const endStr  = (!ev.allDay && ev.endDatetime)
      ? ` - ${ev.endDatetime.slice(11, 16)}`
      : '';
    const icon = ev.allDay ? '🔵' : '⏰';
    msg += `${icon} ${timeStr}${endStr}  ${ev.title}\n`;
    if (ev.location)    msg += `📍 ${ev.location}\n`;
    if (ev.description) msg += `📝 ${ev.description.slice(0, 50)}\n`;
    msg += '\n';
  });
}

msg += '🔗 Family Calendar';

// ── 透過 LINE Messaging API 傳送 Push Message ────────────────
function sendLine(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      messages: [{ type: 'text', text }],
    });

    const req = https.request({
      hostname: 'api.line.me',
      path:     '/v2/bot/message/broadcast',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${TOKEN}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ LINE 訊息傳送成功！');
          resolve();
        } else {
          console.error(`❌ 失敗 ${res.statusCode}: ${data}`);
          reject(new Error(`LINE API error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

sendLine(msg)
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
