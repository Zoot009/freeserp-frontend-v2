import { fileURLToPath } from 'url'
import path from 'path'
import createNextIntlPlugin from 'next-intl/plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const withNextIntl = createNextIntlPlugin() // reads ./i18n/request.ts

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.sanity.io',
        pathname: '/**',
      },
    ],
  },
  turbopack: {
    root: __dirname,
  },
  // /dashboard/llm-tracker retired: the DataForSEO LLM Mentions archive is gone,
  // and the AI Prompt Tracker that lived under it is now a top-level route.
  //
  // These run BEFORE proxy.ts (next.config redirects precede middleware), so
  // next-intl has not normalised the path yet and each locale prefix is matched
  // explicitly. localePrefix is 'as-needed', so English is the unprefixed pair.
  // `en` is matched too because /en/dashboard/... is reachable if someone pastes it.
  //
  // 307, not 308: /dashboard/* is behind auth and never indexed, so a permanent
  // redirect buys no SEO and costs reversibility — browsers cache a 308
  // indefinitely. These are a migration aid for bookmarks and open tabs.
  async redirects() {
    return [
      // The prompt tracker moved: deep trails map one-for-one.
      { source: '/dashboard/llm-tracker/prompts', destination: '/dashboard/ai-prompt-tracker', permanent: false },
      { source: '/dashboard/llm-tracker/prompts/:path*', destination: '/dashboard/ai-prompt-tracker/:path*', permanent: false },
      { source: '/:locale(en|es|fr|de)/dashboard/llm-tracker/prompts', destination: '/:locale/dashboard/ai-prompt-tracker', permanent: false },
      { source: '/:locale(en|es|fr|de)/dashboard/llm-tracker/prompts/:path*', destination: '/:locale/dashboard/ai-prompt-tracker/:path*', permanent: false },

      // The archive itself is gone; its entry point lands on the surviving tool.
      // Deliberately collapses to the root rather than forwarding :path* — the
      // archive's deep paths have no equivalent, and an unconsumed source param
      // would be appended to the destination as ?path=...
      { source: '/dashboard/llm-tracker', destination: '/dashboard/ai-prompt-tracker', permanent: false },
      { source: '/dashboard/llm-tracker/:path*', destination: '/dashboard/ai-prompt-tracker', permanent: false },
      { source: '/:locale(en|es|fr|de)/dashboard/llm-tracker', destination: '/:locale/dashboard/ai-prompt-tracker', permanent: false },
      { source: '/:locale(en|es|fr|de)/dashboard/llm-tracker/:path*', destination: '/:locale/dashboard/ai-prompt-tracker', permanent: false },
    ]
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3003'
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin-allow-popups' },
          { key: 'X-Content-Type-Options',        value: 'nosniff' },
          { key: 'X-Frame-Options',               value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection',              value: '1; mode=block' },
          { key: 'Referrer-Policy',               value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',            value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)
