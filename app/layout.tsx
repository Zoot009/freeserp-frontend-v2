import type React from "react"
import type { Metadata, Viewport } from "next"
import { Bebas_Neue } from "next/font/google"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { GoogleOAuthProvider } from "@react-oauth/google"
import { SmoothScroll } from "@/components/smooth-scroll"
import { AuthProvider } from "@/lib/auth"
import { TutorialProvider } from "@/lib/tutorial"
import { ThemeProvider } from "@/components/theme-provider"
import { ScrollProgress } from "@/components/scroll-progress"
import { CookieConsent } from "@/components/cookie-consent"
import { ClarityAnalytics } from "@/components/clarity-analytics"
import "./globals.css"

const bebasNeue = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" })

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL('https://freeserp.com'),
  title: "Free SERP — Track Keyword Rankings for Free",
  description:
    "Free SERP that tracks keyword rankings in real time across 190+ countries. Spy on competitors, find high-volume keywords & export data — 100% free, no card needed.",
  authors: [{ name: "FreeSERP" }],
  creator: "FreeSERP",
  publisher: "FreeSERP",
  robots: {
    index: true,
    follow: false,
    googleBot: {
      index: true,
      follow: false,
      'max-image-preview': 'large',
      'max-snippet': -1,
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
    types: {
      'application/rss+xml': '/feed.xml',
    },
  },
  openGraph: {
    type: 'website',
    siteName: 'FreeSERP',
    title: 'Free SERP — Track Keyword Rankings for Free',
    description: 'Free SERP that tracks keyword rankings in real time across 190+ countries. Spy on competitors, find high-volume keywords & export data — 100% free, no card needed.',
    url: 'https://freeserp.com',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free SERP — Track Keyword Rankings for Free',
    description: 'Free SERP that tracks keyword rankings in real time across 190+ countries. Spy on competitors, find high-volume keywords & export data — 100% free, no card needed.',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking script — sets dark class before first paint, eliminates flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'light';document.documentElement.classList.remove('light','dark');document.documentElement.classList.add(t);}catch(e){}})()`,
          }}
        />
        {/* Google Tag Manager */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-MG3XS6F6');`,
          }}
        />
        {/* End Google Tag Manager */}
      </head>
      <body
        className={`${bebasNeue.variable} ${GeistSans.variable} ${GeistMono.variable} font-sans antialiased overflow-x-clip`}
      >
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
        <a href="#main-content" className="skip-to-content">
          Skip to content
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
        <Analytics />
        <ClarityAnalytics />
      </body>
    </html>
  )
}
