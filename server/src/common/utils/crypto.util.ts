import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'crypto';

/**
 * Symmetric encryption for provider credentials (SMTP passwords, API keys)
 * stored in sending_servers.encrypted_credentials / *_handlers.encrypted_credentials.
 *
 * AES-256-GCM, authenticated. The key comes from ENCRYPTION_KEY in .env.
 * We accept any-length key and derive a stable 32-byte key via SHA-256, so a
 * long random passphrase in .env is fine.
 *
 * Wire format (single string, safe for a text column):
 *   v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>
 */

const VERSION = 'v1';

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new Error(
      'ENCRYPTION_KEY is missing or too short (min 16 chars) — cannot handle credentials',
    );
  }
  // SHA-256 always yields exactly 32 bytes = AES-256 key length.
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12); // 96-bit nonce is the GCM standard
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Malformed encrypted secret');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}