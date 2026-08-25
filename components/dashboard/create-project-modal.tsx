"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { declineKeywordAi } from "@/lib/keywordAiChoice"
import { CreditCost } from "@/components/dashboard/credit-cost"
import { CREDIT_ACTION_KEYS } from "@/lib/credits"
import { useTranslations } from "next-intl"
import { api } from "@/lib/api"
import { Icon } from "./icons"
import { normalizeDomain, projectNameFor } from "@/lib/pendingDomain"

/**
 * Create a project, from wherever you happen to be.
 *
 * This used to live inside the Rank Tracker page, which meant every other
 * "Create SEO Project" button in the product was really a LINK to that page —
 * you asked to make a project and got navigated somewhere else, then had to find
 * the button again. Now the modal opens in place and the caller decides what to
 * do with the result.
 *
 * Domain only. The name field asked people to invent a label for a thing that
 * already has one, and in almost every project the two ended up as the same
 * string — the switcher stopped showing the name for exactly that reason. It is
 * derived here and editable later on the project's own page.
 *
 * Generic in the created project so each caller keeps its own row type; the API
 * response is passed through untouched.
 */
export function CreateProjectModal<T>({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (project: T) => void
}) {
  // Reuses the strings the Rank Tracker's modal already had in all four
  // locales — no new keys, so this ships translated rather than English-only.
  const t = useTranslations("dashProjects")
  const [raw, setRaw] = useState("")
  /**
   * Whether to read the site and suggest starter keywords.
   *
   * This used to happen unconditionally, which spends credits on someone's
   * behalf and picks a keyword set for a user who may have arrived with their
   * own list already written. Defaulted ON because it is the right answer for
   * most people and it is what the product did before — but it is now a
   * question with a visible answer rather than something that just happens.
   */
  const [autoKeywords, setAutoKeywords] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  // The same normalizer the landing page and the backend use, so "https://www.
  // Example.com/pricing" and "example.com" create one project, not two.
  const domain = useMemo(() => normalizeDomain(raw), [raw])
  const name = domain ? projectNameFor(domain) : ""

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!domain) {
      // The button used to just be `disabled` here, so clicking it with an
      // empty/invalid field did nothing at all — no message, no shake,
      // nothing to explain why "Create project" wasn't working. Surface the
      // same error box the API-failure path already uses instead.
      setError(t("domainRequiredError"))
      inputRef.current?.focus()
      return
    }
    setError("")
    setLoading(true)
    try {
      // New projects start with NO auto-check schedule — the owner sets a
      // cadence afterward on the project page (paid-only).
      const created = await api.post<T>("/api/projects", { name, domain, autoKeywords })
      // Remember "I'll add my own". The server skips the run, but the dashboard
      // and the keywords page each ask again on their own unless they can see
      // that the question was already answered — which is how choosing manual
      // still ended in a prompt on the very next screen.
      if (!autoKeywords) {
        const id = (created as { id?: string } | null)?.id
        if (id) declineKeywordAi(id)
      }
      onCreated(created)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("createError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    // .fs-app because this renders from pages that are Tailwind-only (the
    // Overview), where the dashboard's scoped tokens would not otherwise reach.
    <div className="fs-app">
      <div className="modal-bg" onClick={() => { if (!raw.trim()) onClose() }}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
          <div className="modal-h">
            <div>
              <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}>
                <span className="spark">
                  <Icon.spark />
                </span>{" "}
                {t("addModalEyebrow")}
              </div>
              <div className="b" style={{ fontSize: 18, marginTop: 4 }}>
                {t("addModalTitle")}
              </div>
              {/* States what a "project" actually is before asking for a domain —
                  the label alone didn't say this tracks Google rankings over time. */}
              <div className="tiny muted" style={{ marginTop: 4, maxWidth: 360 }}>
                {t("addModalSubtitle")}
              </div>
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label={t("close")}>
              <Icon.close />
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label htmlFor="cp-domain">{t("domainLabel")}</label>
                <input
                  id="cp-domain"
                  ref={inputRef}
                  className="input lg"
                  type="text"
                  autoComplete="url"
                  placeholder={t("domainPlaceholder")}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                />
                {/* The derived name, shown rather than asked for: it confirms
                    what was understood from a pasted URL before anything is
                    created. Falls back to the format hint while the input is
                    not yet a usable domain. */}
                {name ? (
                  <span className="tiny muted">
                    {t("projectNameLabel")}:{" "}
                    <span style={{ color: "var(--text)" }}>{name}</span>
                  </span>
                ) : (
                  <span className="tiny muted">{t("domainHint")}</span>
                )}
              </div>
              {/* Two plain options rather than a checkbox: "find them for me"
                  and "I'll add my own" are different starting points, and a
                  ticked box hides the second one behind the absence of the
                  first. */}
              <div className="field">
                <label>{t("startLabel")}</label>
                <div style={{ display: "grid", gap: 8 }}>
                  {[
                    { on: true, title: t("autoTitle"), desc: t("autoDesc") },
                    { on: false, title: t("manualTitle"), desc: t("manualDesc") },
                  ].map((opt) => {
                    const selected = autoKeywords === opt.on
                    return (
                      <button
                        key={String(opt.on)}
                        type="button"
                        onClick={() => setAutoKeywords(opt.on)}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "flex-start",
                          textAlign: "left",
                          padding: "11px 13px",
                          borderRadius: "var(--r-md)",
                          border: "1px solid " + (selected ? "var(--brand)" : "var(--border)"),
                          background: selected ? "var(--brand-soft)" : "transparent",
                          cursor: "pointer",
                          font: "inherit",
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            marginTop: 2,
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            flexShrink: 0,
                            border: "2px solid " + (selected ? "var(--brand)" : "var(--border)"),
                            background: selected
                              ? "radial-gradient(circle, var(--brand) 0 3px, transparent 4px)"
                              : "transparent",
                          }}
                        />
                        <span style={{ minWidth: 0 }}>
                          <span className="b" style={{ fontSize: 13, display: "block" }}>{opt.title}</span>
                          <span className="tiny muted" style={{ display: "block", marginTop: 2 }}>{opt.desc}</span>
                          {opt.on && (
                            <CreditCost
                              action={CREDIT_ACTION_KEYS.keywordSuggestions}
                              showBalance={false}
                              className="mt-1"
                            />
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
              {error && (
                <div
                  className="card tight"
                  style={{ borderColor: "var(--neg)", background: "var(--neg-soft)", color: "var(--neg)", fontSize: 12 }}
                >
                  {error}
                </div>
              )}
            </div>
            <div className="modal-f">
              <button type="button" className="btn" onClick={onClose}>
                {t("cancel")}
              </button>
              <button type="submit" className="btn primary" disabled={loading}>
                {loading ? t("creating") : t("createProject")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
