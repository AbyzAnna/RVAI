# RVAI

RVAI helps people who can't afford expensive software or games find free, legal alternatives, see what each one is missing, and plan an original tool when nothing free is good enough. The goal is to make technology accessible to everyone without copying or cracking paid software.

```bash
npx tsx src/cli.ts "I need something like Photoshop for my Linux laptop, with layers and masks"
```

```
Free alternatives to Adobe Photoshop

1. GIMP  [score 0.89, must-haves 100%]
   GPL-3.0-or-later  https://www.gimp.org
   GIMP covers 100% of your must-haves, runs on your platform, open source (GPL-3.0-or-later). ...
   - Partial: RAW photo editing. Workaround: Open RAW files through darktable or RawTherapee ...
   - Via plug-in: Content-aware fill / healing. Workaround: Use the Heal tool or the Resynthesizer plug-in (GPL).
```

## How it works

```
request ─▶ guard input ─▶ analyze goal ─▶ (discover) ─▶ compare features ─▶ recommend ─▶ guard output ─▶ result
              │ refuse        │ Claude, or      │ only when not   │ deterministic   │ picks, gaps,     │ drop unsafe
              │ piracy etc.   │ keywords        │ in the catalog  │ coverage scores │ discounts, plan  │ links/text
```

- **Orchestrator** (`src/orchestrator.ts`) runs the steps in order, validates each step's output with zod, retries, falls back, and keeps a trace.
- **Goal analyzer** (`src/analyzer/`) uses Claude structured output, through the Anthropic API or OpenRouter, to turn free text into a goal profile. Without an API key, in `--offline` mode, or if Claude fails, a keyword analyzer takes over.
- **Feature comparison** (`src/compare.ts`) scores each alternative: must-haves 55%, nice-to-haves 20%, vibe 10%, platform 10%, learning curve against skill level 5%. Coverage is weighted by each feature's weight (1 to 3); full support counts 1, a plug-in 0.75, partial 0.5. Same input, same ranking.
- **Recommendations** (`src/recommend.ts`) return the top 3 picks with gaps and workarounds, official discounts for the original, and a plan for an original tool when the best pick covers under 70% of the must-haves.
- **Guardrails** (`src/guardrails.ts`) refuse cracking, piracy, license bypass, decompiling or reverse engineering, asset ripping and cheats, and audit every link in the output.
- **Live discovery** (`src/discover.ts`) looks up alternatives for requests outside the catalog and checks every link before showing it.
- **Seed catalog** (`data/catalog.json`) holds 15 paid products and their free alternatives, each with an SPDX license and official link.
- **Web app** (`ui/`, served by `src/server.ts` at `/ui/`) and **CLI** (`src/cli.ts`) both run the same pipeline. A plain fallback page lives at `/simple`.

## Usage

Needs Node 20 or newer.

```bash
npm install
npm run web                       # open http://localhost:3000 (the RVAI web app, wired to the backend)
npm run demo                      # offline demo, no API key needed
npx tsx src/cli.ts --offline "a cozy game like Minecraft for an old laptop"
npx tsx src/cli.ts --json --trace "free Office for my Mac"
npx tsx src/cli.ts --offline --catalog=examples/catalog.example.json "a free Figma"
npx tsx src/cli.ts --scaffold my-tool "Photoshop with generative AI fill for raw photos"
```

**Live discovery.** When a request isn't in the catalog (say, "edit and sign PDFs like Acrobat") and an API key is set, RVAI asks Claude for free alternatives, then keeps only the ones whose official https link passes the guardrails and actually loads. These results are labeled as found live and not reviewed by a person. Turn it off with `--no-discover`.

**Starter kit.** `--scaffold DIR` writes an empty folder with a project brief in plain words, the clean-room rules, a credits file to fill in and a note on choosing a license, so building an original tool starts on the right foot.

To let Claude analyze requests, give RVAI a key in the environment or in a `.env` file in the folder you run it from (`.env` is gitignored, so keys never get committed):

```bash
# Anthropic API directly (model claude-opus-5-5)
ANTHROPIC_API_KEY=...
# or Claude through OpenRouter (model anthropic/claude-opus-5.5)
OPENROUTER_API_KEY=...
```

If both are set, RVAI uses the Anthropic API. Change the model with `--model`. If a call fails or is declined, RVAI retries once and then uses the keyword analyzer, and the trace (`--trace`) says which provider answered or why it fell back.

Build and run the compiled CLI:

```bash
npm run build
node dist/cli.js --offline "something like AutoCAD"
```

Use it as a library:

```ts
import { run, formatResult } from "rvai";

const { result, trace } = await run("I want to make beats like in Ableton", { offline: true });
console.log(formatResult(result));
```

## Tests

```bash
npm test
```

The tests cover the catalog (including the MVP bar: for every seed product the top pick covers at least 70% of its core must-haves, and every link is an official https link), the guardrails, both analyzers (Claude through a fake client), the scoring, the recommendations, the orchestrator's retry and fallback paths, and the CLI.

## Catalog format

A catalog is a JSON file shaped `{ "products": [...] }`, described by [catalog.schema.json](catalog.schema.json). RVAI uses `data/catalog.json` unless you pass `--catalog=file.json` or set `RVAI_CATALOG`. See [examples/catalog.example.json](examples/catalog.example.json) for a small one.

- **Product**: `id`, `name`, `aliases`, `category`, `vibe`, `features`, `alternatives`, and optional `vendor` and `officialDiscounts` (`name`, https `url`, `eligibility`).
- **Feature**: `id`, `label`, `keywords` (used by the offline analyzer), `weight` from 1 to 3. List core features first; the analyzer uses the first four when a request names none.
- **Alternative**: `id`, `name`, official https `url`, `license` (an SPDX id, or `Freeware` for free software that isn't open source), `openSource`, `platforms`, `learningCurve` (`easy`, `moderate`, `steep`), `features` (a map from feature id to `full`, `partial` or `plugin`; anything not listed counts as missing), `vibe`, and optional `workarounds` (feature id to text) and `notes`.

The catalog is validated on load, so a typo in a feature id fails fast. After changing the zod schema in `src/schemas.ts`, run `npm run schema` to regenerate `catalog.schema.json`; a test checks the two match.

## Legal

Read [DISCLAIMER.md](DISCLAIMER.md) and [PLAN_AND_LEGAL.md](PLAN_AND_LEGAL.md) for the clean-room approach and how RVAI respects licenses and trademarks. Product names are trademarks of their owners and are used only to say what an alternative replaces.

RVAI is released under the [MIT License](LICENSE).

## RVAI web interface (`ui/`)

The goal is to make technology accessible to everyone without simply copying or cracking paid software.

### Mission

RevAI helps someone get the tool they need in three steps, in order:

1. **Find existing alternatives**: free, open, or legitimately accessible projects that already do the job.
2. **Extend a suitable project**: when something close exists, adapt or build on it instead of starting over.
3. **Create an original prototype**: when nothing fits, sketch a new one (websites included).

### Team responsibilities

- **Claude**: implements the UI.
- **Codex**: orchestrates, reviews, and tests.
- **Anna**: owns the backend and AI generation.

### Initial catalog foundation

See [catalog setup and scope](docs/catalog-foundation.md) and [backend handoff](docs/integration.md). This is role 1 groundwork; the backend and interface remain in development.

### Interface preview

Serve the repository root and open the UI:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Then visit http://127.0.0.1:4173/ui/ .

#### Connect Anna's backend (live mode)

One command serves the UI and the backend on the same origin:

```sh
npm install && npm run web            # http://127.0.0.1:3000/ui/ (keyword analyzer without an API key; Claude with one in .env)
```

When the page is served this way it finds `GET /api/health` and switches **Use connected agent** on by itself (untick it in **Connection settings** to go back to the scripted demo; the choice is remembered). The Python dev proxy still works if you prefer to serve the UI separately:

```sh
python3 scripts/dev_server.py         # UI on http://127.0.0.1:4173/ui/, /api/* -> :3000 (--api to change)
```

With the proxy, open **Connection settings** in Innovate, keep the endpoint `/api/recommend` and tick **Use connected agent**. `ui/rvai-adapter.js` maps her `{result, trace}` into the chat, the Alternatives cards (gaps and workarounds), the Plan tab (when she returns a `buildPlan`) and a refusal with legal options. Her trace is shown as reported, and nothing is invented locally. The fixtures in `docs/examples/recommend.*.json` are real responses from her server. If the backend is down, the chat shows a 502 with Retry and no scripted fallback. No frontend installation or API key required. See [UI connection contract](docs/ui-api-contract.md), [role 1 requirements](docs/role-1-requirements.md), and [today’s workflow](docs/today-workflow.md).

What the preview is and is not:

- The chat conversation is a **scripted local demo, not AI**: goal → purpose → features → device limits → catalog alternatives (evidence, unknowns, exclusions) → Find/Extend (pick a base project) or Create → plan with acceptance check. Guided revisions recompute everything.
- For the website Create route, after reviewing the plan you can press **Create demo website template** to get a sandboxed preview and an HTML download. It is a deterministic local template, **not AI generation**.
- CAD/game/other Create routes are **proposals only** until Anna's agent is connected.
- **Live mode with Anna's `/api/recommend` was checked in Chrome on 2026-10-25** against `npm run web` in offline mode (keyword analyzer, no API key): a recommendation with a build plan, a refusal, and backend-down. Claude-backed analysis and live discovery were not exercised. Any other endpoint URL still receives the *proposed* `0.2-draft` envelope ([contract](docs/conversational-product-contract.md)). See the [UI build report](docs/claude-ui-build-report.md).

### Checks

CI (`.github/workflows/catalog-checks.yml`) runs with no dependency installs:

- Python catalog/metadata tests: `python -m unittest discover -s tests -v`
- JSON validation of `data/*.json`
- Syntax check of every `ui/*.js` file as an ES module
- UI Node tests: `node --test ui/*.test.mjs` (website template, shell, backend adapter)
- Dev proxy test: `tests/test_dev_server.py` (part of the unittest run)
