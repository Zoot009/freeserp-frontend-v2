"use client"

import { useEffect, useRef } from "react"
import gsap from "gsap"
import { useTutorial, TUTORIAL_STEPS } from "@/lib/tutorial"

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

const PAD = 8

function getTargetRect(target: string | null): SpotlightRect | null {
  if (!target) return null
  const el = document.querySelector(`[data-tutorial="${target}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  }
}

interface TutorialOverlayProps {
  onRectChange: (rect: SpotlightRect | null) => void
}

export function TutorialOverlay({ onRectChange }: TutorialOverlayProps) {
  const { isActive, currentStep, skipTutorial, nextStep, prevStep } = useTutorial()
  const spotlightRef = useRef<HTMLDivElement>(null)
  const step = TUTORIAL_STEPS[currentStep]
  const currentTarget = step?.target ?? null
  const isActionStep = step?.isAction === true
  const hideOverlay = step?.hideOverlay === true
  const scrollToTarget = step?.scrollToTarget === true

  // Animate spotlight to the target element.
  // Retries every 300 ms (up to 20 times = 6 s) so elements that are still
  // loading (e.g. ProjectView fetching data) are caught once they appear.
  useEffect(() => {
    if (!isActive) return

    let cancelled = false
    let attempts = 0
    const MAX_ATTEMPTS = 20

    const applySpotlight = () => {
      if (cancelled) return

      const rect = getTargetRect(currentTarget)
      onRectChange(rect)

      if (!spotlightRef.current) return

      if (!rect) {
        gsap.to(spotlightRef.current, { opacity: 0, duration: 0.2, ease: "power2.out" })
        if (currentTarget && attempts < MAX_ATTEMPTS) {
          attempts++
          setTimeout(applySpotlight, 300)
        }
        return
      }

      gsap.to(spotlightRef.current, {
        opacity: 1,
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        duration: 0.45,
        ease: "power3.inOut",
      })
    }

    const apply = () => {
      if (cancelled) return

      if (scrollToTarget && currentTarget) {
        const el = document.querySelector(`[data-tutorial="${currentTarget}"]`)
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
          // Re-measure after smooth scroll settles
          setTimeout(applySpotlight, 450)
          return
        }
      }

      applySpotlight()
    }

    // Small initial delay lets Next.js finish painting after client-side nav
    const timer = setTimeout(apply, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [currentStep, isActive, currentTarget, scrollToTarget, onRectChange])

  // Keyboard navigation.
  // Arrow keys / Enter disabled on action steps so form submissions don't
  // accidentally advance the tutorial.
  useEffect(() => {
    if (!isActive) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        skipTutorial()
      } else if (!isActionStep && e.key === "ArrowRight") {
        nextStep()
      } else if (!isActionStep && e.key === "ArrowLeft") {
        prevStep()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isActive, isActionStep, skipTutorial, nextStep, prevStep])

  if (!isActive) return null

  const hasTarget = !!currentTarget

  // hideOverlay steps: no dark backdrop, just a subtle accent outline on the target
  if (hideOverlay) {
    return hasTarget ? (
      <div
        ref={spotlightRef}
        className="fixed z-[9999] pointer-events-none"
        style={{
          opacity: 0,
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          outline: "2px solid var(--accent)",
          outlineOffset: "0px",
        }}
        aria-hidden="true"
      />
    ) : null
  }

  return (
    <>
      {/*
       * Dark backdrop — purely visual, pointer-events: none so every click
       * passes through to the real UI beneath (buttons, modals, etc.).
       */}
      <div
        className="fixed inset-0 z-[9998] pointer-events-none"
        style={{ background: "rgba(0,0,0,0.78)" }}
        aria-hidden="true"
      />

      {/*
       * Spotlight hole — box-shadow darkens everything OUTSIDE the rect.
       * pointer-events: none so the spotlit button stays fully clickable.
       */}
      {hasTarget && (
        <div
          ref={spotlightRef}
          className="fixed z-[9999] pointer-events-none"
          style={{
            opacity: 0,
            top: 0,
            left: 0,
            width: 0,
            height: 0,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.78)",
            outline: "2px solid var(--accent)",
            outlineOffset: "0px",
          }}
          aria-hidden="true"
        />
      )}
    </>
  )
}
