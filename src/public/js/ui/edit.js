// Right column, writing: pick a type, then the form. The form is redrawn only for structural changes;
// typing updates the draft directly, and only the box typed in, so a CRLF value nobody touched stays as it was.
import { h, form, field } from './dom.js';
import { icon } from './icons.js';
import { TYPE_LABELS } from './list.js';
import { openGenerator } from './generator-dialog.js';
import { hasQrReader, openQrDialog } from './qr-dialog.js';
import { FILE_KINDS, FIELD_KINDS, ITEM_TYPES } from '../core/model.js';
import { blankDraftField, moveDraftField, setDraftFieldKind, setScopeSelection } from '../vault-ops.js';
import { liveEnvs, liveProjects } from '../vault-query.js';
import { FILE_MAX_BYTES, fieldFileBytes, formatSize, readFieldFile } from '../field-file.js';

const TYPE_INFO = {
  login: ['user', 'Tài khoản web, portal'],
  api_key: ['key', 'Key và secret của dịch vụ'],
  token: ['ticket', 'Bearer, PAT, deploy token'],
  ssh: ['term', 'Cặp khoá và passphrase'],
  db: ['db', 'Postgres, MySQL, Redis…'],
  server: ['server', 'VPS, bastion, admin panel'],
  vpn: ['shield', 'OpenVPN (.ovpn) kèm user/pass'],
  doc: ['file', 'Link tài liệu, runbook'],
  note: ['note', 'Ghi chú bảo mật'],
};
const KIND_LABELS = { text: 'Văn bản', secret: 'Bí mật', url: 'URL', multi: 'Nhiều dòng', 'secret-multi': 'Bí mật nhiều dòng', otp: 'Mã OTP (2FA)' };
const OTP_ERRORS = {
  empty: 'Hãy nhập secret hoặc URI.',
  hotp: 'Chỉ hỗ trợ TOTP, không nhận otpauth://hotp/.',
  base32: 'Secret base32 không hợp lệ.',
  digits: 'digits phải từ 6 đến 8.',
  period: 'period phải từ 1 đến 300.',
  algorithm: 'algorithm phải là SHA1, SHA256 hoặc SHA512.',
  uri: 'URI otpauth không hợp lệ.',
};
const FILE_ERRORS = {
  'too-large': 'File lớn hơn 64 KB nên không nhận. Giá trị cũ giữ nguyên.',
  binary: 'File nhị phân nên không nhận. Giá trị cũ giữ nguyên.',
  encoding: 'File không phải UTF-8 hợp lệ nên không nhận. Giá trị cũ giữ nguyên.',
};

// Per-row screen state, kept out of the draft so that showing a value does not count as an edit.
const rowUi = new WeakMap();
function uiOf(f) {
  if (!rowUi.has(f)) rowUi.set(f, { show: false, editing: false, note: '' });
  return rowUi.get(f);
}

function renderPick(app) {
  return [
    h('h2', { tabindex: -1, fk: 'pick-title' }, 'Chọn loại item'),
    h('div', { class: 'cat-grid' }, ITEM_TYPES.map((type) => h('button', {
      class: 'cat',
      'aria-label': TYPE_LABELS[type],
      fk: `pick-${type}`,
      on: { click: () => app.pickType(type) },
    }, h('span', { class: 'cat-ic' }, icon(TYPE_INFO[type][0])), h('span', null, h('b', null, TYPE_LABELS[type]), h('small', null, TYPE_INFO[type][1]))))),
    h('div', { class: 'actions' }, h('button', { fk: 'pick-cancel', on: { click: () => app.cancelEdit() } }, 'Huỷ')),
  ];
}

async function pickFile(app, f, file) {
  const ui = uiOf(f);
  const result = file.size > FILE_MAX_BYTES ? { ok: false, reason: 'too-large' } : readFieldFile(new Uint8Array(await file.arrayBuffer()), file.name);
  if (result.ok) {
    f.v = result.text;
    f.file = result.file;
    ui.editing = false;
    ui.note = '';
  } else {
    ui.note = FILE_ERRORS[result.reason];
  }
  app.formChanged();
}

function valueEditor(app, f, label, refs) {
  const ui = uiOf(f);
  const set = (e) => {
    f.v = e.target.value;
  };
  const eye = () => h('button', {
    class: 'icon',
    'aria-label': `${ui.show ? 'Che' : 'Hiện'} ${label()}`,
    fk: `eye-${f.key}`,
    on: { click: () => { ui.show = !ui.show; app.formChanged(); } },
  }, icon(ui.show ? 'eyeOff' : 'eye'));
  const named = (el) => {
    refs.push(() => el.setAttribute('aria-label', `Giá trị ${label()}`));
    el.setAttribute('aria-label', `Giá trị ${label()}`);
    return el;
  };
  const input = (type, cls) => named(h('input', { type, value: f.v, autocomplete: 'off', spellcheck: 'false', class: cls, fk: `value-${f.key}`, on: { input: set } }));

  if (f.kind === 'text' || f.kind === 'url') return [input('text')];
  if (f.kind === 'secret') {
    return [
      input(ui.show ? 'text' : 'password', 'mono'),
      eye(),
      h('button', { class: 'icon', 'aria-label': `Sinh mật khẩu cho ${label()}`, fk: `gen-${f.key}`, on: { click: () => openGenerator(app, (value) => { f.v = value; app.formChanged(); }) } }, icon('dice')),
    ];
  }
  if (f.kind === 'otp') {
    const scan = () => {
      if (!hasQrReader()) {
        ui.note = 'Trình duyệt này không có bộ đọc QR. Hãy dán secret hoặc URI otpauth://totp/… vào ô.';
        return app.formChanged();
      }
      ui.note = '';
      return openQrDialog(app, (uri) => { f.v = uri; app.formChanged(); });
    };
    return [
      input(ui.show ? 'text' : 'password', 'mono'),
      eye(),
      h('button', { class: 'icon', 'aria-label': `Quét QR cho ${label()}`, fk: `qr-${f.key}`, on: { click: scan } }, icon('qr')),
    ];
  }
  // multi and secret-multi; a file's content stays out of the box until asked for.
  const chooser = h('input', {
    type: 'file',
    hidden: true,
    'aria-label': `File cho ${label()}`,
    'data-file-for': f.key,
    on: { change: (e) => {
      const [file] = e.target.files;
      if (file) pickFile(app, f, file);
      e.target.value = '';
    } },
  });
  const choose = h('button', { fk: `file-${f.key}`, on: { click: () => chooser.click() } }, icon('upload'), 'Chọn file…');
  if (f.file && !ui.editing) {
    return [
      h('span', { class: 'file-chip' }, icon('file'), `${f.file}${f.v ? ` · ${formatSize(fieldFileBytes(f.v).length)}` : ' · chưa có nội dung'}`),
      h('button', { 'aria-label': `Sửa nội dung ${label()}`, fk: `edit-text-${f.key}`, on: { click: () => { ui.editing = true; app.formChanged(); } } }, 'Sửa nội dung'),
      choose,
      chooser,
    ];
  }
  const masked = f.kind === 'secret-multi' && !ui.show;
  return [
    named(h('textarea', { value: f.v, class: `mono${masked ? ' masked' : ''}`, spellcheck: 'false', autocomplete: 'off', fk: `value-${f.key}`, on: { input: set } })),
    f.kind === 'secret-multi' ? eye() : null,
    choose,
    chooser,
  ];
}

function fieldEditor(app, draft, f, i) {
  const ui = uiOf(f);
  const refs = [];
  const label = () => f.label || `Field ${i + 1}`;
  const error = app.state.draftErrors?.fields?.[f.key];
  const kind = h('select', {
    fk: `kind-${f.key}`,
    on: { change: (e) => {
      setDraftFieldKind(f, e.target.value);
      ui.editing = false;
      app.formChanged();
    } },
  }, FIELD_KINDS.map((k) => h('option', { value: k, selected: f.kind === k }, KIND_LABELS[k])));
  const name = () => kind.setAttribute('aria-label', `Kiểu ${label()}`);
  name();
  refs.push(name);
  const labelInput = h('input', {
    value: f.label,
    autocomplete: 'off',
    'aria-label': `Tên field ${i + 1}`,
    fk: `label-${f.key}`,
    on: { input: (e) => {
      f.label = e.target.value;
      refs.forEach((fn) => fn());
    } },
  });
  const move = (delta) => {
    if (moveDraftField(draft, f.key, delta)) app.formChanged();
  };
  return h('div', { class: 'edit-field' },
    labelInput,
    kind,
    h('div', { class: 'acts' },
      h('button', { class: 'icon', 'aria-label': `Đưa ${label()} lên`, fk: `up-${f.key}`, disabled: i === 0, on: { click: () => move(-1) } }, icon('up')),
      h('button', { class: 'icon', 'aria-label': `Đưa ${label()} xuống`, fk: `down-${f.key}`, disabled: i === draft.fields.length - 1, on: { click: () => move(1) } }, icon('down')),
      h('button', { class: 'icon', 'aria-label': `Xoá ${label()}`, fk: `rm-${f.key}`, on: { click: () => {
        draft.fields = draft.fields.filter((x) => x !== f);
        app.state.focus = 'add-field';
        app.formChanged();
      } } }, icon('x'))),
    h('div', { class: 'val-in' }, valueEditor(app, f, label, refs)),
    error ? h('div', { class: 'err', role: 'alert' }, OTP_ERRORS[error]) : null,
    ui.note ? h('div', { class: FILE_KINDS.includes(f.kind) ? 'err' : 'hint', role: 'alert' }, ui.note) : null);
}

function scopePicker(app, draft) {
  const v = app.vault;
  const projects = liveProjects(v);
  if (projects.length === 0) return h('p', { class: 'hint' }, 'Chưa có project nào. Item sẽ nằm ở Chưa gán; gán sau cũng được.');
  return projects.map((p) => h('fieldset', { class: 'scope-proj' },
    h('legend', null, p.name),
    h('div', { class: 'envs' }, liveEnvs(v, p.id).map((e) => h('label', null,
      h('input', {
        type: 'checkbox',
        checked: draft.scopes.includes(e.id),
        'aria-label': `${p.name} / ${e.name}`,
        fk: `scope-${e.id}`,
        on: { change: (ev) => setScopeSelection(draft, e.id, ev.target.checked) },
      }),
      e.name))),
    liveEnvs(v, p.id).length === 0 ? h('p', { class: 'hint' }, 'Project này chưa có env.') : null));
}

function renderForm(app) {
  const { draft, draftErrors, saveFailed } = app.state;
  const newKind = h('select', { 'aria-label': 'Kiểu field mới', fk: 'new-kind' }, FIELD_KINDS.map((k) => h('option', { value: k }, KIND_LABELS[k])));
  const addField = () => {
    const f = blankDraftField(newKind.value);
    f.label = KIND_LABELS[newKind.value];
    draft.fields.push(f);
    app.state.focus = `label-${f.key}`;
    app.formChanged();
  };
  const title = h('input', {
    class: 'title-in',
    value: draft.title,
    autocomplete: 'off',
    fk: 'edit-title',
    'aria-invalid': draftErrors?.title ? 'true' : null,
    on: { input: (e) => { draft.title = e.target.value; } },
  });
  const expires = h('input', { type: 'date', value: draft.expires ?? '', fk: 'edit-expires', on: { input: (e) => { draft.expires = e.target.value || null; } } });
  return form({ class: 'stack' }, () => app.saveDraft(),
    h('div', { class: 'hint' }, `${draft.id ? 'Sửa' : 'Item mới'} · ${TYPE_LABELS[draft.type]}`),
    field('Tiêu đề', title),
    draftErrors?.title ? h('div', { class: 'err', role: 'alert' }, 'Tiêu đề không được trống.') : null,
    h('div', { class: 'section' },
      h('h3', null, 'Field'),
      draft.fields.map((f, i) => fieldEditor(app, draft, f, i)),
      h('div', { class: 'row-flex section' },
        h('div', { class: 'grow' }, newKind),
        h('button', { fk: 'add-field', on: { click: addField } }, icon('plus'), 'Thêm field'))),
    h('div', { class: 'section' }, h('h3', null, 'Gán vào env'), scopePicker(app, draft)),
    h('div', { class: 'two' },
      h('div', { class: 'row-flex' },
        h('label', { class: 'f grow' }, 'Ngày hết hạn', expires),
        h('button', { fk: 'clear-expires', on: { click: () => { draft.expires = null; expires.value = ''; } } }, 'Bỏ hạn'))),
    field('Ghi chú', h('textarea', { value: draft.notes, fk: 'edit-notes', on: { input: (e) => { draft.notes = e.target.value; } } })),
    saveFailed ? h('div', { class: 'callout danger', role: 'alert' }, icon('warn'), h('p', null, 'Lưu thất bại. Bản nháp vẫn còn ở đây, hãy thử lại.')) : null,
    h('div', { class: 'actions' },
      h('button', { type: 'submit', class: 'primary', fk: 'save-item' }, 'Lưu'),
      h('button', { fk: 'cancel-item', on: { click: () => app.cancelEdit() } }, 'Huỷ')));
}

export const renderEdit = (app) => (app.state.mode === 'pick' ? renderPick(app) : renderForm(app));
