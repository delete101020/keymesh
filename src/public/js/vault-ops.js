// Vault changes the screens ask for, built on core/model.js. Every function that mutates is meant to
// run inside session.mutate(), on its copy of the vault.
import { addProject, addEnv, updateProject, updateEnv, createItem, updateItem, ITEM_TEMPLATES, FILE_KINDS } from './core/model.js';
import { itemLiveEnvs, liveEnvs, liveItems, liveProjects, orderedFields } from './vault-query.js';
import { parseOtp } from './otp.js';

export const DEFAULT_ENVS = Object.freeze(['dev', 'uat', 'staging', 'prod']);

const nameKey = (s) => s.normalize('NFC').trim().toLowerCase();

function checkName(name, others) {
  if (!nameKey(name)) return 'empty';
  return others.some((o) => nameKey(o.name) === nameKey(name)) ? 'duplicate' : null;
}

export const projectNameError = (vault, name, selfId) => checkName(name, liveProjects(vault).filter((p) => p.id !== selfId));

export const envNameError = (vault, projectId, name, selfId) => checkName(name, liveEnvs(vault, projectId).filter((e) => e.id !== selfId));

// Error for a comma-separated initial env list, or null. An empty list is allowed: a project can start with no env.
export function envListError(names) {
  const seen = new Set();
  for (const n of names) {
    if (seen.has(nameKey(n))) return 'duplicate';
    seen.add(nameKey(n));
  }
  return null;
}

export const parseEnvList = (text) => text.split(',').map((s) => s.trim()).filter(Boolean);

export function addProjectWithEnvs(vault, name, envNames, ctx) {
  const project = addProject(vault, { name: name.trim() }, ctx);
  for (const env of envNames) addEnv(vault, project.id, { name: env.trim() }, ctx);
  return project;
}

function moveInList(list, id, delta, apply) {
  const from = list.findIndex((x) => x.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return false;
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  next.forEach((x, order) => apply(x.id, order));
  return true;
}

export const moveProject = (vault, id, delta, ctx) =>
  moveInList(liveProjects(vault), id, delta, (pid, order) => updateProject(vault, pid, { order }, ctx));

export function moveEnv(vault, id, delta, ctx) {
  const env = vault.envs.find((e) => e.id === id);
  return moveInList(liveEnvs(vault, env?.projectId), id, delta, (eid, order) => updateEnv(vault, eid, { order }, ctx));
}

export function countItemsInProject(vault, projectId) {
  return liveItems(vault).filter((i) => itemLiveEnvs(vault, i).some((e) => e.projectId === projectId)).length;
}

export const countItemsInEnv = (vault, envId) => liveItems(vault).filter((i) => i.scopes.includes(envId)).length;

// --- drafts --------------------------------------------------------------------------------------

let keySeq = 0;
const fieldKey = () => `k${++keySeq}`;

// `key` identifies a row of the form; only drafts of existing fields carry `id`.
const draftField = (f, keepId) => ({
  key: fieldKey(),
  ...(keepId ? { id: f.id } : {}),
  label: f.label,
  kind: f.kind,
  v: f.v ?? '',
  ...(f.file ? { file: f.file } : {}),
});

const baseDraft = (over) => ({ id: null, type: null, title: '', notes: '', expires: null, tags: [], scopes: [], forkedFrom: null, fields: [], ...over });

export function templateDraft(type, filter) {
  return baseDraft({
    type,
    fields: ITEM_TEMPLATES[type].map((f) => draftField(f, false)),
    scopes: filter?.k === 'env' ? [filter.id] : [],
  });
}

export const editDraft = (item) =>
  baseDraft({
    id: item.id,
    type: item.type,
    title: item.title,
    notes: item.notes,
    expires: item.expires,
    tags: [...item.tags],
    scopes: [...item.scopes],
    forkedFrom: item.forkedFrom,
    fields: orderedFields(item).map((f) => draftField(f, true)),
  });

export const duplicateDraft = (item) =>
  baseDraft({
    type: item.type,
    title: `${item.title} (bản sao)`,
    notes: item.notes,
    expires: item.expires,
    tags: [...item.tags],
    scopes: [...item.scopes],
    fields: orderedFields(item).map((f) => draftField(f, false)),
  });

export const blankDraftField = (kind = 'text') => ({ key: fieldKey(), label: '', kind, v: '' });

// Changing kind to one that cannot hold a file drops the file name (FR21).
export function setDraftFieldKind(field, kind) {
  field.kind = kind;
  if (!FILE_KINDS.includes(kind)) delete field.file;
}

export function moveDraftField(draft, key, delta) {
  const from = draft.fields.findIndex((f) => f.key === key);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= draft.fields.length) return false;
  draft.fields.splice(to, 0, draft.fields.splice(from, 1)[0]);
  return true;
}

// Live envs are toggled; ids of deleted envs stay in scopes (docs/03 "Quy tắc toàn vẹn", FR22).
export function setScopeSelection(draft, envId, on) {
  const has = draft.scopes.includes(envId);
  if (on && !has) draft.scopes = [...draft.scopes, envId];
  if (!on && has) draft.scopes = draft.scopes.filter((id) => id !== envId);
  return draft.scopes;
}

// { title?: code, fields: { [key]: otp reason } }; null when the draft can be saved.
export function draftErrors(draft) {
  const errors = { fields: {} };
  if (!draft.title.trim()) errors.title = 'empty';
  for (const f of draft.fields) {
    if (f.kind !== 'otp') continue;
    const r = parseOtp(f.v);
    if (!r.ok) errors.fields[f.key] = r.reason;
  }
  return errors.title || Object.keys(errors.fields).length ? errors : null;
}

// Creates or updates from a draft that passed draftErrors. Returns the item.
export function commitDraft(vault, draft, ctx) {
  const common = { title: draft.title.trim(), notes: draft.notes, expires: draft.expires || null, scopes: [...draft.scopes] };
  if (draft.id === null) {
    const fields = draft.fields.map(({ label, kind, v, file }) => ({ label, kind, v, ...(file ? { file } : {}) }));
    return createItem(vault, draft.type, { ...common, fields, tags: [...draft.tags] }, ctx);
  }
  const fields = draft.fields.map(({ id, label, kind, v, file }) => ({ ...(id ? { id } : {}), label, kind, v, ...(id ? { file: file ?? null } : file ? { file } : {}) }));
  return updateItem(vault, draft.id, { ...common, fields }, ctx);
}

// New item with the current values, new field ids and empty history, only in `envId`; the original
// loses that env (FR24). Both happen on the session's copy, so they land in one write.
export function forkItem(vault, itemId, envId, ctx) {
  const item = vault.items.find((i) => i.id === itemId);
  if (!item || !itemLiveEnvs(vault, item).some((e) => e.id === envId) || itemLiveEnvs(vault, item).length < 2) return null;
  const fork = createItem(
    vault,
    item.type,
    {
      title: item.title,
      notes: item.notes,
      tags: [...item.tags],
      favorite: item.favorite,
      expires: item.expires,
      scopes: [envId],
      forkedFrom: item.id,
      fields: orderedFields(item).map(({ label, kind, v, file }) => ({ label, kind, v, ...(file ? { file } : {}) })),
    },
    ctx,
  );
  updateItem(vault, item.id, { scopes: item.scopes.filter((id) => id !== envId) }, ctx);
  return fork;
}
