// Read-only views over a decrypted vault. Time comes in as a parameter, as in core/.
const byOrder = (a, b) => a.order - b.order;
const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true });

export const EXPIRING_DAYS = 14;

export const liveProjects = (vault) => vault.projects.filter((p) => p.deletedAt === null).sort(byOrder);

// An env under a deleted project counts as deleted for display (KM-003 Concern 12). Merge can produce one.
export function liveEnvs(vault, projectId) {
  const alive = new Set(liveProjects(vault).map((p) => p.id));
  return vault.envs
    .filter((e) => e.deletedAt === null && alive.has(e.projectId) && (projectId === undefined || e.projectId === projectId))
    .sort(byOrder);
}

export const liveItems = (vault) => vault.items.filter((i) => i.deletedAt === null && i.purgedAt === null);

// The ids come from local settings and may outlive their item.
export function recentItems(vault, ids) {
  const live = new Map(liveItems(vault).map((i) => [i.id, i]));
  return ids.map((id) => live.get(id)).filter(Boolean);
}

export const favoriteItems = (vault) => liveItems(vault).filter((i) => i.favorite).sort((a, b) => collator.compare(a.title, b.title));

export function itemLiveEnvs(vault, item) {
  const scopes = new Set(item.scopes);
  return liveEnvs(vault).filter((e) => scopes.has(e.id));
}

// Fields in fieldOrder; a live field missing from fieldOrder goes last (docs/03 §1).
export function orderedFields(item) {
  const live = item.fields.filter((f) => f.deletedAt === null);
  const rank = new Map(item.fieldOrder.map((id, i) => [id, i]));
  const at = (f) => rank.get(f.id) ?? Number.MAX_SAFE_INTEGER;
  return live.map((f, i) => [f, i]).sort(([a, i], [b, j]) => at(a) - at(b) || i - j).map(([f]) => f);
}

const localDay = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;

// Whole calendar days from `now` to `expires` in local time; UTC arithmetic keeps DST days at 24 h.
export function daysLeft(expires, now) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expires ?? '');
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 - localDay(new Date(now));
}

export function isExpiring(item, now) {
  const left = daysLeft(item.expires, now);
  return left !== null && left <= EXPIRING_DAYS;
}

export const isProd = (vault, item) => itemLiveEnvs(vault, item).some((e) => e.name.trim().toLowerCase() === 'prod');

// Case- and accent-insensitive form: "Mật khẩu Đà Nẵng" → "mat khau da nang".
export const foldText = (s) =>
  s.normalize('NFD').replace(/\p{M}+/gu, '').replace(/[đĐ]/g, 'd').toLowerCase();

const SEARCHED_KINDS = new Set(['text', 'url', 'multi']);

function matchesSearch(item, words) {
  const parts = [item.title, item.notes];
  for (const f of item.fields) if (f.deletedAt === null && SEARCHED_KINDS.has(f.kind)) parts.push(f.v);
  const text = foldText(parts.join('\n'));
  return words.every((w) => text.includes(w));
}

export function searchItems(items, query) {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  return words.length ? items.filter((i) => matchesSearch(i, words)) : items;
}

// filter: { k: 'all' | 'unassigned' | 'expiring' | 'project' | 'env', id? }
export function matchesFilter(vault, item, filter, now) {
  switch (filter.k) {
    case 'unassigned':
      return itemLiveEnvs(vault, item).length === 0;
    case 'expiring':
      return isExpiring(item, now);
    case 'project':
      return itemLiveEnvs(vault, item).some((e) => e.projectId === filter.id);
    case 'env':
      return itemLiveEnvs(vault, item).some((e) => e.id === filter.id);
    default:
      return true;
  }
}

export function queryItems(vault, filter, query, now) {
  const scoped = liveItems(vault).filter((i) => matchesFilter(vault, i, filter, now));
  return searchItems(scoped, query).sort((a, b) => collator.compare(a.title, b.title));
}

export function filterCounts(vault, now) {
  const items = liveItems(vault);
  const counts = { all: items.length, unassigned: 0, expiring: 0, projects: new Map(), envs: new Map() };
  const envs = liveEnvs(vault);
  const envById = new Map(envs.map((e) => [e.id, e]));
  for (const item of items) {
    const here = item.scopes.map((id) => envById.get(id)).filter(Boolean);
    if (here.length === 0) counts.unassigned++;
    if (isExpiring(item, now)) counts.expiring++;
    for (const e of new Set(here)) counts.envs.set(e.id, (counts.envs.get(e.id) ?? 0) + 1);
    for (const pid of new Set(here.map((e) => e.projectId))) counts.projects.set(pid, (counts.projects.get(pid) ?? 0) + 1);
  }
  return counts;
}

// "Dùng chung: uat, staging (+1 project khác)". Names are from the filtered project, else the first
// project (in order) the item is in. Null when the item has fewer than 2 live envs.
export function sharedChip(vault, item, filter) {
  const envs = itemLiveEnvs(vault, item);
  if (envs.length < 2) return null;
  const projects = liveProjects(vault).filter((p) => envs.some((e) => e.projectId === p.id));
  const filtered = filter?.k === 'project' ? filter.id : filter?.k === 'env' ? vault.envs.find((e) => e.id === filter.id)?.projectId : null;
  const main = projects.find((p) => p.id === filtered) ?? projects[0];
  const names = envs.filter((e) => e.projectId === main.id).map((e) => e.name);
  const others = projects.length - 1;
  return `Dùng chung: ${names.join(', ')}${others > 0 ? ` (+${others} project khác)` : ''}`;
}
