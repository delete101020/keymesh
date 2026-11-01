// Left column: filters and the project/env tree.
import { h } from './dom.js';
import { icon } from './icons.js';
import { filterCounts, liveEnvs, liveProjects } from '../vault-query.js';
import { openAddProject, openManageProject, envColorClass } from './project-dialogs.js';

function filterButton(app, filter, label, count, { iconName, cls = '', fk, dot } = {}) {
  const { filter: cur, query } = app.state;
  const on = !query && cur.k === filter.k && cur.id === filter.id;
  return h('button', {
    class: `nav-item ${cls}${on ? ' on' : ''}`,
    'aria-current': on ? 'true' : null,
    'aria-label': `${label}, ${count} item`,
    fk: fk ?? `nav-${filter.k}-${filter.id ?? ''}`,
    on: { click: () => app.setFilter(filter) },
  }, iconName ? icon(iconName) : null, dot ?? null, h('span', { class: 'name' }, label), h('span', { class: 'count', 'aria-hidden': 'true' }, String(count)));
}

export function renderNav(app) {
  const v = app.vault;
  const counts = filterCounts(v, Date.now());
  const tree = [];
  for (const p of liveProjects(v)) {
    tree.push(h('div', { class: 'nav-row' },
      filterButton(app, { k: 'project', id: p.id }, p.name, counts.projects.get(p.id) ?? 0, { cls: 'project' }),
      h('button', { class: 'icon', 'aria-label': `Quản lý project ${p.name}`, fk: `manage-${p.id}`, on: { click: () => openManageProject(app, p.id) } }, icon('more'))));
    for (const e of liveEnvs(v, p.id)) {
      tree.push(filterButton(app, { k: 'env', id: e.id }, e.name, counts.envs.get(e.id) ?? 0, {
        cls: 'env',
        dot: h('span', { class: `env-dot ${envColorClass(e.color)}` }),
      }));
    }
  }
  return [
    h('div', { class: 'muted hint', 'aria-label': 'Vault đang mở' }, app.vaultName),
    filterButton(app, { k: 'all' }, 'Tất cả', counts.all, { iconName: 'inbox', fk: 'nav-all' }),
    filterButton(app, { k: 'unassigned' }, 'Chưa gán', counts.unassigned, { iconName: 'link' }),
    filterButton(app, { k: 'expiring' }, 'Sắp hết hạn', counts.expiring, { iconName: 'clock' }),
    h('div', { class: 'nav-sec' },
      h('span', null, 'Dự án'),
      h('button', { class: 'icon', 'aria-label': 'Thêm project', fk: 'add-project', on: { click: () => openAddProject(app) } }, icon('plus'))),
    tree,
  ];
}
