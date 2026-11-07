// Register, log in again, replace the account on this device, log out (KM-006 FR02, FR03, FR09–FR12, FR25).
import { h, openDialog, form, field } from './dom.js';
import { icon } from './icons.js';
import { passwordStrength, STRENGTH_LABELS } from '../password-strength.js';

// The word typed to confirm losing data that is not on the server (plan decision 9).
export const CONFIRM_WORD = 'XOÁ';

export const LOGIN_MESSAGES = {
  'invalid-credentials': 'Sai username hoặc master password.',
  network: 'Không kết nối được tới server. Kiểm tra mạng rồi thử lại; dữ liệu trên máy không đổi.',
  incompatible: 'Server trả về tham số không tương thích với bản app này, nên không có gì được gửi đi.',
  server: 'Server đang gặp lỗi. Hãy thử lại sau; dữ liệu trên máy không đổi.',
  'vault-damaged': 'Đã tải về nhưng không mở được dữ liệu của tài khoản. Không có gì được ghi xuống máy này.',
  'other-tab': 'KeyMesh đang mở khoá ở một tab khác của trình duyệt này. Hãy khoá hoặc đóng tab đó rồi thử lại.',
  storage: 'Không ghi được bộ lưu trữ của trình duyệt. Không có gì được thay đổi.',
  'bad-request': 'Server không nhận yêu cầu này. Dữ liệu trên máy không đổi.',
  forbidden: 'Server từ chối yêu cầu từ trang này.',
};

export const loginMessage = (r) => (r.error === 'rate-limited' ? `Thử sai quá nhiều lần. Hãy thử lại sau ${r.minutes} phút; dữ liệu trên máy vẫn dùng được.` : LOGIN_MESSAGES[r.error] ?? LOGIN_MESSAGES.storage);

const REGISTER_MESSAGES = {
  username: 'Username gồm 1–64 ký tự: chữ cái không dấu, chữ số và . _ - @ +.',
  'wrong-password': 'Sai master password.',
  network: 'Không kết nối được tới server. Tài khoản vẫn chỉ ở trên máy này và dùng được như trước; hãy thử lại.',
  'registration-closed': 'Server đang đóng đăng ký, hoặc token đăng ký không đúng. Tài khoản vẫn chỉ ở trên máy này.',
  'username-taken': 'Username này đã có trên server. Nếu là của bạn, hãy đăng nhập bằng tên này.',
  'vault-exists': 'Vault của máy này đã có trên server. Nếu bạn đã đăng ký từ máy này, hãy đăng nhập.',
  server: 'Server đang gặp lỗi. Tài khoản vẫn chỉ ở trên máy này; hãy thử lại sau.',
  'bad-request': 'Server không nhận dữ liệu đăng ký. Tài khoản vẫn chỉ ở trên máy này.',
  forbidden: 'Server từ chối yêu cầu từ trang này.',
  storage: 'Đăng ký xong trên server nhưng chưa ghi được xuống máy. Hãy đăng nhập bằng tên vừa đăng ký.',
};

// A meter under a password input (FR02). Shown, never blocking. `onWeak` adds a warning of its own.
export function strengthMeter(input, { weakNote = null } = {}) {
  const bar = h('meter', { min: 0, max: 3, low: 1.5, high: 2.5, optimum: 3, value: 0, 'aria-hidden': 'true' });
  const label = h('span', { class: 'strength-label' });
  const note = weakNote ? h('div', { class: 'hint warn', hidden: true }, weakNote) : null;
  const box = h('div', { class: 'strength', hidden: true, 'aria-live': 'polite' }, bar, label);
  const update = () => {
    const s = passwordStrength(input.value);
    box.hidden = s === null;
    bar.value = { weak: 1, fair: 2, strong: 3 }[s] ?? 0;
    box.dataset.level = s ?? '';
    label.textContent = s ? `Độ mạnh: ${STRENGTH_LABELS[s]}` : '';
    if (note) note.hidden = s !== 'weak';
  };
  input.addEventListener('input', update);
  return [box, note];
}

// FR03: the account on this device goes to the server with the keys it already has.
export function openRegister(app) {
  const d = openDialog(app, { title: 'Đăng ký để đồng bộ' });
  const username = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', fk: 'reg-user' });
  const token = h('input', { type: 'password', autocomplete: 'off', fk: 'reg-token' });
  const pw = h('input', { type: 'password', autocomplete: 'current-password', fk: 'reg-pw' });
  const error = h('div', { class: 'err', role: 'alert' });
  const after = h('div');
  const submit = h('button', { type: 'submit', class: 'primary' }, 'Đăng ký');
  const go = async () => {
    error.textContent = '';
    after.replaceChildren();
    submit.disabled = true;
    const r = await app.register({ username: username.value.trim(), registrationToken: token.value, password: pw.value });
    submit.disabled = false;
    if (r.ok) return d.close();
    error.textContent = REGISTER_MESSAGES[r.error] ?? REGISTER_MESSAGES.storage;
    if (r.error === 'username-taken' || r.error === 'vault-exists') {
      after.append(h('button', { on: { click: () => {
        const name = username.value.trim();
        d.close();
        openLogin(app, { username: name });
      } } }, 'Đăng nhập bằng tên này'));
    }
  };
  d.setBody(form({ class: 'stack', id: 'register-form' }, go,
    h('p', { class: 'hint' }, 'Dữ liệu đang có trên máy này được đưa lên server, đã mã hoá. Master password giữ nguyên.'),
    field('Username', username),
    field('Token đăng ký', token),
    field('Master password hiện tại', pw),
    strengthMeter(pw, { weakNote: 'Mật khẩu này sẽ bảo vệ cả dữ liệu trên server, và hiện chưa có cách thay mật khẩu này sau khi đăng ký. Nên dùng ít nhất 14 ký tự.' }),
    error,
    after));
  submit.setAttribute('form', 'register-form');
  d.setFoot(h('button', { on: { click: d.close } }, 'Huỷ'), submit);
  username.focus();
}

// Logging in while the app is open: "Cần đăng nhập lại" (FR25, username filled in), or a taken username.
export function openLogin(app, { username = '' } = {}) {
  const d = openDialog(app, { title: 'Đăng nhập' });
  const user = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', value: username, fk: 'login-user' });
  const pw = h('input', { type: 'password', autocomplete: 'current-password', fk: 'login-pw' });
  const error = h('div', { class: 'err', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'primary' }, 'Đăng nhập');
  const go = async () => {
    error.textContent = '';
    submit.disabled = true;
    const r = await app.login({ username: user.value.trim(), password: pw.value });
    submit.disabled = false;
    if (r.ok) return d.close();
    if (r.choose) {
      d.close();
      return openReplace(app, r.choose);
    }
    error.textContent = loginMessage(r);
    pw.select();
  };
  d.setBody(form({ class: 'stack', id: 'login-form' }, go, field('Username', user), field('Master password', pw), error));
  submit.setAttribute('form', 'login-form');
  d.setFoot(h('button', { on: { click: d.close } }, 'Huỷ'), submit);
  (username ? pw : user).focus();
}

// A row that only enables `button` once the confirmation word is typed.
function confirmWord(button) {
  const input = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': `Gõ ${CONFIRM_WORD} để xác nhận` });
  button.disabled = true;
  input.addEventListener('input', () => {
    button.disabled = input.value.trim().normalize('NFC') !== CONFIRM_WORD;
  });
  return h('label', { class: 'f' }, `Gõ ${CONFIRM_WORD} để xác nhận`, input);
}

// FR09: the server said yes for another account. Cancel is the default and changes nothing here.
export function openReplace(app, choose, onDone = () => {}) {
  let decided = false;
  const d = openDialog(app, {
    title: 'Máy này đang có tài khoản khác',
    onClose: () => {
      if (!decided) app.cancelLogin();
    },
  });
  const who = choose.username ? `tài khoản "${choose.username}"` : 'một tài khoản chưa đăng ký';
  const replace = h('button', { class: 'primary danger-fill' }, 'Thay thế');
  const error = h('div', { class: 'err', role: 'alert' });
  replace.addEventListener('click', async () => {
    decided = true;
    replace.disabled = true;
    const r = await app.confirmReplace();
    if (r.ok) {
      d.close();
      return onDone(r);
    }
    error.textContent = loginMessage(r);
  });
  d.setBody(
    h('div', { class: 'callout warn' }, icon('warn'), h('div', { class: 'grow' },
      h('p', null, `Máy này đang giữ ${who}. Thay thế sẽ xoá toàn bộ dữ liệu của tài khoản đó trên máy này, rồi tải tài khoản vừa đăng nhập về.`),
      choose.risky ? h('p', null, h('b', null, 'Tài khoản đó có dữ liệu chưa lên server. Thay thế thì phần đó mất vĩnh viễn.')) : null)),
    choose.risky ? confirmWord(replace) : null,
    error);
  const cancel = h('button', { on: { click: d.close } }, 'Huỷ');
  d.setFoot(cancel, replace);
  cancel.focus();
}

// FR10–FR12: keep the data, or wipe it; pending changes are tried first, then counted.
export function openLogout(app) {
  const d = openDialog(app, { title: 'Đăng xuất' });
  const error = h('div', { class: 'err', role: 'alert' });
  const keep = () => {
    d.close();
    app.logout({ wipe: false });
  };
  const wipe = async () => {
    error.textContent = '';
    d.setBody(h('p', { class: 'hint' }, 'Đang đưa thay đổi còn lại lên server…'));
    d.setFoot();
    const { dirty, pending } = await app.pendingBeforeLogout();
    if (!d.isOpen) return;
    if (!dirty) {
      d.close();
      return app.logout({ wipe: true });
    }
    const go = h('button', { class: 'primary danger-fill', on: { click: () => {
      d.close();
      app.logout({ wipe: true });
    } } }, 'Xoá dữ liệu trên máy này');
    d.setTitle('Còn thay đổi chưa lên server');
    d.setBody(
      h('div', { class: 'callout danger' }, icon('warn'), h('div', { class: 'grow' },
        h('p', null, pending > 0
          ? `${pending} thay đổi chưa lên server sẽ mất vĩnh viễn nếu xoá dữ liệu bây giờ.`
          : 'Lịch sử sửa chưa lên server sẽ mất vĩnh viễn nếu xoá dữ liệu bây giờ.'),
        h('p', null, 'Đăng xuất mà giữ dữ liệu thì không mất gì: lần sau đăng nhập lại, thay đổi được đưa lên.'))),
      confirmWord(go));
    const cancel = h('button', { on: { click: d.close } }, 'Huỷ');
    d.setFoot(cancel, h('button', { on: { click: keep } }, 'Đăng xuất, giữ dữ liệu'), go);
    cancel.focus();
  };
  d.setBody(
    h('p', null, 'Giữ dữ liệu: máy này vẫn mở khoá được khi không có mạng, nhưng không đồng bộ cho tới khi đăng nhập lại.'),
    h('p', null, 'Xoá dữ liệu: mọi thứ của tài khoản trên máy này bị xoá. Dữ liệu trên server và các máy khác không bị ảnh hưởng.'),
    error);
  const cancel = h('button', { on: { click: d.close } }, 'Huỷ');
  d.setFoot(cancel, h('button', { on: { click: keep } }, 'Đăng xuất, giữ dữ liệu'), h('button', { class: 'primary danger-fill', on: { click: wipe } }, 'Đăng xuất và xoá dữ liệu'));
  cancel.focus();
}
