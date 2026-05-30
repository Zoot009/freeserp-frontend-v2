"use client"

import { useRef, useEffect } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export function SerpCheckerSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sectionRef.current) return

    const ctx = gsap.context(() => {
      if (headerRef.current) {
        gsap.from(headerRef.current, {
          x: -60,
          opacity: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: headerRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        })
      }

      if (contentRef.current) {
        gsap.from(contentRef.current, {
          y: 40,
          opacity: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: contentRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        })
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="what-is-serp-checker"
      className="relative py-32 pl-6 md:pl-28 pr-6 md:pr-12 border-t border-border/30"
    >
      {/* Section header */}
      <div ref={headerRef} className="mb-16">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">What is FreeSERP?</span>
        <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">WHAT IS A SERP CHECKER?</h2>
      </div>

      {/* Content */}
      <div ref={contentRef} className="max-w-5xl">
        <div className="space-y-16">

          {/* Main explanation */}
          <div className="space-y-5">
            <p className="font-mono text-base md:text-lg text-foreground/90 leading-relaxed">
              A SERP checker is a tool that shows where your website appears in Google search results for a specific keyword.
              But if you think that&apos;s all it does — you&apos;re missing 80% of its value.
            </p>
            <p className="font-mono text-sm text-muted-foreground leading-relaxed">
              Because modern SEO is not just about rankings. It&apos;s about understanding search behavior, competition, and 
              content quality. Google rankings are never stable — they change constantly, sometimes daily, sometimes hourly.
              If you&apos;re not tracking those changes, every SEO decision you make is based on assumptions — not data.
            </p>
          </div>

          {/* What FreeSERP does */}
          <div>
            <h3 className="font-[var(--font-bebas)] text-2xl md:text-3xl mb-6 text-foreground">WITH FREESERP, YOU CAN:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: "Keyword Rankings", desc: "Check keyword rankings instantly for any domain — no account required." },
                { label: "Real-Time Changes", desc: "Track real-time position changes as they happen, not cached data." },
                { label: "Competitor Analysis", desc: "Analyze who is ranking above you and understand why they outrank you." },
                { label: "Deep Insights", desc: "Understand why pages rank — not just where. That's the real advantage." },
              ].map(({ label, desc }) => (
                <div key={label} className="border border-border/40 p-5 bg-card/30">
                  <div className="font-mono text-xs uppercase tracking-widest text-accent mb-2">{label}</div>
                  <p className="font-mono text-sm text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* SERP elements */}
          <div>
            <h3 className="font-[var(--font-bebas)] text-2xl md:text-3xl mb-4 text-foreground">WHAT A SERP ACTUALLY INCLUDES</h3>
            <p className="font-mono text-sm text-muted-foreground mb-6">
              When you search anything on Google, you don&apos;t just see 10 blue links. Modern SERPs include a combination 
              of elements that all compete for user attention:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { num: "01", label: "Organic Results", desc: "Standard rankings based on relevance, content quality, and SEO signals." },
                { num: "02", label: "Paid Ads", desc: "Appear at top and bottom — they drive traffic but don't build long-term authority." },
                { num: "03", label: "SERP Features", desc: "Featured snippets, People Also Ask boxes, local map packs, image and video results." },
              ].map(({ num, label, desc }) => (
                <div key={num} className="border border-border/40 p-5 bg-card/20">
                  <div className="font-[var(--font-bebas)] text-4xl text-accent/30 mb-2">{num}</div>
                  <div className="font-mono text-xs uppercase tracking-widest text-foreground mb-2">{label}</div>
                  <p className="font-mono text-xs text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
            <p className="font-mono text-xs text-muted-foreground mt-4 border-l-2 border-accent pl-4">
              Even if you rank #3, you might still appear below multiple SERP features — making your actual visibility 
              lower than your ranking number suggests. That&apos;s why SERP analysis is critical.
            </p>
          </div>

          {/* Why rankings change */}
          <div>
            <h3 className="font-[var(--font-bebas)] text-2xl md:text-3xl mb-4 text-foreground">WHY GOOGLE RANKINGS CHANGE EVERY DAY</h3>
            <p className="font-mono text-sm text-muted-foreground mb-6">
              One of the biggest myths in SEO: &quot;Once you rank, you stay there.&quot; That&apos;s not true.
              Google rankings are dynamic and influenced by multiple factors:
            </p>
            <div className="space-y-3">
              {[
                { title: "Competitor Activity", desc: "If a competitor updates their content or builds backlinks, they can outrank you quickly." },
                { title: "Algorithm Updates", desc: "Google rolls out hundreds of updates annually — some small, some entirely reshape rankings." },
                { title: "Search Intent Shifts", desc: "User behavior evolves. When Google detects a change in what users want, rankings shift accordingly." },
                { title: "Content Freshness", desc: "Outdated content slowly loses ranking. New, updated, and relevant content gains visibility over time." },
              ].map(({ title, desc }) => (
                <div key={title} className="flex gap-4 border border-border/30 p-4 bg-card/10">
                  <div className="w-1 bg-accent flex-shrink-0" />
                  <div>
                    <div className="font-mono text-xs uppercase tracking-widest text-foreground mb-1">{title}</div>
                    <p className="font-mono text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Who should use it */}
          <div>
            <h3 className="font-[var(--font-bebas)] text-2xl md:text-3xl mb-6 text-foreground">WHO SHOULD USE THIS TOOL?</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                "SEO Professionals",
                "Digital Marketing Agencies",
                "Bloggers & Content Creators",
                "Freelancers",
                "Local Businesses",
                "E-commerce Owners",
              ].map((who) => (
                <div key={who} className="border border-border/40 px-4 py-3 font-mono text-xs text-muted-foreground">
                  → {who}
                </div>
              ))}
            </div>
            <p className="font-mono text-xs text-muted-foreground mt-6">
              If your goal is to check SERP position free and improve rankings — this tool was built for you.
            </p>
          </div>

        </div>
      </div>
    </section>
  )
}
