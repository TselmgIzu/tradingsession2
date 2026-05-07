// Forex trading session definitions (UTC hours)
// User local timezone: GMT+8

export const SESSIONS = [
  {
    key: 'sydney',
    name: 'Sydney',
    city: 'Sydney',
    flag: '🇦🇺',
    icon: '🌏',
    utcOpen: 22,   // 22:00 UTC (previous day)
    utcClose: 7,   // 07:00 UTC (next day) - overnight session
    color: '#14b8a6',     // teal
    glowColor: 'rgba(20, 184, 166, 0.55)',
    overlap: ['tokyo'],
    description: 'Asian session opener. Lower liquidity but moves AUD/JPY pairs.'
  },
  {
    key: 'tokyo',
    name: 'Tokyo',
    city: 'Tokyo',
    flag: '🇯🇵',
    icon: '🗾',
    // TSE: 09:00 – 15:30 JST (UTC+9) = 00:00 – 06:30 UTC
    utcOpen: 0,
    utcClose: 6.5,
    // TSE midday recess: 11:30–12:30 JST = 02:30–03:30 UTC
    lunchBreak: { utcStart: 2.5, utcEnd: 3.5, label: '11:30–12:30 JST' },
    color: '#ef4444',     // red
    glowColor: 'rgba(239, 68, 68, 0.55)',
    overlap: ['sydney'],
    description: 'TSE: 09:00 – 15:30 JST. JPY pairs and Asian indices peak.'
  },
  {
    key: 'london',
    name: 'London',
    city: 'London',
    flag: '🇬🇧',
    icon: '🏛️',
    utcOpen: 8,
    utcClose: 17,
    color: '#fbbf24',     // gold
    glowColor: 'rgba(251, 191, 36, 0.55)',
    overlap: ['tokyo', 'newyork'],
    description: 'Largest forex hub. ~35% of daily volume. EUR/GBP pairs surge.'
  },
  {
    key: 'newyork',
    name: 'New York',
    city: 'New York',
    flag: '🇺🇸',
    icon: '🗽',
    // NYSE: 9:30 AM – 4:00 PM ET. During EDT (UTC-4) → 13:30–20:00 UTC.
    utcOpen: 13.5,
    utcClose: 20,
    color: '#3b82f6',     // electric blue
    glowColor: 'rgba(59, 130, 246, 0.6)',
    overlap: ['london'],
    description: 'NYSE: 9:30 AM – 4:00 PM ET. USD pairs and equities most active.'
  }
];

// Map for quick lookup by key
export const SESSION_MAP = SESSIONS.reduce((acc, s) => {
  acc[s.key] = s;
  return acc;
}, {});

// Significant overlap zones (the most actively traded windows)
// Note: with TSE closing 06:30 UTC and London opening 08:00 UTC, Tokyo × London
// no longer overlap — there's a 1.5-hour quiet gap between them.
export const OVERLAPS = [
  {
    sessions: ['sydney', 'tokyo'],
    utcStart: 0,
    utcEnd: 6.5,
    label: 'Sydney × Tokyo',
    significance: 'Asian liquidity bridge — AUD/JPY and NZD/JPY most active.'
  },
  {
    sessions: ['london', 'newyork'],
    utcStart: 13.5,
    utcEnd: 17,
    label: 'London × New York',
    significance: 'THE GOLDEN HOUR — peak volatility & volume. Best for major pairs.'
  }
];

// Optional override — leave null to auto-detect the user's system timezone via Intl
// (e.g. "Europe/Budapest", "Europe/London", "America/New_York", "Asia/Singapore")
export const LOCAL_TZ_OVERRIDE = null;
