/**
 * src/lib/auth/jwt.ts
 * HMAC-SHA256 JWT — ใช้เฉพาะ integrity + expiry + jti identification
 * ไม่ใช้สำหรับ authorization
 */

export interface JWTPayload {
  jti: string; // session document ID
  sub: string; // employeeId
  iat: number; // issued at (seconds)
  exp: number; // expiry (seconds)
}

function b64url(data: string | ArrayBuffer): string {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : new Uint8Array(data);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(str: string): string {
  const p = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = p.length % 4;
  return atob(pad ? p + '='.repeat(4 - pad) : p);
}

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signJWT(payload: JWTPayload): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const msg = `${header}.${body}`;
  const key = await getKey();
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(msg)
  );
  return `${msg}.${b64url(sig)}`;
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const key = await getKey();
    const sigBytes = Uint8Array.from(
      atob(sig.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(`${header}.${body}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(b64urlDecode(body)) as JWTPayload;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!payload.jti || !payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
}
