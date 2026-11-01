// Differences between a history entry and the current item, one row per attribute or field.
// otp rows never carry a value, so a later bug in a screen cannot show a TOTP secret.
const SECRET_KINDS = new Set(['secret', 'secret-multi']);

const liveById = (fields) => new Map(fields.filter((f) => f.deletedAt === null).map((f) => [f.id, f]));

function fieldRow(id, before, after) {
  const was = before ?? after;
  const row = { attr: 'field', fieldId: id, label: (after ?? before).label, change: !before ? 'added' : !after ? 'removed' : 'changed' };
  if (was.kind === 'otp' || after?.kind === 'otp') return { ...row, otp: true };
  const masked = SECRET_KINDS.has(before?.kind) || SECRET_KINDS.has(after?.kind);
  const out = { ...row, masked, before: before?.v ?? null, after: after?.v ?? null };
  if (before && after && before.label !== after.label) out.labelBefore = before.label;
  return out;
}

const sameField = (a, b) => a.label === b.label && a.kind === b.kind && a.v === b.v && a.file === b.file;

export function diffVersion(item, entry) {
  const rows = [];
  for (const attr of ['title', 'notes', 'expires']) {
    if (entry[attr] !== item[attr]) rows.push({ attr, before: entry[attr], after: item[attr], masked: false });
  }
  const before = liveById(entry.fields);
  const after = liveById(item.fields);
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(id);
    const a = after.get(id);
    if (!b || !a || !sameField(b, a)) rows.push(fieldRow(id, b, a));
  }
  const scopesOld = [...entry.scopes].sort();
  const scopesNew = [...item.scopes].sort();
  if (JSON.stringify(scopesOld) !== JSON.stringify(scopesNew)) rows.push({ attr: 'scopes', before: entry.scopes, after: item.scopes, masked: false });
  return rows;
}
