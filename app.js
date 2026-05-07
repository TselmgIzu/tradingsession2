import { SESSIONS, SESSION_MAP, OVERLAPS } from './sessions.js';
import { getSessionHours, isHoliday, getHolidayName, toUTCDateString } from './holidays.js';

let isMarketHoliday = false;

// ---------- Timezone (numeric GMT offset, picked via slider) ----------

const TZ_STORAGE_KEY = 'fx_user_offset_min';

// Every commonly-used GMT offset, including half/quarter-hour zones.
// Values are minutes from UTC.
const OFFSET_OPTIONS = [
  -720,        // GMT-12  (Baker Island)
  -660,        // GMT-11  (American Samoa)
  -600,        // GMT-10  (Hawaii)
  -570,        // GMT-9:30 (Marquesas)
  -540,        // GMT-9   (Alaska)
  -480,        // GMT-8   (Los Angeles)
  -420,        // GMT-7   (Denver)
  -360,        // GMT-6   (Chicago, Mexico City)
  -300,        // GMT-5   (New York, Toronto)
  -240,        // GMT-4   (Halifax, Caracas)
  -210,        // GMT-3:30 (St. John's)
  -180,        // GMT-3   (Buenos Aires, São Paulo)
  -120,        // GMT-2   (Mid-Atlantic)
  -60,         // GMT-1   (Azores)
  0,           // GMT+0   (London winter, Lisbon, Reykjavik)
  60,          // GMT+1   (Berlin, Paris, Budapest, Lagos)
  120,         // GMT+2   (Athens, Cairo, Johannesburg)
  180,         // GMT+3   (Moscow, Istanbul, Riyadh)
  210,         // GMT+3:30 (Tehran)
  240,         // GMT+4   (Dubai, Baku)
  270,         // GMT+4:30 (Kabul)
  300,         // GMT+5   (Karachi, Tashkent)
  330,         // GMT+5:30 (India, Sri Lanka)
  345,         // GMT+5:45 (Nepal)
  360,         // GMT+6   (Dhaka, Almaty)
  390,         // GMT+6:30 (Yangon)
  420,         // GMT+7   (Bangkok, Jakarta)
  480,         // GMT+8   (Singapore, Hong Kong, Beijing, Perth)
  525,         // GMT+8:45 (Eucla)
  540,         // GMT+9   (Tokyo, Seoul)
  570,         // GMT+9:30 (Adelaide, Darwin)
  600,         // GMT+10  (Sydney, Melbourne, Brisbane)
  630,         // GMT+10:30 (Lord Howe)
  660,         // GMT+11  (Solomon Islands, Noumea)
  720,         // GMT+12  (Auckland, Fiji)
  765,         // GMT+12:45 (Chatham Islands)
  780,         // GMT+13  (Tonga, Samoa)
  840          // GMT+14  (Kiribati)
];

const DEFAULT_INDEX = OFFSET_OPTIONS.indexOf(0); // GMT+0

const AUTO_OFFSET_MIN = -new Date().getTimezoneOffset(); // browser-detected

function nearestOffsetIndex(minutes) {
  let best = 0, bestDiff = Infinity;
  for (let i = 0; i < OFFSET_OPTIONS.length; i++) {
    const diff = Math.abs(OFFSET_OPTIONS[i] - minutes);
    if (diff < bestDiff) { best = i; bestDiff = diff; }
  }
  return best;
}

function loadStoredOffset() {
  try {
    const v = localStorage.getItem(TZ_STORAGE_KEY);
    if (v == null) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

let USER_OFFSET_MIN = (() => {
  const stored = loadStoredOffset();
  if (stored != null && OFFSET_OPTIONS.includes(stored)) return stored;
  // Snap auto-detected offset to nearest supported value
  return OFFSET_OPTIONS[nearestOffsetIndex(AUTO_OFFSET_MIN)];
})();

function setUserOffset(minutes, persist = true) {
  USER_OFFSET_MIN = minutes;
  if (persist) {
    try { localStorage.setItem(TZ_STORAGE_KEY, String(minutes)); } catch {}
  } else {
    try { localStorage.removeItem(TZ_STORAGE_KEY); } catch {}
  }
  renderLegend(new Date());
  tick();
}

function formatOffsetLabel(minutes) {
  const sign = minutes >= 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `GMT${sign}${h}` : `GMT${sign}${h}:${String(m).padStart(2, '0')}`;
}

/** Convert a UTC Date to a "shifted" Date whose UTC fields equal the local time. */
function shiftDate(date, offsetMin = USER_OFFSET_MIN) {
  return new Date(date.getTime() + offsetMin * 60000);
}

// ---------- Timezone dropdown UI ----------

// Friendly hint of cities for each offset (purely cosmetic — shown in option label)
const OFFSET_HINTS = {
  [-720]: 'Baker Island',
  [-660]: 'Samoa',
  [-600]: 'Hawaii',
  [-570]: 'Marquesas',
  [-540]: 'Alaska',
  [-480]: 'Los Angeles',
  [-420]: 'Denver',
  [-360]: 'Chicago, Mexico City',
  [-300]: 'New York, Toronto',
  [-240]: 'Halifax, Caracas',
  [-210]: "St. John's",
  [-180]: 'Buenos Aires, São Paulo',
  [-120]: 'Mid-Atlantic',
  [-60]:  'Azores',
  [0]:    'London (winter), Lisbon, UTC',
  [60]:   'Berlin, Paris, Budapest, Lagos',
  [120]:  'Athens, Cairo, Johannesburg',
  [180]:  'Moscow, Istanbul, Riyadh',
  [210]:  'Tehran',
  [240]:  'Dubai, Baku',
  [270]:  'Kabul',
  [300]:  'Karachi, Tashkent',
  [330]:  'India, Sri Lanka',
  [345]:  'Nepal',
  [360]:  'Dhaka, Almaty',
  [390]:  'Yangon',
  [420]:  'Bangkok, Jakarta, Hanoi',
  [480]:  'Singapore, Hong Kong, Beijing, Perth',
  [525]:  'Eucla',
  [540]:  'Tokyo, Seoul',
  [570]:  'Adelaide, Darwin',
  [600]:  'Sydney, Melbourne, Brisbane',
  [630]:  'Lord Howe Island',
  [660]:  'Solomon Islands, Nouméa',
  [720]:  'Auckland, Fiji',
  [765]:  'Chatham Islands',
  [780]:  'Tonga, Samoa',
  [840]:  'Kiribati'
};

function initTzDropdown() {
  const select = document.getElementById('tz-dropdown');
  if (!select) {
    console.warn('FX: #tz-dropdown not found yet, will retry');
    return false;
  }
  const autoBtn = document.getElementById('tz-auto-btn');
  const autoInfo = document.getElementById('tz-auto-info');

  // Build options
  select.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const offset of OFFSET_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = String(offset);
    const hint = OFFSET_HINTS[offset];
    opt.textContent = hint
      ? `${formatOffsetLabel(offset)}  —  ${hint}`
      : formatOffsetLabel(offset);
    frag.appendChild(opt);
  }
  select.appendChild(frag);

  console.info(`FX: TZ dropdown populated with ${OFFSET_OPTIONS.length} options`);

  select.value = String(
    OFFSET_OPTIONS.includes(USER_OFFSET_MIN)
      ? USER_OFFSET_MIN
      : OFFSET_OPTIONS[DEFAULT_INDEX]
  );

  select.addEventListener('change', e => {
    setUserOffset(parseInt(e.target.value, 10));
  });

  if (autoBtn && autoInfo) {
    const autoIdx = nearestOffsetIndex(AUTO_OFFSET_MIN);
    const autoOffset = OFFSET_OPTIONS[autoIdx];
    autoInfo.textContent = `Browser reports ${formatOffsetLabel(AUTO_OFFSET_MIN)}`;
    autoBtn.addEventListener('click', () => {
      select.value = String(autoOffset);
      setUserOffset(autoOffset, false);
    });
  }
  return true;
}

// ---------- Alerts (browser notifications) ----------

const ALERT_PREFS_KEY = 'fx_alert_prefs';

const DEFAULT_ALERT_PREFS = {
  enabled: false,
  onOpen: true,
  onClose: true,
  sessions: { sydney: true, tokyo: true, london: true, newyork: true }
};

function loadAlertPrefs() {
  try {
    const raw = localStorage.getItem(ALERT_PREFS_KEY);
    if (!raw) return { ...DEFAULT_ALERT_PREFS, sessions: { ...DEFAULT_ALERT_PREFS.sessions } };
    const parsed = JSON.parse(raw);
    return {
      enabled: !!parsed.enabled,
      onOpen: parsed.onOpen !== false,
      onClose: parsed.onClose !== false,
      sessions: { ...DEFAULT_ALERT_PREFS.sessions, ...(parsed.sessions || {}) }
    };
  } catch {
    return { ...DEFAULT_ALERT_PREFS, sessions: { ...DEFAULT_ALERT_PREFS.sessions } };
  }
}

let alertPrefs = loadAlertPrefs();
let prevSessionStatuses = {}; // key -> last seen status string
let alertsBootstrapTickDone = false;

function saveAlertPrefs() {
  try { localStorage.setItem(ALERT_PREFS_KEY, JSON.stringify(alertPrefs)); } catch {}
}

function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function notificationStatusText() {
  if (!notificationsSupported()) return 'Not supported in this browser';
  switch (Notification.permission) {
    case 'granted':  return 'Permission granted ✓';
    case 'denied':   return 'Permission denied — enable it in browser settings';
    default:         return 'Permission required';
  }
}

async function ensureNotificationPermission() {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied')  return false;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch { return false; }
}

function fireNotification(title, body) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
      tag: title,            // collapse repeated notifications for the same session
      silent: false
    });
    setTimeout(() => { try { n.close(); } catch {} }, 12000);
  } catch (err) {
    console.warn('Failed to fire notification:', err);
  }
}

function maybeFireSessionAlerts(statuses) {
  // Capture initial statuses on first run — no alerts on bootstrap
  if (!alertsBootstrapTickDone) {
    for (const s of statuses) prevSessionStatuses[s.key] = s.status;
    alertsBootstrapTickDone = true;
    return;
  }

  if (!alertPrefs.enabled) {
    for (const s of statuses) prevSessionStatuses[s.key] = s.status;
    return;
  }

  // OPEN ↔ LUNCH transitions are not "real" open/close events
  const isLiveStatus = st => st === 'OPEN' || st === 'LUNCH';

  for (const s of statuses) {
    const prev = prevSessionStatuses[s.key];
    if (prev !== undefined && prev !== s.status && alertPrefs.sessions[s.key]) {
      const wasLive = isLiveStatus(prev);
      const nowLive = isLiveStatus(s.status);

      // OPEN transition: not-live → live
      if (!wasLive && nowLive && alertPrefs.onOpen) {
        fireNotification(
          `${s.flag} ${s.name} — OPEN`,
          `${s.name} session has opened. Closes ${s.localCloseTime} ${formatOffsetLabel(USER_OFFSET_MIN)}.`
        );
      }
      // CLOSE transition: live → not-live
      if (wasLive && !nowLive && alertPrefs.onClose) {
        fireNotification(
          `${s.flag} ${s.name} — CLOSED`,
          `${s.name} session has closed.`
        );
      }
    }
    prevSessionStatuses[s.key] = s.status;
  }
}

// ---------- Alerts UI ----------

function renderAlertsStatus() {
  const statusEl = document.getElementById('alerts-status');
  if (!statusEl) return;
  statusEl.textContent = notificationStatusText();
  statusEl.dataset.permission = notificationsSupported() ? Notification.permission : 'unsupported';
}

function initAlertsUI() {
  const enabledToggle = document.getElementById('alerts-enabled');
  const onOpen = document.getElementById('alert-on-open');
  const onClose = document.getElementById('alert-on-close');
  const sessionChecks = document.querySelectorAll('input[data-alert-session]');
  const testBtn = document.getElementById('alerts-test');
  if (!enabledToggle || !onOpen || !onClose || !testBtn) return false;

  // Hydrate UI from prefs
  enabledToggle.checked = alertPrefs.enabled && (notificationsSupported() && Notification.permission === 'granted');
  onOpen.checked = alertPrefs.onOpen;
  onClose.checked = alertPrefs.onClose;
  sessionChecks.forEach(cb => {
    const k = cb.getAttribute('data-alert-session');
    cb.checked = !!alertPrefs.sessions[k];
  });
  renderAlertsStatus();

  enabledToggle.addEventListener('change', async () => {
    if (enabledToggle.checked) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        enabledToggle.checked = false;
        alertPrefs.enabled = false;
        renderAlertsStatus();
        return;
      }
      alertPrefs.enabled = true;
    } else {
      alertPrefs.enabled = false;
    }
    saveAlertPrefs();
    renderAlertsStatus();
  });

  onOpen.addEventListener('change', () => {
    alertPrefs.onOpen = onOpen.checked;
    saveAlertPrefs();
  });
  onClose.addEventListener('change', () => {
    alertPrefs.onClose = onClose.checked;
    saveAlertPrefs();
  });
  sessionChecks.forEach(cb => {
    cb.addEventListener('change', () => {
      const k = cb.getAttribute('data-alert-session');
      alertPrefs.sessions[k] = cb.checked;
      saveAlertPrefs();
    });
  });

  testBtn.addEventListener('click', async () => {
    const granted = await ensureNotificationPermission();
    renderAlertsStatus();
    if (granted) {
      fireNotification('🔔 FX Sessions — Test alert', 'Notifications are working. You\'ll be alerted when sessions open or close.');
    }
  });

  return true;
}

// ---------- Time helpers ----------

function pad(n) { return String(n).padStart(2, '0'); }

/**
 * Convert a UTC hour-of-day to "HH:mm" in the user's selected GMT offset.
 */
function utcHourToLocalString(utcHour) {
  const totalMin = Math.round(utcHour * 60) + USER_OFFSET_MIN;
  const wrapped = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${pad(h)}:${pad(m)}`;
}

function formatLocalClock(now) {
  const d = shiftDate(now);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function formatLocalDate(now) {
  const d = shiftDate(now);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function formatLocalShort(now) {
  const d = shiftDate(now);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function formatCountdown(minutes) {
  if (minutes == null || minutes < 0) return '—';
  const totalMin = Math.floor(minutes);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${pad(m)}m`;
  return `${m}m`;
}

// ---------- Session status logic ----------

function dateAtUtc(dateStr, hour) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wholeHours = Math.floor(hour);
  const minutes = Math.round((hour - wholeHours) * 60);
  return new Date(Date.UTC(y, m - 1, d, wholeHours, minutes, 0));
}

/** Add `n` days to a UTC date string, returning a new YYYY-MM-DD string. */
function addUtcDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return toUTCDateString(dt);
}

function evaluateSession(sessionKey, now) {
  const todayDateStr = toUTCDateString(now);
  const yesterdayDateStr = addUtcDays(todayDateStr, -1);

  const todayHours = getSessionHours(sessionKey, todayDateStr);
  const yHours = getSessionHours(sessionKey, yesterdayDateStr);

  const def = SESSION_MAP[sessionKey];
  const overnight = def.utcClose <= def.utcOpen;

  let isOpen = false;
  let openTimeMs = null;
  let closeTimeMs = null;

  if (overnight) {
    if (yHours && !yHours.closedAllDay) {
      const winOpen = dateAtUtc(yesterdayDateStr, yHours.open);
      const winClose = dateAtUtc(todayDateStr, yHours.close);
      if (now >= winOpen && now < winClose) {
        isOpen = true;
        openTimeMs = winOpen.getTime();
        closeTimeMs = winClose.getTime();
      }
    }

    if (!isOpen && todayHours && !todayHours.closedAllDay) {
      const winOpen = dateAtUtc(todayDateStr, todayHours.open);
      const winClose = dateAtUtc(addUtcDays(todayDateStr, 1), todayHours.close);
      if (now >= winOpen && now < winClose) {
        isOpen = true;
        openTimeMs = winOpen.getTime();
        closeTimeMs = winClose.getTime();
      }
    }
  } else {
    if (todayHours && !todayHours.closedAllDay) {
      const winOpen = dateAtUtc(todayDateStr, todayHours.open);
      const winClose = dateAtUtc(todayDateStr, todayHours.close);
      if (now >= winOpen && now < winClose) {
        isOpen = true;
        openTimeMs = winOpen.getTime();
        closeTimeMs = winClose.getTime();
      }
    }
  }

  // If not open, scan up to 8 days ahead for the next valid open.
  // (Worst case: Saturday 00:00 UTC for non-overnight sessions → next open is Monday.)
  if (!isOpen) {
    for (let i = 0; i < 8 && openTimeMs == null; i++) {
      const dateStr = addUtcDays(todayDateStr, i);
      const hours = getSessionHours(sessionKey, dateStr);
      if (!hours || hours.closedAllDay) continue;
      const candidate = dateAtUtc(dateStr, hours.open);
      if (candidate > now) {
        openTimeMs = candidate.getTime();
      }
    }
  }

  // Lunch-break detection (only meaningful when session is currently open)
  let onLunch = false;
  let minutesUntilLunchEnd = null;
  if (isOpen && def.lunchBreak) {
    const lunchStart = dateAtUtc(todayDateStr, def.lunchBreak.utcStart);
    const lunchEnd = dateAtUtc(todayDateStr, def.lunchBreak.utcEnd);
    if (now >= lunchStart && now < lunchEnd) {
      onLunch = true;
      minutesUntilLunchEnd = (lunchEnd.getTime() - now.getTime()) / 60000;
    }
  }

  const minutesUntilOpen = openTimeMs != null && !isOpen
    ? (openTimeMs - now.getTime()) / 60000
    : null;
  const minutesUntilClose = isOpen && closeTimeMs != null
    ? (closeTimeMs - now.getTime()) / 60000
    : null;

  const openingSoon = !isOpen && minutesUntilOpen != null && minutesUntilOpen <= 30;

  return {
    isOpen,
    onLunch,
    openingSoon,
    minutesUntilOpen,
    minutesUntilClose,
    minutesUntilLunchEnd,
    todayHours,
    lunchBreak: def.lunchBreak || null,
    closedAllDay: !!(todayHours && todayHours.closedAllDay)
  };
}

export function getCurrentSessionStatus(now = new Date()) {
  const results = SESSIONS.map(s => {
    const ev = evaluateSession(s.key, now);
    let status;
    if (ev.closedAllDay) status = 'HOLIDAY';
    else if (ev.onLunch) status = 'LUNCH';
    else if (ev.isOpen) status = 'OPEN';
    else if (ev.openingSoon) status = 'OPENING_SOON';
    else status = 'CLOSED';

    return {
      key: s.key,
      name: s.name,
      flag: s.flag,
      icon: s.icon,
      color: s.color,
      glowColor: s.glowColor,
      description: s.description,
      status,
      opensIn: ev.minutesUntilOpen,
      closesIn: ev.minutesUntilClose,
      lunchBackIn: ev.minutesUntilLunchEnd,
      lunchBreakLabel: ev.lunchBreak?.label || null,
      localOpenTime: ev.todayHours ? utcHourToLocalString(ev.todayHours.open) : '—',
      localCloseTime: ev.todayHours ? utcHourToLocalString(ev.todayHours.close) : '—',
      localLunchStart: ev.lunchBreak ? utcHourToLocalString(ev.lunchBreak.utcStart) : null,
      localLunchEnd: ev.lunchBreak ? utcHourToLocalString(ev.lunchBreak.utcEnd) : null,
      holidayName: ev.todayHours?.holiday || null,
      weekend: ev.todayHours?.weekend || false,
      earlyClose: ev.todayHours?.earlyClose || false
    };
  });

  isMarketHoliday = results.every(r => r.status === 'HOLIDAY');
  return results;
}

export function getActiveOverlaps(statuses) {
  // Treat OPEN and LUNCH as "in session" for overlap purposes
  const liveKeys = new Set(
    statuses.filter(s => s.status === 'OPEN' || s.status === 'LUNCH').map(s => s.key)
  );
  return OVERLAPS.filter(o => o.sessions.every(k => liveKeys.has(k)))
    .map(o => ({
      ...o,
      sessionDetails: o.sessions.map(k => SESSION_MAP[k])
    }));
}

// ---------- Rendering ----------

function el(id) { return document.getElementById(id); }

function renderClock(now) {
  const clockEl = el('live-clock');
  const dateEl = el('live-date');
  if (clockEl) {
    clockEl.textContent = formatLocalClock(now);
    clockEl.classList.remove('tick-pulse');
    void clockEl.offsetWidth;
    clockEl.classList.add('tick-pulse');
  }
  if (dateEl) dateEl.textContent = formatLocalDate(now);
}

function renderTzPills(now) {
  const offsetLabel = formatOffsetLabel(USER_OFFSET_MIN);

  const pill = el('tz-pill');
  if (pill) {
    pill.textContent = offsetLabel;
    pill.title = `Your selected offset: ${offsetLabel}`;
  }

  const big = el('tz-offset-big');
  if (big) big.textContent = offsetLabel;

  const preview = el('tz-preview-clock');
  if (preview) preview.textContent = formatLocalShort(now);

  document.querySelectorAll('.tz-tag-dynamic').forEach(n => {
    n.textContent = offsetLabel;
  });
}

function renderMarketBanner(statuses) {
  const banner = el('market-banner');
  const stateEl = el('banner-state');
  const detailEl = el('banner-detail');
  if (!banner || !stateEl || !detailEl) return;

  // For banner purposes, treat OPEN and LUNCH as "in session"
  const liveSessions = statuses.filter(s => s.status === 'OPEN' || s.status === 'LUNCH');
  const openSessions = statuses.filter(s => s.status === 'OPEN');
  const allClosed = liveSessions.length === 0;
  const allWeekend = allClosed && statuses.every(s => s.weekend);
  const allHoliday = allClosed && statuses.every(s => s.status === 'HOLIDAY' && !s.weekend);

  banner.classList.remove('banner-open', 'banner-closed', 'banner-holiday', 'banner-weekend');

  // Common: find the next session that opens
  const next = [...statuses]
    .filter(s => s.opensIn != null && s.opensIn >= 0)
    .sort((a, b) => a.opensIn - b.opensIn)[0];
  const nextStr = next ? `Next: ${next.flag} ${next.name} opens in ${formatCountdown(next.opensIn)}` : '';

  if (liveSessions.length > 0) {
    stateEl.textContent = '🟢 OPEN';
    const parts = liveSessions.map(s =>
      s.status === 'LUNCH' ? `${s.name} (🍱 lunch)` : s.name
    );
    const names = parts.join(' · ');
    detailEl.textContent = `${names} ${liveSessions.length > 1 ? 'sessions live' : 'session live'}`;
    banner.classList.add('banner-open');
  } else if (allWeekend) {
    stateEl.textContent = '🛌 WEEKEND — CLOSED';
    detailEl.textContent = nextStr || 'Forex market re-opens Sunday 22:00 UTC';
    banner.classList.add('banner-weekend');
  } else if (allHoliday) {
    const names = [...new Set(statuses.map(s => s.holidayName).filter(Boolean))];
    stateEl.textContent = '🏖️ HOLIDAY — CLOSED';
    detailEl.textContent = names.length ? names.join(' / ') : 'All major markets closed';
    banner.classList.add('banner-holiday');
  } else {
    stateEl.textContent = '🔴 CLOSED';
    detailEl.textContent = nextStr || 'No sessions currently active';
    banner.classList.add('banner-closed');
  }
}

function renderSessions(statuses, now) {
  const grid = el('sessions-grid');
  if (!grid) return;
  const offsetLabel = formatOffsetLabel(USER_OFFSET_MIN);

  grid.innerHTML = statuses.map(s => {
    const statusBadge = badgeFor(s);
    let countdown;
    if (s.status === 'OPEN') {
      countdown = `<span class="countdown-label">Closes in</span><span class="countdown-value">${formatCountdown(s.closesIn)}</span>`;
    } else if (s.status === 'LUNCH') {
      countdown = `<span class="countdown-label">🍱 Lunch · back in</span><span class="countdown-value">${formatCountdown(s.lunchBackIn)}</span>`;
    } else if (s.status === 'HOLIDAY') {
      countdown = `<span class="countdown-label">${s.weekend ? 'Weekend' : 'Status'}</span><span class="countdown-value muted">${s.weekend ? 'Reopens ' + formatCountdown(s.opensIn) : 'Closed all day'}</span>`;
    } else {
      countdown = `<span class="countdown-label">Opens in</span><span class="countdown-value">${formatCountdown(s.opensIn)}</span>`;
    }

    const liveClass = s.status === 'OPEN' ? 'is-live' : '';
    const lunchClass = s.status === 'LUNCH' ? 'is-lunch' : '';
    const soonClass = s.status === 'OPENING_SOON' ? 'is-soon' : '';
    const holidayClass = s.status === 'HOLIDAY' ? (s.weekend ? 'is-weekend' : 'is-holiday') : '';

    const earlyTag = s.earlyClose ? `<span class="early-tag">Early Close</span>` : '';
    const weekendTag = s.weekend ? `<span class="weekend-tag">Weekend</span>` : '';
    const holidayTag = (s.holidayName && !s.weekend) ? `<span class="holiday-tag">${s.holidayName}</span>` : '';
    const lunchTag = s.lunchBreakLabel ? `<span class="lunch-tag" title="Daily midday recess">🍱 ${s.lunchBreakLabel}</span>` : '';

    return `
      <article class="session-card ${liveClass} ${lunchClass} ${soonClass} ${holidayClass}" data-key="${s.key}"
               style="--c:${s.color}; --glow:${s.glowColor};">
        <header class="session-head">
          <div class="session-title">
            <span class="session-flag">${s.flag}</span>
            <span class="session-name">${s.name}</span>
          </div>
          ${statusBadge}
        </header>
        <div class="session-times">
          <div class="time-block">
            <span class="time-label">OPEN</span>
            <span class="time-val">${s.localOpenTime}</span>
          </div>
          <div class="time-divider">→</div>
          <div class="time-block">
            <span class="time-label">CLOSE</span>
            <span class="time-val">${s.localCloseTime}</span>
          </div>
        </div>
        <div class="session-countdown">
          ${countdown}
        </div>
        <div class="session-meta">
          ${weekendTag}
          ${holidayTag}
          ${earlyTag}
          ${lunchTag}
          <span class="tz-tag tz-tag-dynamic">${offsetLabel}</span>
        </div>
      </article>
    `;
  }).join('');
}

function badgeFor(s) {
  switch (s.status) {
    case 'OPEN':
      return `<span class="badge badge-live"><span class="dot pulse"></span>LIVE</span>`;
    case 'LUNCH':
      return `<span class="badge badge-lunch"><span class="dot"></span>🍱 LUNCH</span>`;
    case 'OPENING_SOON':
      return `<span class="badge badge-soon"><span class="dot"></span>SOON</span>`;
    case 'HOLIDAY':
      return s.weekend
        ? `<span class="badge badge-weekend"><span class="dot"></span>WEEKEND</span>`
        : `<span class="badge badge-holiday"><span class="dot"></span>HOLIDAY</span>`;
    default:
      return `<span class="badge badge-closed"><span class="dot"></span>CLOSED</span>`;
  }
}

function renderOverlaps(overlaps) {
  const wrap = el('overlap-zone');
  if (!wrap) return;

  if (!overlaps.length) {
    wrap.innerHTML = `
      <div class="overlap-empty">
        <span class="overlap-empty-title">No active overlaps</span>
        <span class="overlap-empty-sub">Single-session liquidity. Watch for the London × New York window — peak volatility.</span>
      </div>`;
    return;
  }

  wrap.innerHTML = overlaps.map(o => {
    const colorStops = o.sessionDetails.map(s => s.color).join(', ');
    const flags = o.sessionDetails.map(s => s.flag).join(' ');
    return `
      <div class="overlap-card" style="background: linear-gradient(135deg, ${colorStops}22, transparent);">
        <div class="overlap-flags">${flags}</div>
        <div class="overlap-text">
          <div class="overlap-title">${o.label}</div>
          <div class="overlap-significance">${o.significance}</div>
        </div>
        <div class="overlap-pulse" style="background: linear-gradient(90deg, ${colorStops});"></div>
      </div>`;
  }).join('');
}

function renderLegend(now) {
  const list = el('legend-list');
  if (!list) return;
  list.innerHTML = SESSIONS.map(s => {
    const open = utcHourToLocalString(s.utcOpen);
    const close = utcHourToLocalString(s.utcClose);
    const overnight = s.utcClose <= s.utcOpen;
    const closeLabel = overnight ? `${close} (next day)` : close;
    let extra = '';
    if (s.lunchBreak) {
      const lOpen = utcHourToLocalString(s.lunchBreak.utcStart);
      const lClose = utcHourToLocalString(s.lunchBreak.utcEnd);
      extra = ` <span class="legend-extra">🍱 lunch ${lOpen}–${lClose}</span>`;
    }
    if (s.key === 'newyork') {
      extra += ` <span class="legend-extra">NYSE 9:30 ET</span>`;
    }
    return `<li><span class="dot" style="background:${s.color}"></span>
              <strong>${s.name}</strong> ${open} → ${closeLabel}${extra}</li>`;
  }).join('');

  const tzNote = el('legend-tz-note');
  if (tzNote) {
    tzNote.textContent = `All times shown in ${formatOffsetLabel(USER_OFFSET_MIN)} (your selected timezone). NY hours are EDT-aligned.`;
  }
}

// ---------- Main tick ----------

function tick() {
  const now = new Date();
  renderClock(now);
  renderTzPills(now);
  const statuses = getCurrentSessionStatus(now);
  renderMarketBanner(statuses);
  renderSessions(statuses, now);
  renderOverlaps(getActiveOverlaps(statuses));
  maybeFireSessionAlerts(statuses);
}

function initOnce() {
  const ok = initTzDropdown();
  if (!ok) {
    requestAnimationFrame(initOnce);
    return;
  }
  initAlertsUI();
  renderLegend(new Date());
  tick();
}

function bootstrap() {
  try {
    initOnce();
    setInterval(tick, 1000);
    setInterval(() => renderLegend(new Date()), 3600 * 1000);
  } catch (err) {
    console.error('FX Sessions bootstrap error:', err);
  }
}

// Modules are deferred, but readyState may already be 'interactive'
// or 'complete' by the time this evaluates — handle both paths.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

window.__fx = {
  getCurrentSessionStatus,
  getActiveOverlaps,
  setUserOffset,
  get USER_OFFSET_MIN() { return USER_OFFSET_MIN; },
  AUTO_OFFSET_MIN,
  OFFSET_OPTIONS
};
