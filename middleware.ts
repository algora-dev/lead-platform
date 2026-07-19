import { NextRequest, NextResponse } from 'next/server';
import { verifyTokenEdge, COOKIE_NAME } from '@/lib/auth-edge';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Set pathname header for server components
  const res = NextResponse.next();
  res.headers.set('x-pathname', pathname);

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return res;
  }

  // Allow static assets and Next.js internals
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.match(/\.(ico|png|svg|jpg|jpeg|gif|webp|css|js)$/)) {
    return res;
  }

  // Check session cookie
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const user = token ? await verifyTokenEdge(token) : null;

  if (!user) {
    // Redirect to login for page requests, 401 for API requests
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
