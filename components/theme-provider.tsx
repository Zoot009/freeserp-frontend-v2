'use client'

import * as React from 'react'

// Cookie-based theme provider (replaces next-themes) — no rendered <script>.
//
// The anti-flash trick: the theme is stored in a cookie, and the SERVER layout
// reads it and stamps the correct `class` on <html> in the initial HTML. So
// there is no flash of the wrong theme AND no client-side script to inject —
// which is what React 19 / Next 16 flags with "Encountered a script tag while
// rendering React component…" (it flags every rendered <script>, including
// next-themes' and next/script's beforeInteractive one). This provider only
// manages runtime toggling: it writes the cookie + class on setTheme.

type Theme = 'light' | 'dark'

const COOKIE = 'theme'
const ONE_YEAR = 60 * 60 * 24 * 365

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: Theme
  setTheme: (t: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

function applyTheme(t: Theme) {
  const el = document.documentElement
  el.classList.remove('light', 'dark')
  el.classList.add(t)
  el.style.colorScheme = t
}

function readCookieTheme(): Theme | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|;\s*)theme=(light|dark)/)
  return m ? (m[1] as Theme) : null
}

// `initialTheme` comes from the server (cookie) so state matches the SSR class
// with no flash. Extra next-themes-style props are accepted and ignored so the
// layout call site didn't need to change.
export function ThemeProvider({
  children,
  initialTheme = 'light',
}: {
  children: React.ReactNode
  initialTheme?: Theme
  attribute?: string
  defaultTheme?: string
  enableSystem?: boolean
  enableColorScheme?: boolean
  disableTransitionOnChange?: boolean
}) {
  const [theme, setThemeState] = React.useState<Theme>(initialTheme)

  const setTheme = React.useCallback((next: Theme) => {
    // Suppress the whole-page transition sweep during the switch.
    const style = document.createElement('style')
    style.appendChild(
      document.createTextNode('*,*::before,*::after{transition:none !important}'),
    )
    document.head.appendChild(style)

    setThemeState(next)
    document.cookie = `${COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`
    applyTheme(next)

    // Force a reflow so the "no transitions" style takes effect, then restore.
    ;(() => window.getComputedStyle(document.body).opacity)()
    requestAnimationFrame(() => {
      style.remove()
    })
  }, [])

  // On mount, adopt the stored theme (cookie, or legacy next-themes
  // localStorage) and apply the class. The server renders the default (light)
  // — reading the cookie server-side would force the [locale] layout dynamic
  // and conflict with setRequestLocale (breaks the root-layout render), so the
  // theme is applied client-side here. A dark-mode user may see a brief flash
  // on a hard reload; light (the default) never flashes.
  React.useEffect(() => {
    let stored: Theme | null = readCookieTheme()
    if (!stored) {
      try {
        const legacy = localStorage.getItem('theme')
        if (legacy === 'dark' || legacy === 'light') stored = legacy
      } catch {
        /* localStorage blocked */
      }
    }
    if (stored && stored !== theme) {
      setTheme(stored)
    } else {
      applyTheme(theme)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme: theme, setTheme }),
    [theme, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// Drop-in replacement for next-themes' useTheme (theme / resolvedTheme /
// setTheme). No system theme, so resolvedTheme === theme.
export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) {
    return { theme: 'light', resolvedTheme: 'light', setTheme: () => {} }
  }
  return ctx
}
