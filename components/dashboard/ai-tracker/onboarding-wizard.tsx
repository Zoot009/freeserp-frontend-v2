"use client"

/**
 * Setting up a brand, as four steps instead of one modal.
 *
 * WHY THIS EXISTS
 * The feature's front door was a modal with five fields, two of which were free
 * text lists, and a "Create brand" button that dropped you on an empty brand
 * page. Everything that makes the tracker worth anything -- which questions to
 * ask, which assistants to ask, how often, what it costs -- happened AFTER that
 * button, in a second modal you had to find. So the first screen asked for the
 * hardest input (write your buyers' questions from scratch) at the moment the
 * user knew least about what the tool does with them.
 *
 * The wizard reorders that: identity, then market, then the questions the market
 * implies, then the spend. Each step asks for one kind of thing and says why it
 * is asked, and the steps that follow are built out of the answers to the ones
 * before -- step 3's suggestions are literally made from step 2's competitors,
 * so filling in a competitor visibly buys you something two screens later.
 *
 * WHAT IS REAL HERE
 * Every field maps to a column the API already accepts. There is no crawl and no
 * inference: we do not fetch the domain, read its schema.org or guess a
 * category, so nothing on these screens is presented as "we found this". The one
 * field that is not persisted is `category`, which exists only to phrase the
 * suggestions on step 3, and says so where it is asked.
 *
 * WHEN THE BRAND IS ACTUALLY CREATED
 * At the end of step 2, not step 4. The API refuses a brand whose name is made
 * only of ordinary words, and the fix for that refusal is the alias field on
 * step 2 -- surfacing that error two steps later, next to a credit estimate,
 * would be showing it as far from its cause as this flow allows. The cost is
 * that abandoning after step 2 leaves a brand with no prompts; the footer says
 * the brand is saved once it exists, and the brand page can finish the job.
 *
 * i18n: inline English, matching the rest of this dashboard section.
 */

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { api, ApiError } from "@/lib/api"
import { Icon } from "@/components/dashboard/icons"
import { Dropdown } from "@/components/dashboard/dropdown"
import { PlatformMark } from "@/components/dashboard/platform-marks"
import { CREDIT_ACTION_KEYS, formatCredits, useCreditQuote } from "@/lib/credits"
import { FREQUENCY_OPTIONS, PLATFORM_LABEL, runsPerMonth, type Platform } from "@/lib/ai-tracker"
import { ENGINE_NOTE, ENGINE_ORDER, ENGINES } from "@/lib/ai-engines"

type CreatedProject = { id: string; name: string; brandName: string }

/** The brand fields, as both endpoints want them. */
type BrandBody = {
  name: string
  brandName: string
  brandDomain: string | null
  brandAliases: string[]
  competitorNames: string[]
}

/**
 * Whether a second pass through step 2 actually changed anything.
 *
 * Field by field rather than JSON.stringify: the two arrays are rebuilt on every
 * keystroke, so a structural compare would call an untouched form dirty and PATCH
 * on every Continue -- and each of those PATCHes enqueues a rescore of the whole
 * history when a scoring field is in the body.
 */
function dirty(next: BrandBody, prev: BrandBody | null): boolean {
  if (!prev) return true
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])
  return (
    next.name !== prev.name ||
    next.brandName !== prev.brandName ||
    next.brandDomain !== prev.brandDomain ||
    !same(next.brandAliases, prev.brandAliases) ||
    !same(next.competitorNames, prev.competitorNames)
  )
}

const STEPS = ["Brand", "Market", "Prompts", "Assistants"] as const

/**
 * Sample counts, as the same dropdown the cadence field uses.
 *
 * It was a native <select>, which on Windows opens the OS list -- a blue
 * highlight and a system chevron dropped into the middle of a themed form, and
 * the only control on the page that ignored dark mode.
 */
const SAMPLE_OPTIONS = [
  { value: "1", label: "1 sample" },
  { value: "3", label: "3 samples (recommended)" },
  { value: "5", label: "5 samples" },
]

type GroupName = "Category" | "Head to head" | "Alternatives" | "Brand"
type Suggestion = { id: string; group: GroupName; text: string }

/**
 * Four groups because they are four different moments in a buying decision, and
 * a brand can be winning one while invisible in another -- which is the finding
 * the tracker exists to produce. A flat list of fifteen hides exactly that.
 */
const GROUP_NOTE: Record<GroupName, string> = {
  Category:
    "Asked before anyone has a shortlist. Being named here is how you get onto one, and it is the hardest group to win.",
  "Head to head":
    "Asked once you are already on the shortlist. A wrong answer here costs a deal that was yours to lose.",
  Alternatives:
    "Your competitors' customers, looking for a reason to leave. You are not in the question, so you have to be in the answer.",
  Brand:
    "People who already know your name, checking. The cheapest group to track, and the one where a bad answer is most fixable.",
}

const GROUP_ORDER: GroupName[] = ["Category", "Head to head", "Alternatives", "Brand"]

/**
 * Suggested questions, built from what the user typed rather than fetched.
 *
 * Phrased lowercase and without flourishes because that is how questions are
 * actually typed into an assistant, and the phrasing changes the answer.
 */
function suggestPrompts(brandName: string, category: string, competitors: string[]): Suggestion[] {
  const brand = brandName.trim() || "your brand"
  // Lowercased for the mid-sentence uses: a category typed "Rank Tracking" reads
  // wrong inside "the best Rank Tracking for a small team".
  const cat = (category.trim() || "SEO tools").toLowerCase()
  const rivals = competitors.map((c) => c.trim()).filter(Boolean).slice(0, 4)
  // Not hardcoded: these prompts sit in a database for months, and a stale year
  // is the detail that makes a suggestion look generated.
  const year = new Date().getFullYear()

  const out: [GroupName, string][] = [
    ["Category", `best ${cat} in ${year}`],
    ["Category", `what is the best ${cat} for a small team?`],
    ["Category", `top ${cat} compared`],
    ["Category", `affordable ${cat}`],
  ]

  for (const r of rivals) out.push(["Head to head", `${brand} vs ${r}`])
  for (const r of rivals.slice(0, 2)) out.push(["Alternatives", `${r} alternatives`])
  if (rivals[0]) out.push(["Alternatives", `cheapest alternative to ${rivals[0]}`])

  out.push(["Brand", `is ${brand} worth it?`])
  out.push(["Brand", `${brand} pricing`])
  out.push(["Brand", `${brand} reviews`])

  return out.map(([group, text], i) => ({ id: `s${i}`, group, text }))
}

/** Which suggestions start ticked: the whole category group, and two rivals. */
function defaultPicks(all: Suggestion[]): Set<string> {
  const head = all.filter((s) => s.group === "Head to head").slice(0, 2)
  return new Set([...all.filter((s) => s.group === "Category"), ...head].map((s) => s.text))
}

export function OnboardingWizard({
  /** Rendered only when there is something to go back to -- i.e. not on a first run. */
  onCancel,
}: {
  onCancel?: () => void
}) {
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [maxStep, setMaxStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  // Step 1
  const [brandName, setBrandName] = useState("")
  const [brandDomain, setBrandDomain] = useState("")

  // Step 2
  const [aliases, setAliases] = useState<string[]>([])
  const [category, setCategory] = useState("")
  const [competitors, setCompetitors] = useState<string[]>([])

  // Created at the end of step 2.
  const [project, setProject] = useState<CreatedProject | null>(null)
  /**
   * What was last written for this brand, so a second pass through step 2 can
   * tell an edit from a re-Continue. A ref rather than state: nothing renders
   * from it, and it must be current inside the same tick the request settles.
   */
  const saved = useRef<BrandBody | null>(null)

  // Step 3
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [custom, setCustom] = useState<string[]>([])

  // Step 4
  const [platforms, setPlatforms] = useState<Platform[]>(["chat_gpt"])
  const [samples, setSamples] = useState(3)
  const [freq, setFreq] = useState("off")

  const suggestions = useMemo(
    () => suggestPrompts(brandName, category, competitors),
    [brandName, category, competitors],
  )

  // Null until the user first ticks something, so that regenerating suggestions
  // after an edit cannot silently discard choices they already made. Once they
  // have chosen, the set is theirs and later suggestions arrive unticked.
  const picks = picked ?? defaultPicks(suggestions)
  const chosenPrompts = useMemo(
    () =>
      Array.from(
        new Set([...suggestions.filter((s) => picks.has(s.text)).map((s) => s.text), ...custom]),
      ),
    [suggestions, picks, custom],
  )

  const go = (n: number) => {
    setError("")
    setStep(n)
    setMaxStep((m) => Math.max(m, n))
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const toggleSuggestion = (text: string) => {
    const next = new Set(picks)
    if (next.has(text)) next.delete(text)
    else next.add(text)
    setPicked(next)
  }

  const togglePlatform = (p: Platform) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))

  /**
   * Step 2 -> 3. Writes the brand, so the API's name guard lands next to its fix.
   *
   * A PATCH on the way back through, not a no-op: the rail lets you return to
   * step 1 or 2 after the brand exists, and an edit made there that Continue
   * quietly dropped would be worse than not offering the rail at all -- you
   * would be looking at a corrected domain that was never saved.
   */
  const saveBrand = async () => {
    const body: BrandBody = {
      name: brandName.trim(),
      brandName: brandName.trim(),
      // null, not omitted: on a PATCH, clearing a domain you typed and then
      // deleted is a real instruction, and omitting the key would keep the old
      // one. The schema takes a nullable domain for exactly this.
      brandDomain: brandDomain.trim() ? normaliseDomain(brandDomain) : null,
      brandAliases: aliases,
      competitorNames: competitors,
    }

    if (project && !dirty(body, saved.current)) {
      go(3)
      return
    }

    setBusy(true)
    setError("")
    try {
      const res = project
        ? await api.patch<CreatedProject>(`/api/llm-tracker/projects/${project.id}`, body)
        : // The API wants a display name and a brand name. Asking for both up
          // front made the first screen a form about our data model -- in
          // practice they are the same string, and the name is editable later.
          //
          // Creation takes an OPTIONAL domain where the edit takes a nullable
          // one, so the null has to become an absent key. JSON.stringify drops
          // an undefined value, which is the whole trick.
          await api.post<CreatedProject>("/api/llm-tracker/projects", {
            ...body,
            brandDomain: body.brandDomain ?? undefined,
          })
      saved.current = body
      setProject(res)
      go(3)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't save the brand.")
    } finally {
      setBusy(false)
    }
  }

  /** Step 4. Adds the prompts, optionally runs them, then hands over the brand page. */
  const finish = async (mode: "add" | "run") => {
    if (!project) return
    setBusy(true)
    setError("")
    try {
      const res = await api.post<{ added: number; prompts?: { id: string }[] }>(
        `/api/llm-tracker/projects/${project.id}/prompts`,
        {
          prompts: chosenPrompts,
          platforms,
          samplesPerRun: samples,
          checkFrequency: freq === "off" ? null : Number(freq),
        },
      )
      toast.success(
        `${project.brandName} is set up — ${res.added} prompt${res.added === 1 ? "" : "s"} tracked.`,
      )

      const ids = (res.prompts ?? []).map((p) => p.id)
      if (mode === "run" && ids.length > 0) {
        try {
          await api.post(`/api/llm-tracker/projects/${project.id}/run`, { promptIds: ids })
        } catch (err) {
          // The prompts are saved either way, so a refused run must not read as a
          // failed setup -- and a 402 already raises the global upsell modal.
          if (!(err instanceof ApiError && err.status === 402)) {
            toast.error("Prompts were saved, but the first run didn't start.")
          }
        }
      }
      router.push(`/dashboard/ai-prompt-tracker/${project.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't save the prompts.")
      setBusy(false)
    }
  }

  const step1Ready = brandName.trim().length > 1
  const step4Ready = chosenPrompts.length > 0 && platforms.length > 0

  // Claude and Perplexity are 3 credits an answer where the other two are 1, so a
  // run spans two rate cards and the two have to be summed rather than averaged.
  const pricey = platforms.filter((p) => ENGINES[p].creditsPerAnswer === 3).length
  const flat = platforms.length - pricey
  const answers = chosenPrompts.length * platforms.length * samples

  return (
    <div className="llm-wiz">
      <ol className="llm-wiz-rail">
        {STEPS.map((label, i) => {
          const n = i + 1
          const state = n < step ? "done" : n === step ? "current" : "todo"
          return (
            <li key={label} className="llm-wiz-crumb">
              <button
                type="button"
                className="llm-wiz-step"
                data-state={state}
                /* Backwards only, and only over ground already covered: a rail
                   that jumps to step 4 before a brand exists offers a screen
                   that cannot do anything. */
                disabled={n > maxStep || busy}
                aria-current={state === "current" ? "step" : undefined}
                onClick={() => n <= maxStep && go(n)}
              >
                <span className="llm-wiz-dot">{state === "done" ? <Icon.check size={12} /> : n}</span>
                <span className="llm-wiz-lbl">{label}</span>
              </button>
              {n < STEPS.length && <span className="llm-wiz-bar" aria-hidden />}
            </li>
          )
        })}
      </ol>

      <div className="llm-wiz-b">
        {step === 1 && (
          // Split, with the four assistants down the side. The step needs two
          // short fields and nothing else, so the width was going to be spent on
          // something -- and what a new account most needs to see on the screen
          // it lands on is WHO is being asked. Four marks say "this reads real
          // AI assistants" faster than the paragraph that used to say it alone.
          <div className="llm-wiz-split">
            <div className="llm-wiz-main">
              <h2 className="llm-wiz-h">Which brand should we listen for?</h2>
              <p className="llm-wiz-sub">
                We ask the assistants the questions your buyers ask, then read every answer looking
                for you. To do that we need to know what &ldquo;you&rdquo; looks like in a sentence.
              </p>

              <div className="field">
                <label htmlFor="wiz-brand">Brand name</label>
                <input
                  id="wiz-brand"
                  className="input"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="FreeSERP"
                  maxLength={120}
                  autoFocus
                />
                <div className="tiny muted">
                  Written exactly as it appears in prose. We match it as a whole word, so casing and
                  punctuation are handled for you.
                </div>
              </div>

              <div className="field">
                <label htmlFor="wiz-domain">Domain</label>
                <input
                  id="wiz-domain"
                  className="input"
                  value={brandDomain}
                  onChange={(e) => setBrandDomain(e.target.value)}
                  placeholder="freeserp.com"
                  maxLength={253}
                />
                <div className="tiny muted">
                  Optional, but it is the one name nobody else can use by accident — and it is what
                  separates a <em>citation</em>, where the assistant linked to you, from a passing
                  mention. A brand made of ordinary words (&ldquo;Free SERP&rdquo;) can only be tracked
                  with one.
                </div>
              </div>

              <ul className="llm-wiz-notes">
                <li>
                  <Icon.zap /> No credits used until the last step
                </li>
                <li>
                  <Icon.clock /> About a minute
                </li>
                <li>
                  <Icon.settings /> Everything here is editable later
                </li>
              </ul>
            </div>

            <aside className="llm-wiz-side">
              <div className="llm-wiz-side-h">Who we ask</div>
              <div className="llm-wiz-side-list">
                {ENGINE_ORDER.map((id) => (
                  // .llm-eng is what carries the per-assistant accent tokens.
                  // Reusing it means the orange next to Claude here is the same
                  // orange as the Claude page, from one definition.
                  <div key={id} className="llm-eng llm-wiz-side-row" data-engine={id}>
                    <span className="llm-wiz-mark">
                      <PlatformMark id={id} size={17} />
                    </span>
                    <span className="llm-wiz-side-id">
                      <span className="llm-wiz-side-nm">{PLATFORM_LABEL[id]}</span>
                      <span className="tiny muted">{ENGINE_NOTE[id]}</span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="tiny muted llm-wiz-side-foot">
                You pick which of these to run on the last step. Nothing is asked until then.
              </p>
            </aside>
          </div>
        )}

        {step === 2 && (
          <>
            <h2 className="llm-wiz-h">What are you, and who do you lose to?</h2>
            <p className="llm-wiz-sub">
              These two answers decide what we ask. Competitors are also scored as share of voice — who
              gets named in the same answers you do.
            </p>

            <div className="llm-wiz-grid">
              <div className="field">
                <label htmlFor="wiz-cat">What you sell</label>
                <input
                  id="wiz-cat"
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="rank tracking software"
                  maxLength={80}
                />
                <div className="tiny muted">
                  The category a buyer would search, not your positioning line. Used to phrase the
                  suggested questions on the next step — it is not saved to the brand.
                </div>
              </div>

              <TagField
                id="wiz-comp"
                label="Competitors"
                values={competitors}
                onChange={setCompetitors}
                placeholder="Ahrefs, Semrush, Nightwatch"
                hint="Type a name and press Enter. Each one becomes a head-to-head question on the next step, so three or four is usually enough."
              />

              {/* Across the foot rather than in a column: this is the field that
                  collects the most values, and chips wrap better wide than tall. */}
              <TagField
                id="wiz-alias"
                label="Other spellings"
                values={aliases}
                onChange={setAliases}
                placeholder="Free-SERP, FreeSerp"
                hint="Optional. An assistant that writes your name a way we don't recognise reads as “not mentioned”, which is the one error that makes the whole score wrong."
                wide
              />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="llm-wiz-head">
              <div>
                <h2 className="llm-wiz-h">Which questions should we ask?</h2>
                <p className="llm-wiz-sub">
                  {suggestions.length} suggestions, written from your category and competitors. Untick
                  anything your buyers would not actually type, and add the ones only you know about.
                </p>
              </div>
              {/* The running count, where the decision is being made. It used to
                  appear only on the next screen, so "have I picked too many?"
                  could not be answered on the screen that asks. */}
              <div className="llm-wiz-tally">
                <span className="llm-wiz-tally-n">{chosenPrompts.length}</span>
                <span className="tiny muted">selected</span>
              </div>
            </div>

            {GROUP_ORDER.map((group) => {
              const items = suggestions.filter((s) => s.group === group)
              if (items.length === 0) return null
              const on = items.filter((s) => picks.has(s.text)).length
              const all = on === items.length
              return (
                <div className="llm-sugg-group" key={group}>
                  <div className="llm-sugg-head">
                    <span className="llm-sugg-name">{group}</span>
                    <span className="llm-sugg-count" data-on={on > 0 ? "true" : undefined}>
                      {on} of {items.length}
                    </span>
                    {/* Four groups of three or four: ticking them one at a time
                        is the common case and it is tedious. */}
                    <button
                      type="button"
                      className="llm-sugg-all"
                      onClick={() => {
                        const next = new Set(picks)
                        for (const s of items) {
                          if (all) next.delete(s.text)
                          else next.add(s.text)
                        }
                        setPicked(next)
                      }}
                    >
                      {all ? "Clear" : "Select all"}
                    </button>
                  </div>
                  <p className="tiny muted llm-sugg-note">{GROUP_NOTE[group]}</p>
                  <div className="llm-sugg-list">
                    {items.map((s) => {
                      const checked = picks.has(s.text)
                      return (
                        <label
                          key={s.id}
                          className={"engine-card llm-sugg" + (checked ? " selected" : "")}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSuggestion(s.text)}
                          />
                          <span className={`engine-box${checked ? " on" : ""}`} aria-hidden>
                            {checked && <Icon.check size={12} />}
                          </span>
                          <span className="llm-sugg-txt">{s.text}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            <TagField
              id="wiz-custom"
              label="Your own questions"
              values={custom}
              onChange={setCustom}
              placeholder="how do I track rankings without a subscription?"
              hint="Type a question and press Enter. Write it the way a buyer would ask it out loud — the phrasing changes the answer."
              stacked
            />
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="llm-wiz-h">Who do we ask, and how often?</h2>
            <p className="llm-wiz-sub">
              An assistant is only worth tracking if your buyers use it. Start with one or two — you can
              add the rest once you know what the answers look like.
            </p>

            <div className="field">
              <label>Assistants</label>
              {/* A card each, with the assistant's own mark and its own accent.
                  They were four identical grey chips before, which made the one
                  screen that is entirely about WHICH AI look like a form about
                  nothing in particular -- and hid that the four are not
                  interchangeable. The mark and the rate are the two facts that
                  decide this, so both are on the face of the card. */}
              <div className="llm-wiz-engines">
                {ENGINE_ORDER.map((id) => {
                  const on = platforms.includes(id)
                  const rate = ENGINES[id].creditsPerAnswer
                  return (
                    <label
                      key={id}
                      className={"llm-eng llm-wiz-engine" + (on ? " on" : "")}
                      data-engine={id}
                    >
                      <input type="checkbox" checked={on} onChange={() => togglePlatform(id)} />
                      <span className="llm-wiz-engine-h">
                        <span className="llm-wiz-mark">
                          <PlatformMark id={id} size={18} />
                        </span>
                        <span className="llm-wiz-engine-nm">{PLATFORM_LABEL[id]}</span>
                        <span className="llm-wiz-tick" aria-hidden>
                          {on && <Icon.check size={11} />}
                        </span>
                      </span>
                      <span className="llm-wiz-engine-note">{ENGINE_NOTE[id]}</span>
                      {/* Marked as the dear pair rather than left to arithmetic:
                          it is the only thing on this card that can surprise you
                          on the bill. */}
                      <span className={"llm-wiz-rate" + (rate === 3 ? " dear" : "")}>
                        {rate} credit{rate === 1 ? "" : "s"} an answer
                      </span>
                    </label>
                  )
                })}
              </div>
              <div className="tiny muted">
                Perplexity and Claude are answered through a different, dearer endpoint than ChatGPT and
                Gemini. That is the price difference — not the models being better.
              </div>
            </div>

            <div className="llm-wiz-grid">
              <div className="field">
                {/* No htmlFor: the control below is a button, not an input, so
                    the label has nothing to point at and says so via ariaLabel. */}
                <label>Samples per assistant</label>
                <Dropdown
                  ariaLabel="Samples per assistant"
                  value={String(samples)}
                  options={SAMPLE_OPTIONS}
                  onChange={(v) => setSamples(Number(v))}
                  block
                />
                <div className="tiny muted">
                  The same question asked twice does not give the same answer. Asking {samples} time
                  {samples === 1 ? "" : "s"} turns a coin-flip into a rate — at 1 the number moves every
                  run and means nothing.
                </div>
              </div>

              <div className="field">
                <label>Run automatically</label>
                <Dropdown
                  ariaLabel="Run frequency"
                  value={freq}
                  options={FREQUENCY_OPTIONS}
                  onChange={setFreq}
                  block
                />
                <div className="tiny muted">
                  {freq === "off"
                    ? "You'll run these yourself. A schedule can be turned on per prompt later."
                    : `${runsPerMonth(Number(freq))} runs a month. AI answers drift slowly — weekly is enough to see a trend without paying for noise.`}
                </div>
              </div>
            </div>

            <div className="llm-wiz-sum">
              <div className="llm-wiz-sum-line">
                <strong>{chosenPrompts.length}</strong> prompt{chosenPrompts.length === 1 ? "" : "s"} ×{" "}
                <strong>{platforms.length}</strong> assistant{platforms.length === 1 ? "" : "s"} ×{" "}
                <strong>{samples}</strong> sample{samples === 1 ? "" : "s"} ={" "}
                <strong>{answers}</strong> answers a run
              </div>
              <RunCost
                base={chosenPrompts.length * flat * samples}
                pricey={chosenPrompts.length * pricey * samples}
                everyHours={freq === "off" ? null : Number(freq)}
              />
            </div>
          </>
        )}

        {error && (
          <div className="llm-wiz-err">
            {error}
            {step === 2 && (
              <div className="tiny" style={{ marginTop: 4 }}>
                If the name is the problem, a domain on step 1 or a distinctive spelling above will fix
                it.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="llm-wiz-f">
        <div className="llm-wiz-f-l">
          {step > 1 ? (
            <button type="button" className="btn" onClick={() => go(step - 1)} disabled={busy}>
              Back
            </button>
          ) : onCancel ? (
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          ) : null}
          {/* Said once the brand is real, because from here on leaving does not
              throw the work away -- and not saying so is what makes a half-
              finished wizard feel like a trap. */}
          {project && (
            <span className="tiny muted llm-wiz-saved">
              <Icon.check size={12} /> {project.brandName} saved
            </span>
          )}
        </div>

        <div className="row" style={{ gap: 8 }}>
          {step === 1 && (
            <button type="button" className="btn primary" disabled={!step1Ready} onClick={() => go(2)}>
              Continue <Icon.chevR />
            </button>
          )}
          {step === 2 && (
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void saveBrand()}
            >
              {busy ? "Saving…" : "Continue"} <Icon.chevR />
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              className="btn primary"
              disabled={chosenPrompts.length === 0}
              onClick={() => go(4)}
            >
              Continue <Icon.chevR />
            </button>
          )}
          {step === 4 && (
            <>
              <button
                type="button"
                className="btn"
                disabled={busy || !step4Ready}
                onClick={() => void finish("add")}
              >
                Save without running
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || !step4Ready}
                onClick={() => void finish("run")}
              >
                {busy ? "Starting…" : "Start tracking"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ───── Pieces ───────────────────────────────────────────────────────────────

/**
 * A list of short strings, entered one at a time.
 *
 * Replaces the comma-or-newline textarea the modal used. That control asked the
 * user to hold a parsing rule in their head and gave no feedback until submit,
 * so a stray comma inside a competitor's name silently became two competitors.
 * Here each value is committed on Enter and visible as its own removable chip.
 */
function TagField({
  id,
  label,
  values,
  onChange,
  placeholder,
  hint,
  /** Chips on their own rows -- for full sentences, which do not fit a chip rail. */
  stacked = false,
  /** Span both columns when the field sits inside .llm-wiz-grid. */
  wide = false,
}: {
  id: string
  label: string
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  hint?: string
  stacked?: boolean
  wide?: boolean
}) {
  const [draft, setDraft] = useState("")

  const commit = () => {
    const v = draft.trim()
    if (!v) return
    // Pasting a comma-separated list is still the fastest way in for someone who
    // has one on a clipboard, so split here rather than refusing the paste.
    const parts = v.split(",").map((s) => s.trim()).filter(Boolean)
    onChange(Array.from(new Set([...values, ...parts])))
    setDraft("")
  }

  return (
    <div className={"field" + (wide ? " wide" : "")}>
      <label htmlFor={id}>{label}</label>
      <div className={"llm-tags" + (stacked ? " stacked" : "")}>
        {values.map((v) => (
          <span className="llm-tag" key={v}>
            <span className="llm-tag-t">{v}</span>
            <button
              type="button"
              className="llm-tag-x"
              onClick={() => onChange(values.filter((x) => x !== v))}
              aria-label={`Remove ${v}`}
            >
              <Icon.close />
            </button>
          </span>
        ))}
        <input
          id={id}
          className="llm-tag-in"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commit()
            } else if (e.key === "Backspace" && !draft && values.length > 0) {
              onChange(values.slice(0, -1))
            }
          }}
          /* Committed on blur too: typing a name and then clicking Continue is
             the obvious thing to do, and losing it to an uncommitted draft is
             the classic way a chip input eats input. */
          onBlur={commit}
          placeholder={values.length === 0 ? placeholder : "Add another…"}
        />
      </div>
      {hint && <div className="tiny muted">{hint}</div>}
    </div>
  )
}

/**
 * What one run costs, summed across the two rate cards.
 *
 * Renders nothing for a grandfathered worker subscriber, who spends daily checks
 * rather than credits, and nothing while the rate card is loading — the same
 * rules <CreditCost> follows elsewhere.
 */
function RunCost({
  base,
  pricey,
  everyHours,
}: {
  base: number
  pricey: number
  everyHours: number | null
}) {
  const cheap = useCreditQuote(CREDIT_ACTION_KEYS.llmPromptSample, Math.max(base, 1))
  const dear = useCreditQuote(CREDIT_ACTION_KEYS.llmPromptSample, Math.max(pricey, 1), "claude")
  if (!cheap.applies || cheap.cost == null || dear.cost == null) return null

  const total = (base > 0 ? cheap.cost : 0) + (pricey > 0 ? dear.cost : 0)
  if (total === 0) return null
  const short = cheap.balance != null && total > cheap.balance

  return (
    <div className="llm-wiz-cost" data-short={short ? "true" : undefined}>
      <strong>{formatCredits(total)}</strong> credit{total === 1 ? "" : "s"} a run
      {cheap.balance != null &&
        (short
          ? ` · only ${formatCredits(cheap.balance)} left, so this run would be refused`
          : ` · ${formatCredits(cheap.balance)} left`)}
      {everyHours ? (
        <div>Then about {formatCredits(total * runsPerMonth(everyHours))} a month while scheduled.</div>
      ) : null}
    </div>
  )
}

/** "https://Example.com/pricing" -> "example.com". The API stores a bare host. */
function normaliseDomain(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]!
    .toLowerCase()
}
