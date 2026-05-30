"use client"

import { useEffect, useState, useCallback, CSSProperties } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useTutorial, TUTORIAL_STEPS } from "@/lib/tutorial"

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

interface TutorialStepCardProps {
  spotlightRect: SpotlightRect | null
}

const CARD_WIDTH = 380
const CARD_GAP = 16

function computePosition(rect: SpotlightRect | null, hasTarget: boolean, preferAbove = false): CSSProperties {
  if (!rect) {
    // Target expected but not in DOM yet — park bottom-right so it doesn't block UI
    if (hasTarget) {
      return { position: "fixed", bottom: 24, right: 24 }
    }
    return { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
  }

  const vw = typeof window !== "undefined" ? window.innerWidth : 1280
  const vh = typeof window !== "undefined" ? window.innerHeight : 800
  const CARD_HEIGHT_ESTIMATE = 260

  const clampLeft = (l: number) => Math.max(16, Math.min(l, vw - CARD_WIDTH - 16))
  const centerLeft = clampLeft(rect.left + rect.width / 2 - CARD_WIDTH / 2)

  // Target is in a fixed bottom bar — float card just above the bar on the right
  // so it doesn't cover interactive content above it
  if (rect.top + rect.height > vh * 0.85) {
    const distanceFromBottom = vh - rect.top + CARD_GAP
    return { position: "fixed", bottom: distanceFromBottom, right: 16 }
  }

  // When preferAbove, try above first
  if (preferAbove) {
    const aboveTop = rect.top - CARD_HEIGHT_ESTIMATE - CARD_GAP
    if (aboveTop >= 16) {
      return { position: "fixed", top: aboveTop, left: centerLeft }
    }
  }

  // Try below
  const belowTop = rect.top + rect.height + CARD_GAP
  if (belowTop + CARD_HEIGHT_ESTIMATE < vh) {
    return { position: "fixed", top: belowTop, left: centerLeft }
  }

  // Otherwise above
  const aboveTop = rect.top - CARD_HEIGHT_ESTIMATE - CARD_GAP
  return { position: "fixed", top: Math.max(16, aboveTop), left: centerLeft }
}

// Count only the non-welcome, non-done steps for the progress bar
const ACTION_STEPS = TUTORIAL_STEPS.filter(s => s.id !== "welcome" && !s.isDone)

export function TutorialStepCard({ spotlightRect }: TutorialStepCardProps) {
  const { isActive, currentStep, step, skipTutorial, nextStep, prevStep } = useTutorial()
  const [cardStyle, setCardStyle] = useState<CSSProperties>({})
  const [lastStep, setLastStep] = useState(currentStep)
  const [direction, setDirection] = useState(1)

  useEffect(() => {
    setDirection(currentStep > lastStep ? 1 : -1)
    setLastStep(currentStep)
  }, [currentStep]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasTarget = !!step.target
  const preferAbove = step.scrollToTarget === true

  const updatePosition = useCallback(() => {
    setCardStyle(computePosition(spotlightRect, hasTarget, preferAbove))
  }, [spotlightRect, hasTarget, preferAbove])

  useEffect(() => {
    updatePosition()
    window.addEventListener("resize", updatePosition)
    return () => window.removeEventListener("resize", updatePosition)
  }, [updatePosition])

  if (!isActive) return null

  const isWelcome = step.id === "welcome"
  const isDone = !!step.isDone

  // Which index among action steps are we on?
  const actionIdx = ACTION_STEPS.findIndex(s => s.id === step.id)

  const variants = {
    enter: { opacity: 0, y: direction * 10 },
    center: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: direction * -10 },
  }

  return (
    <div
      className="z-[10000]"
      style={{ ...cardStyle, width: CARD_WIDTH, pointerEvents: "auto" }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step.id}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="bg-background border border-border/60 p-7 relative overflow-hidden"
          style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Accent top bar */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent" />

          {/* Progress dots — only for action steps */}
          {!isWelcome && !isDone && (
            <div className="flex items-center gap-3 mb-5">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
                {String(actionIdx + 1).padStart(2, "0")} / {String(ACTION_STEPS.length).padStart(2, "0")}
              </span>
              <div className="flex gap-1 ml-auto">
                {ACTION_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className="h-[2px] transition-all duration-300"
                    style={{
                      width: i === actionIdx ? 18 : 8,
                      background: i <= actionIdx ? "var(--accent)" : "var(--border)",
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Title */}
          <h2
            className="leading-none tracking-tight mb-3"
            style={{
              fontFamily: "var(--font-bebas)",
              fontSize: isWelcome || isDone ? 42 : 28,
            }}
          >
            {step.title}
          </h2>

          {/* Description */}
          <p className="font-sans text-sm text-muted-foreground leading-relaxed mb-6">
            {step.description}
          </p>

          {/* Buttons */}
          {isWelcome ? (
            <button
              onClick={nextStep}
              className="w-full bg-accent text-accent-foreground px-5 py-3 font-mono text-[11px] uppercase tracking-widest hover:bg-accent/80 transition-all"
            >
              Start Tour →
            </button>
          ) : isDone ? (
            <button
              onClick={skipTutorial}
              className="w-full bg-accent text-accent-foreground px-5 py-3 font-mono text-[11px] uppercase tracking-widest hover:bg-accent/80 transition-all"
            >
              Let's Go →
            </button>
          ) : step.isAction ? (
            // Action step — user must click the highlighted element
            <div className="space-y-3">
              <div className="flex items-center gap-2 border border-accent/20 bg-accent/5 px-3 py-2.5">
                <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse shrink-0" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                  Perform the action above to continue
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={skipTutorial}
                  className="border border-border/40 px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-border transition-all"
                >
                  End Tour
                </button>
                <button
                  onClick={nextStep}
                  className="flex-1 border border-border/60 px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-border transition-all"
                >
                  Skip Step →
                </button>
              </div>
            </div>
          ) : (
            // Info step — show Next/Back buttons
            <div className="flex items-center gap-3">
              <button
                onClick={skipTutorial}
                className="border border-border/40 px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-border transition-all"
              >
                Skip
              </button>
              {currentStep > 0 && (
                <button
                  onClick={prevStep}
                  className="border border-border/40 px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-border transition-all"
                >
                  ← Back
                </button>
              )}
              <button
                onClick={nextStep}
                className="flex-1 bg-accent text-accent-foreground px-5 py-3 font-mono text-[11px] uppercase tracking-widest hover:bg-accent/80 transition-all"
              >
                Next →
              </button>
            </div>
          )}

          {/* Keyboard hint for non-action, non-welcome, non-done steps */}
          {!isWelcome && !isDone && !step.isAction && (
            <p className="font-mono text-[9px] text-muted-foreground/40 mt-3 uppercase tracking-widest">
              ← → arrow keys · esc to skip
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
