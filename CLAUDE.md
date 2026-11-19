# CLAUDE.md — freeserp-frontend-v2

The customer dashboard (Next.js 16, React 19, next-intl). `/api/*` is rewritten to the backend
(`BACKEND_URL`, default `http://localhost:3003`).

## Checks

```bash
npx tsc --noEmit   # no typecheck script; components/aeo/report-pdf.tsx errors are pre-existing
npm run test       # vitest: lib/**/*.test.ts, components/**/*.test.ts
```

- Check port 3000 before `npm run dev` (`ss -ltnp | grep :3000`). It is often already running,
  and Next refuses a second dev server for this directory.
- `next build` kills a running `npm run dev` here, so prefer `tsc` to check a change.

## Demo reports

Every tool gets a read-only Nike demo, generated in-process under `lib/demo/`. To build or change
one, follow `/demo-report <tool-slug>` (`.claude/skills/demo-report/SKILL.md`). It holds the
rules, the shared files that tool PRs must not edit, and the tracker of who is building which
tool.
