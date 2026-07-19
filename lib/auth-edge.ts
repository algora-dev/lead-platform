// Edge-safe JWT verification using Web Crypto API
// Used in middleware (Edge Runtime) to avoid importing jsonwebtoken

const COOKIE_NAME = 'li_session';
const JWT_SECRET = process.env.JWT_SECRET || 'lead-intel-dev-secret-change-me';

export interface SessionUser {
  id: number;
  email: string;
  name: string | null;
  role: string;
  tenantId: number;
  tenantSlug: string;
}

export { COOKIE_NAME, JWT_SECRET };

async function importKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

export async function verifyTokenEdge(token: string): Promise<SessionUser | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const key = await importKey();
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const sig = base64urlDecode(parts[2]);
    const valid = await crypto.subtle.verify('HMAC', key, sig, data);
    if (!valid) return null;

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && Date.now() >= payload.exp * 1000) return null;

    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      tenantId: payload.tenantId,
      tenantSlug: payload.tenantSlug,
    };
  } catch {
    return null;
  }
}

function base64urlDecode(str: string): ArrayBuffer {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
