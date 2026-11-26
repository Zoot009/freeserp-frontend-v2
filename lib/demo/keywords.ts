// The Keywords page's demo. The page (every tracked keyword, across projects) has
// no data of its own, so its demo is a VIEW of it, /dashboard/keywords?view=demo,
// that lists the rank tracker demo's project: GET /api/projects/demo, which
// lib/demo/index.ts already answers in the browser (./rank-tracker.ts). Nothing
// to register, and no data module: these are only the links.

import { DEMO_ID } from "./shared"

/** The demo view — and what PaidToolGate's sample screen links free users to. */
export const KEYWORDS_DEMO_HREF = `/dashboard/keywords?view=${DEMO_ID}`
/** Where the demo's CTAs lead: keywords are tracked in a project. Same as RANK_TRACKER_CREATE_HREF. */
export const KEYWORDS_CREATE_HREF = "/dashboard/projects?create=1"
