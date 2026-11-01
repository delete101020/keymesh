// Text files in multi / secret-multi fields. Bytes must survive a round trip exactly, so the BOM is
// kept in the string (ignoreBOM) and line endings are never touched.
export const FILE_MAX_BYTES = 65536;
const DEFAULT_NAME = 'file.txt';

export function readFieldFile(bytes, name) {
  if (bytes.length > FILE_MAX_BYTES) return { ok: false, reason: 'too-large' };
  if (bytes.includes(0)) return { ok: false, reason: 'binary' };
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return { ok: true, text, file: name || DEFAULT_NAME };
  } catch {
    return { ok: false, reason: 'encoding' };
  }
}

export const fieldFileBytes = (text) => new TextEncoder().encode(text);

export function formatSize(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}
