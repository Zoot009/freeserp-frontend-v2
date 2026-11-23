// Client case studies, served at
//   /team-b4ada0c0962365f0cd6a669c/agency/<agency>/casestudy/<client>
// New client = new entry under its agency's `clients`. Empty optional sections are hidden.
// Images go in public/case-studies/<client>/ and are referenced as "/case-studies/<client>/x.png".

export interface CaseStudy {
  name: string
  address: string
  website: string
  /** Before/after screenshot pairs (e.g. Google Maps ranking, GBP profile). */
  beforeAfter?: { before: string; after: string; caption?: string }[]
  /** Link to the audit report (FreeSERP share link or a PDF in public/). */
  auditReportUrl?: string
  citations: string[]
  hiddenSites: string[]
  /** "+ N of our websites" count. */
  ownSites?: number
  reviews?: {
    before: { rating: number; count: number }
    after: { rating: number; count: number }
  }
  /** Where the QR code points (ideally the Google review link). Defaults to a Google Maps search. */
  qrUrl?: string
}

export const AGENCIES: Record<string, { name: string; clients: Record<string, CaseStudy> }> = {
  zoot: {
    name: "Zoot",
    clients: {
      "ci-siamo": {
        name: "Ci Siamo",
        address: "440 W 33rd St Ste 100, New York, NY 10001, United States",
        website: "https://www.cisiamo.com/",
        citations: [
          "https://www.tripadvisor.in/Restaurant_Review-g60763-d23417627-Reviews-Ci_Siamo-New_York_City_New_York.html",
          "https://www.yelp.com/biz/ci-siamo-new-york-5",
          // Not about this restaurant (Italian news piece on Serbia) — re-add only if intended.
          // "https://www.huffingtonpost.it/esteri/2026/11/22/news/dimitrije_dimic_i_miei_54_giorni_di_calvario_da_sovversivo_ma_ci_siamo_ripresi_la_serbia-23308910/",
          "https://www.opentable.com/r/ci-siamo-new-york",
          "https://www.thefork.com/restaurant/ci-siamo-r828528",
        ],
        hiddenSites: ["Trustpilot", "Foursquare", "Local Yahoo", "BatchGeo", "Zeemaps"],
        ownSites: 25,
      },
    },
  },
}
