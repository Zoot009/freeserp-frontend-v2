/**
 * Whether the owner has already said no to automatic keyword suggestions.
 *
 * The choice is made in two places — the create-project modal ("I'll add my
 * own") and the dismiss on the dashboard's own prompt — and read in two more:
 * that prompt, and the keywords page, which otherwise POSTs a run the moment it
 * mounts for a new project.
 *
 * Without somewhere shared to record it, declining at create time was forgotten
 * immediately: the dashboard asked again on the very next screen, and the
 * keywords page started the run anyway. Answering a question and being asked it
 * again is worse than never being asked.
 *
 * localStorage rather than a column: it is a UI preference about whether to show
 * a prompt, it is per-person rather than per-account, and a schema migration for
 * "do not ask me again" is a heavier thing than the question deserves. The cost
 * is that it does not follow you to another browser, where you get asked once
 * more — which is the same as today and no worse.
 */
const key = (projectId: string) => `fs.kwai.${projectId}`

/** "0" means dismissed — kept as-is so choices made before this file still count. */
export function hasDeclinedKeywordAi(projectId: string): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(key(projectId)) === "0"
  } catch {
    return false
  }
}

export function declineKeywordAi(projectId: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key(projectId), "0")
  } catch {
    // Private mode / storage disabled. The prompt reappears, which is the old
    // behaviour and not worth failing anything over.
  }
}
