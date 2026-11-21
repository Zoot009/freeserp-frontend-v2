import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { CHATBOT_CRM_URL, DEMO_TOKEN } from "@/lib/chatbot-builder"

/**
 * A client chatbot's demo at FreeSERP's own address (the Chatbot Builder's share link). The chat and the client
 * report are the chatbot CRM's demo page, shown full-screen in a frame: the CRM allows that from FreeSERP only,
 * checks the token itself, and serves the chat from its own origin, so nothing here can reach anything else.
 */

interface Props {
  params: Promise<{ token: string }>
}

export const metadata: Metadata = {
  title: "AI chatbot demo",
  robots: { index: false, follow: false },
}

export default async function SharedChatbotPage({ params }: Props) {
  const { token } = await params
  if (!DEMO_TOKEN.test(token)) notFound()
  return (
    <iframe
      src={`${CHATBOT_CRM_URL}/demo/${token}`}
      title="AI chatbot demo"
      allow="clipboard-write"
      className="fixed inset-0 z-[100] h-full w-full border-0 bg-white"
    />
  )
}
