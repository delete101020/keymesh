// Password generator. The value reaches the field only through Dùng.
import { h, openDialog } from './dom.js';
import { icon } from './icons.js';
import { LENGTH_DEFAULT, LENGTH_MAX, LENGTH_MIN, WORDS_DEFAULT, WORDS_MAX, WORDS_MIN, generateRandom, generateWords } from '../passgen.js';

export function openGenerator(app, onUse) {
  const d = openDialog(app, { title: 'Sinh mật khẩu' });
  const opt = { mode: 'random', length: LENGTH_DEFAULT, upper: true, digits: true, symbols: true, count: WORDS_DEFAULT };
  const out = h('output', { class: 'gen-out', 'aria-label': 'Mật khẩu vừa sinh' });
  const generate = () => {
    out.textContent = opt.mode === 'random' ? generateRandom(opt) : generateWords({ count: opt.count });
  };
  const check = (key, label) => h('label', null,
    h('input', { type: 'checkbox', checked: opt[key], fk: `gen-${key}`, on: { change: (e) => { opt[key] = e.target.checked; generate(); } } }),
    label);
  const slider = (key, label, min, max) => {
    const val = h('b', null, String(opt[key]));
    return h('label', { class: 'f' },
      h('span', null, `${label}: `, val),
      h('input', { type: 'range', min, max, value: opt[key], fk: `gen-${key}`, on: { input: (e) => {
        opt[key] = Number(e.target.value);
        val.textContent = e.target.value;
        generate();
      } } }));
  };
  const modeButton = (mode, label) => h('button', {
    'aria-pressed': String(opt.mode === mode),
    fk: `gen-mode-${mode}`,
    on: { click: () => { opt.mode = mode; draw(); } },
  }, label);
  function draw() {
    generate();
    d.setBody(
      h('div', { class: 'seg' }, modeButton('random', 'Ngẫu nhiên'), modeButton('words', 'Dễ nhớ')),
      out,
      opt.mode === 'random'
        ? [slider('length', 'Độ dài', LENGTH_MIN, LENGTH_MAX), h('div', { class: 'gen-opts' }, check('upper', 'Chữ hoa'), check('digits', 'Số'), check('symbols', 'Ký tự đặc biệt'))]
        : slider('count', 'Số từ', WORDS_MIN, WORDS_MAX));
  }
  d.setFoot(
    h('button', { fk: 'gen-again', on: { click: generate } }, icon('dice'), 'Sinh lại'),
    h('button', { on: { click: d.close } }, 'Đóng'),
    h('button', { class: 'primary', on: { click: () => {
      const value = out.textContent;
      d.close();
      onUse(value);
    } } }, 'Dùng'));
  draw();
}
