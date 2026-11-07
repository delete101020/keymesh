// Settings of this device. Shows only the auto-lock rule that applies to this kind of device (F-AUTH-11).
import { h, openDialog } from './dom.js';
import { BACKGROUND_CHOICES, IDLE_CHOICES } from '../settings.js';
import { openLogout, openRegister } from './account-dialogs.js';

export function openSettings(app) {
  const d = openDialog(app, { title: 'Cài đặt' });
  const { touch, state } = app;
  const key = touch ? 'backgroundMs' : 'idleMs';
  const choices = touch ? BACKGROUND_CHOICES : IDLE_CHOICES;
  const label = touch ? 'Khoá sau khi chuyển nền' : 'Tự khoá khi không thao tác';
  const select = h('select', {
    'aria-label': label,
    on: { change: (e) => app.changeSettings({ [key]: Number(e.target.value) }, 'Đã lưu.') },
  }, choices.map((c) => h('option', { value: String(c.ms), selected: c.ms === state.settings[key] }, c.label)));
  // KM-006 FR03, FR10: registering is offered to a local account, logging out only to a registered one.
  const account = state.account;
  const accountRow = account?.registered
    ? h('div', { class: 'row-flex' }, h('span', { class: 'grow' }, `Tài khoản: ${account.username}`),
      h('button', { on: { click: () => { d.close(); openLogout(app); } } }, 'Đăng xuất'))
    : h('div', { class: 'row-flex' }, h('span', { class: 'grow hint' }, 'Dữ liệu chỉ ở trên máy này.'),
      h('button', { on: { click: () => { d.close(); openRegister(app); } } }, 'Đăng ký để đồng bộ'));
  d.setBody(
    h('label', { class: 'f' }, label, select),
    h('p', { class: 'hint' }, 'Chỉ áp dụng trên thiết bị này.'),
    h('h3', null, 'Tài khoản'),
    accountRow);
  d.setFoot(h('button', { class: 'primary', on: { click: d.close } }, 'Đóng'));
}
