// Adding and managing projects and envs. Reordering is by buttons, so it works from the keyboard.
import { h, form, field, openDialog, confirmDialog } from './dom.js';
import { icon } from './icons.js';
import { liveEnvs, liveProjects } from '../vault-query.js';
import { DEFAULT_ENVS, countItemsInEnv, countItemsInProject, envListError, envNameError, parseEnvList, projectNameError } from '../vault-ops.js';

export const ENV_COLORS = Object.freeze([
  ['', 'Không màu'],
  ['red', 'Đỏ'],
  ['orange', 'Cam'],
  ['green', 'Xanh lá'],
  ['blue', 'Xanh dương'],
  ['purple', 'Tím'],
]);

export const envColorClass = (color) => (ENV_COLORS.some(([c]) => c && c === color) ? `env-${color}` : '');

const NAME_ERRORS = { empty: 'Tên không được trống.', duplicate: 'Tên này đã có.' };

export function openAddProject(app) {
  const d = openDialog(app, { title: 'Thêm project' });
  const name = h('input', { autocomplete: 'off', fk: 'new-project-name' });
  const envs = h('input', { autocomplete: 'off', value: DEFAULT_ENVS.join(', ') });
  const error = h('div', { class: 'err', role: 'alert' });
  const submit = async () => {
    const list = parseEnvList(envs.value);
    const problem = projectNameError(app.vault, name.value, null) ?? envListError(list);
    if (problem) {
      error.textContent = NAME_ERRORS[problem];
      name.focus();
      return;
    }
    const r = await app.addProject(name.value, list);
    if (r.ok) d.close();
  };
  d.setBody(form({ class: 'stack', id: 'add-project-form' }, submit,
    field('Tên project', name),
    field('Các env', envs),
    h('div', { class: 'hint' }, 'Cách nhau bằng dấu phẩy. Sửa hoặc thêm env sau cũng được.'),
    error));
  d.setFoot(
    h('button', { on: { click: d.close } }, 'Huỷ'),
    h('button', { class: 'primary', type: 'submit', form: 'add-project-form' }, 'Tạo project'));
  name.focus();
}

export function openManageProject(app, projectId) {
  const project = () => liveProjects(app.vault).find((p) => p.id === projectId);
  const d = openDialog(app, { title: `Quản lý project ${project().name}` });
  const error = h('div', { class: 'err', role: 'alert' });

  const removeProject = async () => {
    const n = countItemsInProject(app.vault, projectId);
    const ok = await confirmDialog(app, {
      title: `Xoá project ${project().name}?`,
      message: `${n} item đang gán vào env của project này. Item vẫn còn; item không còn env nào sẽ vào Chưa gán.`,
      confirmLabel: 'Xoá project',
      danger: true,
    });
    if (!ok) return;
    const r = await app.deleteProject(projectId);
    if (r.ok) d.close();
  };

  const removeEnv = async (env) => {
    const n = countItemsInEnv(app.vault, env.id);
    const ok = await confirmDialog(app, {
      title: `Xoá env ${env.name}?`,
      message: `${n} item đang gán vào env này. Item vẫn còn; item không còn env nào sẽ vào Chưa gán.`,
      confirmLabel: 'Xoá env',
      danger: true,
    });
    if (ok && (await app.deleteEnv(env.id)).ok) draw();
  };

  const act = async (run) => {
    error.textContent = '';
    if ((await run()).ok) draw();
  };

  function envRow(env, i, all) {
    const name = h('input', { value: env.name, 'aria-label': `Tên env ${env.name}`, autocomplete: 'off', fk: `env-name-${env.id}` });
    const rename = () => {
      const problem = envNameError(app.vault, projectId, name.value, env.id);
      if (problem) return void (error.textContent = NAME_ERRORS[problem]);
      if (name.value.trim() !== env.name) act(() => app.renameEnv(env.id, name.value));
    };
    const color = h('select', {
      'aria-label': `Màu env ${env.name}`,
      fk: `env-color-${env.id}`,
      on: { change: (e) => act(() => app.setEnvColor(env.id, e.target.value || null)) },
    }, ENV_COLORS.map(([c, label]) => h('option', { value: c, selected: (env.color ?? '') === c }, label)));
    return h('div', { class: 'env-edit' },
      name,
      color,
      h('div', { class: 'acts' },
        h('button', { class: 'icon', 'aria-label': `Lưu tên env ${env.name}`, fk: `env-save-${env.id}`, on: { click: rename } }, icon('edit')),
        h('button', { class: 'icon', 'aria-label': `Đưa env ${env.name} lên`, fk: `env-up-${env.id}`, disabled: i === 0, on: { click: () => act(() => app.moveEnv(env.id, -1)) } }, icon('up')),
        h('button', { class: 'icon', 'aria-label': `Đưa env ${env.name} xuống`, fk: `env-down-${env.id}`, disabled: i === all.length - 1, on: { click: () => act(() => app.moveEnv(env.id, 1)) } }, icon('down')),
        h('button', { class: 'icon', 'aria-label': `Xoá env ${env.name}`, fk: `env-del-${env.id}`, on: { click: () => removeEnv(env) } }, icon('x'))));
  }

  function draw() {
    const p = project();
    if (!p) return d.close();
    d.setTitle(`Quản lý project ${p.name}`);
    const projects = liveProjects(app.vault);
    const index = projects.findIndex((x) => x.id === projectId);
    const envs = liveEnvs(app.vault, projectId);
    const nameInput = h('input', { value: p.name, autocomplete: 'off', fk: 'project-name' });
    const newEnv = h('input', { autocomplete: 'off', 'aria-label': 'Tên env mới', fk: 'new-env' });
    const addEnvNow = () => {
      const problem = envNameError(app.vault, projectId, newEnv.value, null);
      if (problem) return void (error.textContent = NAME_ERRORS[problem]);
      act(() => app.addEnv(projectId, newEnv.value));
    };
    const renameNow = () => {
      const problem = projectNameError(app.vault, nameInput.value, projectId);
      if (problem) return void (error.textContent = NAME_ERRORS[problem]);
      if (nameInput.value.trim() !== p.name) act(() => app.renameProject(projectId, nameInput.value));
    };
    d.setBody(
      error,
      form({ class: 'row-flex' }, renameNow,
        h('label', { class: 'f grow' }, 'Tên project', nameInput),
        h('button', { type: 'submit', fk: 'project-rename' }, 'Đổi tên')),
      h('div', { class: 'row-flex' },
        h('span', { class: 'muted grow' }, 'Thứ tự project'),
        h('button', { 'aria-label': 'Đưa project lên', fk: 'project-up', disabled: index === 0, on: { click: () => act(() => app.moveProject(projectId, -1)) } }, icon('up'), 'Lên'),
        h('button', { 'aria-label': 'Đưa project xuống', fk: 'project-down', disabled: index === projects.length - 1, on: { click: () => act(() => app.moveProject(projectId, 1)) } }, icon('down'), 'Xuống')),
      h('div', null,
        h('div', { class: 'muted' }, 'Env'),
        envs.length ? envs.map((e, i) => envRow(e, i, envs)) : h('p', { class: 'hint' }, 'Project này chưa có env.')),
      form({ class: 'row-flex' }, addEnvNow, h('div', { class: 'grow' }, newEnv), h('button', { type: 'submit', fk: 'add-env' }, icon('plus'), 'Thêm env')));
  }

  d.setFoot(
    h('button', { class: 'danger', fk: 'project-delete', on: { click: removeProject } }, 'Xoá project'),
    h('button', { class: 'primary', on: { click: d.close } }, 'Xong'));
  draw();
}
