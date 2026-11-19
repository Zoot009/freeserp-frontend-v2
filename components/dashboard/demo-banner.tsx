"use client"

// Chrome shared by every tool's demo (spec: .claude/skills/demo-report/SKILL.md):
// the banner on top of a demo page, the chip that marks a demo in a list, the
// guard that turns a would-be change into the demo prompt, and the check that
// lets a demo page past PaidToolGate. Shared file — change it in its own PR.

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Link, useRouter } from "@/i18n/navigation"
import { DEMO_BRAND, DEMO_ID } from "@/lib/demo/shared"

/**
 * Top of every demo page. `createHref` is where this tool starts for real —
 * its create or run page — and is where both CTAs lead.
 */
export function DemoBanner({ createHref, subject = DEMO_BRAND.domain }: { createHref: string; subject?: string }) {
  const t = useTranslations("demo")
  return (
    <div
      className="card tight row"
      style={{ gap: 10, marginBottom: 16, padding: "10px 14px", borderColor: "var(--brand)", flexWrap: "wrap" }}
    >
      <DemoChip />
      <span style={{ fontSize: 13, flex: 1, minWidth: 200 }}>
        <span className="b">{t("bannerTitle")}</span>
        <span className="muted"> · {t("bannerText", { subject })}</span>
      </span>
      <Link href={createHref} className="btn primary sm">
        {t("bannerCta")} →
      </Link>
    </div>
  )
}

/** Marks the demo item in a tool's list, in place of its status chip. */
export function DemoChip() {
  const t = useTranslations("demo")
  return <span className="chip brand">{t("chip")}</span>
}

/** The prompt a demo shows instead of running an action. */
export function useDemoPrompt(createHref: string) {
  const t = useTranslations("demo")
  const router = useRouter()
  return () =>
    toast(t("promptTitle"), {
      description: t("promptText"),
      action: { label: t("promptCta"), onClick: () => router.push(createHref) },
    })
}

/**
 * Wrap every control that would change data: `guard(fn)` runs `fn` normally,
 * and on a demo shows the prompt instead — after `onBlocked`, e.g. closing the
 * menu the action sat in. Controls stay visible so the demo shows what exists.
 */
export function useDemoGuard(isDemo: boolean, createHref: string, onBlocked?: () => void) {
  const prompt = useDemoPrompt(createHref)
  return <A extends unknown[]>(fn: (...args: A) => unknown) =>
    (...args: A): void => {
      if (!isDemo) return void fn(...args)
      onBlocked?.()
      prompt()
    }
}

/**
 * Whether this page shows a demo: a "demo" path segment or query value.
 * null until the query has been read — that happens after mount, because
 * useSearchParams would need a Suspense boundary in every PaidToolGate layout,
 * and reading window during render would break hydration.
 */
export function useIsDemoView(): boolean | null {
  const pathname = usePathname()
  const [inQuery, setInQuery] = useState<boolean | null>(null)
  useEffect(() => {
    setInQuery([...new URLSearchParams(window.location.search).values()].includes(DEMO_ID))
  }, [pathname])
  return pathname.split("/").includes(DEMO_ID) || inQuery
}
