// Login lockouts. Counting a failure is a single statement over both rows, so parallel requests cannot
// slip past a threshold (AC53). Keys are HMACs: nothing stored here can be read back (NFR02).
import { toBase64 } from '../../public/js/core/bytes.js';
import { ApiError } from './_http.js';
import { LABEL_ATTEMPT_IP, LABEL_ATTEMPT_USER, labeledHmac } from './_secrets.js';

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const USER_LIMIT = 5;
const IP_LIMIT = 20;
const UNKNOWN_IP = 'unknown';

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const HEXTET_RE = /^[0-9a-f]{1,4}$/;

function ipv6Hextets(text) {
  let address = text.toLowerCase();
  const lastColon = address.lastIndexOf(':');
  const tail = address.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (lastColon < 0 || !IPV4_RE.test(tail)) return null;
    const [a, b, c, d] = tail.split('.').map(Number);
    address = `${address.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const parts = address.split('::');
  if (parts.length > 2) return null;
  const left = parts[0] === '' ? [] : parts[0].split(':');
  const right = parts.length === 1 || parts[1] === '' ? [] : parts[1].split(':');
  const missing = 8 - left.length - right.length;
  if (parts.length === 1 ? missing !== 0 : missing < 1) return null;
  const hextets = [...left, ...Array(parts.length === 1 ? 0 : missing).fill('0'), ...right];
  if (!hextets.every((h) => HEXTET_RE.test(h))) return null;
  return hextets.map((h) => parseInt(h, 16));
}

// IPv6 counts per /64, an IPv4-mapped address as its IPv4. Anything else shares one counter (FR18).
export function normalizeIp(value) {
  if (typeof value !== 'string') return UNKNOWN_IP;
  if (IPV4_RE.test(value)) return value;
  const hextets = value.includes(':') ? ipv6Hextets(value) : null;
  if (!hextets) return UNKNOWN_IP;
  if (hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff) {
    const [hi, lo] = hextets.slice(6);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  return `${hextets.slice(0, 4).map((h) => h.toString(16)).join(':')}::/64`;
}

// The only source of the client address: the header Cloudflare sets itself. Local wrangler passes through
// whatever a client sends, so the real proof of this line belongs to KM-006 (AC25).
export async function attemptKeys(request, secret, username) {
  const ip = normalizeIp(request.headers.get('CF-Connecting-IP'));
  return {
    user: toBase64(await labeledHmac(secret, LABEL_ATTEMPT_USER, username.toLowerCase())),
    ip: toBase64(await labeledHmac(secret, LABEL_ATTEMPT_IP, ip)),
  };
}

function refuseUntil(lockedUntil, now) {
  const seconds = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
  return new ApiError('too_many_attempts', { headers: { 'Retry-After': String(seconds) } });
}

async function latestLock(db, keys, now) {
  const row = await db.prepare('SELECT max(locked_until) AS until FROM sys_auth_attempt WHERE key IN (?, ?) AND locked_until > ?').bind(keys.user, keys.ip, now).first();
  return row?.until ?? null;
}

export async function assertNotLocked(db, keys, now) {
  const until = await latestLock(db, keys, now);
  if (until !== null) throw refuseUntil(until, now);
}

// Counts the failure unless a lock already holds, which it checks in the same statement. No row back means
// another request locked first, so this one is refused as locked rather than told it merely failed.
export async function recordFailure(db, keys, now) {
  const { results } = await db
    .prepare(
      `INSERT INTO sys_auth_attempt (key, count, window_start, locked_until)
       SELECT column1, 1, ?3, NULL FROM (VALUES (?1), (?2))
       WHERE NOT EXISTS (SELECT 1 FROM sys_auth_attempt WHERE key IN (?1, ?2) AND locked_until > ?3)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN locked_until IS NOT NULL OR window_start + ?4 <= ?3 THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN locked_until IS NOT NULL OR window_start + ?4 <= ?3 THEN ?3 ELSE window_start END,
         locked_until = CASE
           WHEN locked_until IS NOT NULL OR window_start + ?4 <= ?3 THEN NULL
           WHEN count + 1 >= CASE WHEN key = ?1 THEN ?5 ELSE ?6 END THEN ?3 + ?7
         END
       RETURNING key`,
    )
    .bind(keys.user, keys.ip, now, WINDOW_MS, USER_LIMIT, IP_LIMIT, LOCK_MS)
    .all();
  if (results.length > 0) return;
  throw refuseUntil((await latestLock(db, keys, now)) ?? now, now);
}

export function clearUserCounter(db, keys) {
  return db.prepare('DELETE FROM sys_auth_attempt WHERE key = ?').bind(keys.user);
}

// FR35: what a stranger's guesses leave behind does not pile up forever. Failing here never fails a login.
export async function removeStale(db, now) {
  const cutoff = now - RETENTION_MS;
  try {
    await db.batch([
      db.prepare('DELETE FROM dt_session WHERE expires_at < ?').bind(cutoff),
      db.prepare('DELETE FROM sys_auth_attempt WHERE window_start < ?1 AND (locked_until IS NULL OR locked_until < ?1)').bind(cutoff),
    ]);
  } catch (error) {
    console.error('api: cleanup failed', error?.name);
  }
}
