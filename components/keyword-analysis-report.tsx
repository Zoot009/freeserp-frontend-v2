"use client"

import { useState } from "react"
import { Icon } from "@/components/dashboard/icons"
import type { CrawlData } from "@/types/competitor-analysis"

// SEO report body for a single crawled page, styled to match the fs-app
// dashboard design system (cards, chips, CSS-var tokens). Used ONLY by the
// standalone Keyword Analysis results page — the older `SinglePageReport`
// (components/single-page-report.tsx) keeps its own dark/mono look and stays
// wired up as-is for the competitor-analysis "SEO Audit" sub-page.

const DEFAULT_OPEN = new Set(["meta", "content", "keyword", "headings", "links", "images", "technical"])

function tone(ok: boolean): string {
  return ok ? "var(--pos)" : "var(--neg)"
}

function CheckRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div
      className="mini-tile"
      style={{
        display: "flex", alignItems: "center", gap: 8, minWidth: 0,
        borderLeft: `3px solid ${tone(ok)}`,
        background: ok ? "var(--bg-inset)" : "var(--neg-soft)",
      }}
    >
      <span style={{ color: tone(ok), display: "inline-flex", flexShrink: 0 }}>
        {ok ? <Icon.check /> : <Icon.close />}
      </span>
      <span className="tiny" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}{detail && <span className="muted"> · {detail}</span>}
      </span>
    </div>
  )
}

function MiniStat({ label, value, tone: t }: { label: string; value: React.ReactNode; tone?: "pos" | "warn" | "neg" }) {
  const color = t === "pos" ? "var(--pos)" : t === "warn" ? "var(--warn)" : t === "neg" ? "var(--neg)" : "var(--text)"
  return (
    <div className="mini-tile">
      <div className="mini-tile-lbl">{label}</div>
      <div className="mini-tile-val tabular" style={{ color }}>{value}</div>
    </div>
  )
}

function TileGrid({ children, min = 120 }: { children: React.ReactNode; min?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 10 }}>
      {children}
    </div>
  )
}

function MiniBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100)
  const color = pct >= 70 ? "var(--pos)" : pct >= 40 ? "var(--warn)" : "var(--neg)"
  return (
    <div className="mini-tile">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <span className="mini-tile-lbl" style={{ marginBottom: 0 }}>{label}</span>
        <span className="tiny b tabular">{value}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "var(--bg-elev)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 999 }} />
      </div>
    </div>
  )
}

// Ranked phrase list (top n-grams by occurrence) — a divided row list reads
// far better than a cramped space-between column once phrase text gets long.
function PhraseList({ title, phrases }: { title: string; phrases: Array<{ phrase: string; count: number }> }) {
  return (
    <div className="mini-tile" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px 6px" }}>
        <SubHeading>{title}</SubHeading>
      </div>
      {phrases.slice(0, 8).map((p, i) => (
        <div
          key={i}
          className="row"
          style={{ justifyContent: "space-between", gap: 10, padding: "8px 14px", borderTop: i > 0 ? "1px solid var(--border)" : "none" }}
        >
          <span className="tiny" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.phrase}</span>
          <span
            className="tiny b tabular"
            style={{ flexShrink: 0, padding: "2px 8px", borderRadius: 999, background: "var(--bg-elev)", color: "var(--text-mute)" }}
          >
            {p.count}×
          </span>
        </div>
      ))}
    </div>
  )
}

// Section title → icon + accent color (+ matching soft background for the
// icon badge and a top accent stripe on the card), so the accordion reads as
// a scannable, color-coded list instead of a wall of identical rows.
const SECTION_STYLE: Record<string, { icon: keyof typeof Icon; color: string; soft: string }> = {
  meta: { icon: "search", color: "var(--brand)", soft: "var(--brand-soft)" },
  keyword: { icon: "key", color: "var(--brand)", soft: "var(--brand-soft)" },
  content: { icon: "chart", color: "var(--pos)", soft: "var(--pos-soft)" },
  headings: { icon: "menu", color: "var(--brand)", soft: "var(--brand-soft)" },
  links: { icon: "external", color: "var(--brand)", soft: "var(--brand-soft)" },
  images: { icon: "monitor", color: "var(--warn)", soft: "var(--warn-soft)" },
  technical: { icon: "settings", color: "var(--text-mute)", soft: "var(--bg-inset)" },
}

function Section({
  id, title, subtitle, open, onToggle, children,
}: {
  id: string
  title: string
  subtitle?: string
  open: boolean
  onToggle: (id: string) => void
  children: React.ReactNode
}) {
  const style = SECTION_STYLE[id]
  const SectionIcon = style ? Icon[style.icon] : null
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: "16px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          {SectionIcon && (
            <span
              style={{
                width: 32, height: 32, borderRadius: "var(--r-sm)", background: style?.soft ?? "var(--bg-inset)",
                color: style?.color ?? "var(--text-mute)", display: "grid", placeItems: "center", flexShrink: 0,
              }}
            >
              <SectionIcon />
            </span>
          )}
          <span style={{ minWidth: 0 }}>
            <span className="b" style={{ fontSize: 15, display: "block" }}>{title}</span>
            {subtitle && <span className="tiny muted" style={{ display: "block", marginTop: 2 }}>{subtitle}</span>}
          </span>
        </span>
        <span
          style={{
            color: "var(--text-mute)", display: "inline-flex", flexShrink: 0,
            transform: open ? "rotate(90deg)" : "none", transition: "transform .15s",
          }}
        >
          <Icon.chevR />
        </span>
      </button>
      {open && (
        <div style={{ padding: "16px 18px 20px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 14 }}>
          {children}
        </div>
      )}
    </div>
  )
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
      {children}
    </div>
  )
}

export function KeywordAnalysisReport({ crawlData, keyword }: { crawlData: CrawlData; keyword: string }) {
  const [open, setOpen] = useState<Set<string>>(DEFAULT_OPEN)
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <div>
      {/* HTTP Status / Word Count / Crawl Time now live in the ScoreCard's
          "Overview Metrics" card (app/[locale]/dashboard/keyword-analysis/results/page.tsx),
          alongside Domain/Page Authority and backlinks — no need to repeat them here. */}

      {/* Meta Tags */}
      <Section id="meta" title="Meta Tags" subtitle="Title, description, canonical, and Open Graph data" open={open.has("meta")} onToggle={toggle}>
        <div className="mini-tile">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <span className="mini-tile-lbl" style={{ marginBottom: 0 }}>Title</span>
            <span className="tiny" style={{ flexShrink: 0, color: crawlData.metaTags?.titleLength >= 30 && crawlData.metaTags?.titleLength <= 60 ? "var(--pos)" : "var(--warn)" }}>
              {crawlData.metaTags?.titleLength ?? 0} chars
            </span>
          </div>
          <p className="tiny" style={{ margin: 0, color: "var(--text)" }}>{crawlData.metaTags?.title || "Not set"}</p>
        </div>

        <div className="mini-tile">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <span className="mini-tile-lbl" style={{ marginBottom: 0 }}>Meta Description</span>
            <span className="tiny" style={{ flexShrink: 0, color: crawlData.metaTags?.descriptionLength >= 120 && crawlData.metaTags?.descriptionLength <= 160 ? "var(--pos)" : "var(--warn)" }}>
              {crawlData.metaTags?.descriptionLength ?? 0} chars
            </span>
          </div>
          <p className="tiny muted" style={{ margin: 0 }}>{crawlData.metaTags?.description || "Not set"}</p>
        </div>

        <div className="mini-tile">
          <div className="mini-tile-lbl">Canonical URL</div>
          <div className="row" style={{ gap: 6, minWidth: 0 }}>
            <span style={{ color: tone(!!crawlData.metaTags?.canonical), display: "inline-flex", flexShrink: 0 }}>
              {crawlData.metaTags?.canonical ? <Icon.check /> : <Icon.close />}
            </span>
            <span className="tiny mono" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{crawlData.metaTags?.canonical || "Not set"}</span>
          </div>
        </div>

        <TileGrid min={150}>
          <MiniStat label="Language" value={crawlData.metaTags?.language || "N/A"} />
          <CheckRow label="HTTPS" ok={!!crawlData.urlInfo?.isHttps} detail={crawlData.urlInfo?.isHttps ? "Secure" : "Not secure"} />
        </TileGrid>

        {crawlData.openGraph && Object.keys(crawlData.openGraph).length > 0 && (
          <div>
            <SubHeading>Open Graph</SubHeading>
            <TileGrid min={200}>
              {Object.entries(crawlData.openGraph).slice(0, 6).map(([key, value]) => (
                <div key={key} className="mini-tile" style={{ minWidth: 0 }}>
                  <div className="mini-tile-lbl">{key}</div>
                  <div className="tiny" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(value).slice(0, 80) || "—"}</div>
                </div>
              ))}
            </TileGrid>
          </div>
        )}
      </Section>

      {/* Keyword Analysis */}
      {crawlData.keywordAnalysis && (
        <Section id="keyword" title="Keyword Analysis" subtitle={`Target: "${keyword}"`} open={open.has("keyword")} onToggle={toggle}>
          <TileGrid min={160}>
            <CheckRow label="In Title" ok={crawlData.keywordAnalysis.inTitle} />
            <CheckRow label="In H1" ok={crawlData.keywordAnalysis.inH1} />
            <CheckRow label="In Meta Desc" ok={crawlData.keywordAnalysis.inMetaDescription} />
            <CheckRow label="In First 100 Words" ok={crawlData.keywordAnalysis.inFirst100Words} />
            <CheckRow label="In URL" ok={crawlData.keywordAnalysis.inUrl} />
          </TileGrid>

          <TileGrid min={120}>
            <MiniStat label="Occurrences" value={crawlData.keywordAnalysis.occurrences} />
            <MiniStat label="Density" value={`${crawlData.keywordAnalysis.density}%`} />
          </TileGrid>

          {crawlData.keywordAnalysis.bySection && Object.keys(crawlData.keywordAnalysis.bySection).length > 0 && (
            <div>
              <SubHeading>Density by Section</SubHeading>
              <TileGrid min={150}>
                {Object.entries(crawlData.keywordAnalysis.bySection).map(([section, data]) => (
                  <div key={section} className="mini-tile">
                    <div className="mini-tile-lbl">{section}</div>
                    <div className="tiny">{data.occurrences} hits · {data.density}%</div>
                    <div className="tiny muted">{data.wordCount} words</div>
                  </div>
                ))}
              </TileGrid>
            </div>
          )}

          {crawlData.keywordAnalysis.topPhrases && (
            <div className="grid g-2">
              {(crawlData.keywordAnalysis.topPhrases.twoWord?.length ?? 0) > 0 && (
                <PhraseList title="Two-word Phrases" phrases={crawlData.keywordAnalysis.topPhrases.twoWord} />
              )}
              {(crawlData.keywordAnalysis.topPhrases.threeWord?.length ?? 0) > 0 && (
                <PhraseList title="Three-word Phrases" phrases={crawlData.keywordAnalysis.topPhrases.threeWord} />
              )}
            </div>
          )}
        </Section>
      )}

      {/* Content Analysis */}
      <Section
        id="content"
        title="Content Analysis"
        subtitle={`${(crawlData.content?.wordCount ?? 0).toLocaleString()} words, ${crawlData.content?.readability?.sentenceCount ?? 0} sentences`}
        open={open.has("content")}
        onToggle={toggle}
      >
        <TileGrid min={110}>
          <MiniStat
            label="Word Count"
            value={(crawlData.content?.wordCount ?? 0).toLocaleString()}
            tone={(crawlData.content?.wordCount ?? 0) >= 800 ? "pos" : (crawlData.content?.wordCount ?? 0) >= 300 ? "warn" : "neg"}
          />
          <MiniStat label="Unique Words" value={crawlData.content?.uniqueWords ?? 0} />
          <MiniStat label="Paragraphs" value={crawlData.content?.paragraphs ?? 0} />
          <MiniStat label="Reading Time" value={`${crawlData.content?.readingTime ?? 0}m`} />
          <MiniStat label="Sentences" value={crawlData.content?.readability?.sentenceCount ?? 0} />
        </TileGrid>

        <div className="grid g-2">
          <MiniBar label="Readability (Flesch Score)" value={crawlData.content?.readability?.fleschScore ?? 0} />
          <MiniStat label="Grade Level (Flesch-Kincaid)" value={crawlData.content?.readability?.gradeLevel ?? 0} />
        </div>

        {crawlData.pageSections && Object.keys(crawlData.pageSections).length > 0 && (
          <div>
            <SubHeading>Page Sections</SubHeading>
            <TileGrid min={170}>
              {Object.entries(crawlData.pageSections).map(([section, data]) => (
                <div key={section} className="mini-tile">
                  <div className="tiny b" style={{ marginBottom: 4, textTransform: "capitalize" }}>{section}</div>
                  <div className="tiny muted">{data.wordCount} words</div>
                  <div className="tiny muted">
                    H1: {Array.isArray(data.headings?.h1) ? data.headings.h1.length : (data.headings?.h1 || 0)},{" "}
                    H2: {Array.isArray(data.headings?.h2) ? data.headings.h2.length : (data.headings?.h2 || 0)},{" "}
                    H3: {Array.isArray(data.headings?.h3) ? data.headings.h3.length : (data.headings?.h3 || 0)}
                  </div>
                  <div className="tiny muted">
                    {Array.isArray(data.links?.internal) ? data.links.internal.length : (data.links?.internal || 0)} internal, {Array.isArray(data.links?.external) ? data.links.external.length : (data.links?.external || 0)} external links
                  </div>
                </div>
              ))}
            </TileGrid>
          </div>
        )}
      </Section>

      {/* Heading Structure */}
      <Section
        id="headings"
        title="Heading Structure"
        subtitle={`${crawlData.headings?.h1?.length ?? 0} H1, ${crawlData.headings?.h2?.length ?? 0} H2, ${crawlData.headings?.h3?.length ?? 0} H3`}
        open={open.has("headings")}
        onToggle={toggle}
      >
        <TileGrid min={72}>
          {(["h1", "h2", "h3", "h4", "h5", "h6"] as const).map((tag) => {
            const count = crawlData.headings?.[tag]?.length ?? 0
            const warn = tag === "h1" && count !== 1
            return (
              <div key={tag} className="mini-tile" style={{ textAlign: "center" }}>
                <div className="mini-tile-lbl" style={{ textAlign: "center" }}>{tag.toUpperCase()}</div>
                <div className="mini-tile-val tabular" style={{ color: warn ? "var(--warn)" : "var(--text)" }}>{count}</div>
              </div>
            )
          })}
        </TileGrid>

        {crawlData.headingStructure && crawlData.headingStructure.length > 0 && (
          <div className="mini-tile" style={{ maxHeight: 260, overflowY: "auto" }}>
            <SubHeading>Heading Hierarchy</SubHeading>
            <div className="col" style={{ gap: 6, marginTop: 8 }}>
              {crawlData.headingStructure.slice(0, 30).map((h, i) => (
                <div key={i} className="row" style={{ gap: 8, alignItems: "flex-start", paddingLeft: (h.level - 1) * 14 }}>
                  <span className={"chip" + (h.level === 1 ? " brand" : " outline")} style={{ flexShrink: 0 }}>H{h.level}</span>
                  <span className="tiny" style={{ minWidth: 0 }}>{h.text}</span>
                  {h.section && <span className="tiny muted" style={{ marginLeft: "auto", flexShrink: 0 }}>[{h.section}]</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Link Analysis */}
      {crawlData.linkAnalysis && (
        <Section
          id="links"
          title="Link Analysis"
          subtitle={`${crawlData.linkAnalysis.total ?? 0} total (${crawlData.linkAnalysis.internal ?? 0} internal, ${crawlData.linkAnalysis.external ?? 0} external)`}
          open={open.has("links")}
          onToggle={toggle}
        >
          <TileGrid min={120}>
            <MiniStat label="Internal" value={crawlData.linkAnalysis.internal} />
            <MiniStat label="External" value={crawlData.linkAnalysis.external} />
            <MiniStat label="Nofollow" value={crawlData.linkAnalysis.nofollow} />
            <MiniStat label="Self-references" value={crawlData.linkAnalysis.selfReferences} />
          </TileGrid>

          {crawlData.linkAnalysis.bySection && Object.keys(crawlData.linkAnalysis.bySection).length > 0 && (
            <div>
              <SubHeading>Links by Section</SubHeading>
              <TileGrid min={170}>
                {Object.entries(crawlData.linkAnalysis.bySection).map(([section, data]) => (
                  <div key={section} className="mini-tile">
                    <div className="mini-tile-lbl" style={{ textTransform: "capitalize" }}>{section}</div>
                    <div className="tiny">{data.internal} internal, {data.external} external</div>
                  </div>
                ))}
              </TileGrid>
            </div>
          )}

          {crawlData.linkAnalysis.externalDomains?.length > 0 && (
            <div className="mini-tile">
              <SubHeading>External Domains ({crawlData.linkAnalysis.externalDomains.length})</SubHeading>
              <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {crawlData.linkAnalysis.externalDomains.slice(0, 20).map((d, i) => (
                  <span key={i} className="chip outline">{d}</span>
                ))}
              </div>
            </div>
          )}

          {crawlData.linkAnalysis.internalLinks?.length > 0 && (
            <div className="mini-tile" style={{ maxHeight: 220, overflowY: "auto" }}>
              <SubHeading>Internal Links (top {Math.min(20, crawlData.linkAnalysis.internalLinks.length)})</SubHeading>
              <div className="col" style={{ gap: 6, marginTop: 8 }}>
                {crawlData.linkAnalysis.internalLinks.slice(0, 20).map((link, i) => (
                  <div key={i} className="row tiny" style={{ gap: 8 }}>
                    <span className="muted" style={{ flexShrink: 0 }}>[{link.section}]</span>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.text || "(no anchor)"}</span>
                    <span className="mono muted" style={{ marginLeft: "auto", flexShrink: 0, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.url}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Image Analysis */}
      {crawlData.imageAnalysis && (
        <Section
          id="images"
          title="Image Analysis"
          subtitle={`${crawlData.imageAnalysis.total ?? 0} images, ${crawlData.imageAnalysis.withoutAlt ?? 0} missing alt`}
          open={open.has("images")}
          onToggle={toggle}
        >
          <TileGrid min={120}>
            <MiniStat label="Total Images" value={crawlData.imageAnalysis.total} />
            <MiniStat label="With Alt Text" value={crawlData.imageAnalysis.withAlt} />
            <MiniStat label="Missing Alt" value={crawlData.imageAnalysis.withoutAlt} tone={crawlData.imageAnalysis.withoutAlt > 0 ? "warn" : undefined} />
            <MiniStat label="Lazy Loaded" value={crawlData.imageAnalysis.lazyLoaded} />
          </TileGrid>

          {crawlData.imageAnalysis.images?.length > 0 && (
            <div className="mini-tile" style={{ maxHeight: 280, overflowY: "auto" }}>
              <SubHeading>Images (showing {Math.min(15, crawlData.imageAnalysis.images.length)})</SubHeading>
              <div className="col" style={{ gap: 10, marginTop: 8 }}>
                {crawlData.imageAnalysis.images.slice(0, 15).map((img, i) => (
                  <div key={i} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                    {img.src && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img.src.startsWith("http") ? img.src : `${crawlData.urlInfo?.url?.replace(/\/$/, "")}${img.src.startsWith("/") ? "" : "/"}${img.src}`}
                        alt={img.alt || ""}
                        width={36}
                        height={36}
                        style={{ width: 36, height: 36, objectFit: "cover", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--bg-elev)", flexShrink: 0 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden" }}
                      />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="row" style={{ gap: 6 }}>
                        <span style={{ color: tone(img.hasAlt), display: "inline-flex", flexShrink: 0 }}>
                          {img.hasAlt ? <Icon.check /> : <Icon.close />}
                        </span>
                        <span className="tiny" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.alt || "(no alt text)"}</span>
                      </div>
                      <div className="tiny muted mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.src}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Technical SEO */}
      <Section id="technical" title="Technical SEO" subtitle="Performance, structured data, and technical checks" open={open.has("technical")} onToggle={toggle}>
        {crawlData.performance && (
          <div>
            <SubHeading>Performance</SubHeading>
            <TileGrid min={100}>
              <MiniStat label="TTFB" value={`${crawlData.performance.ttfb}ms`} tone={crawlData.performance.ttfb > 600 ? "warn" : undefined} />
              <MiniStat label="DOM Interactive" value={`${crawlData.performance.domInteractive}ms`} />
              <MiniStat label="DOM Loaded" value={`${crawlData.performance.domContentLoaded}ms`} />
              <MiniStat label="FCP" value={`${crawlData.performance.webVitals?.fcp}ms`} tone={(crawlData.performance.webVitals?.fcp || 0) > 2500 ? "warn" : undefined} />
              <MiniStat label="LCP" value={`${crawlData.performance.webVitals?.lcp}ms`} tone={(crawlData.performance.webVitals?.lcp || 0) > 2500 ? "warn" : undefined} />
              <MiniStat label="CLS" value={String(crawlData.performance.webVitals?.cls ?? 0)} tone={(crawlData.performance.webVitals?.cls || 0) > 0.1 ? "warn" : undefined} />
            </TileGrid>
          </div>
        )}

        <div>
          <SubHeading>Technical Checks</SubHeading>
          <TileGrid min={140}>
            <CheckRow label="Favicon" ok={!!crawlData.technical?.hasFavicon} />
            <CheckRow label="Viewport" ok={!!crawlData.technical?.hasViewport} />
            <CheckRow label="Schema Markup" ok={(crawlData.structuredData?.totalSchemas ?? 0) > 0} />
            <CheckRow label="HTTPS" ok={!!crawlData.urlInfo?.isHttps} />
          </TileGrid>
        </div>

        {crawlData.structuredData?.schemas?.length > 0 && (
          <div className="mini-tile">
            <SubHeading>Schema Markup ({crawlData.structuredData.totalSchemas})</SubHeading>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {crawlData.structuredData.schemas.map((s, i) => (
                <span key={i} className="chip brand">{s.type}</span>
              ))}
            </div>
          </div>
        )}

        <TileGrid min={120}>
          <MiniStat label="Scripts" value={crawlData.technical?.scripts ?? 0} />
          <MiniStat label="Stylesheets" value={crawlData.technical?.stylesheets ?? 0} />
          <MiniStat label="Inline Styles" value={crawlData.technical?.inlineStyles ?? 0} />
        </TileGrid>

        <div>
          <SubHeading>Trust Signals</SubHeading>
          <TileGrid min={140}>
            <CheckRow label="Privacy Policy" ok={!!crawlData.trustSignals?.hasPrivacyPolicy} />
            <CheckRow label="Terms of Service" ok={!!crawlData.trustSignals?.hasTermsOfService} />
            <CheckRow label="Contact Info" ok={!!crawlData.trustSignals?.hasContactInfo} />
            <CheckRow label="Social Links" ok={!!crawlData.trustSignals?.hasSocialLinks} />
          </TileGrid>
        </div>

        <div>
          <SubHeading>Content Structure</SubHeading>
          <TileGrid min={160}>
            <CheckRow label="Table of Contents" ok={!!crawlData.contentStructure?.hasTableOfContents} />
            <CheckRow label="FAQ Section" ok={!!crawlData.contentStructure?.hasFaqSection} />
            <CheckRow label="Video" ok={!!crawlData.contentStructure?.hasVideo} />
            <CheckRow label="Breadcrumb" ok={!!crawlData.contentStructure?.hasBreadcrumb} />
            <MiniStat label="Lists" value={crawlData.contentStructure?.lists ?? 0} />
            <MiniStat label="Bullet Points" value={crawlData.contentStructure?.bulletPoints ?? 0} />
          </TileGrid>
        </div>
      </Section>
    </div>
  )
}
