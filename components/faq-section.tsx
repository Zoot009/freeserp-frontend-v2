"use client"

import { useRef, useEffect } from "react"
import { useTranslations } from "next-intl"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

gsap.registerPlugin(ScrollTrigger)

type Faq = { question: string; answer: string }

export function FaqSection() {
  const t = useTranslations("faq")
  const faqs = t.raw("items") as Faq[]
  const sectionRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const accordionRef = useRef<HTMLDivElement>(null)

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

      if (accordionRef.current) {
        gsap.from(accordionRef.current, {
          y: 40,
          opacity: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: accordionRef.current,
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
      id="faq"
      className="relative py-32 px-6 md:px-12 border-t border-border/30"
    >
      <div className="max-w-4xl mx-auto">
        {/* Section header */}
        <div ref={headerRef} className="mb-16 text-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{t("eyebrow")}</span>
          <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">{t("heading")}</h2>
          <p className="mt-4 mx-auto max-w-2xl font-mono text-sm text-muted-foreground leading-relaxed">
            {t("subtitle")}
          </p>
        </div>

        {/* FAQ Accordion */}
        <div ref={accordionRef} className="w-full">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem 
                key={index} 
                value={`item-${index}`}
                className="border-b border-border/20 last:border-b-0"
              >
                <AccordionTrigger className="font-mono text-lg md:text-xl text-foreground hover:text-accent transition-colors text-left py-8 hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="font-mono text-base md:text-lg text-muted-foreground/80 leading-relaxed pb-8 pr-12">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}
