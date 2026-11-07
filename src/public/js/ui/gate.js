// Everything shown while no vault is open: setup, unlock, and the errors that stop the app.
import { h, form, field } from './dom.js';
import { icon } from './icons.js';
import { loginMessage, openReplace, strengthMeter } from './account-dialogs.js';

const MIN_LENGTH = 12;

const MESSAGES = {
  'wrong-password': 'Sai mật khẩu hoặc dữ liệu hỏng.',
  'other-tab': 'KeyMesh đang mở khoá ở một tab khác của trình duyệt này. Hãy khoá hoặc đóng tab đó rồi thử lại.',
  'vault-damaged': 'Không mở được vault vì dữ liệu đã hỏng. Dữ liệu đang lưu không bị thay đổi.',
  unsupported: 'Dữ liệu này cần trình duyệt hoặc bản app mới hơn. Dữ liệu đang lưu không bị thay đổi.',
  storage: 'Không đọc hoặc ghi được bộ lưu trữ của trình duyệt. Không có gì được thay đổi.',
  'no-account': 'Dữ liệu trên máy này đã bị xoá ở một tab khác.',
};

const logo = () => h('div', { class: 'logo' }, h('span', { class: 'mark' }, icon('key')), 'KeyMesh');

const card = (...children) => h('div', { class: 'gate' }, h('main', { class: 'card' }, logo(), ...children));

export function renderSetup(app) {
  const first = h('input', { type: 'password', autocomplete: 'new-password', fk: 'setup-pw' });
  const second = h('input', { type: 'password', autocomplete: 'new-password' });
  const warn = h('div', { class: 'hint warn', hidden: true }, `Mật khẩu ngắn hơn ${MIN_LENGTH} ký tự thì dễ đoán hơn. Bạn vẫn có thể tiếp tục.`);
  const error = h('div', { class: 'err', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'primary block' }, 'Tạo tài khoản');
  first.addEventListener('input', () => {
    const n = [...first.value.normalize('NFC')].length;
    warn.hidden = n === 0 || n >= MIN_LENGTH;
  });
  const go = async () => {
    error.textContent = '';
    if (!first.value) return void (error.textContent = 'Hãy nhập master password.');
    if (first.value.normalize('NFC') !== second.value.normalize('NFC')) return void (error.textContent = 'Hai lần nhập không khớp.');
    submit.disabled = true;
    const r = await app.createAccount(first.value);
    if (!r.ok) {
      submit.disabled = false;
      error.textContent = MESSAGES[r.error] ?? MESSAGES.storage;
    }
  };
  const el = card(
    h('h1', null, 'Tạo tài khoản'),
    h('p', { class: 'lead' }, 'Một master password mở toàn bộ dữ liệu của bạn.'),
    form({ class: 'stack' }, go,
      field('Master password', first),
      strengthMeter(first),
      warn,
      field('Nhập lại master password', second),
      h('div', { class: 'callout warn' }, icon('warn'), h('div', { class: 'grow' },
        h('p', null, 'Không có cách khôi phục khi quên master password.'),
        h('p', null, 'Dữ liệu chỉ nằm trên trình duyệt này. Xoá dữ liệu trình duyệt là mất hết.'))),
      error,
      submit),
    // KM-006 FR01: the other way in on an empty device.
    h('div', { class: 'gate-alt' },
      h('span', { class: 'hint' }, 'Đã có tài khoản trên server?'),
      h('button', { class: 'link', fk: 'to-login', on: { click: () => el.replaceWith(renderLogin(app, () => renderSetup(app))) } }, 'Đăng nhập')),
  );
  return el;
}

// KM-006 FR06–FR09: from the empty device or the lock screen. `back` builds the screen to return to.
export function renderLogin(app, back) {
  const user = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', fk: 'login-user' });
  const pw = h('input', { type: 'password', autocomplete: 'current-password' });
  const error = h('div', { class: 'err', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'primary block' }, 'Đăng nhập');
  const go = async () => {
    error.textContent = '';
    submit.disabled = true;
    const r = await app.login({ username: user.value.trim(), password: pw.value });
    submit.disabled = false;
    if (r.ok) return;
    if (r.choose) return openReplace(app, r.choose);
    error.textContent = loginMessage(r);
    pw.select();
  };
  const el = card(
    h('h1', null, 'Đăng nhập'),
    h('p', { class: 'lead' }, 'Tải dữ liệu của tài khoản về máy này. Sau đó mở khoá không cần mạng.'),
    form({ class: 'stack' }, go, field('Username', user), field('Master password', pw), error, submit),
    h('div', { class: 'gate-alt' }, h('button', { class: 'link', on: { click: () => el.replaceWith(back()) } }, 'Quay lại')),
  );
  queueMicrotask(() => user.focus());
  return el;
}

export function renderUnlock(app) {
  const pw = h('input', { type: 'password', autocomplete: 'current-password', fk: 'unlock-pw' });
  const error = h('div', { class: 'err', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'primary block' }, 'Mở khoá');
  const go = async () => {
    error.textContent = '';
    submit.disabled = true;
    const r = await app.unlock(pw.value);
    if (!r.ok) {
      submit.disabled = false;
      error.textContent = MESSAGES[r.error] ?? MESSAGES.storage;
      pw.select();
    }
  };
  const who = app.state.account?.username;
  const el = card(
    h('h1', null, 'Đã khoá'),
    h('p', { class: 'lead' }, 'Mở khoá diễn ra trên máy này, không cần mạng.'),
    who ? h('p', { class: 'hint' }, `Tài khoản: ${who}`) : null,
    form({ class: 'stack' }, go, field('Master password', pw), error, submit),
    // FR09: works without this account's password, so a forgotten one does not lock the device out.
    h('div', { class: 'gate-alt' },
      h('button', { class: 'link', fk: 'to-login', on: { click: () => el.replaceWith(renderLogin(app, () => renderUnlock(app))) } }, who ? 'Đăng nhập tài khoản khác' : 'Đăng nhập')),
  );
  return el;
}

export function renderError(detail) {
  return card(
    h('h1', null, 'Không chạy được KeyMesh'),
    h('div', { class: 'callout danger', role: 'alert' }, icon('warn'), h('div', { class: 'grow' },
      h('p', null, detail.kind === 'unsupported'
        ? 'Trình duyệt này thiếu tính năng mà KeyMesh cần để giữ dữ liệu an toàn. Hãy dùng Chrome, Safari hoặc Firefox bản mới.'
        : 'Không dùng được bộ lưu trữ của trình duyệt, ví dụ trong một số chế độ riêng tư. Hãy mở bằng cửa sổ thường.'),
      detail.what ? h('p', { class: 'mono' }, detail.what) : null)),
  );
}
