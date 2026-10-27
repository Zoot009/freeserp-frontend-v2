// The downloadable report: a designed A4 document, not a print of the web page. Ported from Aeo-Tool-E's
// src/audit/pdf/report-pdf.tsx and recoloured for FreeSERP. Built in the browser with @react-pdf/renderer when someone
// clicks Download PDF (the report page imports this file only then), so it's one click and no print dialog.
import { Document, Font, Page, pdf, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import {
  askedHow,
  bandOf,
  CATEGORIES,
  CATEGORY_NAMES,
  countryName,
  EFFORT_LABELS,
  ENGINE_NAMES,
  fmtDay,
  overall,
  type AeoReport as Report,
  type Fix,
  type Outcome,
  type Severity,
  type Tone,
  type VisibilitySummary,
} from "@/lib/aeo";

// Geist, the app's own typeface, as files: it carries characters such as "→" that the built-in PDF fonts lack.
const FONTS = "/fonts/geist"; // public/fonts/geist
Font.register({
  family: "Geist",
  fonts: [
    { src: `${FONTS}/Geist-Regular.ttf`, fontWeight: 400 },
    { src: `${FONTS}/Geist-Medium.ttf`, fontWeight: 500 },
    { src: `${FONTS}/Geist-SemiBold.ttf`, fontWeight: 600 },
    { src: `${FONTS}/Geist-Bold.ttf`, fontWeight: 700 },
  ],
});
Font.register({ family: "GeistMono", src: `${FONTS}/GeistMono-Regular.ttf` });
// No hyphenation; only a very long word (a URL, say) may break, in pieces, rather than run off the page.
Font.registerHyphenationCallback((word) => (word.length > 32 ? (word.match(/.{1,24}/g) ?? [word]) : [word]));

// FreeSERP's light theme (app/dashboard.css), so the PDF looks like the dashboard; the cover band is the dark theme's.
const C = {
  ink: "#0B0D12",
  muted: "#4B5363",
  faint: "#8A93A4",
  line: "#E7E9EE",
  wash: "#F2F4F7",
  chip: "#F2F4F7",
  night: "#0B0D12",
  cyan: "#5B7DFF", // the brand blue as it shows on the dark cover band
  brandDeep: "#1E40D8",
  accent: "#EEF2FF",
  up: "#16A34A",
  down: "#DC2626",
  warn: "#C28B00",
};
const FILL: Record<Tone, string> = { good: "#16A34A", warn: "#C28B00", bad: "#DC2626" };
const TRACK: Record<Tone, string> = { good: "#E8F7EE", warn: "#FBF3DC", bad: "#FCEBEB" };
const SEVERITY: Record<Severity, { bg: string; fg: string }> = {
  CRITICAL: { bg: "#DC2626", fg: "#ffffff" },
  HIGH: { bg: "#FCEBEB", fg: "#DC2626" },
  MEDIUM: { bg: "#FBF3DC", fg: "#C28B00" },
  LOW: { bg: C.chip, fg: "#4B5363" },
};
const MAX_PLACES = 5;
// The footer is placed from the top of the A4 page (842pt tall), not with `bottom`: with a page number (a render
// prop), react-pdf re-lays out continuation pages without their height, and a bottom-anchored footer once got a
// broken box there and failed the render ("unsupported number").
const FOOTER_TOP = 800;

// A unitless lineHeight is turned into points with the font size of the same style (18pt if it sets none), and
// inherited as points. So text much larger or smaller than the 9pt body sets both.
const s = StyleSheet.create({
  page: { fontFamily: "Geist", fontSize: 9, lineHeight: 1.45, color: C.ink, paddingTop: 58, paddingBottom: 54, paddingHorizontal: 44 },
  cover: { fontFamily: "Geist", fontSize: 9, lineHeight: 1.45, color: C.ink, paddingBottom: 54 },
  header: { position: "absolute", top: 24, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, lineHeight: 1.3, color: C.faint, borderBottomWidth: 0.75, borderBottomColor: C.line, paddingBottom: 6 },
  footer: { position: "absolute", top: FOOTER_TOP, left: 44, right: 44, fontSize: 7.5, lineHeight: 1.3, color: C.faint, borderTopWidth: 0.75, borderTopColor: C.line, paddingTop: 6 },
  pageNumber: { position: "absolute", top: FOOTER_TOP + 6.75, right: 44, fontSize: 7.5, lineHeight: 1.3, color: C.faint },
  h1: { fontSize: 15, lineHeight: 1.3, fontWeight: 700, marginBottom: 2 },
  h2: { fontSize: 11, lineHeight: 1.3, fontWeight: 600, marginBottom: 2 },
  lead: { fontSize: 8.5, lineHeight: 1.45, color: C.muted, marginBottom: 10 },
  small: { fontSize: 7.5, lineHeight: 1.4, color: C.muted },
  label: { fontSize: 7, lineHeight: 1.3, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  muted: { color: C.muted },
  card: { borderWidth: 0.75, borderColor: C.line, borderRadius: 8, padding: 14 },
  // Blocks are spaced with padding: react-pdf moves a block that misses the page only by its margin instead of splitting it.
  section: { paddingBottom: 24 },
  row: { flexDirection: "row" },
  thead: { flexDirection: "row", paddingBottom: 5, borderBottomWidth: 0.75, borderBottomColor: C.line },
  th: { fontSize: 7, lineHeight: 1.3, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  tr: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: C.line },
  pill: { fontSize: 7, lineHeight: 1.2, borderRadius: 3, paddingHorizontal: 4, paddingTop: 2, paddingBottom: 1.5 },
});

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pts = (n: number) => (n >= 0.5 ? `+${Math.round(n)}` : "<1");
const impact = (fix: Fix) => `${pts(fix.gain.aeo)} AEO · ${pts(fix.gain.geo)} GEO`;
const where = (url: string, origin: string) => {
  const u = new URL(url);
  return u.origin === origin ? `${u.pathname}${u.search}` : url;
};
const dayOf = fmtDay;

function Meter({ value, tone, height = 5 }: { value: number; tone: Tone; height?: number }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: TRACK[tone] }}>
      <View style={{ height, width: `${Math.max(0, Math.min(100, value))}%`, borderRadius: height / 2, backgroundColor: FILL[tone] }} />
    </View>
  );
}

function Dot({ color, size = 5 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, marginRight: 4 }} />;
}

// As in the app: a filled badge per band, and Weak in solid red capitals, so it reads as a problem in print too.
const BAND: Record<Tone, { bg: string; fg: string }> = { good: { bg: TRACK.good, fg: "#15803D" }, warn: { bg: TRACK.warn, fg: C.warn }, bad: { bg: C.down, fg: "#ffffff" } };
function BandLabel({ score }: { score: number }) {
  const band = bandOf(score);
  const bad = band.tone === "bad";
  return (
    <View style={{ flexDirection: "row", alignSelf: "flex-start", backgroundColor: BAND[band.tone].bg, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2.5 }}>
      <Text style={{ fontSize: 7.5, lineHeight: 1.2, fontWeight: 700, color: BAND[band.tone].fg, ...(bad && { textTransform: "uppercase", letterSpacing: 0.5 }) }}>
        {band.label}
      </Text>
    </View>
  );
}

function Change({ from, to }: { from?: number | null; to: number }) {
  if (from == null || from === to) return null;
  const up = to > from;
  return <Text style={{ fontSize: 8, lineHeight: 1.2, fontWeight: 600, color: up ? C.up : C.down }}>{`${up ? "+" : "−"}${Math.abs(to - from)}`}</Text>;
}

function Badge({ severity }: { severity: Severity }) {
  const { bg, fg } = SEVERITY[severity];
  return <Text style={[s.pill, { fontSize: 6.5, fontWeight: 700, letterSpacing: 0.5, color: fg, backgroundColor: bg }]}>{severity}</Text>;
}

function Chip({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <Text style={[s.pill, { marginLeft: 4, fontWeight: strong ? 600 : 400, color: strong ? C.brandDeep : C.muted, backgroundColor: strong ? C.accent : C.chip }]}>
      {children}
    </Text>
  );
}

function Header({ host }: { host: string }) {
  return (
    <View style={s.header} fixed>
      <Text>AEO &amp; GEO audit report</Text>
      <Text>{host}</Text>
    </View>
  );
}

function Footer({ host, day }: { host: string; day: string }) {
  return (
    <>
      <View style={s.footer} fixed>
        <Text>{`FreeSERP · ${host} · ${day}`}</Text>
      </View>
      <Text style={s.pageNumber} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </>
  );
}

type SectionProps = { title: string; lead?: string; children: ReactNode; keep?: number };

/**
 * `keep`: points of the section that must fit under the heading, or the heading moves to the next page with them.
 * Heading and body are siblings on the page, not one View: react-pdf only moves an element that has siblings before it.
 */
function Section({ title, lead, children, keep = 80 }: SectionProps) {
  return (
    <>
      <View wrap={false} minPresenceAhead={keep}>
        <Text style={s.h1}>{title}</Text>
        {lead && <Text style={s.lead}>{lead}</Text>}
      </View>
      <View style={s.section}>{children}</View>
    </>
  );
}

function Cover({ report }: { report: Report }) {
  const { breakdown, previous, fixes, host, audit, pages, seconds } = report;
  const day = dayOf(audit.createdAt);
  const b = breakdown!;
  const rules = b.categories.flatMap((c) => c.rules);
  const urgent = fixes.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH").length;
  const cited = overall(b.measured ?? []);
  const scores = [
    {
      label: "AEO score",
      value: b.aeo,
      before: previous?.aeoScore,
      text: "Answer engines: how ready the pages are to be the answer.",
      alarm: "Serious: answer engines are unlikely to use these pages as answers.",
    },
    {
      label: "GEO score",
      value: b.geo,
      before: previous?.geoScore,
      text: "Generative AI: how ready the brand is to be cited and recommended.",
      alarm: "Serious: AI engines are unlikely to cite or recommend this brand.",
    },
  ];
  const stats = [
    { label: "Things to fix", value: String(fixes.length), note: urgent ? `${urgent} high priority` : "none high priority" },
    { label: "Checks passed", value: String(rules.reduce((n, r) => n + r.passed, 0)), note: `of ${rules.reduce((n, r) => n + r.total, 0)}` },
    { label: "Pages read", value: String(pages.length), note: seconds !== null ? `in ${seconds}s` : " " },
    cited
      ? { label: "Cited in AI answers", value: `${cited.score}%`, note: `${cited.cited} of ${cited.answered} answers` }
      : { label: "Cited in AI answers", value: "—", note: "not measured" },
  ];
  return (
    <Page size="A4" style={s.cover}>
      <View style={{ backgroundColor: C.night, paddingHorizontal: 44, paddingTop: 34, paddingBottom: 28, color: "#ededed" }}>
        <Text style={{ fontSize: 10, lineHeight: 1.2, fontWeight: 600, color: C.cyan }}>FreeSERP</Text>
        <Text style={{ fontSize: 26, lineHeight: 1.15, fontWeight: 700, marginTop: 30, color: "#ffffff" }}>AEO &amp; GEO Audit Report</Text>
        <Text style={{ fontSize: 13, lineHeight: 1.3, fontWeight: 500, marginTop: 8 }}>{audit.origin}</Text>
        <Text style={{ marginTop: 2, color: "#a3a3a3" }}>{`Audited ${day} · ${plural(pages.length, "page")} checked`}</Text>
      </View>
      <View style={{ height: 2, backgroundColor: C.cyan }} />
      <View style={{ paddingHorizontal: 44, paddingTop: 22 }}>
        <View style={[s.row, { gap: 12 }]}>
          {scores.map((sc) => (
            <View key={sc.label} style={[s.card, { flex: 1 }]}>
              <View style={[s.row, { justifyContent: "space-between", alignItems: "center" }]}>
                <Text style={s.label}>{sc.label}</Text>
                <BandLabel score={sc.value} />
              </View>
              <View style={[s.row, { alignItems: "flex-end", marginTop: 8, marginBottom: 10 }]}>
                <Text style={{ fontSize: 40, lineHeight: 1, fontWeight: 700 }}>{sc.value}</Text>
                <Text style={{ fontSize: 10, lineHeight: 1.2, color: C.muted, marginLeft: 4, marginBottom: 3 }}>/100</Text>
                <View style={{ marginLeft: 8, marginBottom: 4 }}>
                  <Change from={sc.before} to={sc.value} />
                </View>
              </View>
              <Meter value={sc.value} tone={bandOf(sc.value).tone} />
              {bandOf(sc.value).tone === "bad" ? (
                <Text style={[s.small, { marginTop: 8, color: C.down, fontWeight: 600 }]}>{sc.alarm}</Text>
              ) : (
                <Text style={[s.small, { marginTop: 8 }]}>{sc.text}</Text>
              )}
            </View>
          ))}
        </View>
        {b.caps.length > 0 && (
          <View style={{ marginTop: 10, backgroundColor: "#fdecef", borderRadius: 6, padding: 10 }}>
            <Text style={{ fontSize: 8.5, lineHeight: 1.4, color: C.down }}>
              {`Both scores are capped at 40 (they would be AEO ${b.uncapped?.aeo} and GEO ${b.uncapped?.geo}) because ${b.caps.join("; ")}.`}
            </Text>
          </View>
        )}
        <View style={[s.row, { gap: 10, marginTop: 12 }]}>
          {stats.map((st) => (
            <View key={st.label} style={[s.card, { flex: 1, padding: 10 }]}>
              <Text style={s.label}>{st.label}</Text>
              <Text style={{ fontSize: 18, lineHeight: 1.2, fontWeight: 700, marginTop: 5 }}>{st.value}</Text>
              <Text style={s.small}>{st.note}</Text>
            </View>
          ))}
        </View>
        {b.engines?.length ? (
          <View style={{ marginTop: 20 }}>
            <Text style={s.h2}>AI engine readiness</Text>
            <Text style={[s.small, { marginBottom: 8 }]}>
              Estimated from this audit: how ready the site is for each engine to read and use it. Not whether an engine cites it today.
            </Text>
            <View style={[s.row, { flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 }]}>
              {b.engines.map((e) => (
                <View key={e.id} style={[s.card, { width: "32%", padding: 10 }]}>
                  <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-start" }]}>
                    <View>
                      <Text style={{ fontSize: 9, lineHeight: 1.25, fontWeight: 600 }}>{e.name}</Text>
                      <Text style={s.small}>{e.maker}</Text>
                    </View>
                    <Text style={{ fontSize: 17, lineHeight: 1.1, fontWeight: 700 }}>{e.score}</Text>
                  </View>
                  <View style={{ marginTop: 7, marginBottom: 6 }}>
                    <Meter value={e.score} tone={bandOf(e.score).tone} height={4} />
                  </View>
                  {e.capped ? <Text style={[s.small, { color: C.down }]}>Capped: main crawler blocked</Text> : <BandLabel score={e.score} />}
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {fixes.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={[s.h2, { marginBottom: 4 }]}>The biggest wins</Text>
            {fixes.slice(0, 3).map((f, i) => (
              <View key={f.checkId} style={s.tr}>
                <Text style={{ width: 16, color: C.faint }}>{i + 1}</Text>
                <Text style={{ flex: 1, fontWeight: 500 }}>{f.failing[0]!.title}</Text>
                <Chip strong>{impact(f)}</Chip>
                <Chip>{EFFORT_LABELS[f.effort]}</Chip>
              </View>
            ))}
            <Text style={[s.small, { marginTop: 6 }]}>Points each score gains once the issue is fixed everywhere. Every fix is explained in detail in this report.</Text>
          </View>
        )}
      </View>
      <Footer host={host.replace(/^www\./, "")} day={day} />
    </Page>
  );
}

function FixTable({ fixes }: { fixes: Fix[] }) {
  if (!fixes.length) return null;
  return (
    <Section title="Fixes at a glance" lead="Ranked by impact against effort: the points each score gains once the issue is fixed on every page.">
      <View style={s.thead} minPresenceAhead={30}>
        <Text style={[s.th, { width: 18 }]}>#</Text>
        <Text style={[s.th, { flex: 1 }]}>Fix</Text>
        <Text style={[s.th, { width: 56 }]}>Severity</Text>
        <Text style={[s.th, { width: 84 }]}>Impact</Text>
        <Text style={[s.th, { width: 64 }]}>Effort</Text>
        <Text style={[s.th, { width: 40, textAlign: "right" }]}>Pages</Text>
      </View>
      {fixes.map((f, i) => (
        <View key={f.checkId} style={s.tr} wrap={false}>
          <Text style={{ width: 18, color: C.faint }}>{i + 1}</Text>
          <Text style={{ flex: 1, paddingRight: 8 }}>{f.failing[0]!.title}</Text>
          <View style={[s.row, { width: 56 }]}>
            <Badge severity={f.severity} />
          </View>
          <Text style={{ width: 84, color: C.brandDeep, fontWeight: 600 }}>{impact(f)}</Text>
          <Text style={{ width: 64, color: C.muted }}>{EFFORT_LABELS[f.effort]}</Text>
          <Text style={{ width: 40, color: C.muted, textAlign: "right" }}>{`${f.failing.length}/${f.total}`}</Text>
        </View>
      ))}
    </Section>
  );
}

function Categories({ report }: { report: Report }) {
  const b = report.breakdown!;
  return (
    <Section title="Scores by category" lead="Each category's score out of 100, and how much it counts toward AEO and GEO.">
      {b.categories.map(({ category, score, rules }) => (
        <View key={category} style={s.tr} wrap={false}>
          <Text style={{ width: 110, fontWeight: 500 }}>{CATEGORY_NAMES[category]}</Text>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Meter value={score} tone={bandOf(score).tone} />
          </View>
          <Text style={{ width: 24, fontWeight: 700, textAlign: "right" }}>{score}</Text>
          <Text style={[s.small, { width: 150, textAlign: "right" }]}>
            {`${rules.reduce((n, r) => n + r.passed, 0)}/${rules.reduce((n, r) => n + r.total, 0)} passed · ${b.weights.aeo[category] ?? 0}% AEO · ${b.weights.geo[category] ?? 0}% GEO`}
          </Text>
        </View>
      ))}
    </Section>
  );
}

function Engines({ report }: { report: Report }) {
  const engines = report.breakdown!.engines;
  if (!engines?.length) return null;
  return (
    <Section
      title="AI engine readiness"
      lead="Estimated from this audit: whether each engine's crawlers may read the site, and how well it does on what that engine weighs most. Not a measure of whether an engine cites the site today."
    >
      <View wrap={false}>
        <View style={s.thead}>
          <Text style={[s.th, { width: 110 }]}>Engine</Text>
          <Text style={[s.th, { width: 150 }]}>Readiness</Text>
          <Text style={[s.th, { flex: 1 }]}>Crawlers in robots.txt</Text>
        </View>
        {engines.map((e) => (
          <View key={e.id} style={s.tr}>
            <View style={{ width: 110 }}>
              <Text style={{ fontSize: 9, lineHeight: 1.3, fontWeight: 600 }}>{e.name}</Text>
              <Text style={s.small}>{e.maker}</Text>
            </View>
            <View style={{ width: 150, paddingRight: 24 }}>
              <View style={[s.row, { alignItems: "center", marginBottom: 4 }]}>
                <Text style={{ fontSize: 9, lineHeight: 1.2, fontWeight: 700, marginRight: 6 }}>{e.score}</Text>
                <BandLabel score={e.score} />
              </View>
              <Meter value={e.score} tone={bandOf(e.score).tone} height={4} />
            </View>
            <View style={{ flex: 1 }}>
              {e.bots.map((bot) => (
                <View key={bot.token} style={[s.row, { alignItems: "center" }]}>
                  <Dot color={bot.allowed === 1 ? C.up : bot.allowed === 0 ? C.down : C.warn} size={4} />
                  <Text style={{ fontSize: 7.5, lineHeight: 1.5 }}>
                    <Text style={{ fontFamily: "GeistMono" }}>{bot.token}</Text>
                    <Text style={s.muted}>{bot.allowed === 1 ? " allowed" : bot.allowed === 0 ? " blocked" : " blocked on some pages"}</Text>
                  </Text>
                </View>
              ))}
              {e.capped && <Text style={[s.small, { color: C.down }]}>Capped at 40: its main crawler is blocked from the homepage.</Text>}
            </View>
          </View>
        ))}
      </View>
    </Section>
  );
}

// Words, not only colours, so the table reads in black and white too.
const OUTCOME: Record<Outcome, [string, string]> = {
  cited: ["Cited", C.up],
  consulted: ["Read only", C.warn],
  named: ["Named", C.brandDeep],
  absent: ["Not cited", C.faint],
  none: ["No answer", C.faint],
};

function Visibility({ report }: { report: Report }) {
  const measured = (report.breakdown?.measured ?? []).filter((m) => m.status !== "skipped");
  const total = overall(measured);
  if (!total) return null;
  const host = report.host.replace(/^www\./, "");
  const ours = (d: string) => d === host || d.endsWith(`.${host}`);
  const name = (m: VisibilitySummary) => ENGINE_NAMES[m.engine] ?? m.engine;
  const first = measured.find((m) => m.questions?.length)?.questions ?? []; // the same questions, in the same order, for every engine
  const questions = first.map((q) => q.question);
  const { market } = measured[0]!;
  const rivals = new Map<string, number>();
  for (const m of measured) for (const q of m.questions ?? []) for (const d of q.outcome ? q.cited : []) if (!ours(d)) rivals.set(d, (rivals.get(d) ?? 0) + 1);
  const top = [...rivals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6);
  return (
    <Section
      title="Measured in AI answers"
      lead={`We asked ${new Intl.ListFormat("en-GB").format(measured.map(name))} the same ${plural(questions.length, "question")} a customer${market ? ` in ${countryName(market.country)}` : ""} might ask, ${askedHow(first)}, and checked which sites the answers link to. Answers vary from run to run.`}
    >
      <View style={[s.row, { gap: 20, marginBottom: 14 }]} wrap={false}>
        <View style={{ width: 110 }}>
          <Text style={s.label}>{measured.length > 1 ? "All engines" : name(measured[0]!)}</Text>
          <Text style={{ fontSize: 30, lineHeight: 1, fontWeight: 700, marginTop: 6 }}>{`${total.score}%`}</Text>
          <Text style={[s.small, { marginTop: 4 }]}>{`Cited in ${total.cited} of ${total.answered} answers`}</Text>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          {measured.map((m) => (
            <View key={m.engine} style={[s.row, { alignItems: "center", gap: 10 }]}>
              <Text style={{ width: 70, fontWeight: 600 }}>{name(m)}</Text>
              <View style={{ flex: 1 }}>
                {m.score !== undefined ? <Meter value={m.score} tone="good" height={4} /> : <Text style={s.small}>Couldn&apos;t be measured</Text>}
              </View>
              <Text style={{ width: 80, textAlign: "right" }}>
                <Text style={{ fontWeight: 700 }}>{m.score !== undefined ? `${m.score}%` : "—"}</Text>
                <Text style={s.muted}>{m.score !== undefined ? `  ${m.cited} of ${m.answered}` : ""}</Text>
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={s.thead} minPresenceAhead={30}>
        <Text style={[s.th, { flex: 1 }]}>Question</Text>
        {measured.map((m) => (
          <Text key={m.engine} style={[s.th, { width: 54, textAlign: "center" }]}>
            {name(m)}
          </Text>
        ))}
      </View>
      {questions.map((question, i) => (
        <View key={i} style={s.tr} wrap={false}>
          <Text style={{ flex: 1, paddingRight: 8 }}>
            {question}
            {first[i]?.branded && <Text style={{ fontSize: 7, color: C.brandDeep, fontWeight: 600 }}>{"  BRANDED"}</Text>}
          </Text>
          {measured.map((m) => {
            const r = m.questions?.[i];
            const [word, color] = r?.outcome ? OUTCOME[r.outcome] : ["—", C.faint];
            return (
              <Text key={m.engine} style={{ width: 54, textAlign: "center", fontSize: 7.5, color, fontWeight: r?.outcome === "cited" ? 700 : 500 }}>
                {r?.position ? `${word} #${r.position}` : word}
              </Text>
            );
          })}
        </View>
      ))}
      <Text style={[s.small, { marginTop: 6 }]} wrap={false}>
        Cited #n: the answer links to the site, as its nth source. Read only: the engine read the site while searching but cited others.
        Named: the answer names the brand without a link. No answer: Google showed no AI Overview. —: couldn&apos;t be asked.
      </Text>
      {top.length > 0 && (
        <Text style={[s.small, { marginTop: 6 }]} wrap={false}>
          {`Cited instead: ${top.map(([domain, answers]) => `${domain} (${answers})`).join(", ")}`}
        </Text>
      )}
    </Section>
  );
}

function SinceLast({ report }: { report: Report }) {
  const { previous } = report;
  const b = report.breakdown!;
  if (!previous) return null;
  const change = previous; // fixed and regressed, compared on the server
  return (
    <Section title="Since the last audit" lead={`Compared with the audit of ${dayOf(previous.createdAt)}.`}>
      <View style={[s.row, { gap: 24, marginBottom: 8 }]}>
        {(
          [
            ["AEO", previous.aeoScore, b.aeo],
            ["GEO", previous.geoScore, b.geo],
          ] as const
        ).map(([name, from, to]) => (
          <View key={name} style={[s.row, { alignItems: "center", gap: 6 }]}>
            <Text style={{ fontWeight: 600 }}>{`${name} ${from ?? "—"} → ${to}`}</Text>
            <Change from={from} to={to} />
          </View>
        ))}
      </View>
      {change.fixed.length > 0 && <Text style={{ marginBottom: 3 }}>{`Fixed: ${change.fixed.map((c) => c.title).join(" · ")}`}</Text>}
      {change.regressed.length > 0 && <Text>{`New problems: ${change.regressed.map((c) => c.title).join(" · ")}`}</Text>}
      {!change.fixed.length && !change.regressed.length && <Text style={s.muted}>No check went from failing to passing, or back.</Text>}
    </Section>
  );
}

function Label({ children, detail }: { children: string; detail?: string }) {
  return (
    <Text style={[s.label, { marginTop: 9, marginBottom: 3 }]}>
      {children}
      {detail && <Text style={{ textTransform: "none", fontWeight: 400, letterSpacing: 0 }}>{`  ${detail}`}</Text>}
    </Text>
  );
}

function FixDetail({ fix, rank, origin }: { fix: Fix; rank: number; origin: string }) {
  const worst = fix.failing[0]!;
  return (
    <View style={{ paddingBottom: 18 }}>
      <View wrap={false}>
        <View style={[s.row, { alignItems: "center", backgroundColor: C.wash, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 8 }]}>
          <Text style={{ width: 18, fontWeight: 700, color: C.faint }}>{rank}</Text>
          <Badge severity={fix.severity} />
          <Text style={{ flex: 1, fontSize: 10.5, lineHeight: 1.3, fontWeight: 600, marginLeft: 7, paddingRight: 6 }}>{worst.title}</Text>
          <Chip strong>{impact(fix)}</Chip>
          <Chip>{EFFORT_LABELS[fix.effort]}</Chip>
        </View>
        <Text style={{ color: C.muted, marginTop: 6, marginHorizontal: 8 }}>{worst.why}</Text>
      </View>
      <View style={{ marginHorizontal: 8 }}>
        <View wrap={false}>
          <Label detail={fix.total > 1 ? `${fix.failing.length} of ${fix.total} pages` : undefined}>Where</Label>
          {fix.failing.slice(0, MAX_PLACES).map((f, i) => (
            <View key={i} style={{ marginBottom: 3 }}>
              {where(f.url, origin) === "/" ? (
                <Text style={{ fontSize: 8, lineHeight: 1.4, fontWeight: 600 }}>Homepage</Text>
              ) : (
                <Text style={{ fontFamily: "GeistMono", fontSize: 7.5, lineHeight: 1.4 }}>{where(f.url, origin)}</Text>
              )}
              <Text style={s.muted}>{f.evidence}</Text>
            </View>
          ))}
          {fix.failing.length > MAX_PLACES && <Text style={s.small}>{`…and ${plural(fix.failing.length - MAX_PLACES, "more page")}.`}</Text>}
        </View>
        {worst.fix && (
          <View wrap={false}>
            <Label>How to fix</Label>
            <Text>{worst.fix}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function Strengths({ report }: { report: Report }) {
  const { strengths } = report;
  if (!strengths.length) return null;
  return (
    <Section title="What's working" lead="Checks that pass on every page they apply to." keep={140}>
      {CATEGORIES.map((category) => {
        const items = strengths.filter((st) => st.category === category);
        if (!items.length) return null;
        return (
          <View key={category} style={{ marginBottom: 8 }} wrap={false}>
            <Text style={[s.label, { marginBottom: 3 }]}>{CATEGORY_NAMES[category]}</Text>
            {items.map((st) => (
              <View key={st.checkId} style={[s.row, { alignItems: "center" }]}>
                <Dot color={C.up} size={4} />
                <Text>
                  {st.title}
                  {st.count > 1 && <Text style={s.muted}>{` (all ${st.count} pages)`}</Text>}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </Section>
  );
}

function Appendix({ report }: { report: Report }) {
  const { pages, findings, origin, site } = report;
  const issues = (url: string) => findings.filter((f) => f.url === url && !f.passed).length;
  const sitemapUrls = site?.sitemaps.reduce((n, sm) => n + (sm.kind === "urlset" ? sm.count : 0), 0) ?? 0;
  return (
    <Section title="Appendix: what was checked" lead="Every page the audit read, and the site files crawlers look at first." keep={300}>
      {/* At most 21 pages are read, so the table fits on one page. */}
      <View wrap={false}>
        <View style={s.thead}>
          <Text style={[s.th, { flex: 1 }]}>Page</Text>
          <Text style={[s.th, { width: 60 }]}>Type</Text>
          <Text style={[s.th, { width: 70 }]}>Status</Text>
          <Text style={[s.th, { width: 40, textAlign: "right" }]}>Issues</Text>
        </View>
        {pages.map((p) => (
          <View key={p.id} style={s.tr}>
            <Text style={{ flex: 1, fontFamily: "GeistMono", fontSize: 7.5, lineHeight: 1.4, paddingRight: 8 }}>{where(p.url, origin)}</Text>
            <Text style={{ width: 60, color: C.muted }}>{p.facts.reason}</Text>
            <Text style={{ width: 70, color: C.muted }}>{p.statusCode ? `HTTP ${p.statusCode}` : (p.facts.error ?? "not loaded")}</Text>
            <Text style={{ width: 40, textAlign: "right", fontWeight: 600 }}>{issues(p.url)}</Text>
          </View>
        ))}
      </View>
      {site && (
        <View style={[s.row, { gap: 10, marginTop: 12 }]} wrap={false}>
          {[
            ["robots.txt", { ok: "Found", missing: "Not found", unreachable: "Unreachable" }[site.robots.state]],
            ["llms.txt", site.llmsTxt.status === 200 && !/html/i.test(site.llmsTxt.contentType ?? "") ? "Found" : "Not found"],
            ["Sitemap", sitemapUrls ? `${sitemapUrls.toLocaleString("en")} URLs` : site.sitemaps.some((sm) => sm.error) ? "Unreachable" : "Not found"],
          ].map(([name, value]) => (
            <View key={name} style={[s.card, { flex: 1, padding: 10 }]}>
              <Text style={s.label}>{name}</Text>
              <Text style={{ fontWeight: 600, marginTop: 2 }}>{value}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={[s.small, { marginTop: 14 }]} wrap={false}>
        How the scores work: every check has a severity worth points (critical 8, high 5, medium 3, low 1); a category scores the points it
        earned out of 100; AEO and GEO weight the categories as shown in Scores by category. Engine readiness is estimated from this audit;
        the AI answers are measured.
      </Text>
    </Section>
  );
}

function ReportPdf({ report }: { report: Report }) {
  const { host, fixes, origin, audit } = report;
  const day = dayOf(audit.createdAt);
  const bare = host.replace(/^www\./, "");
  return (
    <Document title={`AEO audit report: ${bare}`} author="FreeSERP" subject={`AEO & GEO audit of ${audit.origin}, ${day}`} creator="FreeSERP">
      <Cover report={report} />
      <Page size="A4" style={s.page}>
        <Header host={bare} />
        <FixTable fixes={fixes} />
        <Categories report={report} />
        <Visibility report={report} />
        <Engines report={report} />
        <SinceLast report={report} />
        {fixes.length > 0 && (
          <Section title="Fixes in detail" lead="Why each one matters, where it was found, and how to fix it." keep={150}>
            {fixes.map((fix, i) => (
              <FixDetail key={fix.checkId} fix={fix} rank={i + 1} origin={origin} />
            ))}
          </Section>
        )}
        <Strengths report={report} />
        <Appendix report={report} />
        <Footer host={bare} day={day} />
      </Page>
    </Document>
  );
}

/** Builds the report's PDF and downloads it, named after the site and day. Only for audits with scores. */
export async function downloadReportPdf(report: Report) {
  const blob = await pdf(<ReportPdf report={report} />).toBlob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `AEO audit ${report.host.replace(/^www\./, "")} ${report.audit.createdAt.slice(0, 10)}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}
