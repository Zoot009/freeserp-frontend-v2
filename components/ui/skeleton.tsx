import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      // bg-muted, NOT the upstream bg-accent. In stock shadcn themes --accent is
      // a quiet neutral, but this codebase deliberately repurposes it as the
      // BRAND blue (see the mapping note in globals.css) — so every skeleton
      // rendered as solid electric-blue blocks. --muted is the neutral this
      // theme reserves for placeholder surfaces.
      // Re-apply this if `shadcn add skeleton` ever overwrites the file.
      className={cn('bg-muted animate-pulse rounded-md', className)}
      {...props}
    />
  )
}

export { Skeleton }
