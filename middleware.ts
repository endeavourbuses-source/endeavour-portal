import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC = [/^\/login/, /^\/setup/, /^\/enquire/, /^\/q\//, /^\/i\//, /^\/api\/cron/, /^\/_next/, /^\/favicon/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const t = req.cookies.get('eb_session')?.value;
  let role: string | null = null;
  if (t) {
    try {
      const { payload } = await jwtVerify(t, new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret-change-me-please-0123456789'));
      role = payload.role as string;
    } catch {}
  }
  if (!role) return NextResponse.redirect(new URL('/login', req.url));
  if (role === 'driver' && !pathname.startsWith('/driver')) return NextResponse.redirect(new URL('/driver', req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
