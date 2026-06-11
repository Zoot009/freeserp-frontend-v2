import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Reduce a stored site value to just its registrable domain for display —
 * strips any protocol, path, query, and a leading "www.". Accepts bare domains
 * ("zootwebagency.com"), full URLs, and domains with a path
 * ("www.rewarddrave.com/en-ae/store/mothercare" → "rewarddrave.com"). Returns
 * the input trimmed if it can't be parsed.
 */
export function displayDomain(value: string | null | undefined): string {
  if (!value) return ''
  const raw = value.trim()
  let host: string
  try {
    host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname
  } catch {
    host = raw.replace(/^[a-z]+:\/\//i, '').split('/')[0]
  }
  return host.replace(/^www\./, '')
}
