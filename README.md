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
request ─▶ guard input ─▶ analyze goal ─▶ compare features ─▶ recommend ─▶ guard output ─▶ result
              │ refuse        │ Claude, or                │ deterministic   │ picks, gaps,     │ drop unsafe
              │ piracy etc.   │ keywords as fallback      │ coverage scores │ discounts, plan  │ links/text
```

- **Orchestrator** (`src/orchestrator.ts`) runs the steps in order, validates each step's output with zod, retries, falls back, and keeps a trace.
- **Goal analyzer** (`src/analyzer/`) uses Claude structured output to turn free text into a goal profile. Without an API key, in `--offline` mode, or if Claude fails, a keyword analyzer takes over.
- **Feature comparison** (`src/compare.ts`) scores each alternative: must-haves 55%, nice-to-haves 20%, vibe 10%, platform 10%, learning curve against skill level 5%. Coverage is weighted by each feature's weight (1 to 3); full support counts 1, a plug-in 0.75, partial 0.5. Same input, same ranking.
- **Recommendations** (`src/recommend.ts`) return the top 3 picks with gaps and workarounds, official discounts for the original, and a plan for an original tool when the best pick covers under 70% of the must-haves.
- **Guardrails** (`src/guardrails.ts`) refuse cracking, piracy, license bypass, decompiling or reverse engineering, asset ripping and cheats, and audit every link in the output.
- **Seed catalog** (`data/catalog.json`) holds 11 paid products and their free alternatives, each with an SPDX license and official link.

## Usage

Needs Node 20 or newer.

```bash
npm install
npm run demo                      # offline demo, no API key needed
npx tsx src/cli.ts --offline "a cozy game like Minecraft for an old laptop"
npx tsx src/cli.ts --json --trace "free Office for my Mac"
npx tsx src/cli.ts --offline --catalog=examples/catalog.example.json "a free Figma"
```

To let Claude analyze requests, set `ANTHROPIC_API_KEY`. The default model is `claude-opus-5-5`; change it with `--model`. If a Claude call fails or is declined, RVAI retries once and then uses the keyword analyzer, and the trace says so.

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
