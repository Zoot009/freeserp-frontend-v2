"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "@/emails/i18n/navigation"
import { api } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { FavoriteButton } from "@/components/dashboard/favorite-button"
import { displayDomain } from "@/lib/utils"

type KeywordEntity = {
  id: string
  keyword: string
  location: string | null
  device: string | null
  searchVolume: number | null
  position: number | null
  url: string | null
  checkedAt: string | null
  projectId: string
  projectName: string
  projectDomain: string
}

type AnalysisEntity = {
  id: string
  keyword: string
  yourDomain: string | null
  status: string
  isPartial: boolean
  projectId: string | null
  createdAt: string
  completedAt: string | null
  hasAiPlan: boolean
}

type ProjectEntity = {
  id: string
  name: string
  domain: string
  isPaused: boolean
  createdAt: string
  keywordCount: number
}

type FavoriteEntry =
  | { favoritedAt: string; entityType: "keyword"; entity: KeywordEntity }
  | { favoritedAt: string; entityType: "competitor_analysis"; entity: AnalysisEntity }
  | { favoritedAt: string; entityType: "project"; entity: ProjectEntity }

type Tab = "all" | "keyword" | "competitor_analysis" | "project"

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })

export default function FavoritesPage() {
  const t = useTranslations("dashFavorites")
  const router = useRouter()
  const [entries, setEntries] = useState<FavoriteEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("all")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.get<{ favorites: FavoriteEntry[] }>("/api/favorites")
        if (!cancelled) setEntries(data.favorites ?? [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("errorLoad"))
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [t])

  // Drop an entry from the list when the user unfavorites it in place.
  const remove = (entityType: Tab, id: string) =>
    setEntries((prev) => prev.filter((e) => !(e.entityType === entityType && e.entity.id === id)))

  const counts = useMemo(() => {
    const c = { all: entries.length, keyword: 0, competitor_analysis: 0, project: 0 }
    for (const e of entries) c[e.entityType]++
    return c
  }, [entries])

  const visible = tab === "all" ? entries : entries.filter((e) => e.entityType === tab)

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: t("tabAll"), count: counts.all },
    { key: "keyword", label: t("tabKeywords"), count: counts.keyword },
    { key: "competitor_analysis", label: t("tabAnalyses"), count: counts.competitor_analysis },
    { key: "project", label: t("tabProjects"), count: counts.project },
  ]

  return (
    <div className="page">
      <div className="page-h">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow"><span className="spark"><Icon.starFilled size={12} /></span> {t("headerEyebrow")}</div>
          <h1>{t("headerTitle")}</h1>
          <div className="sub">
            {error ? <span style={{ color: "var(--neg)" }}>{error}</span> : t("subtitle")}
          </div>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {tabs.map((tb) => (
          <button
            key={tb.key}
            className={"tab" + (tab === tb.key ? " active" : "")}
            onClick={() => setTab(tb.key)}
          >
            {tb.label}
            <span className="tiny muted" style={{ marginLeft: 6 }}>{tb.count}</span>
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="card" style={{ padding: 60, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
          {t("loading")}
        </div>
      ) : visible.length === 0 ? (
        <div
          className="card"
          style={{ padding: "60px 32px", textAlign: "center", border: "1px dashed var(--border-strong)", background: "transparent" }}
        >
          <div className="eyebrow" style={{ justifyContent: "center" }}>
            <span className="spark"><Icon.star /></span>
            {tab === "all" ? t("emptyTitle") : t("emptyTitleType")}
          </div>
          <div className="tiny muted" style={{ marginTop: 6, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
            {tab === "all" ? t("emptyBody") : t("emptyBodyType")}
          </div>
        </div>
      ) : (
        <div className="grid g-2" style={{ gap: 12 }}>
          {visible.map((e) => {
            if (e.entityType === "keyword") return <KeywordCard key={`k-${e.entity.id}`} e={e.entity} favoritedAt={e.favoritedAt} t={t} router={router} onRemoved={() => remove("keyword", e.entity.id)} />
            if (e.entityType === "competitor_analysis") return <AnalysisCard key={`a-${e.entity.id}`} e={e.entity} favoritedAt={e.favoritedAt} t={t} router={router} onRemoved={() => remove("competitor_analysis", e.entity.id)} />
            return <ProjectCard key={`p-${e.entity.id}`} e={e.entity} favoritedAt={e.favoritedAt} t={t} router={router} onRemoved={() => remove("project", e.entity.id)} />
          })}
        </div>
      )}
    </div>
  )
}

type Tx = ReturnType<typeof useTranslations>
type Rt = ReturnType<typeof useRouter>

function CardShell({
  onClick, children, star,
}: { onClick: () => void; children: React.ReactNode; star: React.ReactNode }) {
  return (
    <div
      onClick={onClick}
      className="card"
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onClick() } }}
      style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12 }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      <div onClick={(ev) => ev.stopPropagation()} style={{ flexShrink: 0 }}>{star}</div>
    </div>
  )
}

function KeywordCard({ e, favoritedAt, t, router, onRemoved }: { e: KeywordEntity; favoritedAt: string; t: Tx; router: Rt; onRemoved: () => void }) {
  return (
    <CardShell
      onClick={() => router.push(`/dashboard/project/${e.projectId}/keywords/${e.id}`)}
      star={<FavoriteButton entityType="keyword" entityId={e.id} initial title={{ add: t("add"), remove: t("remove") }} onChange={(f) => { if (!f) onRemoved() }} />}
    >
      <div className="row" style={{ gap: 6, marginBottom: 6 }}>
        <span className="chip outline"><Icon.key /> {t("tabKeywords")}</span>
        <span className="tiny muted">{t("colSaved")} {fmtDate(favoritedAt)}</span>
      </div>
      <div className="b" style={{ fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.keyword}</div>
      <div className="row tiny muted" style={{ gap: 12, marginTop: 6, flexWrap: "wrap" }}>
        <span>{t("colPosition")}: <span className="b" style={{ color: "var(--text)" }}>{e.position != null ? `#${e.position}` : "—"}</span></span>
        <span>{t("colVolume")}: <span className="b" style={{ color: "var(--text)" }}>{e.searchVolume != null ? e.searchVolume.toLocaleString() : "—"}</span></span>
        <span className="chip">{displayDomain(e.projectDomain)}</span>
      </div>
    </CardShell>
  )
}

function AnalysisCard({ e, favoritedAt, t, router, onRemoved }: { e: AnalysisEntity; favoritedAt: string; t: Tx; router: Rt; onRemoved: () => void }) {
  const open = () => {
    if (!e.projectId) return
    router.push(`/dashboard/project/${e.projectId}/competitor-analysis/results?analysisId=${e.id}&keyword=${encodeURIComponent(e.keyword)}`)
  }
  return (
    <CardShell
      onClick={open}
      star={<FavoriteButton entityType="competitor_analysis" entityId={e.id} initial title={{ add: t("add"), remove: t("remove") }} onChange={(f) => { if (!f) onRemoved() }} />}
    >
      <div className="row" style={{ gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
        <span className="chip outline"><Icon.users /> {t("tabAnalyses")}</span>
        {e.hasAiPlan && <span className="chip"><Icon.ai /> {t("aiPlanReady")}</span>}
        <span className="tiny muted">{t("colSaved")} {fmtDate(favoritedAt)}</span>
      </div>
      <div className="b" style={{ fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.keyword}</div>
      <div className="row tiny muted" style={{ gap: 12, marginTop: 6, flexWrap: "wrap" }}>
        {e.yourDomain && <span className="chip">{displayDomain(e.yourDomain)}</span>}
        <span className="mono" style={{ textTransform: "uppercase" }}>{e.status}</span>
      </div>
    </CardShell>
  )
}

function ProjectCard({ e, favoritedAt, t, router, onRemoved }: { e: ProjectEntity; favoritedAt: string; t: Tx; router: Rt; onRemoved: () => void }) {
  return (
    <CardShell
      onClick={() => router.push(`/dashboard/project/${e.id}/keywords`)}
      star={<FavoriteButton entityType="project" entityId={e.id} initial title={{ add: t("add"), remove: t("remove") }} onChange={(f) => { if (!f) onRemoved() }} />}
    >
      <div className="row" style={{ gap: 6, marginBottom: 6 }}>
        <span className="chip outline"><Icon.folder /> {t("tabProjects")}</span>
        <span className={"chip " + (e.isPaused ? "warn" : "pos")}>{e.isPaused ? t("statusPaused") : t("statusActive")}</span>
        <span className="tiny muted">{t("colSaved")} {fmtDate(favoritedAt)}</span>
      </div>
      <div className="b" style={{ fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</div>
      <div className="row tiny muted" style={{ gap: 12, marginTop: 6, flexWrap: "wrap" }}>
        <span className="mono">{displayDomain(e.domain)}</span>
        <span>{t("keywordsCount", { count: e.keywordCount })}</span>
      </div>
    </CardShell>
  )
}
