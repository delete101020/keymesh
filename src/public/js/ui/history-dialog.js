// Versions of an item with their differences from the current one. A masked value is created in the
// DOM only when its button is pressed; an otp row has no value to show at all.
import { h, openDialog } from './dom.js';
import { icon } from './icons.js';
import { diffVersion } from '../history-diff.js';

const REASONS = { edit: 'Sửa', restore: 'Khôi phục', conflict: 'Xung đột' };
const ATTR_LABELS = { title: 'Tiêu đề', notes: 'Ghi chú', expires: 'Hạn', scopes: 'Gán env' };
const CHANGE_LABELS = { added: 'field thêm sau bản này', removed: 'field đã xoá sau bản này', changed: null };

function scopeNames(app, ids) {
  const v = app.vault;
  const names = ids.map((id) => {
    const e = v.envs.find((x) => x.id === id);
    if (!e) return null;
    const p = v.projects.find((x) => x.id === e.projectId);
    const gone = e.deletedAt !== null || p?.deletedAt !== null;
    return `${p?.name ?? ''} / ${e.name}${gone ? ' (đã xoá)' : ''}`;
  }).filter(Boolean);
  return names.length ? names.join(', ') : 'Chưa gán';
}

const show = (v) => (v === null || v === '' ? '(trống)' : v);

function values(before, after) {
  return [
    before === null ? null : h('div', null, h('span', { class: 'diff-del' }, show(before))),
    after === null ? null : h('div', null, h('span', { class: 'diff-add' }, show(after))),
  ];
}

function diffRow(app, row) {
  if (row.attr === 'scopes') {
    return h('div', { class: 'diff-row' }, h('div', { class: 'lbl' }, ATTR_LABELS.scopes), values(scopeNames(app, row.before), scopeNames(app, row.after)));
  }
  const name = row.attr === 'field' ? row.label : ATTR_LABELS[row.attr];
  const note = CHANGE_LABELS[row.change];
  const label = h('div', { class: 'lbl' }, note ? `${name} · ${note}` : name, row.labelBefore ? ` (trước đây: ${row.labelBefore})` : '');
  if (row.otp) return h('div', { class: 'diff-row' }, label, h('div', null, 'Đã đổi'));
  if (!row.masked) return h('div', { class: 'diff-row' }, label, values(row.before, row.after));
  const box = h('div', { class: 'diff-row' }, label);
  const mask = h('div', { class: 'diff-val' }, '••••••••');
  const reveal = h('button', { 'aria-label': `Hiện giá trị ${name}`, on: { click: () => {
    mask.remove();
    reveal.replaceWith(...values(row.before, row.after).filter(Boolean));
  } } }, icon('eye'), 'Hiện');
  box.append(mask, reveal);
  return box;
}

export function openHistory(app, itemId) {
  const d = openDialog(app, { title: 'Lịch sử' });
  const item = () => app.vault.items.find((i) => i.id === itemId);
  const restore = async (entry) => {
    const r = await app.restoreVersion(entry);
    if (r.ok) d.close();
  };
  const history = item().history;
  d.setBody(history.length
    ? history.map((entry) => {
      const rows = diffVersion(item(), entry);
      return h('div', { class: 'hist-entry' },
        h('div', { class: 'hist-head' },
          h('b', { class: 'grow' }, new Date(entry.at).toLocaleString('vi-VN')),
          h('span', { class: 'chip' }, REASONS[entry.reason] ?? entry.reason),
          h('button', { on: { click: () => restore(entry) } }, 'Khôi phục bản này')),
        rows.length ? rows.map((row) => diffRow(app, row)) : h('div', { class: 'hint' }, 'Giống bản hiện tại.'));
    })
    : h('p', { class: 'hint' }, 'Item này chưa có bản cũ nào.'));
  d.setFoot(h('button', { class: 'primary', on: { click: d.close } }, 'Đóng'));
}
