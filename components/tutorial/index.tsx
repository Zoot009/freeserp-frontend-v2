"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { useTutorial } from "@/lib/tutorial"
import { TutorialOverlay } from "./overlay"
import { TutorialStepCard } from "./step-card"

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

export function Tutorial() {
  const { isActive } = useTutorial()
  const [mounted, setMounted] = useState(false)
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null)

  useEffect(() => { setMounted(true) }, [])

  if (!mounted || !isActive) return null

  return createPortal(
    <>
      <TutorialOverlay onRectChange={setSpotlightRect} />
      <TutorialStepCard spotlightRect={spotlightRect} />
    </>,
    document.body
  )
}
