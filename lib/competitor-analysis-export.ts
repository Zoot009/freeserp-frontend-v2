import type { AnalysisData, AiPlan, CrawlData, CompetitorResult } from "@/types/competitor-analysis"
import type { LinkGraphDomain } from "@/components/internal-link-graph"

interface BuildArgs {
  analysis: AnalysisData
  linkGraph: LinkGraphDomain[] | null
  aiPlan: AiPlan | null
  exportedAt: string
}

const yn = (b: boolean | undefined | null) => (b ? "✓" : "✗")

const clean = (s: string | null | undefined): string =>
  s ? s.replace(/\s+/g, " ").trim() : ""

// Replace inline base64 data URIs with a short placeholder so the export stays
// token-efficient. Keeps the mime type for context.
const stripDataUri = (url: string | null | undefined): string => {
  if (!url) return ""
  const m = /^data:([^;,]+)[^,]*,/.exec(url)
  return m ? `[data:${m[1]}]` : url
}

function recordToInline(r: Record<string, string> | undefined | null): string {
  if (!r) return ""
  const entries = Object.entries(r).filter(([, v]) => v)
  return entries.map(([k, v]) => `${k}=${clean(v)}`).join(", ")
}

function appendCrawlData(data: CrawlData, out: string[]): void {
  // Meta
  const meta: string[] = []
  if (data.metaTags?.title) meta.push(`title (${data.metaTags.titleLength} chars): "${clean(data.metaTags.title)}"`)
  if (data.metaTags?.description) meta.push(`description (${data.metaTags.descriptionLength} chars): "${clean(data.metaTags.description)}"`)
  if (data.metaTags?.canonical) meta.push(`canonical: ${data.metaTags.canonical}`)
  if (data.metaTags?.language) meta.push(`language: ${data.metaTags.language}`)
  if (data.metaTags?.robots) meta.push(`robots: ${data.metaTags.robots}`)
  if (meta.length) {
    out.push("#### Meta")
    meta.forEach(m => out.push(`- ${m}`))
    out.push("")
  }

  // Open Graph / Twitter
  const og = recordToInline(data.openGraph)
  const tw = recordToInline(data.twitterCard)
  if (og || tw) {
    out.push("#### Social")
    if (og) out.push(`- og: ${og}`)
    if (tw) out.push(`- twitter: ${tw}`)
    out.push("")
  }

  // Content
  const c = data.content
  if (c) {
    out.push("#### Content")
    out.push(`- ${c.wordCount} words, ${c.uniqueWords} unique, ${c.paragraphs} paragraphs, ~${c.readingTime} min read`)
    if (c.readability) {
      out.push(`- Flesch ${c.readability.fleschScore} (grade ${c.readability.gradeLevel}), ${c.readability.sentenceCount} sentences, avg ${c.readability.avgWordsPerSentence} words/sentence`)
    }
    if (c.firstWords) out.push(`- first words: "${clean(c.firstWords)}"`)
    if (c.contentText) {
      out.push("")
      out.push("Content text:")
      out.push("```")
      out.push(c.contentText)
      out.push("```")
    }
    out.push("")
  }

  // Keyword analysis
  const k = data.keywordAnalysis
  if (k) {
    out.push(`#### Keyword "${k.targetKeyword}"`)
    out.push(`- ${k.occurrences} occurrences, density ${k.density}`)
    out.push(`- title: ${yn(k.inTitle)}, h1: ${yn(k.inH1)}, meta: ${yn(k.inMetaDescription)}, first 100 words: ${yn(k.inFirst100Words)}, url: ${yn(k.inUrl)}`)
    const secEntries = Object.entries(k.bySection || {}).filter(([, v]) => v && v.occurrences > 0)
    if (secEntries.length) {
      out.push("- by section:")
      secEntries.forEach(([sec, v]) => {
        out.push(`  - ${sec}: ${v.occurrences} occ, ${v.density}, ${v.wordCount} words`)
      })
    }
    if (k.topPhrases?.oneWord?.length) {
      out.push(`- top 1-word: ${k.topPhrases.oneWord.map(p => `${p.phrase}(${p.count})`).join(", ")}`)
    }
    if (k.topPhrases?.twoWord?.length) {
      out.push(`- top 2-word: ${k.topPhrases.twoWord.map(p => `${p.phrase}(${p.count})`).join(", ")}`)
    }
    if (k.topPhrases?.threeWord?.length) {
      out.push(`- top 3-word: ${k.topPhrases.threeWord.map(p => `${p.phrase}(${p.count})`).join(", ")}`)
    }
    out.push("")
  }

  // Headings
  const h = data.headings
  if (h) {
    const hLines: string[] = []
    ;(["h1", "h2", "h3", "h4", "h5", "h6"] as const).forEach(level => {
      const arr = h[level]
      if (arr && arr.length > 0) {
        hLines.push(`${level.toUpperCase()} (${arr.length}):`)
        arr.forEach(t => hLines.push(`- ${clean(t)}`))
      }
    })
    if (hLines.length) {
      out.push("#### Headings")
      hLines.forEach(l => out.push(l))
      out.push("")
    }
  }

  // Page sections
  const ps = data.pageSections
  if (ps && Object.keys(ps).length > 0) {
    out.push("#### Page Sections")
    Object.entries(ps).forEach(([name, sec]) => {
      const headingCounts = Object.entries(sec.headings || {})
        .filter(([, v]) => v > 0)
        .map(([hk, hv]) => `${hk}=${hv}`)
        .join(" ")
      out.push(
        `- ${name}: ${sec.wordCount} words${headingCounts ? `, ${headingCounts}` : ""}, links int=${sec.links?.internal ?? 0} ext=${sec.links?.external ?? 0}, images=${sec.images ?? 0}`
      )
      if (sec.text) {
        const preview = clean(sec.text)
        out.push(`  preview: "${preview.slice(0, 240)}${preview.length > 240 ? "…" : ""}"`)
      }
    })
    out.push("")
  }

  // Images
  const ia = data.imageAnalysis
  if (ia && ia.total > 0) {
    out.push(`#### Images (${ia.total} total: ${ia.withAlt} with alt, ${ia.withoutAlt} without, ${ia.lazyLoaded} lazy)`)
    ia.images?.forEach(img => {
      const flags: string[] = []
      if (img.isLazy) flags.push("lazy")
      if (img.width || img.height) flags.push(`${img.width || "?"}x${img.height || "?"}`)
      const altPart = img.hasAlt ? `alt: "${clean(img.alt)}"` : "NO ALT"
      out.push(`- ${stripDataUri(img.src)} — ${altPart}${flags.length ? ` [${flags.join(" ")}]` : ""}`)
    })
    out.push("")
  }

  // Links
  const la = data.linkAnalysis
  if (la && la.total > 0) {
    out.push(`#### Links (${la.total} total: ${la.internal} internal, ${la.external} external, ${la.nofollow} nofollow, ${la.selfReferences} self-ref)`)
    if (la.externalDomains?.length) out.push(`- external domains: ${la.externalDomains.join(", ")}`)
    const linkSecs = Object.entries(la.bySection || {}).filter(([, v]) => v.internal + v.external > 0)
    if (linkSecs.length) {
      out.push(
        "- by section: " +
          linkSecs.map(([s, v]) => `${s}(int=${v.internal} ext=${v.external})`).join(", ")
      )
    }
    if (la.internalLinks?.length) {
      out.push("")
      out.push(`Internal links (${la.internalLinks.length}):`)
      la.internalLinks.forEach(l => {
        out.push(`- "${clean(l.text)}" → ${stripDataUri(l.url)} [${l.section}]`)
      })
    }
    if (la.externalLinks?.length) {
      out.push("")
      out.push(`External links (${la.externalLinks.length}):`)
      la.externalLinks.forEach(l => {
        out.push(`- "${clean(l.text)}" → ${stripDataUri(l.url)} [${l.section}]${l.isNofollow ? " [nofollow]" : ""}`)
      })
    }
    out.push("")
  }

  // Structured data
  const sd = data.structuredData
  if (sd && sd.totalSchemas > 0) {
    out.push(`#### Structured Data (${sd.totalSchemas} schemas)`)
    sd.schemas?.forEach(s => {
      const keys = s.data ? Object.keys(s.data).slice(0, 8).join(", ") : ""
      out.push(`- ${s.type}${keys ? ` { ${keys} }` : ""}`)
    })
    out.push("")
  }

  // Technical
  const t = data.technical
  if (t) {
    out.push("#### Technical")
    out.push(
      `- favicon: ${yn(t.hasFavicon)}, viewport: ${yn(t.hasViewport)}, scripts: ${t.scripts}, stylesheets: ${t.stylesheets}, inline-styles: ${t.inlineStyles}`
    )
    if (t.metaRobots) out.push(`- meta-robots: ${t.metaRobots}`)
    if (t.xRobotsTag) out.push(`- x-robots-tag: ${t.xRobotsTag}`)
    out.push("")
  }

  // Trust signals
  const ts = data.trustSignals
  if (ts) {
    out.push("#### Trust Signals")
    out.push(
      `- privacy: ${yn(ts.hasPrivacyPolicy)}, terms: ${yn(ts.hasTermsOfService)}, contact: ${yn(ts.hasContactInfo)}, social: ${yn(ts.hasSocialLinks)}`
    )
    out.push("")
  }

  // Content structure
  const cs = data.contentStructure
  if (cs) {
    out.push("#### Content Structure")
    out.push(
      `- ToC: ${yn(cs.hasTableOfContents)}, FAQ: ${yn(cs.hasFaqSection)}, video: ${yn(cs.hasVideo)}, breadcrumb: ${yn(cs.hasBreadcrumb)}, lists: ${cs.lists}, bullets: ${cs.bulletPoints}`
    )
    out.push("")
  }

  // Performance
  const p = data.performance
  if (p) {
    out.push("#### Performance")
    out.push(`- TTFB ${p.ttfb}ms, DOM-interactive ${p.domInteractive}ms, DOM-loaded ${p.domContentLoaded}ms`)
    if (p.webVitals) {
      out.push(`- Web Vitals: FCP ${p.webVitals.fcp}ms, LCP ${p.webVitals.lcp}ms, CLS ${p.webVitals.cls}`)
    }
    out.push("")
  }

  // PSI
  if (data.psiData) {
    const psi = data.psiData
    out.push(`#### PageSpeed Insights (${psi.strategy})`)
    out.push(
      `- scores: perf ${psi.scores.performance}, seo ${psi.scores.seo}, a11y ${psi.scores.accessibility}, BP ${psi.scores.bestPractices}`
    )
    out.push(
      `- vitals: TTFB ${psi.vitals.ttfb}, FCP ${psi.vitals.fcp}, LCP ${psi.vitals.lcp}, TBT ${psi.vitals.tbt}, CLS ${psi.vitals.cls}, SI ${psi.vitals.si}, TTI ${psi.vitals.tti}`
    )
    out.push("")
  }

  // Crawl meta
  out.push("#### Crawl")
  out.push(`- method: ${data.crawlMethod}, time: ${data.crawlTime}ms, status: ${data.httpStatus}, redirected: ${yn(data.redirected)}`)
  if (data.crawledAt) out.push(`- crawled at: ${data.crawledAt}`)
  out.push("")
}

type InternalPage = {
  url: string
  wordCount: number
  h1Count: number
  h2Count: number
  h1Tags: string[]
  h2Tags: string[]
}

function appendInternalPages(pages: InternalPage[] | undefined, out: string[]): void {
  if (!pages || pages.length === 0) return
  out.push(`#### Internal Pages Crawled (${pages.length})`)
  pages.forEach(p => {
    out.push(`- ${p.url} — ${p.wordCount} words, h1=${p.h1Count}, h2=${p.h2Count}`)
    if (p.h1Tags?.length) out.push(`  H1: ${p.h1Tags.map(t => `"${clean(t)}"`).join(" | ")}`)
    if (p.h2Tags?.length) out.push(`  H2: ${p.h2Tags.map(t => `"${clean(t)}"`).join(" | ")}`)
  })
  out.push("")
}

function appendYourSite(a: AnalysisData, out: string[]): void {
  out.push(`### Your Site — ${a.yourDomain}${a.yourPosition ? ` (rank #${a.yourPosition})` : " (not ranking)"}`)
  if (a.yourUrl) out.push(`URL: ${a.yourUrl}`)
  out.push("")
  if (a.yourFullCrawlData) {
    appendCrawlData(a.yourFullCrawlData, out)
  } else {
    out.push(
      `- ${a.yourWordCount ?? "?"} words, ${a.yourImageCount ?? "?"} images, ${a.yourLinkCount ?? "?"} links (int=${a.yourInternalLinks ?? "?"}, ext=${a.yourExternalLinks ?? "?"})`
    )
    out.push(`- headings: h1=${a.yourH1Count}, h2=${a.yourH2Count}, h3=${a.yourH3Count}`)
    out.push("")
  }
  if ((a.yourInternalPagesCrawled ?? 0) > 0) {
    out.push("#### Internal Crawl Summary")
    out.push(`- ${a.yourInternalPagesCrawled} pages, ${a.yourTotalInternalWordCount} total words, avg ${a.yourAvgWordsPerPage} words/page`)
    out.push(`- total H1: ${a.yourTotalH1Tags}, total H2: ${a.yourTotalH2Tags}`)
    out.push("")
  }
  appendInternalPages(a.yourInternalPages ?? [], out)
  out.push("---")
  out.push("")
}

function appendCompetitor(c: CompetitorResult, idx: number, out: string[]): void {
  out.push(`### Competitor ${idx + 1} — ${c.domain}${c.position ? ` (rank #${c.position})` : ""}`)
  if (c.url) out.push(`URL: ${c.url}`)
  if (c.title) out.push(`Title: ${clean(c.title)}`)
  if (c.snippet) out.push(`Snippet: ${clean(c.snippet)}`)
  out.push("")
  if (c.fullCrawlData) {
    appendCrawlData(c.fullCrawlData, out)
  } else {
    out.push(
      `- ${c.wordCount ?? "?"} words, ${c.imageCount ?? "?"} images, ${c.linkCount ?? "?"} links (int=${c.internalLinks ?? "?"}, ext=${c.externalLinks ?? "?"})`
    )
    out.push(`- headings: h1=${c.h1Count}, h2=${c.h2Count}, h3=${c.h3Count}`)
    out.push("")
  }
  if ((c.internalPagesCrawled ?? 0) > 0) {
    out.push("#### Internal Crawl Summary")
    out.push(`- ${c.internalPagesCrawled} pages, ${c.totalInternalWordCount} total words, avg ${c.avgWordsPerPage} words/page`)
    out.push(`- total H1: ${c.totalH1Tags}, total H2: ${c.totalH2Tags}`)
    out.push("")
  }
  appendInternalPages(c.internalPages ?? [], out)
  out.push("---")
  out.push("")
}

function appendLinkGraph(graph: LinkGraphDomain[] | null, out: string[]): void {
  if (!graph || graph.length === 0) return
  out.push("## Internal Link Graph")
  out.push("")
  graph.forEach(d => {
    const tag = d.isOwnSite ? " (own site)" : ""
    const rank = d.position ? `, rank #${d.position}` : ""
    out.push(`### ${d.domain}${tag}${rank}`)
    out.push(`- ranking URL: ${d.rankingUrl}`)
    out.push(
      `- ${d.totalCrawledPages} internal pages scanned, ${d.inboundLinks.length} inbound, ${d.outboundLinks.length} outbound`
    )
    out.push("")
    if (d.inboundLinks.length > 0) {
      out.push("Inbound (linking to ranking page):")
      d.inboundLinks.forEach(l => {
        const anchor = l.anchorText || l.text
        out.push(`- ${l.url}${anchor ? ` — "${clean(anchor)}"` : ""}${l.section ? ` [${l.section}]` : ""}`)
      })
      out.push("")
    }
    if (d.outboundLinks.length > 0) {
      out.push("Outbound (from ranking page):")
      d.outboundLinks.forEach(l => {
        const anchor = l.anchorText || l.text
        out.push(`- ${l.url}${anchor ? ` — "${clean(anchor)}"` : ""}${l.section ? ` [${l.section}]` : ""}`)
      })
      out.push("")
    }
    if (d.allPages.length > 0) {
      out.push("All scanned pages:")
      d.allPages.forEach(p => {
        out.push(
          `- ${p.url}: ${p.wordCount} words, ${p.outboundCount} outbound${p.linksToRanking ? ", → ranking" : ""}`
        )
      })
      out.push("")
    }
    out.push("---")
    out.push("")
  })
}

function appendAiPlan(plan: AiPlan | null, out: string[]): void {
  if (!plan) return
  out.push("## AI Plan")
  out.push("")
  out.push(`Summary: ${clean(plan.summary)}`)
  out.push("")
  plan.categories?.forEach(cat => {
    out.push(`### ${cat.icon ? `${cat.icon} ` : ""}${cat.name} (${cat.taskCount} tasks)`)
    cat.tasks?.forEach((t, i) => {
      out.push(`${i + 1}. **${t.priority}** ${clean(t.recommendation)}`)
      if (t.details) out.push(`   ${clean(t.details)}`)
      if (t.impact) out.push(`   Impact: ${clean(t.impact)}`)
    })
    out.push("")
  })
}

export function buildMarkdownExport(args: BuildArgs): string {
  const { analysis, linkGraph, aiPlan, exportedAt } = args
  const out: string[] = []

  out.push(`# Competitor Analysis — "${analysis.keyword}"`)
  out.push("")
  out.push(`Exported: ${exportedAt}`)
  out.push(
    `Status: ${analysis.status} | Created: ${analysis.createdAt}${analysis.completedAt ? ` | Completed: ${analysis.completedAt}` : ""}`
  )
  out.push(`Sites: 1 + ${analysis.competitors.length} competitors`)
  out.push("")

  out.push("## Sites")
  out.push("")
  appendYourSite(analysis, out)
  analysis.competitors.forEach((c, i) => appendCompetitor(c, i, out))

  appendLinkGraph(linkGraph, out)
  appendAiPlan(aiPlan, out)

  return out.join("\n")
}
