// Shared helpers for /api/gallery/* (Edge runtime — Web Crypto only, no node deps)

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });

export const corsPreflight = () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type, authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    },
  });

export interface IKAccount {
  index: number;
  id: string;
  endpoint: string;
  publicKey: string;
  privateKey: string;
}

export function getIKAccounts(): IKAccount[] {
  const out: IKAccount[] = [];
  for (const n of [1, 2, 3]) {
    const id = (process.env[`IMAGEKIT_${n}_ID`] || '').trim();
    const endpoint = (process.env[`IMAGEKIT_${n}_ENDPOINT`] || '').trim();
    const publicKey = (process.env[`IMAGEKIT_${n}_PUBLIC_KEY`] || '').trim();
    const privateKey = (process.env[`IMAGEKIT_${n}_PRIVATE_KEY`] || '').trim();
    if (privateKey) out.push({ index: n, id, endpoint, publicKey, privateKey });
  }
  return out;
}

export function getSupabase() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const serviceKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
  return { url, serviceKey };
}

export function sbHeaders(serviceKey: string) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
}

const enc = new TextEncoder();

export async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64urlEncode(s: string): string {
  const b64 = btoa(unescape(encodeURIComponent(s)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return decodeURIComponent(escape(atob(b64)));
}

export async function issueAdminToken(secret: string, hours = 6): Promise<string> {
  const exp = Date.now() + hours * 3600 * 1000;
  const payload = b64urlEncode(JSON.stringify({ exp, iat: Date.now() }));
  const sig = await hmacHex(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifyAdminToken(secret: string, token: string): Promise<boolean> {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return false;
    const expect = await hmacHex(secret, payload);
    if (expect.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < expect.length; i++) diff |= expect.charCodeAt(i) ^ sig.charCodeAt(i);
    if (diff !== 0) return false;
    const data = JSON.parse(b64urlDecode(payload));
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function getBearer(req: Request): string {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return (m?.[1] || '').trim();
}

export function safeCompare(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
