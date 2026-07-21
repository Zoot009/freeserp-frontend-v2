import type { CrawlError, CrawlErrorCode } from '@/types/competitor-analysis'

export interface CrawlErrorCopy {
  // Short label for the header tile — must fit a narrow column.
  label: string
  // Full explanation shown on hover / in the detail panel.
  detail: string
  // Whether retrying stands a reasonable chance of succeeding.
  retryable: boolean
}

const COPY: Record<CrawlErrorCode, CrawlErrorCopy> = {
  BOT_PROTECTION: {
    label: 'Blocked by site',
    detail:
      'This site uses bot protection (e.g. Cloudflare or a CAPTCHA wall) that refused our crawler. Its SEO data can’t be read automatically — SERP position and backlink metrics are still accurate.',
    retryable: true,
  },
  HTTP_ERROR: {
    label: 'Site returned an error',
    detail: 'The page responded with an error status instead of content. It may be temporarily down or the URL may have moved.',
    retryable: true,
  },
  TIMEOUT: {
    label: 'Timed out',
    detail: 'The page took longer than 30 seconds to respond. This is usually temporary — a recrawl often succeeds.',
    retryable: true,
  },
  UNREACHABLE: {
    label: 'Unreachable',
    detail: 'We couldn’t connect to this domain — the DNS record, certificate, or server appears to be misconfigured.',
    retryable: true,
  },
  THIN_CONTENT: {
    label: 'No readable content',
    detail:
      'The page loaded but rendered almost no content — typically a JavaScript app that needs a real user session. On-page metrics aren’t available for it.',
    retryable: true,
  },
  UNKNOWN: {
    label: 'Crawl failed',
    detail: 'We couldn’t retrieve this page’s content. Try a recrawl — if it keeps failing, the site is likely blocking automated access.',
    retryable: true,
  },
}

export function crawlErrorCopy(err: CrawlError | null | undefined): CrawlErrorCopy {
  const base = COPY[err?.code ?? 'UNKNOWN'] ?? COPY.UNKNOWN
  // Fold the status into the detail when we have one — makes support triage
  // possible without exposing raw internals.
  if (err?.httpStatus) return { ...base, detail: `${base.detail} (HTTP ${err.httpStatus})` }
  return base
}
