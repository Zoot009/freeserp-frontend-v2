// Runs a demo data generator (scripts/demo/<slug>.gen.ts): bundles it with esbuild
// and executes it. Generators import the backend's own pure code from the sibling
// freeserp-backend-v2 checkout, so a demo shows what the product really computes.
//
//   node scripts/demo/run.mjs scripts/demo/<slug>.gen.ts      (from freeserp-frontend-v2/)
//
// Backend modules can reach config at import time. The logger and env.ts are
// swapped for inert stubs (env.ts validates process.env the moment it loads), and
// a generator that pulls in the database or Redis clients is refused: those
// connect on import, and a generator must never touch a live service.

import { build } from "esbuild"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const entry = process.argv[2]
if (!entry) throw new Error("usage: node scripts/demo/run.mjs scripts/demo/<slug>.gen.ts")

const LOGGER = "const log = { trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child: () => log }\nexport const logger = log\nexport const childLogger = () => log\nexport default log"

const outfile = join(tmpdir(), `demo-gen-${process.pid}.mjs`)
await build({
  entryPoints: [resolve(entry)],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  logLevel: "error",
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  plugins: [
    {
      name: "backend-config",
      setup(b) {
        b.onResolve({ filter: /\/config\/(prisma|redis)$|^(@prisma\/client|ioredis|bullmq)$/ }, (args) => ({
          errors: [{ text: `demo generators must not import ${args.path} (from ${args.importer}): it connects to a live service` }],
        }))
        b.onResolve({ filter: /\/config\/(logger|env)$/ }, (args) => ({ path: args.path, namespace: "stub" }))
        b.onLoad({ filter: /logger$/, namespace: "stub" }, () => ({ contents: LOGGER, loader: "js" }))
        b.onLoad({ filter: /env$/, namespace: "stub" }, () => ({ contents: "export const env = {}\nexport const isProd = false", loader: "js" }))
      },
    },
  ],
})
await import(pathToFileURL(outfile).href)
