import { Metadata } from "next"

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Keyword Analysis | FreeSERP Dashboard",
    description:
      "Comprehensive SEO keyword analysis with ranking data, competitor insights, and optimization opportunities.",
    robots: {
      index: false,
      follow: false,
    },
  }
}

export default function KeywordDetailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
