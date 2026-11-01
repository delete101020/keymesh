// Middle column: the items of the current filter or search.
import { h } from './dom.js';
import { icon } from './icons.js';
import { isExpiring, itemLiveEnvs, liveEnvs, liveItems, liveProjects, sharedChip } from '../vault-query.js';

export const TYPE_LABELS = Object.freeze({ login: 'Login', api_key: 'API key', token: 'Token', ssh: 'SSH', db: 'Database', server: 'Server', vpn: 'VPN', doc: 'Doc', note: 'Note' });

function heading(app) {
  const { filter, query } = app.state;
  if (query) return `Kết quả cho “${query}”`;
  const v = app.vault;
  if (filter.k === 'project') return liveProjects(v).find((p) => p.id === filter.id)?.name ?? '';
  if (filter.k === 'env') {
    const e = liveEnvs(v).find((x) => x.id === filter.id);
    const p = e && liveProjects(v).find((x) => x.id === e.projectId);
    return e ? `${p.name} › ${e.name}` : '';
  }
  return { all: 'Tất cả', unassigned: 'Chưa gán', expiring: 'Sắp hết hạn' }[filter.k];
}

function emptyMessage(app) {
  const { filter, query } = app.state;
  const v = app.vault;
  if (query) return 'Không tìm thấy item nào. Hãy thử từ khác; tìm kiếm không xét giá trị bí mật.';
  if (liveItems(v).length === 0) return 'Vault chưa có item nào. Bấm Thêm item để tạo item đầu tiên.';
  if (filter.k === 'project' && liveEnvs(v, filter.id).length === 0) return 'Project này chưa có env. Thêm env trong Quản lý project, rồi gán item vào đó.';
  if (filter.k === 'unassigned') return 'Mọi item đều đã gán vào env.';
  if (filter.k === 'expiring') return 'Không có item nào sắp hết hạn.';
  return 'Chưa có item nào ở đây. Bấm Thêm item, hoặc sửa một item để gán vào đây.';
}

function row(app, item, now) {
  const v = app.vault;
  const envs = itemLiveEnvs(v, item);
  const shared = sharedChip(v, item, app.state.filter);
  const expiring = isExpiring(item, now);
  return h('button', {
    class: `row${item.id === app.state.selectedId ? ' on' : ''}`,
    fk: `item-${item.id}`,
    'aria-label': item.title,
    'aria-current': item.id === app.state.selectedId ? 'true' : null,
    on: { click: () => app.selectItem(item.id) },
  },
  h('span', { class: 't' },
    h('span', { class: 'badge' }, TYPE_LABELS[item.type]),
    h('span', { class: 'ttl grow' }, item.title),
    shared ? h('span', { class: 'flag shared', title: shared }, icon('link'), h('span', { class: 'visually-hidden' }, 'Dùng chung')) : null,
    expiring ? h('span', { class: 'flag exp', title: 'Sắp hết hạn' }, icon('clock'), h('span', { class: 'visually-hidden' }, 'Sắp hết hạn')) : null),
  h('span', { class: 'sub' }, envs.length ? envs.map((e) => e.name).join(', ') : 'Chưa gán'));
}

export function renderList(app) {
  const now = Date.now();
  const items = app.items();
  return [
    h('div', { class: 'list-head' },
      h('h2', { tabindex: -1, fk: 'list-head' }, heading(app)),
      h('button', { class: 'primary', fk: 'add-item', on: { click: () => app.startNew() } }, icon('plus'), 'Thêm item')),
    items.length ? items.map((i) => row(app, i, now)) : h('p', { class: 'empty' }, emptyMessage(app)),
  ];
}
