// The top of the home screen on narrow screens: what was used lately and what was starred. CSS hides it
// on wide screens. One tap from here opens the item, one more copies (docs/07 § Mobile).
import { h } from './dom.js';
import { TYPE_LABELS } from './list.js';
import { favoriteItems, itemLiveEnvs, recentItems } from '../vault-query.js';

function homeRow(app, item, fk) {
  const envs = itemLiveEnvs(app.vault, item);
  return h('button', {
    class: 'row home-row',
    'aria-label': item.title,
    fk,
    on: { click: () => app.selectItem(item.id, { fromHome: true }) },
  },
  h('span', { class: 't' }, h('span', { class: 'badge' }, TYPE_LABELS[item.type]), h('span', { class: 'ttl grow' }, item.title)),
  h('span', { class: 'sub' }, envs.length ? envs.map((e) => e.name).join(', ') : 'Chưa gán'));
}

const section = (title, rows) => (rows.length ? h('section', { class: 'home-sec' }, h('div', { class: 'nav-sec' }, h('span', null, title)), rows) : null);

export function renderHome(app) {
  const v = app.vault;
  const recents = recentItems(v, app.state.settings.recents);
  return h('div', { class: 'home' },
    section('Gần đây', recents.map((i) => homeRow(app, i, `home-recent-${i.id}`))),
    section('Yêu thích', favoriteItems(v).map((i) => homeRow(app, i, `home-fav-${i.id}`))));
}
