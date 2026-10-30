// KeyMesh v2 · prototype tương tác. Chỉ để duyệt giao diện: không mã hoá, không lưu, không gọi mạng.
(() => {
const M = window.MOCK;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Icon (nét, 24×24) ──
const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
  warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  finger: '<path d="M12 11v3a8 8 0 0 1-1.2 4.2M8.5 8.5A5 5 0 0 1 17 12v1.5a14 14 0 0 1-.6 4M6 11a6 6 0 0 1 .7-2.8M15.2 20.6a17 17 0 0 0 .8-3M4.5 15.5A12 12 0 0 0 5 12a7 7 0 0 1 12-5M9 20a12 12 0 0 0 1.5-6V12a1.5 1.5 0 0 1 3 0"/>',
  fork: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 12v5"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  dup: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1"/><circle cx="15.5" cy="15.5" r="1"/><circle cx="15.5" cy="8.5" r="1"/><circle cx="8.5" cy="15.5" r="1"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.3L3 16M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.2-8.2M15 8l3 3M17 6l2 2"/>',
};
Object.assign(P, {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 0 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 1 0-4V6H3z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
  term: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  note: '<path d="M5 3h10l4 4v14H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v.01M14 21h.01M17 21h4v-4"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
});
const ic = (n, s = 16) => `<svg class="i" viewBox="0 0 24 24" style="width:${s}px;height:${s}px">${P[n]}</svg>`;

const TYPES = { login: 'Login', api_key: 'API key', token: 'Token', ssh: 'SSH', db: 'Database', server: 'Server', vpn: 'VPN', doc: 'Doc', note: 'Note' };
// Mẫu field theo loại (03-data-model.md).
// Phần tử thứ 4 (nếu có) là tên file mặc định: field đó nhận nội dung từ file và tải ra lại được thành file.
const TPL = {
  login: { icon: 'user', desc: 'Tài khoản web, portal', fields: [['Username', 'text', 'acme_uat'], ['Password', 'secret'], ['URL', 'url', 'https://']] },
  api_key: { icon: 'key', desc: 'Key + secret của dịch vụ', fields: [['API key', 'secret'], ['Secret', 'secret'], ['Endpoint', 'url', 'https://api.']] },
  token: { icon: 'ticket', desc: 'Bearer, PAT, deploy token', fields: [['Token', 'secret-multi']] },
  ssh: { icon: 'term', desc: 'Cặp khoá và passphrase', fields: [['Private key', 'secret-multi', '-----BEGIN OPENSSH PRIVATE KEY-----'], ['Public key', 'multi', 'ssh-ed25519 AAAA…'], ['Passphrase', 'secret']] },
  db: { icon: 'db', desc: 'Postgres, MySQL, Redis…', fields: [['Host', 'text', 'db.internal'], ['Port', 'text', '5432'], ['Database', 'text'], ['Username', 'text'], ['Password', 'secret'], ['Connection string', 'secret', 'postgres://…']] },
  server: { icon: 'server', desc: 'VPS, bastion, admin panel', fields: [['Host', 'text', '10.0.0.12'], ['Username', 'text', 'root'], ['Password', 'secret'], ['Admin URL', 'url', 'https://']] },
  vpn: { icon: 'shield', desc: 'OpenVPN (.ovpn) kèm user/pass', fields: [['Server', 'text', 'vpn.acme.com:1194'], ['Username', 'text'], ['Password', 'secret'], ['Cấu hình (.ovpn)', 'secret-multi', 'Chọn file .ovpn hoặc dán nội dung', 'client.ovpn']] },
  doc: { icon: 'file', desc: 'Link tài liệu, runbook', fields: [['URL', 'url', 'https://']] },
  note: { icon: 'note', desc: 'Ghi chú bảo mật', fields: [] },
};
const KINDS = { text: 'Văn bản', secret: 'Bí mật', url: 'URL', multi: 'Nhiều dòng', 'secret-multi': 'Bí mật nhiều dòng', otp: 'Mã OTP (2FA)' };
const isSecret = k => k === 'secret' || k === 'secret-multi' || k === 'otp';
const draftFields = type => TPL[type].fields.map(([label, kind, ph, file], n) => ({ id: 'n' + n, label, kind, value: '', ph, file }));
const kb = s => { const n = new Blob([s]).size; return n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB'; };

// OTP (TOTP, RFC 6238). Value là URI otpauth:// (từ QR) hoặc secret base32 nhập tay.
const DEMO_OTP = 'otpauth://totp/Partner%20X:acme_uat?secret=JBSWY3DPEHPK3PXP&issuer=Partner%20X';
function parseOtp(v) {
  v = (v || '').trim();
  const o = { secret: v, digits: 6, period: 30, algo: 'SHA-1', issuer: '', account: '' };
  if (/^otpauth:\/\/totp\//i.test(v)) try {
    const u = new URL(v), q = u.searchParams, label = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    o.secret = q.get('secret') || '';
    o.digits = +q.get('digits') || 6; o.period = +q.get('period') || 30;
    o.algo = { SHA256: 'SHA-256', SHA512: 'SHA-512' }[(q.get('algorithm') || '').toUpperCase()] || 'SHA-1';
    [o.issuer, o.account] = label.includes(':') ? label.split(':') : ['', label];
    o.issuer = q.get('issuer') || o.issuer;
  } catch { o.secret = ''; }
  o.secret = o.secret.replace(/[\s=-]/g, '').toUpperCase();
  return o;
}
function base32(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', out = [];
  let bits = 0, val = 0;
  for (const c of s) { const n = A.indexOf(c); if (n < 0) return null; val = (val << 5) | n; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return out.length ? new Uint8Array(out) : null;
}
async function totp(o) {
  const key = base32(o.secret); if (!key) return null;
  const msg = new ArrayBuffer(8); new DataView(msg).setUint32(4, Math.floor(Date.now() / 1000 / o.period));
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: o.algo }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg)), off = h[h.length - 1] & 15;
  const n = (((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]) % 10 ** o.digits;
  const c = String(n).padStart(o.digits, '0');
  return c.slice(0, c.length / 2) + ' ' + c.slice(c.length / 2);
}
// Mọi phần tử [data-otp] đang hiện trên màn được cập nhật mỗi giây (mã + vòng đếm ngược)
async function tickOtp() {
  for (const el of document.querySelectorAll('[data-otp]')) {
    const o = parseOtp(el.dataset.otp), left = o.period - Math.floor(Date.now() / 1000) % o.period;
    const code = el.dataset.otp ? await totp(o).catch(() => null) : null;
    el.classList.toggle('bad', !code); el.classList.toggle('low', !!code && left <= 5);
    el.querySelector('.otp-code').textContent = code || (el.dataset.otp ? 'Secret không hợp lệ' : 'Nhập secret hoặc quét mã QR ở trang bật 2FA');
    el.querySelector('.otp-left').textContent = code ? left + 's' : '';
    el.style.setProperty('--p', left / o.period);
    const meta = el.querySelector('.otp-meta'); if (meta) meta.textContent = code ? [o.issuer, o.account].filter(Boolean).join(' · ') : '';
  }
}
setInterval(tickOtp, 1000);
const otpBox = (v, cls = '') => `<span class="otp ${cls}" data-otp="${esc(v)}"><span class="otp-code"></span><span class="otp-ring"></span><span class="otp-left"></span><span class="otp-meta"></span></span>`;

// Bộ sinh mật khẩu (F-ITM-10). Prototype dùng crypto.getRandomValues cho giống thật.
const WORDS = 'anh bien cau dong gio hoa lua may nui rung song trang vang xanh bac den cat tre la sao'.split(' ');
function genPassword(g) {
  const rnd = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  if (g.mode === 'words') return Array.from({ length: g.words }, () => WORDS[rnd(WORDS.length)]).join('-') + '-' + rnd(100);
  const sets = [g.upper && 'ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', g.digits && '23456789', g.symbols && '!@#$%^&*-_=+?'].filter(Boolean).join('');
  return Array.from({ length: g.len }, () => sets[rnd(sets.length)]).join('');
}
const SYNC = {
  synced: { cls: '', text: 'Đã đồng bộ · 2 phút trước' },
  pending: { cls: 'pending', text: '3 thay đổi chờ' },
  offline: { cls: 'offline', text: 'Offline · thay đổi lưu trên máy' },
  error: { cls: 'error', text: 'Cần đăng nhập lại' },
};

// ── Trạng thái ──
const S = {
  screen: 'app', vault: M.vaults[0].id, filter: { k: 'env', id: 'e_pay_uat' }, item: 'i_partnerx',
  mode: 'view', sync: 'synced', reveal: {}, mv: 'home', q: '', menu: null, stack: [],
  draft: null, gen: null, // draft: item đang tạo/sửa; gen: id field đang mở bộ sinh mật khẩu
};
const G = { mode: 'chars', len: 24, upper: true, digits: true, symbols: true, words: 4, out: '' };
function startDraft(i) {
  S.gen = null;
  S.draft = i ? { ...i, fields: i.fields.map(f => ({ ...f })), tags: [...(i.tags || [])] }
    : { type: null, title: '', scopes: S.filter.k === 'env' ? [S.filter.id] : [], fields: [], notes: '', tags: [] };
}

const envById = id => { for (const p of M.projects) for (const e of p.envs) if (e.id === id) return { ...e, project: p }; };
const envCls = name => ({ uat: 'uat', staging: 'staging', prod: 'prod' }[name] || '');
const vaultOf = () => M.vaults.find(v => v.id === S.vault);
const projects = () => M.projects.filter(p => p.vault === S.vault);
const items = () => M.items.filter(i => i.vault === S.vault);
const itemById = id => M.items.find(i => i.id === id) || M.trash.find(i => i.id === id);
const expiring = i => !!i.expires;

function filtered() {
  const f = S.filter, q = S.q.trim().toLowerCase();
  let list = f.k === 'trash' ? M.trash.filter(i => i.vault === S.vault) : items();
  if (f.k === 'env') list = list.filter(i => i.scopes.includes(f.id));
  if (f.k === 'project') { const p = M.projects.find(p => p.id === f.id); list = list.filter(i => i.scopes.some(s => p.envs.some(e => e.id === s))); }
  if (f.k === 'unassigned') list = list.filter(i => !i.scopes.length);
  if (f.k === 'expiring') list = list.filter(expiring);
  if (f.k === 'conflict') list = list.filter(i => i.conflict);
  if (f.k === 'fav') list = list.filter(i => i.fav);
  if (q) list = list.filter(i => (i.title + ' ' + (i.fields || []).filter(x => x.kind !== 'secret').map(x => x.value).join(' ') + ' ' + (i.notes || '')).toLowerCase().includes(q));
  return list;
}

function filterTitle() {
  const f = S.filter;
  if (S.q) return `Kết quả cho “${esc(S.q)}”`;
  if (f.k === 'env') { const e = envById(f.id); return `${esc(e.project.name)} <span class="crumb-sep">›</span> ${esc(e.name)}`; }
  if (f.k === 'project') return esc(M.projects.find(p => p.id === f.id).name);
  return { all: 'Tất cả', unassigned: 'Chưa gán', expiring: 'Sắp hết hạn', trash: 'Thùng rác', conflict: 'Có xung đột', fav: 'Yêu thích' }[f.k];
}

// ── Gate ──
function renderGate() {
  const g = $('#gate'), logo = `<div class="logo"><span class="mark">${ic('key', 18)}</span>KeyMesh</div>`;
  if (S.screen === 'unlock') g.innerHTML = `<div class="card">${logo}
    <div class="who"><span class="avatar">K</span><div class="grow"><b>${esc(M.user.username)}</b><div class="hint">Đã khoá · ${M.vaults.length} vault trên thiết bị này</div></div></div>
    <div class="stack" style="margin-top:16px">
      <button class="primary block row-flex" style="justify-content:center" data-act="unlock">${ic('finger', 18)} Mở khoá bằng vân tay</button>
      <div class="or">hoặc</div>
      <label class="f">Master password<input type="password" autocomplete="current-password" placeholder="••••••••••••"></label>
      <button class="block" data-act="unlock">Mở khoá</button>
    </div>
    <div class="gate-foot">Mở khoá diễn ra trên máy, không cần mạng · <a href="#" data-act="go-login">Dùng tài khoản khác</a></div></div>`;
  if (S.screen === 'login') g.innerHTML = `<div class="card">${logo}<h1>Đăng nhập</h1><p class="lead">Đăng nhập trên thiết bị mới để tải vault về.</p>
    <div class="stack">
      <label class="f">Username<input autocomplete="username" value="kingfisher"></label>
      <label class="f">Master password<input type="password" autocomplete="current-password"></label>
      <button class="primary block" data-act="unlock">Đăng nhập</button>
      <div class="hint">Master password không bao giờ rời khỏi thiết bị. Server chỉ nhận một khoá xác thực dẫn xuất từ nó.</div>
    </div>
    <div class="gate-foot">Chưa có tài khoản? <a href="#" data-act="go-signup">Tạo tài khoản</a></div></div>`;
  if (S.screen === 'signup') g.innerHTML = `<div class="card">${logo}<h1>Tạo tài khoản</h1><p class="lead">Một master password mở mọi vault của bạn.</p>
    <div class="stack">
      <label class="f">Username<input autocomplete="username"></label>
      <label class="f">Master password<input type="password" autocomplete="new-password" value="correct-horse"></label>
      <div class="meter"><i></i></div><div class="hint warn">Khá · nên dùng tối thiểu 12 ký tự hoặc một cụm từ dài</div>
      <label class="f">Nhập lại master password<input type="password" autocomplete="new-password"></label>
      <div class="callout warn">${ic('warn')}<div class="grow"><b>Không có cách khôi phục</b>Quên master password là mất toàn bộ dữ liệu. Hãy ghi lại ở nơi an toàn.</div></div>
      <button class="primary block" data-act="unlock">Tạo tài khoản</button>
    </div>
    <div class="gate-foot">Đã có tài khoản? <a href="#" data-act="go-login">Đăng nhập</a></div></div>`;
}

// ── Header, nav, footer ──
function renderHeader() {
  const v = vaultOf(), s = SYNC[S.sync];
  $('header.top').innerHTML = `
    <button class="icon m-back" data-act="m-back" aria-label="Quay lại">${ic('back', 20)}</button>
    <div class="brand"><span class="mark">${ic('key', 14)}</span><span>KeyMesh</span></div>
    <div class="search d-only"><input id="q" placeholder="Tìm item, field, ghi chú…" value="${esc(S.q)}">${ic('search')}<kbd>Ctrl K</kbd></div>
    <span class="sp"></span>
    <span class="sync" data-act="sync" title="${s.text}"><span class="dot ${s.cls}"></span><span class="d-only">${S.sync === 'synced' ? '' : s.text}</span></span>
    <button class="icon" data-act="settings" aria-label="Cài đặt">${ic('gear', 18)}</button>
    <button class="icon" data-act="lock" aria-label="Khoá">${ic('lock', 18)}</button>`;
}

function renderNav() {
  const all = items(), v = vaultOf(), conflicts = all.filter(i => i.conflict).length;
  const on = (k, id) => S.filter.k === k && (id == null || S.filter.id === id) && !S.q ? ' on' : '';
  let h = `<div style="position:relative">
    <button class="vault-pick" data-act="vault-menu"><span class="vault-dot" style="background:${v.color}"></span><b class="grow">${esc(v.name)}</b>${ic('down')}</button>
    ${S.menu === 'vault' ? vaultMenu() : ''}</div>
    <div style="margin-top:8px">
    <div class="nav-item${on('all')}" data-f="all">${ic('inbox')}<span class="name">Tất cả</span><span class="count">${all.length}</span></div>
    <div class="nav-item${on('fav')}" data-f="fav">${ic('star')}<span class="name">Yêu thích</span><span class="count">${all.filter(i => i.fav).length}</span></div>
    <div class="nav-item${on('unassigned')}" data-f="unassigned">${ic('link')}<span class="name">Chưa gán</span><span class="count">${all.filter(i => !i.scopes.length).length}</span></div>
    <div class="nav-item${on('expiring')}" data-f="expiring">${ic('clock')}<span class="name">Sắp hết hạn</span><span class="count warn">${all.filter(expiring).length}</span></div>
    ${conflicts ? `<div class="nav-item${on('conflict')}" data-f="conflict" style="color:var(--warn)">${ic('warn')}<span class="name">Có xung đột</span><span class="count warn">${conflicts}</span></div>` : ''}
    </div>
    <div class="nav-sec"><span>Dự án</span><button class="ghost" title="Thêm project">${ic('plus', 14)}</button></div>`;
  for (const p of projects()) {
    const n = all.filter(i => i.scopes.some(s => p.envs.some(e => e.id === s))).length;
    h += `<div class="nav-item project${on('project', p.id)}" data-f="project" data-id="${p.id}"><span class="name">${esc(p.name)}</span><span class="count">${n}</span></div>`;
    for (const e of p.envs) h += `<div class="nav-item env${on('env', e.id)}" data-f="env" data-id="${e.id}"><span class="env-dot ${envCls(e.name)}"></span><span class="name">${esc(e.name)}</span><span class="count">${all.filter(i => i.scopes.includes(e.id)).length}</span></div>`;
  }
  h += `<div class="nav-sec"></div><div class="nav-item${on('trash')}" data-f="trash">${ic('trash')}<span class="name">Thùng rác</span><span class="count">${M.trash.filter(i => i.vault === S.vault).length}</span></div>`;
  $('nav.side').innerHTML = h;
}

function vaultMenu() {
  return `<div class="menu" style="top:42px;left:0;right:0">${M.vaults.map(v => `<div class="mi" data-act="vault" data-id="${v.id}"><span class="vault-dot" style="background:${v.color}"></span><span class="grow">${esc(v.name)}</span>${v.id === S.vault ? '✓' : ''}</div>`).join('')}
    <hr><div class="mi muted" data-act="toast" data-msg="Tạo vault: M5 (F-VLT-02)">${ic('plus')} Tạo vault mới</div></div>`;
}

function renderFooter() {
  const s = SYNC[S.sync];
  $('footer.status').innerHTML = `<span class="sync" data-act="sync"><span class="dot ${s.cls}"></span>${s.text}</span>
    <span class="sp"></span><span>Bản sao file: <b>keymesh-backup.json</b> · ghi lúc 09:14</span>
    <button class="ghost row-flex" data-act="lock">${ic('lock', 14)} Khoá</button>`;
}

// ── Trang chủ mobile ──
function renderHome() {
  const v = vaultOf(), all = items(), conflicts = all.filter(i => i.conflict), exp = all.filter(expiring);
  const recent = all.filter(i => i.recent).sort((a, b) => a.recent - b.recent);
  $('#home').innerHTML = `
    <div style="position:relative;margin-bottom:12px"><button class="vault-pick" data-act="vault-menu"><span class="vault-dot" style="background:${v.color}"></span><b class="grow">${esc(v.name)}</b>${ic('down')}</button>${S.menu === 'vault' ? vaultMenu() : ''}</div>
    <div class="m-search"><input id="mq" placeholder="Tìm…" value="${esc(S.q)}" enterkeyhint="search">${ic('search', 18)}</div>
    ${S.sync !== 'synced' ? `<div class="alert-tile" style="background:var(--panel2)" data-act="sync"><span class="dot ${SYNC[S.sync].cls}"></span>${SYNC[S.sync].text}</div>` : ''}
    ${conflicts.length ? `<div class="alert-tile warn" data-f="conflict">${ic('warn', 18)}<span class="grow">${conflicts.length} item có xung đột cần xem</span>${ic('chev')}</div>` : ''}
    <div class="home-sec">Gần đây</div>
    <div class="tiles">${recent.map(i => `<div class="tile" data-item="${i.id}" data-from="home"><span class="badge">${TYPES[i.type]}</span><div class="grow"><div>${esc(i.title)}</div><div class="sub">${esc(scopeShort(i))}</div></div>${i.conflict ? `<span class="flag conflict">${ic('warn', 14)}</span>` : ''}<button class="icon" data-copy="${i.id}" aria-label="Copy mật khẩu">${ic('copy', 18)}</button></div>`).join('')}</div>
    <div class="home-sec">Dự án</div>
    <div class="tiles">${projects().map(p => `<div class="tile" data-f="env" data-id="${p.envs[0].id}"><b class="grow">${esc(p.name)}</b><span class="muted">${all.filter(i => i.scopes.some(s => p.envs.some(e => e.id === s))).length}</span>${ic('chev')}</div>`).join('')}</div>
    <div class="home-sec">Khác</div>
    <div class="tiles">
      <div class="tile" data-f="expiring">${ic('clock')}<span class="grow">Sắp hết hạn</span><span style="color:var(--warn);font-weight:650">${exp.length}</span>${ic('chev')}</div>
      <div class="tile" data-f="unassigned">${ic('link')}<span class="grow">Chưa gán</span><span class="muted">${all.filter(i => !i.scopes.length).length}</span>${ic('chev')}</div>
      <div class="tile" data-f="trash">${ic('trash')}<span class="grow">Thùng rác</span><span class="muted">${M.trash.filter(i => i.vault === S.vault).length}</span>${ic('chev')}</div>
    </div>`;
}

// ── Danh sách ──
function renderList() {
  const f = S.filter, list = filtered();
  let tabs = '';
  const proj = f.k === 'env' ? envById(f.id).project : f.k === 'project' ? M.projects.find(p => p.id === f.id) : null;
  if (proj && !S.q) tabs = `<div class="env-tabs">${proj.envs.map(e => `<button class="env-tab${f.k === 'env' && f.id === e.id ? ' on' : ''}" data-f="env" data-id="${e.id}"><span class="env-dot ${envCls(e.name)}"></span>${esc(e.name)}</button>`).join('')}</div>`;
  const rows = list.map(i => {
    if (f.k === 'trash') return `<div class="row${S.item === i.id ? ' on' : ''}" data-item="${i.id}"><div class="t"><span class="badge">${TYPES[i.type]}</span><span class="ttl">${esc(i.title)}</span></div><div class="sub">Xoá ${i.deletedAt} · còn ${i.daysLeft} ngày</div></div>`;
    const shared = i.scopes.length > 1, sub = i.fields?.find(x => x.kind === 'text')?.value || i.notes || '';
    return `<div class="row${S.item === i.id ? ' on' : ''}" data-item="${i.id}">
      <div class="t"><span class="badge">${TYPES[i.type]}</span><span class="ttl">${esc(i.title)}</span><span class="sp"></span>
        ${i.conflict ? `<span class="flag conflict" title="Có xung đột">${ic('warn', 14)}</span>` : ''}
        ${i.expires ? `<span class="flag exp" title="Hết hạn ${i.expires}">${ic('clock', 14)}</span>` : ''}
        ${shared ? `<span class="flag shared" title="Dùng chung ${i.scopes.length} env">${ic('link', 14)}${i.scopes.length}</span>` : ''}</div>
      <div class="sub">${esc(sub)}</div></div>`;
  }).join('');
  $('#list').innerHTML = `<div class="list-head"><h2>${filterTitle()}</h2><span class="muted" style="font-size:12px">${list.length} item</span>
    ${f.k === 'trash' && list.length ? '<button class="ghost danger" data-act="toast" data-msg="Dọn thùng rác: hỏi xác nhận rồi xoá trắng tất cả">Dọn thùng rác</button>' : ''}</div>
    ${tabs}${f.k === 'trash' ? '<div class="callout" style="margin:10px 12px 0;background:var(--panel2);color:var(--muted)">Item trong thùng rác tự xoá trắng sau 30 ngày.</div>' : ''}
    ${rows || '<div class="empty">Không có item nào</div>'}
    ${f.k !== 'trash' ? `<button class="primary fab" data-act="new">${ic('plus', 20)}<span>Item mới</span></button>` : ''}`;
}

// ── Chi tiết ──
function scopeChips(i) {
  return i.scopes.map(s => { const e = envById(s); return `<span class="chip${e.name === 'prod' ? ' prod' : ''}"><span class="env-dot ${envCls(e.name)}"></span>${esc(e.project.name)} / ${esc(e.name)}</span>`; }).join('');
}

// "Payment GW · uat, staging +1 project" cho dòng phụ trên mobile
function scopeShort(i) {
  if (!i.scopes.length) return 'Chưa gán';
  const by = new Map();
  for (const s of i.scopes) { const e = envById(s); by.set(e.project.name, [...(by.get(e.project.name) || []), e.name]); }
  const [[p, envs], ...rest] = by;
  return `${p} · ${envs.join(', ')}${rest.length ? ` +${rest.length} project` : ''}`;
}

function renderDetail() {
  const el = $('#detail'), i = itemById(S.item);
  if (S.mode !== 'view') return renderEdit(el, S.mode === 'new' ? null : i);
  if (!i || (S.filter.k !== 'trash' && i.deletedAt) || (S.filter.k === 'trash' && !i.deletedAt)) { el.innerHTML = '<div class="empty">Chọn một item để xem chi tiết</div>'; return; }
  if (i.deletedAt) {
    el.innerHTML = `<div class="dh"><h2>${esc(i.title)}</h2></div>
      <div class="callout danger">${ic('trash')}<div class="grow"><b>Đã xoá ngày ${i.deletedAt}</b>Còn ${i.daysLeft} ngày trước khi bị xoá trắng. Khôi phục sẽ đưa item về đủ field, scope và lịch sử.</div></div>
      <div class="actions"><button class="primary" data-act="toast" data-msg="Đã khôi phục item">Khôi phục</button><button class="danger" data-act="toast" data-msg="Xoá vĩnh viễn: hỏi xác nhận, không hoàn tác được">Xoá vĩnh viễn</button></div>`;
    return;
  }
  const shared = i.scopes.length > 1;
  const projs = new Set(i.scopes.map(s => envById(s).project.id));
  const fields = i.fields.map(x => {
    const shown = !isSecret(x.kind) || S.reveal[x.id], multi = x.kind === 'multi' || x.kind === 'secret-multi';
    const val = x.kind === 'otp' ? otpBox(x.value, 'big')
      : x.kind === 'url' ? `<a href="#" onclick="return false">${esc(x.value)}</a>`
      : !shown && x.file ? `<span class="file-chip">${ic('file', 14)} ${esc(x.file)} · ${kb(x.value)}</span>`
      : shown ? esc(x.value) : '••••••••••••';
    return `<div class="field${i.conflict === x.id ? ' conflict' : ''}"><div class="lbl">${i.conflict === x.id ? ic('warn', 13) + ' ' : ''}${esc(x.label)}</div><div class="val${multi && shown ? ' pre' : ''}">${val}</div><div class="acts">
      ${isSecret(x.kind) && x.kind !== 'otp' ? `<button class="icon" data-reveal="${x.id}" aria-label="Hiện/ẩn">${ic(shown ? 'eyeOff' : 'eye')}</button>` : ''}
      ${x.kind === 'url' ? `<button class="icon" data-act="toast" data-msg="Mở tab mới" aria-label="Mở">${ic('ext')}</button>` : ''}
      ${x.file ? `<button class="icon" data-act="dl" data-id="${x.id}" title="Tải ${esc(x.file)}" aria-label="Tải file">${ic('download')}</button>` : ''}
      <button class="icon" data-act="copy" data-otpc="${x.kind === 'otp' ? 1 : ''}" data-prod="${i.scopes.some(s => envById(s).name === 'prod') ? 1 : ''}" aria-label="Copy">${ic('copy')}</button></div></div>`;
  }).join('');
  const conflict = i.conflict ? (() => { const fl = i.fields.find(x => x.id === i.conflict), l = i.conflictLoser;
    return `<div class="callout warn">${ic('warn')}<div class="grow"><b>Xung đột ở field “${esc(fl.label)}”</b>Hai thiết bị cùng sửa field này khi offline. Bản mới hơn được giữ; bản của ${esc(l.device)} (${l.at}) đã lưu vào lịch sử.
      <div class="row-flex" style="margin-top:8px"><button data-act="toast" data-msg="Đã dùng bản của ${esc(l.device)}">Dùng bản kia</button><button class="primary" data-act="resolve">Đã xử lý</button></div></div></div>`; })() : '';
  const hist = i.history.length ? `<div class="hist">${i.history.map(h => `<div class="h"><div class="grow"><div><b>${esc(h.change[0])}</b>
      ${h.change[1] ? `<span class="diff-del mono">${h.change[0] === 'Password' ? '••••' : esc(h.change[1])}</span> → ` : ''}${h.change[2] ? `<span class="diff-add mono">${h.change[0] === 'Password' ? '••••' : esc(h.change[2])}</span>` : ''}
      ${h.loser ? ' <span class="chip warn">bản thua xung đột</span>' : ''}</div><div class="muted" style="font-size:12px">${h.at} · ${esc(h.by)}</div></div><button class="ghost" data-act="toast" data-msg="Khôi phục phiên bản này">Khôi phục</button></div>`).join('')}</div>` : '<div class="muted">Chưa có thay đổi nào.</div>';
  el.innerHTML = `
    <div class="dh"><h2>${esc(i.title)}</h2>
      <button class="icon" title="Yêu thích" style="${i.fav ? 'color:var(--warn)' : ''}">${ic('star', 18)}</button>
      <button data-act="edit">Sửa</button>
      <div style="position:relative"><button class="icon" data-act="item-menu" aria-label="Thêm">${ic('more', 18)}</button>${S.menu === 'item' ? `<div class="menu" style="right:0;top:34px">
        <div class="mi" data-act="toast" data-msg="Fork: chọn env để tạo bản riêng">${ic('fork')} Fork cho một env…</div>
        <div class="mi" data-act="toast" data-msg="Đã nhân bản">${ic('dup')} Nhân bản</div>
        <div class="mi" data-act="toast" data-msg="Chuyển sang vault khác (M6)">${ic('ext')} Chuyển sang vault…</div><hr>
        <div class="mi" style="color:var(--danger)" data-act="toast" data-msg="Đã chuyển vào thùng rác · Hoàn tác">${ic('trash')} Xoá</div></div>` : ''}</div>
    </div>
    <div class="meta"><span class="badge">${TYPES[i.type]}</span>${scopeChips(i) || '<span class="chip warn">Chưa gán env</span>'}
      ${i.expires ? `<span class="chip warn">${ic('clock', 12)} Hết hạn ${i.expires}</span>` : ''}${(i.tags || []).map(t => `<span class="chip" style="background:var(--panel2);color:var(--muted)">#${esc(t)}</span>`).join('')}</div>
    ${shared ? `<div class="callout shared">${ic('link')}<div class="grow"><b>Dùng chung ${i.scopes.length} env${projs.size > 1 ? `, ${projs.size} project` : ''}</b>Sửa ở đây thì mọi env được gán đều thấy giá trị mới. Cần giá trị riêng cho một env? Dùng <a href="#" data-act="toast" data-msg="Fork cho một env">Fork</a>.</div></div>` : ''}
    ${conflict}
    ${i.fields.length ? `<div class="section"><h3>Thông tin</h3><div class="fields">${fields}</div></div>` : ''}
    ${i.notes ? `<div class="section"><h3>Ghi chú</h3><div class="notes">${esc(i.notes)}</div></div>` : ''}
    <div class="section"><h3>${ic('history', 13)} Lịch sử (${i.history.length})</h3>${hist}</div>
    <div class="foot-meta">Cập nhật ${esc(i.updatedAt)}</div>`;
}

function renderEdit(el, i) {
  const d = S.draft;
  // Bước 1 (chỉ khi tạo mới): chọn loại, giống màn "New item" của 1Password
  if (!d.type) {
    el.innerHTML = `<div class="dh"><h2>Item mới</h2><button class="ghost" data-act="cancel">Huỷ</button></div>
      <div class="hint">Chọn loại để có sẵn field mẫu. Sau đó vẫn thêm, xoá, đổi kiểu field được.</div>
      <div class="cat-grid">${Object.entries(TPL).map(([k, t]) => `<button class="cat" data-act="pick-type" data-type="${k}">
        <span class="cat-ic t-${k}">${ic(t.icon, 22)}</span><span class="grow"><b>${TYPES[k]}</b><small>${t.desc}</small></span></button>`).join('')}</div>`;
    return;
  }
  const kindOpts = k => Object.entries(KINDS).map(([x, v]) => `<option value="${x}"${x === k ? ' selected' : ''}>${v}</option>`).join('');
  const valIn = x => {
    const a = `data-df="${x.id}" data-p="value" placeholder="${esc(x.ph || '')}" autocomplete="off" autocapitalize="off" spellcheck="false"`;
    if (x.kind === 'multi' || x.kind === 'secret-multi') return `<textarea class="mono${x.kind === 'secret-multi' ? ' masked' : ''}" ${a}>${esc(x.value)}</textarea>`;
    if (x.kind === 'otp') return `<input class="mono" ${a.replace(/placeholder="[^"]*"/, 'placeholder="Secret (base32) hoặc otpauth://…"')} type="password" value="${esc(x.value)}">`;
    return `<input class="mono" ${a} type="${x.kind === 'secret' ? 'password' : 'text'}" value="${esc(x.value)}">`;
  };
  // Nút cạnh ô giá trị: sinh mật khẩu (secret), quét QR (otp), chọn file (nhiều dòng)
  const valBtns = x => x.kind === 'secret' ? `<button class="icon${S.gen === x.id ? ' on' : ''}" title="Sinh mật khẩu" data-act="gen-open" data-id="${x.id}">${ic('dice')}</button>`
    : x.kind === 'otp' ? `<button class="ghost row-flex" data-act="qr-open" data-id="${x.id}">${ic('qr', 16)} Quét QR</button>`
    : x.kind === 'multi' || x.kind === 'secret-multi' ? `<label class="btn-file" title="Đọc nội dung từ file"><input type="file" hidden data-file="${x.id}">${ic('upload', 15)} <span>${x.file && x.value ? esc(x.file) : 'Chọn file…'}</span></label>` : '';
  const extra = x => x.kind === 'otp' ? `<div class="otp-prev">${otpBox(x.value)}</div>`
    : x.file && x.value ? `<div class="otp-prev hint">${ic('file', 13)} ${esc(x.file)} · ${kb(x.value)} · ở màn chi tiết có nút tải lại thành file</div>` : '';
  const gen = x => S.gen !== x.id ? '' : `<div class="gen">
    <div class="gen-out mono">${esc(G.out)}</div>
    <div class="seg"><button class="${G.mode === 'chars' ? 'on' : ''}" data-act="gen-set" data-k="mode" data-v="chars">Ngẫu nhiên</button><button class="${G.mode === 'words' ? 'on' : ''}" data-act="gen-set" data-k="mode" data-v="words">Dễ nhớ</button></div>
    ${G.mode === 'chars' ? `<label class="gen-len">Độ dài <b>${G.len}</b><input type="range" min="8" max="64" value="${G.len}" data-gen="len"></label>
      <div class="gen-opts">${[['upper', 'Chữ hoa'], ['digits', 'Số'], ['symbols', 'Ký tự đặc biệt']].map(([k, v]) => `<label><input type="checkbox" data-gen="${k}"${G[k] ? ' checked' : ''}>${v}</label>`).join('')}</div>`
      : `<label class="gen-len">Số từ <b>${G.words}</b><input type="range" min="3" max="8" value="${G.words}" data-gen="words"></label>`}
    <div class="row-flex"><button class="ghost" data-act="gen-new">${ic('refresh', 14)} Tạo lại</button><span class="sp"></span><button class="ghost" data-act="gen-close">Đóng</button><button class="primary" data-act="gen-use" data-id="${x.id}">Dùng</button></div></div>`;
  el.innerHTML = `<div class="dh"><h2>${i ? 'Sửa item' : 'Item mới'}</h2><button class="ghost" data-act="cancel">Huỷ</button><button class="primary" data-act="save">Lưu</button></div>
    <div class="edit-head"><span class="cat-ic t-${d.type}">${ic(TPL[d.type].icon, 24)}</span>
      <div class="grow"><input class="title-in" data-dt="title" value="${esc(d.title)}" placeholder="Tên item, ví dụ: Partner X portal" aria-label="Tiêu đề">
      <div class="sub">${TYPES[d.type]}${i ? '' : ` · <a href="#" data-act="pick-type" data-type="">Đổi loại</a>`}</div></div></div>
    <div class="section"><h3>Field</h3>
      ${d.fields.map(x => `<div class="edit-field"><span class="drag">${ic('grip', 14)}</span><input value="${esc(x.label)}" data-df="${x.id}" data-p="label" aria-label="Tên field"><select data-df="${x.id}" data-p="kind" aria-label="Kiểu">${kindOpts(x.kind)}</select>
        <div class="row-flex val-in">${valIn(x)}${valBtns(x)}</div>
        <button class="icon rm" data-act="rm-field" data-id="${x.id}" aria-label="Xoá field">${ic('x')}</button>${gen(x)}${extra(x)}</div>`).join('') || '<div class="hint">Chưa có field. Loại Note dùng phần ghi chú bên dưới.</div>'}
      <div class="add-wrap"><button class="ghost row-flex" data-act="add-menu">${ic('plus', 14)} Thêm field</button>
        ${S.menu === 'add' ? `<div class="menu">${Object.entries(KINDS).map(([k, v]) => `<button class="mi" data-act="add-field" data-kind="${k}">${v}</button>`).join('')}</div>` : ''}</div></div>
    <div class="section"><h3>Gán vào env</h3>${projects().map(p => `<div class="scope-proj"><div class="pn">${esc(p.name)}</div><div class="envs">${p.envs.map(e => `<label class="${d.scopes.includes(e.id) ? 'on' : ''}"><input type="checkbox" data-scope="${e.id}"${d.scopes.includes(e.id) ? ' checked' : ''}><span class="env-dot ${envCls(e.name)}"></span>${esc(e.name)}</label>`).join('')}</div></div>`).join('')}
      <div class="hint">Chọn nhiều env để dùng chung một item: sửa một lần, mọi env đều thấy.</div></div>
    <div class="section two"><label class="f">Ngày hết hạn<input type="date" value="${d.expires || ''}"></label><label class="f">Tag<input value="${d.tags.join(', ')}" placeholder="partner, billing"></label></div>
    <div class="section"><label class="f">Ghi chú<textarea data-dt="notes">${esc(d.notes)}</textarea></label></div>
    ${i ? `<div class="actions"><button class="danger" data-act="toast" data-msg="Đã chuyển vào thùng rác">${ic('trash', 14)} Chuyển vào thùng rác</button></div>` : ''}`;
}

// ── Dialog ──
function openSettings() {
  const sw = on => `<button class="switch${on ? ' on' : ''}" onclick="this.classList.toggle('on')"></button>`;
  const d = $('#dlg');
  d.innerHTML = `<div class="dlg-h"><button class="icon m-back" data-act="close">${ic('back', 20)}</button><h2>Cài đặt</h2><button class="icon d-only" data-act="close">${ic('x', 18)}</button></div><div class="dlg-b">
    <div class="set-group"><h4>Bảo mật</h4>
      <div class="set-row"><div class="grow">Mở khoá bằng vân tay / Face ID<small>Chỉ trên thiết bị này</small></div>${sw(true)}</div>
      <div class="set-row"><div class="grow">Tự khoá khi không thao tác<small>Desktop</small></div><select><option>5 phút</option><option selected>10 phút</option><option>30 phút</option><option>1 giờ</option></select></div>
      <div class="set-row"><div class="grow">Tự khoá sau khi chuyển nền<small>Mobile</small></div><select><option>Ngay</option><option>30 giây</option><option selected>60 giây</option><option>5 phút</option></select></div>
      <div class="set-row"><div class="grow">Xoá clipboard sau khi copy</div><select><option>15 giây</option><option selected>30 giây</option><option>60 giây</option></select></div>
      <div class="set-row"><div class="grow">Đổi master password</div><button>Đổi…</button></div></div>
    <div class="set-group"><h4>Vault</h4>
      ${M.vaults.map(v => `<div class="set-row"><span class="vault-dot" style="background:${v.color}"></span><div class="grow">${esc(v.name)}<small>${M.items.filter(i => i.vault === v.id).length} item</small></div><button class="ghost">Đổi tên</button></div>`).join('')}
      <div class="set-row"><div class="grow muted">Tạo vault mới</div><button>${ic('plus', 14)}</button></div></div>
    <div class="set-group"><h4>Dữ liệu</h4>
      <div class="set-row"><div class="grow">Bản sao tự động ra file<small>keymesh-backup.json · ghi lúc 09:14 · chỉ ghi, không đọc lại</small></div>${sw(true)}</div>
      <div class="set-row"><div class="grow">Tải backup đã mã hoá</div><button>Tải về</button></div>
      <div class="set-row"><div class="grow">Import file v1 / backup v2</div><button>Chọn file…</button></div>
      <div class="set-row"><div class="grow">Export sang Bitwarden JSON<small>Mỗi Project/env thành một collection</small></div><button>Export…</button></div>
      <div class="set-row"><div class="grow">Snapshot trên server<small>30 bản gần nhất của vault đang chọn</small></div><button>Xem…</button></div></div>
    <div class="set-group"><h4>Thiết bị đăng nhập</h4>
      ${M.sessions.map(s => `<div class="set-row"><div class="grow">${esc(s.name)}<small>${esc(s.last)}</small></div>${s.current ? '<span class="chip">Thiết bị này</span>' : '<button class="ghost danger">Thu hồi</button>'}</div>`).join('')}</div>
    <div class="set-group"><h4>Giao diện</h4>
      <div class="set-row"><div class="grow">Chủ đề</div><select data-act="theme"><option value="">Theo hệ thống</option><option value="light">Sáng</option><option value="dark">Tối</option></select></div></div>
    <div class="set-group"><div class="set-row"><div class="grow">Đăng xuất<small>Tuỳ chọn xoá dữ liệu cục bộ trên thiết bị này</small></div><button class="danger" data-act="logout">Đăng xuất</button></div></div>
    <div class="hint" style="text-align:center">KeyMesh v2.0.0-prototype</div></div>`;
  d.querySelector('[data-act=theme]').value = document.documentElement.dataset.theme || '';
  d.showModal();
}

// Quét QR cho field OTP. Bản thật: camera qua getUserMedia + BarcodeDetector (thư viện giải mã QR khi trình duyệt không có), hoặc đọc từ ảnh chụp màn hình.
function openQr(id) {
  const d = $('#dlg');
  d.innerHTML = `<div class="dlg-h"><h2>Quét mã QR 2FA</h2><button class="icon" data-act="close">${ic('x', 18)}</button></div><div class="dlg-b">
    <div class="qr-view"><div class="qr-frame"></div><div class="qr-line"></div><span>Đưa mã QR vào khung</span></div>
    <div class="row-flex" style="margin-top:12px;flex-wrap:wrap"><button data-act="qr-done" data-id="${id}">${ic('upload', 14)} Chọn ảnh / ảnh chụp màn hình…</button><span class="sp"></span>
      <button class="primary" data-act="qr-done" data-id="${id}">Giả lập: đã quét</button></div>
    <div class="hint" style="margin-top:10px">Trên desktop, mã QR thường hiện ngay trên màn hình: chụp màn hình rồi chọn ảnh. Camera chỉ bật trong lúc quét, ảnh không được lưu. Không quét được thì nhập tay secret (dòng chữ dưới mã QR).</div></div>`;
  d.showModal();
}

function openSync() {
  const s = SYNC[S.sync], d = $('#dlg');
  const detail = { synced: 'Mọi thay đổi đã có trên server.', pending: '3 thay đổi trong vault “Công việc” đang chờ push. Sẽ tự thử lại.', offline: 'Không có mạng. Bạn vẫn xem và sửa được; thay đổi sẽ đồng bộ khi có mạng.', error: 'Phiên đăng nhập đã hết hạn hoặc bị thu hồi. Dữ liệu trên máy vẫn an toàn.' }[S.sync];
  d.innerHTML = `<div class="dlg-h"><span class="dot ${s.cls}"></span><h2>${s.text}</h2><button class="icon" data-act="close">${ic('x', 18)}</button></div><div class="dlg-b">
    <p style="margin-top:0">${detail}</p>
    <div class="set-group">${M.vaults.map(v => `<div class="set-row"><span class="vault-dot" style="background:${v.color}"></span><div class="grow">${esc(v.name)}<small>version 42 · ${v.id === S.vault && S.sync === 'pending' ? '3 thay đổi chờ' : 'đã đồng bộ'}</small></div></div>`).join('')}</div>
    <div class="actions" style="margin-top:0">${S.sync === 'error' ? '<button class="primary" data-act="go-login">Đăng nhập lại</button>' : `<button class="primary" data-act="toast" data-msg="Đang đồng bộ…">${ic('refresh', 14)} Đồng bộ ngay</button>`}</div></div>`;
  d.showModal();
}

// ── Render tổng ──
function render() {
  const gate = S.screen !== 'app';
  $('#gate').hidden = !gate; $('#app').hidden = gate;
  if (gate) return renderGate();
  document.body.className = 'm-' + S.mv;
  renderHeader(); renderNav(); renderHome(); renderList(); renderDetail(); renderFooter();
  tickOtp();
}

let tt;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2200); }
const go = mv => { S.stack.push(S.mv); S.mv = mv; };

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-f],[data-item],[data-reveal],[data-copy]');
  if (!t) { if (S.menu) { S.menu = null; render(); } return; }
  if (t.tagName === 'A') e.preventDefault();
  if (t.dataset.copy) { e.stopPropagation(); toast('Đã copy mật khẩu · clipboard xoá sau 30 giây'); return; }
  if (t.dataset.reveal) { S.reveal[t.dataset.reveal] = !S.reveal[t.dataset.reveal]; return render(); }
  if (t.dataset.item) { S.item = t.dataset.item; S.mode = 'view'; S.menu = null; if (t.dataset.from === 'home') S.reveal = {}; go('item'); return render(); }
  if (t.dataset.f) { S.filter = { k: t.dataset.f, id: t.dataset.id }; S.q = ''; S.menu = null; if (S.mv === 'home') go('list'); return render(); }
  const a = t.dataset.act;
  switch (a) {
    case 'unlock': S.screen = 'app'; break;
    case 'lock': S.screen = 'unlock'; S.reveal = {}; break;
    case 'go-login': $('#dlg').open && $('#dlg').close(); S.screen = 'login'; break;
    case 'go-signup': S.screen = 'signup'; break;
    case 'logout': $('#dlg').close(); S.screen = 'login'; break;
    case 'vault-menu': S.menu = S.menu === 'vault' ? null : 'vault'; break;
    case 'item-menu': S.menu = S.menu === 'item' ? null : 'item'; break;
    case 'vault': S.vault = t.dataset.id; S.menu = null; S.filter = { k: 'all' }; S.item = null; break;
    case 'edit': S.mode = 'edit'; startDraft(itemById(S.item)); break;
    case 'new': S.mode = 'new'; startDraft(null); go('item'); break;
    case 'pick-type': S.draft.type = t.dataset.type || null; if (S.draft.type) S.draft.fields = draftFields(S.draft.type); S.gen = null; break;
    case 'add-menu': S.menu = S.menu === 'add' ? null : 'add'; break;
    case 'add-field': S.menu = null; S.draft.fields.push({ id: 'n' + Date.now(), label: KINDS[t.dataset.kind], kind: t.dataset.kind, value: '' }); break;
    case 'rm-field': S.draft.fields = S.draft.fields.filter(f => f.id !== t.dataset.id); break;
    case 'gen-open': S.gen = S.gen === t.dataset.id ? null : t.dataset.id; G.out = genPassword(G); break;
    case 'gen-set': G[t.dataset.k] = t.dataset.v; G.out = genPassword(G); break;
    case 'gen-new': G.out = genPassword(G); break;
    case 'gen-close': S.gen = null; break;
    case 'gen-use': S.draft.fields.find(f => f.id === t.dataset.id).value = G.out; S.gen = null; toast('Đã điền mật khẩu mới'); break;
    case 'cancel': S.mode = 'view'; if (!itemById(S.item)) S.mv = S.stack.pop() || 'list'; break;
    case 'save': S.mode = 'view'; toast('Đã lưu · đang đồng bộ'); break;
    case 'resolve': itemById(S.item).conflict = null; toast('Đã đánh dấu xử lý xong'); break;
    case 'copy': toast((t.dataset.prod ? '⚠ Đã copy giá trị của env prod' : t.dataset.otpc ? 'Đã copy mã OTP hiện tại' : 'Đã copy') + ' · clipboard xoá sau 30 giây'); return;
    case 'dl': { const f = itemById(S.item).fields.find(x => x.id === t.dataset.id), a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([f.value], { type: 'application/x-openvpn-profile' })); a.download = f.file; a.click(); URL.revokeObjectURL(a.href);
      toast(`Đã tải ${f.file} · mở bằng OpenVPN Connect để import`); return; }
    case 'qr-open': openQr(t.dataset.id); return;
    case 'qr-done': { $('#dlg').close(); const f = S.draft.fields.find(x => x.id === t.dataset.id), o = parseOtp(DEMO_OTP);
      f.value = DEMO_OTP; if (!S.draft.title) S.draft.title = o.issuer; toast(`Đã đọc mã QR · ${o.issuer} (${o.account})`); break; }
    case 'toast': S.menu = null; toast(t.dataset.msg); break;
    case 'settings': openSettings(); return;
    case 'sync': openSync(); return;
    case 'close': $('#dlg').close(); return;
    case 'm-back': if (S.mode !== 'view') S.mode = 'view'; else S.mv = S.stack.pop() || 'home'; break;
    default: return;
  }
  render();
});
document.addEventListener('input', e => {
  if (e.target.id === 'q' || e.target.id === 'mq') { S.q = e.target.value; const id = e.target.id, pos = e.target.selectionStart; renderList(); if (id === 'mq' && S.q) { go('list'); render(); } else if (id === 'q') renderNav(); const el = document.getElementById(id); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.dt) S.draft[t.dataset.dt] = t.value;
  if (t.dataset.df && t.dataset.p !== 'kind') {
    const f = S.draft.fields.find(f => f.id === t.dataset.df); f[t.dataset.p] = t.value;
    if (f.kind === 'otp' && t.dataset.p === 'value') { t.closest('.edit-field').querySelector('[data-otp]').dataset.otp = t.value; tickOtp(); }
  }
  if (t.dataset.gen === 'len' || t.dataset.gen === 'words') { G[t.dataset.gen] = +t.value; G.out = genPassword(G); renderDetail(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.df && t.dataset.p === 'kind') { S.draft.fields.find(f => f.id === t.dataset.df).kind = t.value; renderDetail(); }
  if (t.dataset.file && t.files[0]) {
    const file = t.files[0], f = S.draft.fields.find(x => x.id === t.dataset.file);
    if (file.size > 64 * 1024) { toast('File lớn hơn 64 KB, không nên lưu trong field'); return; }
    file.text().then(v => { f.value = v; f.file = file.name; toast(`Đã đọc ${file.name} · ${kb(v)}`); renderDetail(); });
  }
  if (t.dataset.gen && t.type === 'checkbox') { G[t.dataset.gen] = t.checked; G.out = genPassword(G); renderDetail(); }
  if (t.dataset.scope && S.draft) { const sc = S.draft.scopes, n = sc.indexOf(t.dataset.scope); if (t.checked && n < 0) sc.push(t.dataset.scope); if (!t.checked && n >= 0) sc.splice(n, 1); }
  if (e.target.dataset.act === 'theme') { const v = e.target.value; if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme; }
  if (e.target.dataset.scope) e.target.closest('label').classList.toggle('on', e.target.checked);
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#q')?.focus(); }
});
// Che nội dung khi chuyển nền (F-PWA, mobile)
document.addEventListener('visibilitychange', () => { $('#shield').hidden = document.visibilityState === 'visible'; });

// ── Preset để trang design/index.html nhảy thẳng tới một trạng thái: app.html#s=conflict&sync=offline ──
function applyHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const s = h.get('s'), mobile = matchMedia('(max-width: 899px)').matches;
  S.mode = 'view'; S.menu = null; S.q = ''; S.stack = []; S.reveal = {};
  const presets = {
    unlock: () => { S.screen = 'unlock'; }, login: () => { S.screen = 'login'; }, signup: () => { S.screen = 'signup'; },
    home: () => { S.screen = 'app'; S.filter = { k: 'env', id: 'e_pay_uat' }; S.item = 'i_partnerx'; S.mv = 'home'; },
    list: () => { S.screen = 'app'; S.filter = { k: 'env', id: 'e_pay_uat' }; S.item = 'i_partnerx'; S.mv = 'list'; S.stack = ['home']; },
    item: () => { S.screen = 'app'; S.filter = { k: 'env', id: 'e_pay_uat' }; S.item = 'i_partnerx'; S.mv = 'item'; S.stack = ['home', 'list']; },
    conflict: () => { S.screen = 'app'; S.filter = { k: 'conflict' }; S.item = 'i_dbprod'; S.mv = 'item'; S.stack = ['home', 'list']; },
    edit: () => { S.screen = 'app'; S.filter = { k: 'env', id: 'e_pay_uat' }; S.item = 'i_partnerx'; S.mode = 'edit'; startDraft(itemById(S.item)); S.mv = 'item'; S.stack = ['home', 'list']; },
    new: () => { S.screen = 'app'; S.filter = { k: 'env', id: 'e_pay_uat' }; S.item = null; S.mode = 'new'; startDraft(null); S.mv = 'item'; S.stack = ['home', 'list']; },
    expiring: () => { S.screen = 'app'; S.filter = { k: 'expiring' }; S.item = 'i_stripe'; S.mv = mobile ? 'list' : 'item'; S.stack = ['home']; },
    trash: () => { S.screen = 'app'; S.filter = { k: 'trash' }; S.item = 'i_oldsandbox'; S.mv = 'list'; S.stack = ['home']; },
    settings: () => { S.screen = 'app'; S.mv = 'home'; setTimeout(openSettings); },
    sync: () => { S.screen = 'app'; S.mv = 'home'; setTimeout(openSync); },
  };
  if ($('#dlg').open) $('#dlg').close();
  (presets[s] || presets.home)();
  if (h.has('sync')) S.sync = h.get('sync');
  const th = h.get('theme'); if (th) document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme;
  render();
}
addEventListener('hashchange', applyHash);
applyHash();
})();
