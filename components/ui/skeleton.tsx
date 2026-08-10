'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

/** Must match the fs-skeleton duration in the className below. */
const PULSE_MS = 2400

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  const ref = React.useRef<HTMLDivElement>(null)

  // Phase-lock every skeleton to one page-wide clock.
  //
  // A CSS animation starts when its element mounts, and the dashboard loads in
  // two stages: the shell draws placeholders while the session resolves, then
  // the page draws its own while the project data is still in flight. The second
  // batch began its pulse from zero, out of step with the batch that had just
  // been on screen — so a refresh looked like two separate skeletons blinking
  // one after the other rather than one continuous load.
  //
  // A negative delay of (time since page load, mod one cycle) drops a late
  // arrival into exactly the phase it would have been in had it mounted at page
  // load, so every placeholder on screen breathes together no matter when it
  // appeared. Set from an effect rather than an inline style so the server and
  // client markup stay identical and hydration doesn't warn.
  React.useLayoutEffect(() => {
    ref.current?.style.setProperty(
      'animation-delay',
      `-${performance.now() % PULSE_MS}ms`,
    )
  }, [])

  return (
    <div
      ref={ref}
      data-slot="skeleton"
      // bg-muted, NOT the upstream bg-accent. In stock shadcn themes --accent is
      // a quiet neutral, but this codebase deliberately repurposes it as the
      // BRAND blue (see the mapping note in globals.css) — so every skeleton
      // rendered as solid electric-blue blocks. --muted is the neutral this
      // theme reserves for placeholder surfaces.
      // Re-apply this if `shadcn add skeleton` ever overwrites the file.
      // Slower than Tailwind's stock 2s pulse, and it never fades to fully
      // transparent (see the fs-skeleton keyframes in dashboard.css). A fast,
      // deep blink reads as the page malfunctioning; a slow, shallow breath
      // reads as work in progress.
      className={cn('bg-muted animate-[fs-skeleton_2.4s_ease-in-out_infinite] rounded-md', className)}
      {...props}
    />
  )
}

export { Skeleton }
