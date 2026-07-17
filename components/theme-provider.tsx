'use client'

import * as React from 'react'

// Minimal, dependency-free theme provider (replaces next-themes).
//
// Why not next-themes? Its provider renders a raw <script> element inside the
// React tree to set the theme before paint. React 19 / Next 16 flags every
// rendered <script> with "Encountered a script tag while rendering React
// component…" on client renders (fires on every navigation). We only need a
// light/dark class toggle with no system-theme detection, so this hand-rolled
// context does the job with zero rendered scripts. The pre-paint anti-flash is
// handled once by a `next/script` (beforeInteractive) in the locale layout —
// see ThemeInitScript below — which Next injects specially and does NOT flag.

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: Theme
  setTheme: (t: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

// The inline program the anti-flash script runs (also reused on client-side
// theme changes). Kept as a plain string so it can be serialized verbatim into
// the beforeInteractive script.
export const THEME_INIT_JS = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='light'&&t!=='dark')t='light';var e=document.documentElement;e.classList.remove('light','dark');e.classList.add(t);e.style.colorScheme=t;}catch(_){document.documentElement.classList.add('light');document.documentElement.style.colorScheme='light';}})();`

function applyTheme(t: Theme) {
  const el = document.documentElement
  el.classList.remove('light', 'dark')
  el.classList.add(t)
  el.style.colorScheme = t
}

// Accepts (and ignores) the next-themes-style props the layout still passes
// (attribute / enableSystem / enableColorScheme / disableTransitionOnChange)
// so the call site didn't need to change. Only `defaultTheme` is honored.
export function ThemeProvider({
  children,
  defaultTheme = 'light',
}: {
  children: React.ReactNode
  defaultTheme?: Theme
  attribute?: string
  enableSystem?: boolean
  enableColorScheme?: boolean
  disableTransitionOnChange?: boolean
}) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme)

  // On mount, adopt whatever the pre-paint script already applied (localStorage)
  // so React state matches the DOM without causing a flash.
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'light' || stored === 'dark') setThemeState(stored)
    } catch {
      /* localStorage blocked — stay on defaultTheme */
    }
  }, [])

  const setTheme = React.useCallback((next: Theme) => {
    // Suppress the whole-page transition sweep during the switch (mirrors
    // next-themes' disableTransitionOnChange).
    const style = document.createElement('style')
    style.appendChild(
      document.createTextNode('*,*::before,*::after{transition:none !important}'),
    )
    document.head.appendChild(style)

    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
    applyTheme(next)

    // Force a reflow so the "no transitions" style takes effect, then restore.
    ;(() => window.getComputedStyle(document.body).opacity)()
    requestAnimationFrame(() => {
      document.head.removeChild(style)
    })
  }, [])

  // Keep the DOM class in sync with state (covers the mount-time adoption above).
  React.useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme: theme, setTheme }),
    [theme, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// Drop-in replacement for next-themes' useTheme (theme / resolvedTheme /
// setTheme). No system theme, so resolvedTheme === theme. Falls back gracefully
// when used outside the provider.
export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) {
    return { theme: 'light', resolvedTheme: 'light', setTheme: () => {} }
  }
  return ctx
}
