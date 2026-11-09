import type { Metadata } from "next"
import { InhouseLogin } from "./inhouse-login"

// The in-house team's sign-in. Deliberately unlinked and unindexed; the password
// (checked on the server, POST /api/auth/inhouse) is what protects it.
export const metadata: Metadata = {
  title: "FreeSERP",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
}

export default function Page() {
  return <InhouseLogin />
}
