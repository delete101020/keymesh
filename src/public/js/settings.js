// Settings of this device (meta.settings, docs/03 §3). Never synced. Holds no title or value: `recents`
// is a short list of random item ids. What comes from disk is checked, since a bad value must not
// turn off auto-lock.
export const IDLE_DEFAULT_MS = 10 * 60 * 1000;
export const BACKGROUND_DEFAULT_MS = 60 * 1000;
export const MAX_RECENT = 5;

const MIN = 60 * 1000;
export const IDLE_CHOICES = Object.freeze([1, 5, 10, 15, 30, 60].map((m) => ({ ms: m * MIN, label: `${m} phút` })));
export const BACKGROUND_CHOICES = Object.freeze([
  { ms: 0, label: 'Ngay lập tức' },
  { ms: 15 * 1000, label: '15 giây' },
  { ms: 30 * 1000, label: '30 giây' },
  { ms: MIN, label: '1 phút' },
  { ms: 5 * MIN, label: '5 phút' },
  { ms: 15 * MIN, label: '15 phút' },
]);

const allowed = (choices, ms) => choices.some((c) => c.ms === ms);

export const defaultSettings = () => ({ idleMs: IDLE_DEFAULT_MS, backgroundMs: BACKGROUND_DEFAULT_MS, recents: [] });

export function cleanSettings(raw) {
  const out = defaultSettings();
  if (raw === null || typeof raw !== 'object') return out;
  if (allowed(IDLE_CHOICES, raw.idleMs)) out.idleMs = raw.idleMs;
  if (allowed(BACKGROUND_CHOICES, raw.backgroundMs)) out.backgroundMs = raw.backgroundMs;
  if (Array.isArray(raw.recents)) out.recents = [...new Set(raw.recents.filter((id) => typeof id === 'string' && id))].slice(0, MAX_RECENT);
  return out;
}

export function pushRecent(recents, id, max = MAX_RECENT) {
  return [id, ...recents.filter((x) => x !== id)].slice(0, max);
}

// Touch devices lock on going to the background; computers lock on inactivity only (F-AUTH-11). Decided by
// input type, not width: a narrow window on a laptop is still a laptop.
export function isTouchDevice(win = globalThis) {
  return Boolean(win.matchMedia?.('(hover: none) and (pointer: coarse)').matches);
}

// The timeouts in force for this kind of device. null means this device has no background lock.
export const lockTimes = (settings, touch) => (touch
  ? { idleMs: IDLE_DEFAULT_MS, backgroundMs: settings.backgroundMs }
  : { idleMs: settings.idleMs, backgroundMs: null });
