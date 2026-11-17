import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import { sql, ensureDb } from './db';

const COOKIE = 'eb_session';
const secret = () => {
  if (!process.env.AUTH_SECRET && process.env.NODE_ENV === 'production' && !process.env.ALLOW_DEV_SECRET)
    throw new Error('AUTH_SECRET environment variable is not set');
  return new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret-change-me-please-0123456789');
};

export type SessionUser = { id: number; name: string; role: 'admin' | 'office' | 'driver' };

export async function createSession(u: SessionUser) {
  const token = await new SignJWT({ id: u.id, name: u.name, role: u.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(u.role === 'driver' ? '30d' : '7d')
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * (u.role === 'driver' ? 30 : 7),
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getUser(): Promise<SessionUser | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, secret());
    await ensureDb();
    const [u] = await sql`select id, name, role, active from users where id = ${payload.id as number}`;
    if (!u || !u.active) return null;
    return { id: u.id, name: u.name, role: u.role };
  } catch {
    return null;
  }
}

export async function requireStaff(roles: string[] = ['admin', 'office']) {
  const u = await getUser();
  if (!u) redirect('/login');
  if (!roles.includes(u.role)) redirect(u.role === 'driver' ? '/driver' : '/');
  return u;
}

export async function requireAdmin() {
  return requireStaff(['admin']);
}

export async function requireDriver() {
  const u = await getUser();
  if (!u) redirect('/login');
  return u; // staff can also view the driver app
}
