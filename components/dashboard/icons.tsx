import type { SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

export const Icon = {
  spark: ({ size = 14, ...p }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" {...p}>
      <path d="M7 0L8.2 5.8L14 7L8.2 8.2L7 14L5.8 8.2L0 7L5.8 5.8L7 0Z" fill="currentColor" />
    </svg>
  ),
  clock: ({ size = 16, ...p }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...p}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4.5V8L10.25 9.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  hourglass: ({ size = 18, ...p }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M4 2h8M4 14h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4.5 2v2.2c0 1.1 1.2 2.2 3.5 3.8 2.3-1.6 3.5-2.7 3.5-3.8V2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M4.5 14v-2.2c0-1.1 1.2-2.2 3.5-3.8 2.3 1.6 3.5 2.7 3.5 3.8V14" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  search: ({ size = 14, ...p }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...p}>
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  dash: (p: IconProps) => (
    <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  folder: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.5L8 4.5H12.5C13.33 4.5 14 5.17 14 6V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  key: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="5" cy="11" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 9L14 2M11 5L14 8M11 2L14 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  zap: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M9 1L3 9H7L6 15L13 7H9L9 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  ),
  users: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.5 14C1.5 11.5 3.5 9.5 6 9.5C8.5 9.5 10.5 11.5 10.5 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="11.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 9.5C12.5 9.5 14.5 11 14.5 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  chart: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 13L6 8L9 11L14 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 4H14V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  bell: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5C5.79 1.5 4 3.29 4 5.5V8.5L2.5 11.5H13.5L12 8.5V5.5C12 3.29 10.21 1.5 8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.5 13.5C6.5 14.33 7.17 15 8 15C8.83 15 9.5 14.33 9.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  settings: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1.5V3M8 13V14.5M14.5 8H13M3 8H1.5M12.6 3.4L11.5 4.5M4.5 11.5L3.4 12.6M12.6 12.6L11.5 11.5M4.5 4.5L3.4 3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  globe: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.5 7H12.5M7 1.5C8.5 3.5 9.25 5.25 9.25 7C9.25 8.75 8.5 10.5 7 12.5M7 1.5C5.5 3.5 4.75 5.25 4.75 7C4.75 8.75 5.5 10.5 7 12.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  external: ({ size = 14, ...p }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M6.5 3H3.5C2.67 3 2 3.67 2 4.5V12.5C2 13.33 2.67 14 3.5 14H11.5C12.33 14 13 13.33 13 12.5V9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9.5 2.5H13.5V6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 2.5L7 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  check: ({ size = 14, ...p }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  monitor: ({ size = 16, ...p }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...p}>
      <rect x="1.5" y="2.5" width="13" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 14H10.5M8 11V14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  smartphone: ({ size = 16, ...p }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...p}>
      <rect x="4" y="1.5" width="8" height="13" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.75 12.25H9.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  arrowUp: () => (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M5.5 9V2M5.5 2L2.5 5M5.5 2L8.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  arrowDown: () => (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M5.5 2V9M5.5 9L2.5 6M5.5 9L8.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  chevR: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  chevD: () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  plus: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 2V12M2 7H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  trash: ({ size = 14, ...p }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M2.8 4.2h10.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6.2 4.2V3a.8.8 0 0 1 .8-.8h2a.8.8 0 0 1 .8.8v1.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4.2 4.2 4.8 13a.9.9 0 0 0 .9.8h4.6a.9.9 0 0 0 .9-.8l.6-8.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.7 6.8v4.4M9.3 6.8v4.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  info: ({ size = 14, ...p }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...p}>
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7.2V11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r="0.9" fill="currentColor" />
    </svg>
  ),
  filter: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1.5 2.5H12.5L8.5 7V11.5L5.5 12.5V7L1.5 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  ),
  download: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1V9M7 9L4 6M7 9L10 6M2 11V12.5H12V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  refresh: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 7C2 4.24 4.24 2 7 2C8.86 2 10.49 3.02 11.37 4.5M12 7C12 9.76 9.76 12 7 12C5.14 12 3.51 10.98 2.63 9.5M11 1.5V4.5H8M3 12.5V9.5H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  // Shield with a tick — used for the money-back guarantee stat on pricing.
  shield: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5L11.5 3.2V6.8C11.5 9.5 9.6 11.6 7 12.5C4.4 11.6 2.5 9.5 2.5 6.8V3.2L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5.2 6.9L6.5 8.2L8.9 5.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  close: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  menu: ({ size = 16, ...p }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  dots: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="3" cy="7" r="1.2" fill="currentColor" />
      <circle cx="7" cy="7" r="1.2" fill="currentColor" />
      <circle cx="11" cy="7" r="1.2" fill="currentColor" />
    </svg>
  ),
  sun: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 1V2M7 12V13M13 7H12M2 7H1M11.24 2.76L10.6 3.4M3.4 10.6L2.76 11.24M11.24 11.24L10.6 10.6M3.4 3.4L2.76 2.76" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  moon: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M12 8.5C11.27 8.81 10.46 9 9.6 9C6.51 9 4 6.49 4 3.4C4 2.54 4.19 1.73 4.5 1C2.45 1.85 1 3.85 1 6.2C1 9.4 3.6 12 6.8 12C9.15 12 11.15 10.55 12 8.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  ),
  ai: () => (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M5.5 1L6.5 4L9.5 5L6.5 6L5.5 9L4.5 6L1.5 5L4.5 4L5.5 1Z" fill="currentColor" />
    </svg>
  ),
  star: ({ size = 16, ...p }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M8 1.75L9.85 5.6L14 6.2L11 9.2L11.7 13.4L8 11.4L4.3 13.4L5 9.2L2 6.2L6.15 5.6L8 1.75Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
  starFilled: ({ size = 16, ...p }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M8 1.75L9.85 5.6L14 6.2L11 9.2L11.7 13.4L8 11.4L4.3 13.4L5 9.2L2 6.2L6.15 5.6L8 1.75Z" fill="currentColor" />
    </svg>
  ),
}
