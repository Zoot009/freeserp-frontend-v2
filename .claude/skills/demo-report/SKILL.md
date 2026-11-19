---
name: demo-report
description: Build the read-only demo report for one FreeSERP dashboard tool, following the shared demo conventions. Use when asked to add, create or build a demo (demo project, demo report, sample report) for a tool, or when invoked as /demo-report <tool-slug>.
argument-hint: <tool-slug>
---

# Demo report for a FreeSERP tool

**Tool to build:** `$ARGUMENTS`. If that is empty or not a slug in the tracker below, show the
tracker and ask which tool.

Two developers are building these demos in parallel, one tool each at a time. This file is the
contract that keeps every demo looking, behaving and merging the same. Follow it exactly. If a
rule here doesn't fit your tool, stop and raise it with the other developer. Don't improvise a
variant.

## What a demo is

Every tool gets one **demo**: a fully populated example of what the tool produces, about Nike,
that any signed-in user (free or paid) can open and explore before running the tool on their own
site.

- **It is the real tool page.** The demo renders through the tool's actual pages and components,
  not a separate mock page, so it always shows the product as it is.
- **The data is generated in the browser.** A module under `lib/demo/` answers the page's API
  requests in-process, before the network. No backend row, no DataForSEO, OpenAI or Scrape.do
  call, no credits, and nothing counted toward quotas.
- **It is read-only.** Every control that would change something stays visible. Clicking one
  shows the "This is a demo" prompt, whose CTA leads to the tool's real start page.

**Reference implementation: the Google Rank Tracker demo.** Read these before writing anything:

| File | What it shows |
|---|---|
| `lib/demo/shared.ts` | The `DemoTool` contract, `DEMO_ID`, `DEMO_BRAND`, `prng`, `demoAnchor`, `perAnchor` |
| `lib/demo/index.ts` | The registry: routing, the central read-only refusal, the 404 |
| `lib/demo/rank-tracker.ts` | A complete tool module: seeds → deterministic generation → backend-shaped responses |
| `lib/demo/rank-tracker.test.ts` | Tool-specific consistency tests |
| `components/dashboard/demo-banner.tsx` | `DemoBanner`, `DemoChip`, `useDemoGuard`, `useDemoPrompt`, `useIsDemoView` |
| `app/[locale]/dashboard/projects/page.tsx` | Pinned Demo entry in a tool's own list (search `DEMO_ID`) |
| `app/[locale]/dashboard/project/[id]/keywords/page.tsx` | Banner + `guard(...)` on every mutating control (search `guard(`) |

## Before you start

1. `git pull` on `main`. Branch `demo/<slug>`. One tool per branch and PR.
2. Claim the tool in the tracker (set Owner, Status → `in progress`) in a tiny first commit and
   push it, so the other developer sees the claim.
3. Read the tool's pages end to end: every GET the demo route makes, every mutating control,
   every poll, and every component it renders. The tracker's "Gotchas" column is a head start,
   not the whole list.

## The rules

### 1. IDs and URLs
- The demo's id is the literal `DEMO_ID` (`"demo"`), placed in whatever slot the tool already
  uses for ids: `[id]`, `[reportId]`, `[scanId]`, `?analysisId=`, `?id=`, `?check=`. Don't add new
  routes for the demo.
- Ids of things inside the demo are `demo-<thing>-<n>` (`demo-kw-3`, `demo-c-1`).
- Stateless tools, which have no saved result and no id (Keyword Magic), use `?view=demo` on
  their page. In demo view the page reads `GET <base>/demo` instead of running its POST.
- `"demo"` in a path segment or a query value is also what opens `PaidToolGate`
  (`useIsDemoView`), so the convention isn't optional.

### 2. The data module: `lib/demo/<slug>.ts`
- Export one `DemoTool`: `{ get(rest, query) }`. `get` receives the path segments after
  `<prefix>/demo` and returns the response body, or `undefined` for a 404.
  - Register it in `lib/demo/index.ts` as one line, mapping the API prefix the id follows to a
    lazy import: `"/api/<prefix>": () => import("./<slug>").then((m) => m.<slug>Demo),`. That
    is the only edit to that file. Two demo branches merged together conflict on those lines.
    Keep both sides.
  - The module loads on the first request to its demo, so its data never weighs on other
    pages. Never import a demo data module from a shared component that every page uses.
- **Copy the response shapes from the backend serializer, never from guesswork.** Find the
  route or service in `freeserp-backend-v2/src/modules/` that produces each response, match its
  fields (including nullable and optional ones), and name those files in the module's header
  comment. The frontend's local TS types are often looser than what the page actually reads.
- **Deterministic.** All randomness comes from `prng(seed)` with a fixed seed per item. The same
  call must return the same data within a day, because pages poll and a value that changes
  between polls reads as live activity. Wrap the builder in `perAnchor`.
- **Always current.** Generate every timestamp backwards from the `anchor` that `perAnchor`
  passes in (the latest run is 06:00 UTC today). Never hard-code a date. Never call
  `Date.now()` inside the data.
- **Subject: Nike, always from `DEMO_BRAND`.** That means the domain, name, store, YouTube
  channel and tracked competitors. Never type `"nike.com"` or a competitor list into a tool
  module. If you need a brand fact that isn't there, see rule 8.
- **Realistic, and covering every state the UI has.**
  - Good, bad and mixed results; the empty-section message; every chip, badge, severity and
    score band; sorting and filters that actually change something.
  - Plausible magnitudes: CTR curves, volumes, scores.
  - Real third-party domains (adidas.com, reddit.com) are fine where a real report would show
    them.
  - No real people, emails, phone numbers or reviews attributed to real individuals.
- **Values the server computes from the data** (scores, forecasts, grades) come from the backend's
  own code, not a re-implementation. If it's pure, run it on your data in a scratch script
  (esbuild-bundle the backend file) and embed the output. Name the source in a comment, and add a
  test that fails when the inputs change without regenerating. See `ads-analysis.ts`. If it isn't
  pure, mirror the formula and say so (`page-audit.ts` scoring).
- **Finished state.** Every run, check or scan the demo returns is in its terminal success state
  (`COMPLETED` and the like), so no spinner and no polling loop stays on.
- **Internally consistent.** Lists, details, counts and totals derive from one generated dataset,
  not from separately invented numbers. The rank tracker builds its competitor counts from the
  same SERPs the keyword pages show.

- **Generated data.** When the demo's data comes from running backend code on synthetic input
  (AEO, Competitor Analysis), the generator is `scripts/demo/<slug>.gen.ts` and writes
  `lib/demo/<slug>-data.ts`. Run it with `node scripts/demo/run.mjs scripts/demo/<slug>.gen.ts`
  from this repo (it needs `freeserp-backend-v2` checked out next to it). The runner stubs the
  backend's logger and env and refuses any import of the database or Redis clients. Commit the
  generator with its output.

### 3. Read-only
- `lib/demo/index.ts` refuses every non-GET with `403 demo_read_only`, for both HTTP clients.
  That is the safety net, not the UX.
- **Every control that would change data, start a run, spend credits or open a create/edit flow
  is wrapped in `guard(...)`** from `useDemoGuard(isDemo, createHref, onBlocked?)`.
  - Controls stay visible: the demo's job is to show what the tool can do.
  - Use `onBlocked` to close whatever menu the control sat in.
  - Guard at the control that opens a modal or confirm, not at the final submit, so nobody
    fills in a form only to be refused.
- **Nothing fires on mount** that would write or spend: auto-started runs, "new item" onboarding
  flows (`?new=1`), auto-refresh POSTs.
- **Calls outside your `base`** reach the real backend too: the registry only answers
  `<base>/demo…`. Page Audit's report POSTs `/api/page-audit/ask` (Ask AI, spends credits) and
  `/api/page-audit/screenshots`. List every endpoint the demo page can call, and hide or skip
  each one outside the prefix.
- **Calls that bypass both HTTP clients** (raw `fetch`, `sendBeacon`, e.g.
  `components/page-audit/ask-ai-panel.tsx`, the PDF download in `report-modal.tsx`) are skipped
  or hidden on the demo, since the registry can't answer them.
- **Hide `FavoriteButton`** on demo items. Favourites are stored server-side by id.
- **Share, export-to-server, schedule, alert and "re-run" controls are guarded.** Purely
  client-side exports (CSV built in the browser) may stay enabled.
- **Links to another tool** from inside a demo are guarded unless that tool's demo exists and the
  link points at it.
- **`guard(fn)` drops `fn`'s return value.** For a handler whose promise the component awaits (Ads'
  `onSaveAssumptions` drives a spinner and an error line), pass
  `isDemo ? async () => void prompt() : handler` with `useDemoPrompt`. A `<Link>` control needs
  `e.preventDefault()` before the prompt, or it still navigates.

### 4. Entry point
The demo is pinned **first** in the tool's own list, for everyone, and never counts toward any
limit, count, quota or "X of Y used" text.

| Tool type | Entry |
|---|---|
| Uses `ReportHistory` | Pass `demo={{ title, subtitle?, href }}`. The row and `DemoChip` are built in. |
| Has its own list or history | Prepend a summary built by your module, swap the status chip for `<DemoChip />`, and hide favourites. Keep the empty state for users with no items of their own, with the demo below it. |
| Stateless | A "See an example" link to `?view=demo` near the input. Reuse existing button styles. |

### 5. Page chrome
- `<DemoBanner createHref={…} />` at the top of **every** page the demo route renders, including
  sub-pages and detail pages.
- `createHref` is the tool's real start page (its create or run form), exported from your module
  as `<TOOL>_CREATE_HREF`. For example, `RANK_TRACKER_CREATE_HREF` is
  `/dashboard/projects?create=1`, where the projects page opens its create modal. Pass the same
  value to `useDemoGuard`.
- Detect the demo with `id === DEMO_ID` (or the query param) in the page. Use `useIsDemoView()`
  only where no id is at hand.

### 6. Paid tools
`PaidToolGate` already lets every demo view through, for every plan. Don't touch the gate, and
don't add plan checks around the demo. For a free user, the CTA leading to the tool's real start
page is the upsell: the gate shows them the paywall there.

Free users never see a paid tool's own list (the gate's sample screen replaces it), so the demo
pinned there is invisible to exactly the people it is for. **Pass the demo's URL from your tool's
layout:** `<PaidToolGate tool="…" demoHref={<TOOL>_DEMO_HREF}>`, with `<TOOL>_DEMO_HREF` exported
from your module. The sample screen then leads with "Explore the live demo". That prop is the
gate's only per-tool input; the gate itself stays untouched.

### 7. Text and i18n
- Use the `demo` namespace: `DemoBanner`, `DemoChip` and the prompt already render it. Don't add
  demo copy to a tool's namespace.
- The demo data itself (keywords, titles, findings) is English sample content and isn't
  translated.
- A genuinely new UI string goes into `messages/en.json`, `es`, `fr` and `de` (not `nl`, which
  isn't routed). Write it with a parse → set → `JSON.stringify(j, null, 2) + "\n"` script; that
  round-trip is byte-identical on these files. Never hand-edit the big JSON blocks.

### 8. Shared files: do not edit in a tool PR
`lib/api.ts`, `lib/axios.ts`, `lib/demo/shared.ts`, `lib/demo/index.ts` (except your
registration line), `components/dashboard/demo-banner.tsx`, `components/dashboard/paid-tool-gate.tsx`,
`components/dashboard/report-history.tsx`, and the `demo` block in `messages/*.json`.

If your tool needs a change in one of them (a new `DEMO_BRAND` field, a new prop), agree it with
the other developer and land it as its own small PR first. Then both of you build on it.

### 9. Backend
- No backend changes for demos.
- Never start the backend (`npm run dev` in `freeserp-backend-v2`) to test a demo while
  `freeserp-backend-v2/.env` has the Supabase `DATABASE_URL` line active: it starts the SERP
  poller and schedulers against that database. Switch to the local Docker line first.

## Tests
- **The contract test is free.** `lib/demo/index.test.ts` runs over every registered tool. It
  checks:
  - writes are refused
  - unknown paths 404
  - real ids and look-alike paths pass through untouched
  - full-URL (axios) matching
  - the axios interceptor answers in-process

  Registering your tool enrolls it.
- **Write `lib/demo/<slug>.test.ts`** for what only your tool can get wrong:
  - list ↔ detail agree
  - counts and totals derive from the items
  - every id the list links to resolves
  - two calls return equal data
  - every status is terminal

  Keep it small; see `rank-tracker.test.ts`.

## Done checklist (paste into the PR)
- [ ] `npx tsc --noEmit` clean, apart from the existing `components/aeo/report-pdf.tsx` errors
- [ ] `npm run test` passes, including the contract test for the new tool
- [ ] As a **free** user and as a **paid** user:
  - [ ] the demo is pinned first in the list and doesn't change "X of Y used"
  - [ ] the banner is on every demo page
  - [ ] every mutating control shows the prompt, and its CTA lands on the tool's start page
- [ ] DevTools → Network filtered by `demo`: **zero** requests (all demo data is in-process)
- [ ] No console errors. No spinner or poll left running.
- [ ] Phone width (375px): no horizontal scroll introduced by the demo entry or banner
- [ ] Tracker row below updated (Status → `done`, plus the final demo URL)

## Tracker

Edit only your own rows. If two branches touched neighbouring rows, merging conflicts on them. Keep both edits.

| Slug | Demo URL | API base | Entry | Gotchas | Owner | Status |
|---|---|---|---|---|---|---|
| `rank-tracker` | `/dashboard/project/demo/keywords` | `/api/projects` | own list | Reference implementation | — | done |
| `youtube-tracker` | `/dashboard/youtube/demo/keywords` | `/api/youtube/projects` | own list (`dashboard/youtube/page.tsx`) | Mirrors the rank tracker; polls while checks are active; PATCH frequency; the snapshot route (`/api/youtube/checks/:id/snapshot`) is outside the base, so demo pages read it via `youtubeSnapshotPath` | A | in progress |
| `maps-tracker` | `/reports/maps-tracker/demo/<kwId>` | `/api/maps-tracker/scans` | own list (`google-maps-tracker/page.tsx`) | Report lives **outside** the dashboard (`app/[locale]/reports/maps-tracker/…`); `/new?from=demo` re-run must be guarded; the map needs `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; use `DEMO_BRAND.store`; the list no longer redirects an empty account to the builder (empty state + demo instead) | A | in progress |
| `maps-audit` | `/dashboard/google-maps-audit/demo` | `/api/gbp-audit` | `ReportHistory` | `useScanKeywordId` in `components/gbp-audit/report.tsx` fetches a maps-tracker scan: point it at the maps-tracker demo or return no scan id; data is a fixture from the backend's own buildReport (`scripts/demo-maps-audit.ts`, re-run when report.ts changes); grid has no scanId (tracker demo is 7×7), so the rival-grid panel is hidden; free users never see the list (PaidToolGate sample), so the gate's sample should link to the demo — shared-file PR | A | in progress |
| `ai-prompt-tracker` | `/dashboard/ai-prompt-tracker/demo` | `/api/llm-tracker/projects` | own list | `?platform=` tabs; prompt page `[promptId]` polls; the `ai-platforms/*` pages are out of scope; first-run users still get the setup wizard as the page, with the demo row under it | A | in progress |
| `serp-checker` | `/dashboard/serp-checker?check=demo` | `/api/serp-check` | own history on the page | 2s poll → must be terminal; reuses the rank-tracker demo's "running shoes" SERP (depth 10) | A | in progress |
| `keyword-magic` | `/dashboard/keyword-magic?view=demo` | `/api/keyword-magic` | "See an example" link | Stateless: the search is a POST, so demo view reads `GET /api/keyword-magic/demo`; guard "Add to tracker"; seed "running shoes" like the other demos; "See an example" is inline English like the rest of this page (no shared `demo` key added) | A | in progress |
| `page-audit` | `/dashboard/page-audit/demo` | `/api/page-audit/reports` | own history (`components/page-audit/audit-history.tsx`) | One demo covers Website Audit and Page Audit (shared runner + report); sub-endpoints `/issue-groups`, `/pages`, `/issues/:type/pages`; `ask-ai-panel` uses raw `fetch`, so hide it; share sections PUT guarded | B | built — browser check pending |
| `ads-analysis` | `/dashboard/ads-analysis/demo` | `/api/ads-analysis` | `ReportHistory` | Guard `onSaveAssumptions` (PATCH); `components/ads-analysis/report.tsx` takes plain props | B | built — browser check pending |
| `aeo-audit` | `/dashboard/aeo-audit/demo` | `/api/aeo-audit` | `ReportHistory` | `QuestionChoice` POSTs `/question-mix`, so guard it; re-run guarded | B | todo |
| `competitor-analysis` | `/dashboard/competitor-analysis/results?analysisId=demo&keyword=running+shoes` | `/api/competitor-analysis` | `ReportHistory` | Uses the **axios** client (covered); `/link-graph`; guard recrawl, AI plan, AI chat (`ai-chat-panel.tsx`) and share; favourites hidden. When done, point the rank-tracker demo's "Rank #n → #1" and "New analysis" at it | B | built — browser check pending |
| `internal-links` | `/dashboard/ai-internal-linking/results?analysisId=demo` | `/api/internal-link-analysis` | `ReportHistory` | The create page uses axios (covered); results use `api` | B | todo |
| `keyword-score` | `/dashboard/keyword-analysis/results?id=demo` | `/api/keyword-analysis` | own cursor history | Guard re-run; when done, point the rank-tracker demo's score badge at it | B | built — browser check pending |

**Out of scope** (aggregate or account pages, not tools): Keywords (all-keywords view), Overview,
Favorites, Alerts, Billing, the AI platform pages, Report Builder (in-house only), Search
Console (paused).
