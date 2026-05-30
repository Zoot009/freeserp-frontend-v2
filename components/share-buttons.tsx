"use client"

import { Twitter, Linkedin, Link as LinkIcon, Check } from "lucide-react"
import { useState } from "react"

interface ShareButtonsProps {
  url: string
  title: string
}

export function ShareButtons({ url, title }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const shareLinks = {
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  }

  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Share:
      </span>
      
      <a
        href={shareLinks.twitter}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center w-9 h-9 border border-border hover:bg-accent hover:border-accent hover:text-accent-foreground transition-colors"
        aria-label="Share on Twitter"
      >
        <Twitter className="w-4 h-4" aria-hidden="true" />
      </a>
      
      <a
        href={shareLinks.linkedin}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center w-9 h-9 border border-border hover:bg-accent hover:border-accent hover:text-accent-foreground transition-colors"
        aria-label="Share on LinkedIn"
      >
        <Linkedin className="w-4 h-4" aria-hidden="true" />
      </a>
      
      <button
        onClick={handleCopyLink}
        className="flex items-center justify-center w-9 h-9 border border-border hover:bg-accent hover:border-accent hover:text-accent-foreground transition-colors"
        aria-label="Copy link"
      >
        {copied ? (
          <Check className="w-4 h-4" aria-hidden="true" />
        ) : (
          <LinkIcon className="w-4 h-4" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}
