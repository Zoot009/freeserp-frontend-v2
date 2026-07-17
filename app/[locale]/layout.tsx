import type React from "react"
import { Suspense } from "react"
import type { Metadata, Viewport } from "next"
import { notFound } from "next/navigation"
import { Bebas_Neue } from "next/font/google"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import Script from "next/script"
import { GoogleOAuthProvider } from "@react-oauth/google"
import { hasLocale, NextIntlClientProvider } from "next-intl"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { SmoothScroll } from "@/components/smooth-scroll"
import { AuthProvider } from "@/lib/auth"
import { TutorialProvider } from "@/lib/tutorial"
import { ThemeProvider, THEME_INIT_JS } from "@/components/theme-provider"
import { ScrollProgress } from "@/components/scroll-progress"
import { CookieConsent } from "@/components/cookie-consent"
import { ClarityAnalytics } from "@/components/clarity-analytics"
import { UtmCapture } from "@/components/utm-capture"
import { routing } from "@/i18n/routing"
import "../globals.css"

const bebasNeue = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" })

const OG_LOCALES: Record<string, string> = {
  en: "en_US",
  es: "es_ES",
  fr: "fr_FR",
  de: "de_DE",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "metadata" })
  const title = t("title")
  const description = t("description")

  return {
    metadataBase: new URL("https://freeserp.com"),
    title,
    description,
    authors: [{ name: "FreeSERP" }],
    creator: "FreeSERP",
    publisher: "FreeSERP",
    robots: {
      index: true,
      follow: false,
      googleBot: {
        index: true,
        follow: false,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    verification: {
      google: "QGo2Ztv0zBp46hWn61UrO_W2X7VISQXn47TE4uOKG5g",
    },
    icons: {
      icon: "/favicon.ico",
      apple: "/favicon.ico",
    },
    alternates: {
      // English lives at the root (localePrefix: 'as-needed'); others are prefixed.
      languages: {
        "x-default": "/",
        en: "/",
        es: "/es",
        fr: "/fr",
        de: "/de",
      },
      types: {
        "application/rss+xml": "/feed.xml",
      },
    },
    openGraph: {
      type: "website",
      siteName: "FreeSERP",
      title,
      description,
      url: "https://freeserp.com",
      locale: OG_LOCALES[locale] ?? "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  }
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }
  // Enable static rendering for this locale.
  setRequestLocale(locale)

  const tCommon = await getTranslations("common")

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${bebasNeue.variable} ${GeistSans.variable} ${GeistMono.variable} font-sans antialiased overflow-x-clip`}
      >
        {/* Theme anti-flash — sets the light/dark class on <html> before paint.
            Loaded via next/script (beforeInteractive) rather than a raw inline
            <script> so it isn't a rendered React element: React 19 / Next 16 flag
            every rendered <script> with "scripts inside React components are never
            executed…". Our custom ThemeProvider (components/theme-provider.tsx)
            then adopts this state on mount — no next-themes, no flagged script. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_JS}
        </Script>
        {/* Google Tag Manager — loaded via next/script (same reason as above:
            avoids the raw-inline-<script> React 19 warning). */}
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-MG3XS6F6');`}
        </Script>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-MG3XS6F6"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}
        <NextIntlClientProvider>
          <a href="#main-content" className="skip-to-content">
            {tCommon("skipToContent")}
          </a>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} enableColorScheme disableTransitionOnChange>
            {/* Page-wide background glow — fixed so it doesn't scroll */}
            <div aria-hidden="true" className="app-grid-glow" />
            <div className="noise-overlay" aria-hidden="true" />
            <ScrollProgress />
            <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""}>
              <AuthProvider>
                <TutorialProvider>
                  <SmoothScroll>{children}</SmoothScroll>
                </TutorialProvider>
              </AuthProvider>
            </GoogleOAuthProvider>
            <CookieConsent />
          </ThemeProvider>
        </NextIntlClientProvider>
        <Analytics />
        <ClarityAnalytics />
        {/* First-party UTM/attribution capture (useSearchParams ⇒ Suspense). */}
        <Suspense fallback={null}>
          <UtmCapture />
        </Suspense>
      </body>
    </html>
  )
}
