import { randomBytes, createHash } from 'crypto';

/**
 * Generates a URL-safe random token (the RAW value we send to the user)
 * plus its SHA-256 hash (what we store in the DB). We never store raw tokens.
 */
export function generateToken(bytes = 32): { raw: string; hash: string } {
  const raw = randomBytes(bytes).toString('hex');
  const hash = hashToken(raw);
  return { raw, hash };
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
