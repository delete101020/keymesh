import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startApp, setup, unlock, addProject, createItem, tempDir, removeDir, PASSWORD } from '../../testkit/e2e/driver.mjs';
import { writeBlankPng, writeQrPng, writeQrY4m } from '../../testkit/e2e/qr-fixture.mjs';

const URI = 'otpauth://totp/KeyMesh:test?secret=JBSWY3DPEHPK3PXP&issuer=KeyMesh';
let app;
let page;
let dir;
before(async () => {
  dir = await tempDir();
  const y4m = await writeQrY4m(dir, 'camera.y4m', URI);
  app = await startApp({ args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`, '--use-fake-ui-for-media-stream'] });
  page = await app.newPage('about:blank');
  // Keeps every camera stream reachable, so tests can see whether its tracks really stopped.
  await page.addInit(`window.__streams = [];
    if (navigator.mediaDevices) {
      const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (c) => { const s = await real(c); window.__streams.push(s); return s; };
    }`);
  await page.goto(app.url);
  await page.waitText('Tạo tài khoản');
  await setup(page);
  await app.grantClipboard();
});
after(async () => {
  const csp = await app.allCsp();
  await app.stop();
  await removeDir(dir);
  assert.deepEqual(csp, [], 'AC45 no CSP violation in this file');
});

const clip = () => page.eval(`navigator.clipboard.readText()`);
const saved = () => page.waitFor(`!document.querySelector('form.stack')`, { what: 'form closed' });
const tracksEnded = () => page.eval(`window.__streams.length > 0 && window.__streams.every((s) => s.getTracks().every((t) => t.readyState === 'ended'))`);

test('KM-003 AC27 FR31 generator: length and groups; closing without Dùng leaves the field alone', async () => {
  await page.click('Thêm item');
  await page.click('Login');
  await page.fill('Tiêu đề', 'Gen');
  await page.fill('Giá trị Password', 'unchanged');
  await page.click('Sinh mật khẩu cho Password');
  await page.waitText('Sinh mật khẩu');
  const first = await page.eval(`document.querySelector('output').textContent`);
  assert.equal(first.length, 24);
  assert.match(first, /[a-z]/);
  await page.click('Đóng');
  assert.equal(await page.value('Giá trị Password'), 'unchanged');
  await page.click('Sinh mật khẩu cho Password');
  await page.click('Chữ hoa');
  await page.click('Số');
  await page.click('Ký tự đặc biệt');
  const lower = await page.eval(`document.querySelector('output').textContent`);
  assert.match(lower, /^[a-z]{24}$/);
  await page.shot('generator');
  await page.click('Dùng');
  assert.equal(await page.value('Giá trị Password'), lower);
});

test('KM-003 AC28 FR32 passphrase mode: 5 words by default, adjustable 3–8', async () => {
  await page.click('Sinh mật khẩu cho Password');
  await page.click('Dễ nhớ');
  const words = () => page.eval(`document.querySelector('output').textContent.split('-').length`);
  assert.equal(await words(), 5);
  for (const n of [3, 8]) {
    await page.eval(`(() => { const r = document.querySelector('dialog[open] input[type=range]'); r.value = ${n}; r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    assert.equal(await words(), n);
  }
  await page.click('Đóng');
  await page.click('Lưu');
  await saved();
});

test('KM-003 AC30 FR33 bad otp values are refused at that field; a good one saves', async () => {
  await page.click('Thêm item');
  await page.click('Note');
  await page.fill('Tiêu đề', 'OTP item');
  await page.select('Kiểu field mới', 'otp');
  await page.click('Thêm field');
  const cases = [
    ['otpauth://hotp/x?secret=JBSWY3DP&counter=1', 'Chỉ hỗ trợ TOTP'],
    ['not base32!', 'base32 không hợp lệ'],
    ['otpauth://totp/x?secret=JBSWY3DP&digits=9', 'digits phải từ 6 đến 8'],
    ['otpauth://totp/x?secret=JBSWY3DP&period=0', 'period phải từ 1 đến 300'],
  ];
  for (const [value, message] of cases) {
    await page.fill('Giá trị Mã OTP (2FA)', value);
    await page.click('Lưu');
    await page.waitText(message);
    assert.equal(await page.has('Lưu'), true);
  }
  assert.equal(await page.eval(`${page.find('Giá trị Mã OTP (2FA)')}.type`), 'password', 'input is masked by default');
  await page.fill('Giá trị Mã OTP (2FA)', 'jbsw y3dp ehpk 3pxp');
  await page.click('Lưu');
  await saved();
});

test('KM-003 AC31 FR34 code and countdown; the code rolls over; no way to see the secret; copy gives the code', async () => {
  await page.waitFor(`/^\\d{6}$/.test(document.querySelector('.otp-code')?.textContent ?? '')`, { what: '6-digit code' });
  assert.ok(!(await page.domDump()).toLowerCase().includes('jbsw'), 'secret absent from the DOM');
  assert.equal(await page.has('Hiện Mã OTP (2FA)'), false);
  const code = await page.eval(`document.querySelector('.otp-code').textContent`);
  await page.click('Copy Mã OTP (2FA)');
  await page.waitText('Sẽ xoá khỏi clipboard sau 30 giây');
  assert.equal(await clip(), code);
  // Jump to just before the next period; the code must follow within a second of crossing it.
  await page.eval(`(() => { const real = Date.now.bind(Date); const left = 30000 - (real() % 30000); Date.now = () => real() + left - 300; })()`);
  await page.waitFor(`document.querySelector('.otp-code').textContent !== ${JSON.stringify(code)}`, { timeout: 1500, what: 'code rolled over' });
});

test('KM-003 AC32 FR35 fake camera reads the QR, fills the field and stops; closing without a read stops too', async () => {
  await page.reload();
  await unlock(page);
  await page.click('Thêm item');
  await page.click('Note');
  await page.fill('Tiêu đề', 'Scanned');
  await page.select('Kiểu field mới', 'otp');
  await page.click('Thêm field');
  await page.click('Quét QR cho Mã OTP (2FA)');
  await page.waitFor(`!document.querySelector('dialog[open]')`, { timeout: 15000, what: 'dialog closed after reading the code' });
  assert.equal(await page.value('Giá trị Mã OTP (2FA)'), URI);
  assert.equal(await tracksEnded(), true);
  await page.fill('Giá trị Mã OTP (2FA)', '');
  await page.eval(`(() => { const d = BarcodeDetector.prototype.detect; window.__detect = d; BarcodeDetector.prototype.detect = async () => []; })()`);
  await page.click('Quét QR cho Mã OTP (2FA)');
  await page.waitFor(`document.querySelector('dialog[open] video')?.srcObject`, { what: 'camera on' });
  await page.shot('qr-dialog');
  assert.equal(await page.eval(`window.__streams.at(-1).getTracks()[0].readyState`), 'live');
  await page.click('Đóng');
  assert.equal(await tracksEnded(), true);
  assert.equal(await page.value('Giá trị Mã OTP (2FA)'), '');
  await page.eval(`BarcodeDetector.prototype.detect = window.__detect; 0`);
});

test('KM-003 AC32 AC33 FR36 image with a QR fills the field; an image without one says so and keeps the value', async () => {
  const good = await writeQrPng(dir, 'good.png', URI);
  const wrong = await writeQrPng(dir, 'wrong.png', 'https://example.test/not-otp');
  const blank = await writeBlankPng(dir, 'blank.png');
  // Keep the camera from reading the code first: only the image path is under test here.
  await page.eval(`(() => { const d = BarcodeDetector.prototype.detect; window.__detect = d; BarcodeDetector.prototype.detect = function (src) { return src instanceof HTMLVideoElement ? Promise.resolve([]) : d.call(this, src); }; })()`);
  await page.click('Quét QR cho Mã OTP (2FA)');
  await page.waitFor(`document.querySelector('input[data-qr-image]')`);
  await page.setFiles('input[data-qr-image]', [blank]);
  await page.waitText('Không đọc được mã QR từ ảnh này');
  await page.setFiles('input[data-qr-image]', [wrong]);
  await page.waitText('không phải otpauth://totp/');
  await page.click('Đóng');
  assert.equal(await page.value('Giá trị Mã OTP (2FA)'), '');
  await page.click('Quét QR cho Mã OTP (2FA)');
  await page.waitFor(`document.querySelector('input[data-qr-image]')`);
  await page.setFiles('input[data-qr-image]', [good]);
  await page.waitFor(`!document.querySelector('dialog[open]')`);
  assert.equal(await page.value('Giá trị Mã OTP (2FA)'), URI);
  assert.equal(await tracksEnded(), true);
  await page.eval(`BarcodeDetector.prototype.detect = window.__detect; 0`);
  await page.click('Lưu');
  await saved();
});

test('KM-003 AC33 FR35 FR37 camera refused, or no QR reader: a clear message and pasting still works', async () => {
  const origin = new URL(app.url).origin;
  await page.click('Sửa');
  await app.conn.send('Browser.setPermission', { origin, permission: { name: 'camera' }, setting: 'denied' });
  await page.eval(`(() => { window.__gum = navigator.mediaDevices.getUserMedia; navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('no', 'NotAllowedError'); }; })()`);
  await page.click('Quét QR cho Mã OTP (2FA)');
  await page.waitText('Quyền dùng camera đã bị từ chối');
  await page.click('Đóng');
  await page.eval(`navigator.mediaDevices.getUserMedia = window.__gum; delete window.BarcodeDetector; 0`);
  await page.click('Quét QR cho Mã OTP (2FA)');
  await page.waitText('không có bộ đọc QR');
  assert.equal(await page.eval(`!!document.querySelector('dialog[open]')`), false);
  await page.fill('Giá trị Mã OTP (2FA)', 'JBSWY3DP');
  await page.click('Lưu');
  await saved();
  await app.conn.send('Browser.resetPermissions');
  await app.grantClipboard();
  await page.reload();
  await unlock(page);
});

test('KM-003 AC35 FR39 a new vpn item with empty Cấu hình has no download button', async () => {
  await createItem(page, { type: 'VPN', title: 'New VPN' });
  assert.equal(await page.has('Tải client.ovpn'), false);
});

test('KM-003 AC34 FR38 FR39 exactly 64 KB with CRLF: accepted, downloaded byte for byte, also after saving another field; too large, NUL and bad UTF-8 are refused', async () => {
  const body = Buffer.alloc(65536, 0x61);
  for (let i = 100; i < 65000; i += 100) body.set([0x0d, 0x0a], i);
  const good = join(dir, 'exact.ovpn');
  await writeFile(good, body);
  const big = join(dir, 'big.txt');
  await writeFile(big, Buffer.alloc(65537, 0x61));
  const nul = join(dir, 'nul.txt');
  await writeFile(nul, Buffer.from([0x61, 0x00, 0x62]));
  const bad = join(dir, 'bad.txt');
  await writeFile(bad, Buffer.from([0x61, 0xff, 0x62]));

  const downloads = await app.downloadsTo();
  await page.click('Sửa');
  const input = `input[aria-label="File cho Cấu hình"]`;
  await page.setFiles(input, [good]);
  await page.waitText('exact.ovpn · 64.0 KB');
  for (const [file, message] of [[big, 'lớn hơn 64 KB'], [nul, 'File nhị phân'], [bad, 'không phải UTF-8']]) {
    await page.setFiles(input, [file]);
    await page.waitText(message);
    await page.waitText('exact.ovpn · 64.0 KB');
  }
  await page.click('Lưu');
  await saved();
  await page.waitText('exact.ovpn · 64.0 KB');
  await page.click('Sửa');
  await page.fill('Giá trị Server', 'vpn.example');
  await page.click('Lưu');
  await saved();
  await page.click('Tải exact.ovpn');
  let names = [];
  for (let i = 0; i < 100 && !names.includes('exact.ovpn'); i++) {
    await new Promise((r) => setTimeout(r, 50));
    names = await readdir(downloads);
  }
  assert.deepEqual(names, ['exact.ovpn']);
  assert.ok((await readFile(join(downloads, 'exact.ovpn'))).equals(body));
  await removeDir(downloads);
  assert.ok(!(await page.domDump()).includes('aaaaaaaaaaaaaaaaaaaaaaaa'), 'file content stays out of the DOM until asked for');
  await page.click('Hiện Cấu hình');
  await page.waitFor(`document.querySelector('.field .val.pre')`);
  await page.click('Che Cấu hình');
});

test('KM-003 AC38 FR41 a revealed secret is masked again after switching items, and absent from the DOM', async () => {
  await createItem(page, { title: 'Masked', values: { Password: 'MASK-MARKER' } });
  assert.ok(!(await page.domDump()).includes('MASK-MARKER'));
  await page.click('Hiện Password');
  await page.waitText('MASK-MARKER');
  await page.click('New VPN');
  await page.waitNoText('MASK-MARKER');
  await page.click('Masked');
  await page.waitFor(page.find('Hiện Password'));
  assert.ok(!(await page.domDump()).includes('MASK-MARKER'));
});

test('KM-003 AC39 FR42 an http URL opens with no opener; javascript: has no open button and runs nothing', async () => {
  const target = `${app.url}?opened`;
  await createItem(page, { title: 'Links', values: { URL: target } });
  const before = (await app.conn.send('Target.getTargets')).targetInfos.map((t) => t.targetId);
  await page.click('Mở URL');
  let info;
  for (let i = 0; i < 100 && !info; i++) {
    await new Promise((r) => setTimeout(r, 50));
    info = (await app.conn.send('Target.getTargets')).targetInfos.find((t) => t.type === 'page' && !before.includes(t.targetId));
  }
  assert.ok(info, 'a new tab opened');
  const { sessionId } = await app.conn.send('Target.attachToTarget', { targetId: info.targetId, flatten: true });
  const r = await app.conn.send('Runtime.evaluate', { expression: 'window.opener === null', returnByValue: true }, sessionId);
  assert.equal(r.result.value, true);
  await app.conn.send('Target.closeTarget', { targetId: info.targetId });
  await page.click('Sửa');
  await page.fill('Giá trị URL', 'javascript:alert(1)');
  await page.click('Lưu');
  await saved();
  assert.equal(await page.has('Mở URL'), false);
  assert.equal(await page.has('Copy URL'), true);
  await page.waitText('javascript:alert(1)');
});

test('KM-003 AC15 FR19 copying from a PROD env warns and still copies; other items do not warn', async () => {
  await addProject(page, 'Live', 'PROD, test');
  await createItem(page, { title: 'Prod item', values: { Username: 'prod-user' }, envs: ['Live / PROD'] });
  await page.click('Copy Username');
  await page.waitText('env prod');
  assert.equal(await clip(), 'prod-user');
  await createItem(page, { title: 'Test item', values: { Username: 'test-user' }, envs: ['Live / test'] });
  await page.click('Copy Username');
  await page.waitFor(`document.getElementById('toast').textContent.startsWith('Đã copy. ')`);
  assert.equal(await clip(), 'test-user');
});

test('KM-003 AC08 FR12 locking with a draft open and a secret shown: both gone after unlocking', async () => {
  await page.click('Masked');
  await page.click('Hiện Password');
  await page.waitText('MASK-MARKER');
  await page.click('Sửa');
  await page.fill('Ghi chú', 'DRAFT-MARKER');
  await page.click('Khoá');
  await page.waitFor(page.find('Mở khoá'));
  const dump = await page.domDump();
  assert.ok(!dump.includes('DRAFT-MARKER') && !dump.includes('MASK-MARKER'));
  await unlock(page, PASSWORD);
  assert.equal(await page.eval(`!!document.querySelector('form.stack')`), false);
  await page.click('Tất cả', { exact: false });
  await page.click('Masked');
  await page.waitFor(page.find('Hiện Password'));
  assert.ok(!(await page.domDump()).includes('DRAFT-MARKER'));
});

test('KM-003 FR12 FR35 locking while the QR dialog is open stops the camera and closes the dialog', async () => {
  await page.click('Thêm item');
  await page.click('Note');
  await page.select('Kiểu field mới', 'otp');
  await page.click('Thêm field');
  await page.eval(`(() => { window.__detect = BarcodeDetector.prototype.detect; BarcodeDetector.prototype.detect = async () => []; })()`);
  await page.click('Quét QR cho Mã OTP (2FA)');
  await page.waitFor(`document.querySelector('dialog[open] video')?.srcObject`);
  await page.eval(`(async () => { const real = Date.now.bind(Date); Date.now = () => real() + 11 * 60000; })()`);
  await page.waitFor(`!document.querySelector('dialog[open]')`, { timeout: 3000, what: 'dialog closed by auto-lock' });
  await page.waitFor(page.find('Mở khoá'));
  assert.equal(await tracksEnded(), true);
  await page.reload();
  await unlock(page, PASSWORD);
});

test('KM-003 AC37 FR12 locking during the count clears the clipboard at once', async () => {
  await page.click('Tất cả', { exact: false });
  await page.click('Test item');
  await page.click('Copy Username');
  await page.waitFor(`navigator.clipboard.readText().then((t) => t === 'test-user')`);
  await page.click('Khoá');
  await page.waitFor(page.find('Mở khoá'));
  await page.waitFor(`navigator.clipboard.readText().then((t) => t === '')`, { timeout: 2000, what: 'clipboard cleared on lock' });
  await unlock(page, PASSWORD);
});

test('KM-003 AC36 FR40 in the real browser: cleared after 30 s; copying again restarts; a later copy elsewhere survives', async () => {
  await page.click('Tất cả', { exact: false });
  await page.click('Test item');
  await page.click('Copy Username');
  await page.waitFor(`navigator.clipboard.readText().then((t) => t === 'test-user')`);
  await new Promise((r) => setTimeout(r, 20000));
  await page.click('Copy Username');
  await new Promise((r) => setTimeout(r, 15000));
  assert.equal(await clip(), 'test-user', 'the second copy restarted the 30 seconds');
  await page.eval(`navigator.clipboard.writeText('from another app')`);
  await new Promise((r) => setTimeout(r, 16000));
  assert.equal(await clip(), 'from another app');
  await page.click('Copy Username');
  await new Promise((r) => setTimeout(r, 30500));
  assert.equal(await clip(), '');
});
