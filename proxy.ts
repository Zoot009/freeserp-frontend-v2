import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  // Match all pathnames except:
  // - /api (proxied to the backend via next.config rewrites — must NOT be touched)
  // - /_next and /_vercel internals
  // - any path containing a dot (static files: favicon.ico, sitemap.xml, feed.xml, images…)
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
