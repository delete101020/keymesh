// Strength of a master password by length after NFC, as docs/04 counts it (KM-006 FR02). Shown, never
// enforced. A long run of few distinct characters ("aaaaaaaaaaaaab") is weak whatever its length.
export const STRENGTH_LABELS = Object.freeze({ weak: 'Yếu', fair: 'Khá', strong: 'Mạnh' });

export function passwordStrength(password) {
  const chars = [...password.normalize('NFC')];
  if (chars.length === 0) return null;
  if (chars.length < 12 || new Set(chars).size < 6) return 'weak';
  return chars.length < 14 ? 'fair' : 'strong';
}
