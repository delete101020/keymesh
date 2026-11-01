// Right column, reading an item. Secret values enter the DOM only after the user asks; an otp secret never does.
import { h, openDialog } from './dom.js';
import { icon } from './icons.js';
import { TYPE_LABELS } from './list.js';
import { envColorClass } from './project-dialogs.js';
import { openHistory } from './history-dialog.js';
import { daysLeft, itemLiveEnvs, liveProjects, orderedFields, sharedChip } from '../vault-query.js';
import { parseOtp, secondsLeft, totp } from '../otp.js';
import { fieldFileBytes, formatSize } from '../field-file.js';

const SECRET_KINDS = new Set(['secret', 'secret-multi']);
const MULTI_KINDS = new Set(['multi', 'secret-multi']);
const MASK = '••••••••••';
const OTP_TICK_MS = 250;

let otpTimers = [];

export function stopOtpTicks() {
  for (const t of otpTimers) clearInterval(t);
  otpTimers = [];
}

function otpBox(field) {
  const parsed = parseOtp(field.v);
  if (!parsed.ok) return h('span', { class: 'muted' }, 'Secret không hợp lệ');
  const code = h('span', { class: 'otp-code', 'aria-label': `Mã OTP ${field.label}` });
  const left = h('span', { class: 'otp-left' });
  const bar = h('progress', { max: parsed.period, 'aria-hidden': 'true' });
  let shownCounter = null;
  let alive = true;
  const tick = async () => {
    const now = Date.now();
    const remaining = secondsLeft(parsed, now);
    left.textContent = `${remaining}s`;
    bar.value = remaining;
    const counter = Math.floor(now / 1000 / parsed.period);
    if (counter === shownCounter) return;
    shownCounter = counter;
    const value = await totp(parsed, now);
    if (alive) code.textContent = value;
  };
  tick();
  const timer = setInterval(tick, OTP_TICK_MS);
  otpTimers.push(timer);
  stopHooks.add(() => {
    alive = false;
  });
  return h('span', { class: 'otp' }, code, bar, left);
}

const stopHooks = new Set();

function isOpenable(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function download(field) {
  const url = URL.createObjectURL(new Blob([fieldFileBytes(field.v)], { type: 'application/octet-stream' }));
  const a = h('a', { href: url, download: field.file });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fieldRow(app, item, f) {
  const shown = app.state.revealed.has(f.id);
  const hasValue = f.v !== '';
  const fileMode = Boolean(f.file) && hasValue;
  const maskable = hasValue && f.kind !== 'otp' && (SECRET_KINDS.has(f.kind) || fileMode);
  let value;
  if (f.kind === 'otp') value = otpBox(f);
  else if (!hasValue) value = h('span', { class: 'muted' }, '—');
  else if (fileMode && !shown) value = h('span', { class: 'muted' }, `${f.file} · ${formatSize(fieldFileBytes(f.v).length)}`);
  else if (maskable && !shown) value = h('span', { 'aria-label': `${f.label} đang được che` }, MASK);
  else value = f.v;
  return h('div', { class: 'field' },
    h('div', { class: 'lbl' }, f.label),
    h('div', { class: `val${MULTI_KINDS.has(f.kind) && (shown || !maskable) ? ' pre' : ''}` }, value),
    h('div', { class: 'acts' },
      maskable ? h('button', { class: 'icon', 'aria-label': `${shown ? 'Che' : 'Hiện'} ${f.label}`, fk: `reveal-${f.id}`, on: { click: () => app.toggleReveal(f.id) } }, icon(shown ? 'eyeOff' : 'eye')) : null,
      f.kind === 'url' && isOpenable(f.v) ? h('a', { class: 'icon-link', href: f.v, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Mở ${f.label}` }, icon('ext')) : null,
      fileMode ? h('button', { class: 'icon', 'aria-label': `Tải ${f.file}`, fk: `dl-${f.id}`, on: { click: () => download(f) } }, icon('download')) : null,
      hasValue ? h('button', { class: 'icon', 'aria-label': `Copy ${f.label}`, fk: `copy-${f.id}`, on: { click: () => app.copyField(item, f) } }, icon('copy')) : null));
}

function expiryChip(item) {
  const left = daysLeft(item.expires, Date.now());
  if (left === null) return null;
  if (left < 0) return h('span', { class: 'chip danger' }, icon('clock'), 'Đã hết hạn');
  const text = left === 0 ? 'Hết hạn hôm nay' : `Còn ${left} ngày`;
  return h('span', { class: `chip${left <= 14 ? ' warn' : ''}` }, icon('clock'), text);
}

function openFork(app, item) {
  const d = openDialog(app, { title: 'Tách bản riêng cho env nào?' });
  const envs = itemLiveEnvs(app.vault, item);
  const projects = liveProjects(app.vault);
  let chosen = envs[0].id;
  d.setBody(
    h('p', { class: 'hint' }, 'Item mới chỉ nằm ở env đã chọn và độc lập từ đây; item này bỏ env đó.'),
    envs.map((e) => h('label', { class: 'row-flex' },
      h('input', { type: 'radio', name: 'fork-env', checked: e.id === chosen, on: { change: () => { chosen = e.id; } } }),
      `${projects.find((p) => p.id === e.projectId).name} / ${e.name}`)));
  d.setFoot(
    h('button', { on: { click: d.close } }, 'Huỷ'),
    h('button', { class: 'primary', on: { click: async () => {
      const r = await app.fork(chosen);
      if (r.ok) d.close();
    } } }, 'Tách item'));
}

export function renderDetail(app) {
  stopHooks.forEach((fn) => fn());
  stopHooks.clear();
  stopOtpTicks();
  const item = app.selectedItem();
  if (!item) return h('p', { class: 'empty' }, 'Chọn một item để xem, hoặc bấm Thêm item.');
  const v = app.vault;
  const projects = liveProjects(v);
  const envs = itemLiveEnvs(v, item);
  const shared = sharedChip(v, item, app.state.filter);
  const origin = item.forkedFrom ? v.items.find((i) => i.id === item.forkedFrom && i.deletedAt === null && i.purgedAt === null) : null;
  return [
    h('div', { class: 'dh' },
      h('h2', { tabindex: -1, fk: 'detail-title' }, item.title),
      h('button', { fk: 'edit-item', on: { click: () => app.startEdit() } }, icon('edit'), 'Sửa'),
      h('button', { fk: 'dup-item', on: { click: () => app.startDuplicate() } }, icon('dup'), 'Nhân bản'),
      h('button', { fk: 'hist-item', on: { click: () => openHistory(app, item.id) } }, icon('history'), 'Lịch sử'),
      app.canFork(item) ? h('button', { fk: 'fork-item', on: { click: () => openFork(app, item) } }, icon('fork'), 'Fork') : null),
    h('div', { class: 'meta' },
      h('span', { class: 'badge' }, TYPE_LABELS[item.type]),
      envs.map((e) => h('span', { class: `chip ${envColorClass(e.color)}` }, h('span', { class: 'env-dot' }), `${projects.find((p) => p.id === e.projectId).name} / ${e.name}`)),
      envs.length === 0 ? h('span', { class: 'chip' }, 'Chưa gán') : null,
      shared ? h('span', { class: 'chip shared' }, icon('link'), shared) : null,
      expiryChip(item),
      origin ? h('button', { class: 'chip', fk: 'fork-origin', on: { click: () => app.selectItem(origin.id) } }, icon('fork'), `Tách từ: ${origin.title}`) : null),
    orderedFields(item).length
      ? h('div', { class: 'section' }, h('h3', null, 'Field'), h('div', { class: 'fields' }, orderedFields(item).map((f) => fieldRow(app, item, f))))
      : null,
    item.notes ? h('div', { class: 'section' }, h('h3', null, 'Ghi chú'), h('div', { class: 'notes' }, item.notes)) : null,
    h('div', { class: 'foot-meta' }, `Sửa lần cuối: ${new Date(item.updatedAt).toLocaleString('vi-VN')}`),
  ];
}
