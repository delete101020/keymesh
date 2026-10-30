// Messages are fixed strings: they never carry passwords, key bytes or vault content.
const MESSAGES = Object.freeze({
  'decrypt-failed': 'Decryption failed',
  format: 'Malformed input',
  unsupported: 'Unsupported',
  invalid: 'Invalid argument',
});

export const ERROR_CODES = Object.freeze(Object.keys(MESSAGES));

export class KeymeshError extends Error {
  // `detail` names what is wrong (a field or API name chosen by core), never a caller-supplied value.
  constructor(code, detail) {
    const base = MESSAGES[code] ?? MESSAGES.invalid;
    super(detail ? `${base}: ${detail}` : base);
    this.name = 'KeymeshError';
    this.code = code in MESSAGES ? code : 'invalid';
  }
}
