// How far a vault is from its last synced copy, in things a person would count (KM-006 FR32, Concern 14):
// items, projects and envs whose content differs. Bookkeeping that every save moves (rev, updatedAt,
// clocks, history, a field's at/dev) is not content, so saving one item twice still counts as one.
const IGNORED = new Set(['rev', 'updatedAt', 'clock', 'history']);

// JSON with sorted keys: equal values give equal strings whatever the key order.
function canon(v) {
  if (v === null || typeof v !== 'object') return v === undefined ? 'null' : JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
}

function content(entity) {
  const out = {};
  for (const [k, v] of Object.entries(entity)) if (!IGNORED.has(k)) out[k] = v;
  if (Array.isArray(out.fields)) out.fields = out.fields.map(({ at, dev, ...f }) => f);
  return canon(out);
}

export const sameVault = (a, b) => canon(a) === canon(b);

// `base` null: never synced, so every entity counts.
export function countPending(base, vault) {
  let n = 0;
  for (const table of ['projects', 'envs', 'items']) {
    const before = new Map((base?.[table] ?? []).map((e) => [e.id, content(e)]));
    for (const e of vault[table]) if (before.get(e.id) !== content(e)) n++;
  }
  return n;
}
