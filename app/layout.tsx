import type React from "react"

// The real <html>/<body> shell, fonts, providers and metadata live in
// app/[locale]/layout.tsx. This root layout only forwards children so that
// next-intl can render a locale-aware document per the [locale] segment.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children
}
