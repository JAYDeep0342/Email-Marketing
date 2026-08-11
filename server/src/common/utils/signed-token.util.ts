import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Stateless signed tokens for open/click tracking.
 *
 * Why not stored tokens (like unsubscribe)? Opens/clicks can be MANY per email
 * (every link, every open). Storing a row per link would bloat the DB. Instead
 * we pack the identity into a compact base64url payload and HMAC-sign it, so the
 * tracking endpoints can verify + decode with ZERO database round-trips.
 *
 * Secret = TRACKING_SECRET (falls back to ENCRYPTION_KEY if unset).
 */

function secret(): string {
  const s = process.env.TRACKING_SECRET || process.env.ENCRYPTION_KEY;
  if (!s || s.length < 16) {
    throw new Error('TRACKING_SECRET (or ENCRYPTION_KEY) missing/too short');
  }
  return s;
}

function b64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(data: string): string {
  return b64url(createHmac('sha256', secret()).update(data).digest());
}

export interface TrackingIdentity {
  j: string; // emailJobId
  t: string; // tenantId
  c: string; // campaignId
  k: string; // contactId
}

/** identity -> "<payload>.<sig>" */
export function encodeTrackingToken(id: TrackingIdentity): string {
  const payload = b64url(Buffer.from(JSON.stringify(id), 'utf8'));
  return `${payload}.${sign(payload)}`;
}

/** "<payload>.<sig>" -> identity, or null if tampered/malformed */
export function decodeTrackingToken(token: string): TrackingIdentity | null {
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(fromB64url(payload).toString('utf8'));
    if (obj && obj.j && obj.t && obj.c && obj.k) return obj as TrackingIdentity;
    return null;
  } catch {
    return null;
  }
}

/**
 * Sign an outbound click target so the redirect endpoint can't be abused as an
 * open redirect. Returns a short signature to append as &s=.
 */
export function signUrl(url: string): string {
  return sign(`url:${url}`);
}

export function verifyUrlSignature(url: string, sig: string): boolean {
  const expected = sign(`url:${url}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}