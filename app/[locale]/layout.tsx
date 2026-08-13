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
import { ThemeProvider } from "@/components/theme-provider"
import { ScrollProgress } from "@/components/scroll-progress"
import { CookieConsent } from "@/components/cookie-consent"
import { ClarityAnalytics } from "@/components/clarity-analytics"
import { UtmCapture } from "@/components/utm-capture"
import { SessionReplay } from "@/components/session-replay"
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
      <head>
        {/*
          Paints the visitor's flag colours onto the logo before first paint.

          Inline and synchronous on purpose. The middleware resolves the country
          to three hex codes and leaves them in the fs-logo cookie; reading that
          cookie here — rather than with cookies() in this layout — is what keeps
          every page statically rendered, since one dynamic API call would opt
          the whole app out of static generation for the sake of a tint.

          Running before paint is what stops the logo flashing brand blue and
          then switching. It sets variables on <html>, so no component needs to
          know the country, and it fails closed: any problem leaves the
          variables unset and the mark renders in its normal colours.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=document.cookie.match(/(?:^|; )fs-logo=([^;]*)/);if(!m)return;var c=decodeURIComponent(m[1]).split("|");if(c.length!==3)return;for(var i=0;i<3;i++){if(!/^#[0-9a-fA-F]{6}$/.test(c[i]))return;}var s=document.documentElement.style;s.setProperty("--fs-logo-1",c[0]);s.setProperty("--fs-logo-2",c[1]);s.setProperty("--fs-logo-3",c[2]);}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${bebasNeue.variable} ${GeistSans.variable} ${GeistMono.variable} font-sans antialiased overflow-x-clip`}
      >
        {/* Google Tag Manager — loaded via next/script (afterInteractive is
            injected imperatively, so unlike a rendered inline/beforeInteractive
            <script> it doesn't trigger React 19's script-tag warning). */}
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
          <ThemeProvider>
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
        <SessionReplay />
      </body>
    </html>
  )
}
