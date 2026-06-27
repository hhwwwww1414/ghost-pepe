import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
} from 'node:crypto';

/**
 * Deterministic, keyed hash used for tokens/fingerprints stored in DB.
 * We never store raw tokens — only HMAC(secret, value). (docs 03 §17)
 */
export function hashToken(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

/** URL-safe random token (default 32 bytes). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function newUuid(): string {
  return randomUUID();
}

function deriveKey(masterKey: string): Buffer {
  // Accept hex, base64 or raw passphrase; normalise to 32 bytes via scrypt.
  return scryptSync(masterKey, 'ghostpepe.credential.v1', 32);
}

/**
 * AES-256-GCM encryption for credential material at rest (docs 05 §15).
 * Returns base64( iv | tag | ciphertext ).
 */
export function encryptSecret(plaintext: string, masterKey: string): string {
  const key = deriveKey(masterKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(payload: string, masterKey: string): string {
  const key = deriveKey(masterKey);
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** Mask a secret for safe display in admin UI (never show full UUID/token). */
export function maskSecret(value: string): string {
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/** scrypt password hashing for admin users (no native deps). Format: scrypt$salt$hash */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1]!, 'hex');
  const expected = Buffer.from(parts[2]!, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqualBuf(expected, actual);
}

function timingSafeEqualBuf(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
