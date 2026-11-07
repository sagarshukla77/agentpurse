import { NextResponse, type NextRequest } from 'next/server';

/** First gate for pages only: no session cookie, no app. Real verification happens in every API route. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const open = pathname === '/login' || pathname.startsWith('/api/') || pathname.startsWith('/_next/') || pathname === '/favicon.ico';
  if (!open && !req.cookies.get('ap_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
