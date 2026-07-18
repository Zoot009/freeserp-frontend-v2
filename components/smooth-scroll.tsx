"use client"

import type React from "react"

import { useEffect, useRef } from "react"
import Lenis from "lenis"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
    // Inner scrollable UI (dropdown menus, modal bodies, chat panel, the
    // location-picker popover…) must keep native wheel scrolling — Lenis
    // otherwise swallows the wheel events and those lists can't scroll at all.
    // `prevent` is called for every node in the event path; returning true
    // hands the event back to the browser. data-lenis-prevent also works and
    // is used by one-off components.
    const NATIVE_SCROLL_CLASSES = ["dd-menu", "modal-b", "aw-body", "chatpanel-msgs", "fs-location-popover"]
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      smoothWheel: true,
      prevent: (node) =>
        NATIVE_SCROLL_CLASSES.some((cls) => node.classList?.contains(cls)) ||
        node.hasAttribute?.("data-lenis-prevent"),
    })

    lenisRef.current = lenis

    // Connect Lenis to GSAP ScrollTrigger
    lenis.on("scroll", ScrollTrigger.update)

    gsap.ticker.add((time) => {
      lenis.raf(time * 1000)
    })

    gsap.ticker.lagSmoothing(0)

    return () => {
      lenis.destroy()
      gsap.ticker.remove(lenis.raf)
    }
  }, [])

  return <>{children}</>
}
