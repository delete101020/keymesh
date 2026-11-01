// Reads an otpauth QR with the browser's own BarcodeDetector. The camera is on only while this dialog
// is open and stops as soon as a code is read; no frame or image is kept.
import { h, openDialog } from './dom.js';
import { icon } from './icons.js';
import { isTotpUri, parseOtp } from '../otp.js';

const SCAN_EVERY_MS = 200;

export const hasQrReader = () => typeof globalThis.BarcodeDetector === 'function';

const validUri = (raw) => isTotpUri(raw) && parseOtp(raw).ok;

export function openQrDialog(app, onResult) {
  let stream = null;
  let timer = null;
  const stopCamera = () => {
    clearTimeout(timer);
    timer = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  };
  const d = openDialog(app, { title: 'Quét mã QR', onClose: stopCamera });
  const message = h('div', { class: 'hint', role: 'status' }, 'Đưa mã QR vào khung hình, hoặc chọn ảnh chụp màn hình.');
  const video = h('video', { class: 'qr-view', muted: true, playsinline: true, 'aria-label': 'Hình từ camera' });
  const detector = new BarcodeDetector({ formats: ['qr_code'] });
  const NOT_TOTP = 'Mã QR này không phải otpauth://totp/… hợp lệ. Field giữ nguyên.';

  const accept = (raw) => {
    if (!validUri(raw)) {
      message.textContent = NOT_TOTP;
      return false;
    }
    stopCamera();
    d.close();
    onResult(raw);
    return true;
  };

  const scan = async () => {
    if (!stream) return;
    try {
      const [code] = await detector.detect(video);
      if (code && accept(code.rawValue)) return;
    } catch {
      // A frame that is not ready yet; the next round tries again.
    }
    if (stream) timer = setTimeout(scan, SCAN_EVERY_MS);
  };

  const fromImage = async (file) => {
    let bitmap = null;
    try {
      bitmap = await createImageBitmap(file);
      const [code] = await detector.detect(bitmap);
      if (code) accept(code.rawValue);
      else message.textContent = 'Không đọc được mã QR từ ảnh này. Field giữ nguyên.';
    } catch {
      message.textContent = 'Không đọc được ảnh này. Field giữ nguyên.';
    } finally {
      bitmap?.close();
    }
  };

  const chooser = h('input', {
    type: 'file',
    accept: 'image/*',
    hidden: true,
    'aria-label': 'Ảnh có mã QR',
    'data-qr-image': true,
    on: { change: (e) => {
      const [file] = e.target.files;
      e.target.value = '';
      if (file) fromImage(file);
    } },
  });

  d.setBody(video, message, chooser);
  d.setFoot(
    h('button', { on: { click: () => chooser.click() } }, icon('upload'), 'Chọn ảnh'),
    h('button', { class: 'primary', on: { click: d.close } }, 'Đóng'));

  (async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (!d.isOpen) return s.getTracks().forEach((t) => t.stop());
      stream = s;
      video.srcObject = s;
      await video.play();
      return scan();
    } catch (e) {
      video.hidden = true;
      message.textContent = `${e?.name === 'NotAllowedError' ? 'Quyền dùng camera đã bị từ chối.' : 'Không mở được camera.'} Bạn vẫn có thể chọn ảnh, hoặc đóng hộp thoại rồi dán secret/URI vào ô.`;
      return undefined;
    }
  })();
}
