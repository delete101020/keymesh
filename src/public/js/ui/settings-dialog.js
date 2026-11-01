// Settings of this device. Shows only the auto-lock rule that applies to this kind of device (F-AUTH-11).
import { h, openDialog } from './dom.js';
import { BACKGROUND_CHOICES, IDLE_CHOICES } from '../settings.js';

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
  d.setBody(
    h('label', { class: 'f' }, label, select),
    h('p', { class: 'hint' }, 'Chỉ áp dụng trên thiết bị này.'));
  d.setFoot(h('button', { class: 'primary', on: { click: d.close } }, 'Đóng'));
}
