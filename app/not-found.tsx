import type React from "react"
import "./globals.css"

/**
 * The 404 for URLs that never reach a locale.
 *
 * This file carries its own <html> and <body>, which no other page here does.
 * The reason is app/layout.tsx: it deliberately forwards children so that
 * app/[locale]/layout.tsx can own the document per locale. That works for every
 * real page, because every real page sits under [locale] — but a URL matching no
 * route at all renders Next's not-found against the ROOT layout, which then
 * produces a document with no html or body and fails outright:
 *
 *   Missing <html> and <body> tags in the root layout
 *
 * So the shell has to be supplied here. globals.css is imported for the same
 * reason: the locale layout is what normally pulls it in, and this page is
 * rendered without it.
 *
 * Deliberately static and dependency-free — no providers, no next-intl, no auth.
 * There is no locale to translate into (that is precisely why we are here), and
 * a 404 that needs a context to render is a 404 that can fail.
 */
export default function NotFound(): React.ReactElement {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: "26rem" }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                opacity: 0.5,
              }}
            >
              404
            </p>
            <h1
              style={{
                marginTop: 10,
                fontSize: 26,
                fontWeight: 700,
                lineHeight: 1.2,
                letterSpacing: "-0.02em",
              }}
            >
              Page not found
            </h1>
            <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, opacity: 0.65 }}>
              That address doesn&apos;t point at anything on FreeSERP. It may have moved, or the
              link may be wrong.
            </p>
            {/* A plain anchor, not next/link: this renders outside the locale
                tree, so the locale-aware Link has no routing context to read. */}
            <a
              href="/"
              style={{
                display: "inline-block",
                marginTop: 22,
                padding: "9px 16px",
                borderRadius: 9,
                background: "#2d5bff",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Back to FreeSERP
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
