import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle /w/[slug] routes — resolve wedding slug
  if (pathname.startsWith('/w/')) {
    const segments = pathname.split('/');
    const slug = segments[2];

    if (!slug) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Pass slug through headers for downstream use
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-wedding-slug', slug);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // Handle /dashboard routes — check for couple auth
  if (pathname.startsWith('/dashboard')) {
    const token = request.cookies.get('couple_token')?.value;

    // If no token and not on auth pages, redirect to login
    if (!token && !pathname.startsWith('/dashboard/auth')) {
      // For now, allow access (auth will be implemented in Phase 3)
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/w/:path*',
    '/dashboard/:path*',
    '/api/v1/:path*',
  ],
};
