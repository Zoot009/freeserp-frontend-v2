import type React from "react"
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google"

/**
 * Route-segment layout for the LLM Tracker.
 *
 * The design specifies Instrument Sans + IBM Plex Mono. Loading them here rather
 * than in the root layout keeps them scoped to this section — the rest of the
 * dashboard keeps Geist, and no other page pays for the extra font payload.
 *
 * next/font only works in a server component, which is why this is a layout and
 * not something the (client) page does for itself. It also self-hosts the files,
 * so this stays consistent with how the app already loads Geist and Bebas rather
 * than adding a Google Fonts <link> the way the raw design mock does.
 */

const instrumentSans = Instrument_Sans({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-llm-sans",
})

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-llm-mono",
})

export default function LlmTrackerLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${instrumentSans.variable} ${ibmPlexMono.variable}`}>{children}</div>
}
