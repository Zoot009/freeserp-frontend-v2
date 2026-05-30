"use client"

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react"

export interface TutorialStep {
  id: string
  title: string
  description: string
  target: string | null
  isAction: boolean   // true = user must perform the action; Next → is hidden
  isDone?: boolean
  hideOverlay?: boolean  // show full page, no dark backdrop
  scrollToTarget?: boolean  // scroll target into view before spotlighting
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "WELCOME TO FREESERP",
    description: "Track keyword rankings, analyze competitors, and climb Google — all for free. Let's walk through the full workflow together.",
    target: null,
    isAction: false,
  },
  {
    id: "create-project",
    title: "CREATE A PROJECT",
    description: 'Click the "+ New Project" button to add your first website. Enter a project name, your domain, and how often you want to check rankings.',
    target: "new-project-btn",
    isAction: true,
  },
  {
    id: "add-keywords",
    title: "ADD KEYWORDS",
    description: 'Click "+ Keywords" to add the search terms you want to rank for — one per line. Choose your target country, then save.',
    target: "add-keywords-btn",
    isAction: true,
  },
  {
    id: "run-check",
    title: "RUN A CHECK",
    description: 'Click "Run Check" to query Google instantly and see where your keywords rank. FreeSERP also runs checks automatically on your chosen schedule.',
    target: "run-check-btn",
    isAction: true,
  },
  {
    id: "improve-ranking",
    title: "IMPROVE YOUR RANKING",
    description: 'Click "Improve Ranking?" on any keyword to see who is outranking you and get a full SEO breakdown.',
    target: "improve-ranking-btn",
    isAction: true,
  },
  {
    id: "select-competitors",
    title: "SELECT COMPETITORS",
    description: "Choose exactly 3 competitors from the SERP results to compare against. Click their cards to select them, then click Next when ready.",
    target: "competitor-list",
    isAction: false,
    hideOverlay: true,
  },
  {
    id: "analyze-competitors",
    title: "ANALYZE COMPETITORS",
    description: 'Click "Analyze Competitors" to run the full SEO comparison. You\'ll get a detailed breakdown with AI-powered recommendations to climb higher.',
    target: "analyze-btn",
    isAction: true,
    scrollToTarget: true,
  },
  {
    id: "done",
    title: "YOU'RE ALL SET",
    description: "You've seen the full FreeSERP workflow. Create your first project whenever you're ready — rankings are waiting to be tracked.",
    target: null,
    isAction: false,
    isDone: true,
  },
]

const STORAGE_DONE_KEY = "freeserp_tutorial_done"
const STORAGE_STEP_KEY = "freeserp_tutorial_step"

interface TutorialContextValue {
  isActive: boolean
  currentStep: number
  totalSteps: number
  step: TutorialStep
  startTutorial: () => void
  skipTutorial: () => void
  nextStep: () => void
  prevStep: () => void
  /** Advance only if the tutorial is currently on `expectedStep`. Uses a
   *  functional state update so it's safe to call from stale closures. */
  advanceFromStep: (expectedStep: number) => void
}

const TutorialContext = createContext<TutorialContextValue | null>(null)

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  // Restore an in-progress tutorial across client-side navigations
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_DONE_KEY)) return
      const saved = localStorage.getItem(STORAGE_STEP_KEY)
      if (saved !== null) {
        const step = parseInt(saved, 10)
        if (!isNaN(step) && step > 0 && step < TUTORIAL_STEPS.length) {
          setCurrentStep(step)
          setIsActive(true)
        }
      }
    } catch {}
  }, [])

  // Persist current step so it survives navigation
  useEffect(() => {
    if (!isActive) return
    try { localStorage.setItem(STORAGE_STEP_KEY, String(currentStep)) } catch {}
  }, [currentStep, isActive])

  const complete = useCallback(() => {
    setIsActive(false)
    try {
      localStorage.setItem(STORAGE_DONE_KEY, "1")
      localStorage.removeItem(STORAGE_STEP_KEY)
    } catch {}
  }, [])

  const startTutorial = useCallback(() => {
    setCurrentStep(0)
    setIsActive(true)
    try { localStorage.removeItem(STORAGE_STEP_KEY) } catch {}
  }, [])

  const skipTutorial = useCallback(() => {
    setIsActive(false)
    try {
      localStorage.setItem(STORAGE_DONE_KEY, "1")
      localStorage.removeItem(STORAGE_STEP_KEY)
    } catch {}
  }, [])

  const nextStep = useCallback(() => {
    setCurrentStep(prev => {
      const next = prev + 1
      if (next >= TUTORIAL_STEPS.length) {
        // schedule the side-effect outside the updater
        setTimeout(() => complete(), 0)
        return prev
      }
      return next
    })
  }, [complete])

  const prevStep = useCallback(() => {
    setCurrentStep(prev => Math.max(0, prev - 1))
  }, [])

  // advanceFromStep uses a functional update so the check is always against
  // the *current* state value — safe even from stale-closure callbacks.
  const advanceFromStep = useCallback((expectedStep: number) => {
    setCurrentStep(prev => {
      if (prev !== expectedStep) return prev   // wrong step — ignore
      const next = prev + 1
      if (next >= TUTORIAL_STEPS.length) {
        setTimeout(() => complete(), 0)
        return prev
      }
      return next
    })
  }, [complete])

  return (
    <TutorialContext.Provider value={{
      isActive,
      currentStep,
      totalSteps: TUTORIAL_STEPS.length,
      step: TUTORIAL_STEPS[currentStep],
      startTutorial,
      skipTutorial,
      nextStep,
      prevStep,
      advanceFromStep,
    }}>
      {children}
    </TutorialContext.Provider>
  )
}

export function useTutorial() {
  const ctx = useContext(TutorialContext)
  if (!ctx) throw new Error("useTutorial must be used inside TutorialProvider")
  return ctx
}

export function isTutorialDone(): boolean {
  try { return !!localStorage.getItem(STORAGE_DONE_KEY) } catch { return false }
}
