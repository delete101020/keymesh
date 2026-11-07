// The sync status (KM-006 FR30, FR31, FR33, FR34, NFR11): a bar at the bottom on wide screens, a dot at the
// top on narrow ones, both opening the details. Every state has a word and a symbol, never colour alone.
// The details name vaults and causes only: no item data.
import { h, openDialog } from './dom.js';
import { openLogin, openLogout, openRegister } from './account-dialogs.js';

// docs/06: the most a vault row may hold on the server (FR30).
const LIMIT_BYTES = 2_000_000;
const SYMBOL = { local: '○', 'logged-out': '○', 'needs-login': '⚠', error: '⚠', syncing: '↻', offline: '○', pending: '•', synced: '✓' };
const TONE = { local: 'gray', 'logged-out': 'gray', 'needs-login': 'red', error: 'red', syncing: 'blue', offline: 'gray', pending: 'yellow', synced: 'green' };

const CAUSES = {
  offline: 'Không có kết nối tới server.',
  server: 'Server đang gặp lỗi. Sẽ tự thử lại.',
  'not-found': 'Server không còn vault này. Dữ liệu trên máy giữ nguyên.',
  'too-large': `Vault vượt giới hạn ${LIMIT_BYTES.toLocaleString('vi-VN')} byte của server. Thay đổi vẫn giữ trên máy.`,
  forbidden: 'Server từ chối yêu cầu từ trang này.',
  'bad-request': 'Server không nhận dữ liệu gửi lên. Thay đổi vẫn giữ trên máy.',
  'invalid-remote': 'Bản trên server không giải mã được hoặc không hợp lệ. Không có gì trên máy bị ghi đè.',
  'server-older': 'Server đang có bản cũ hơn bản trên máy. Không có gì trên máy bị ghi đè.',
  damaged: 'Vault trên máy không mở được. Dữ liệu đang lưu không bị thay đổi.',
  unsupported: 'Vault cần bản app mới hơn. Dữ liệu đang lưu không bị thay đổi.',
};

export function relativeTime(at, now = Date.now()) {
  if (!at) return '';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return new Date(at).toLocaleString('vi-VN');
}

// FR31: one line for the whole app, in the order of priority sync.js already applied.
export function statusText(st, now = Date.now()) {
  if (!st) return 'Chỉ trên máy này';
  const n = st.pending;
  switch (st.kind) {
    case 'local': return 'Chỉ trên máy này';
    case 'logged-out': return 'Đã đăng xuất';
    case 'needs-login': return 'Cần đăng nhập lại';
    case 'error': return 'Lỗi đồng bộ';
    case 'syncing': return 'Đang đồng bộ…';
    case 'offline': return n > 0 ? `Offline – ${n} thay đổi chờ` : 'Offline';
    case 'pending': return n > 0 ? `${n} thay đổi chờ` : 'Thay đổi chờ';
    default: return st.lastOk ? `Đã đồng bộ · ${relativeTime(st.lastOk, now)}` : 'Đã đồng bộ';
  }
}

const kindOf = (st) => st?.kind ?? 'local';
let details = null; // the open details dialog, redrawn when the status changes

// The bottom bar (wide screens). role=status: changes are read out without moving focus.
export function renderStatusBar(app) {
  const st = app.syncStatus;
  const kind = kindOf(st);
  if (details?.isOpen) fillDetails(app, details);
  return h('button', {
    class: `syncbar tone-${TONE[kind]}`,
    fk: 'sync-bar',
    'aria-label': `Trạng thái đồng bộ: ${statusText(st)}. Mở chi tiết`,
    on: { click: () => openSyncDetails(app) },
  },
  h('span', { class: 'sync-sym', 'aria-hidden': 'true' }, SYMBOL[kind]),
  h('span', { class: 'grow', role: 'status' }, statusText(st)),
  st?.large ? h('span', { class: 'sync-large' }, '⚠ Vault gần giới hạn dung lượng') : null);
}

// The dot in the header (narrow screens). A 44 px target with the full status as its name.
export function renderStatusDot(app) {
  const st = app.syncStatus;
  const kind = kindOf(st);
  return h('button', {
    class: `icon syncdot tone-${TONE[kind]}`,
    fk: 'sync-dot',
    'aria-label': `Trạng thái đồng bộ: ${statusText(st)}${st?.large ? ', vault gần giới hạn dung lượng' : ''}. Mở chi tiết`,
    on: { click: () => openSyncDetails(app) },
  }, h('span', { class: 'dot', 'aria-hidden': 'true' }, SYMBOL[kind]));
}

function fillDetails(app, d) {
  const st = app.syncStatus;
  const kind = kindOf(st);
  const account = app.state.account;
  const rows = (st?.vaults ?? []).map((v) => {
    const state = v.error ? `${SYMBOL.error} Lỗi` : kind === 'synced' || (!v.error && v.lastOk) ? `${SYMBOL.synced} Đã đồng bộ` : statusText(st);
    return h('div', { class: 'sync-vault' },
      h('div', { class: 'row-flex' }, h('b', { class: 'grow' }, v.name || 'Vault không mở được'), h('span', null, state)),
      v.lastOk ? h('div', { class: 'hint' }, `Lần thành công gần nhất: ${relativeTime(v.lastOk)}`) : null,
      v.error ? h('div', { class: 'err' }, CAUSES[v.error] ?? CAUSES.damaged) : null,
      v.large ? h('div', { class: 'hint warn' }, `Vault đã dùng ${v.size.toLocaleString('vi-VN')} byte, giới hạn là ${LIMIT_BYTES.toLocaleString('vi-VN')} byte. Vẫn đồng bộ bình thường.`) : null);
  });
  const lead = {
    local: 'Dữ liệu chỉ nằm trên máy này. Đăng ký để dùng trên thiết bị khác.',
    'logged-out': 'Đã đăng xuất: dữ liệu vẫn trên máy, nhưng không đồng bộ cho tới khi đăng nhập lại.',
    'needs-login': 'Phiên đăng nhập đã hết. Dữ liệu và thay đổi vẫn giữ trên máy; đăng nhập lại để đồng bộ tiếp.',
  }[kind];
  d.setBody(
    h('p', { class: `sync-now-line tone-${TONE[kind]}` }, h('span', { 'aria-hidden': 'true' }, `${SYMBOL[kind]} `), statusText(st)),
    lead ? h('p', { class: 'hint' }, lead) : null,
    st?.cause && !st.vaults?.some((v) => v.error) ? h('p', { class: 'err' }, CAUSES[st.cause]) : null,
    rows);
  const buttons = [h('button', { on: { click: d.close } }, 'Đóng')];
  if (!account?.registered) buttons.push(h('button', { class: 'primary', on: { click: () => { d.close(); openRegister(app); } } }, 'Đăng ký để đồng bộ'));
  else if (kind === 'needs-login' || kind === 'logged-out') buttons.push(h('button', { class: 'primary', on: { click: () => { d.close(); openLogin(app, { username: account.username }); } } }, 'Đăng nhập lại'));
  else {
    buttons.push(h('button', { on: { click: () => { d.close(); openLogout(app); } } }, 'Đăng xuất'));
    buttons.push(h('button', { class: 'primary', fk: 'sync-now', disabled: Boolean(st?.running), on: { click: () => app.syncNow() } }, 'Đồng bộ ngay'));
  }
  d.setFoot(...buttons);
}

export function openSyncDetails(app) {
  details = openDialog(app, { title: 'Đồng bộ', onClose: () => { details = null; } });
  fillDetails(app, details);
}
