import { NextRequest, NextResponse } from 'next/server';

const LOCALES = ['fr', 'ar'];

/** Toute page est servie sous /fr ou /ar. La langue du navigateur choisit la redirection initiale. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return NextResponse.next();
  const preferred = req.cookies.get('locale')?.value ?? (req.headers.get('accept-language')?.toLowerCase().startsWith('ar') ? 'ar' : 'fr');
  const url = req.nextUrl.clone();
  url.pathname = `/${LOCALES.includes(preferred) ? preferred : 'fr'}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!api|uploads|_next|favicon.ico|.*\\..*).*)'] };
