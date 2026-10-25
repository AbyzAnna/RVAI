# RVAI: plan and legal approach

The full product and technical plan lives in [this Claude doc](https://claude.ai/artifact/S7VCrfjgiLuzHHdpCDP8U8). This file summarizes it and records how RVAI stays on the right side of copyright, trademark and license law.

## The idea

People who can't afford paid software or games describe what they want in plain words. RVAI:

1. works out the goal: the paid product they have in mind, the must-have features, their platform, skill level and the feel they want;
2. compares free and open-source alternatives feature by feature, with coverage scores;
3. returns ranked picks, what each one is missing, workarounds, and official discounts for the original;
4. when even the best pick covers less than 70% of the must-haves, outlines an original tool to fill the gap.

The goal is to help people do the same job, not get the same product. RVAI is an original idea. It is not derived from, and does not reuse code from, any existing alternatives directory or software-cloning tool.

## MVP scope (this repository)

| Part | File | Notes |
| --- | --- | --- |
| Orchestrator | `src/orchestrator.ts` | Runs the steps in order, validates each output with zod, retries, falls back, keeps a trace |
| Goal analyzer | `src/analyzer/` | Claude structured output (`claude-opus-5-5`), with a keyword analyzer when there is no API key, in offline mode, or on failure |
| Feature comparison | `src/compare.ts` | Plain deterministic code: must-haves 55%, nice-to-haves 20%, vibe 10%, platform 10%, learning curve 5%; coverage weighted by feature weight, with full 1, plug-in 0.75, partial 0.5 |
| Recommendations | `src/recommend.ts` | Top 3 picks with gaps and workarounds, official discounts, build plan under 70% coverage |
| Guardrails | `src/guardrails.ts` | Refuses piracy, license bypass, reverse engineering, asset ripping and cheats; audits every outgoing link and string |
| Live discovery | `src/discover.ts` | For requests outside the catalog: Claude suggests alternatives, and only those with a safe https link that loads are shown, labeled as not human-reviewed |
| Starter kit | `src/scaffold.ts` | `--scaffold DIR` writes a brief, clean-room rules, a credits file and a license note for an original project |
| App Rebuilder | `src/rebuild.ts`, `src/rebuild-templates.ts`, `ui/rebuild.html` | Name an app; research agents run in parallel; the person picks features, mods, a model and their system; RVAI writes one original, self-contained file that runs on that system (see below) |
| Web page | `web/index.html`, `src/server.ts` | `npm run web`; same pipeline as the CLI |
| Seed catalog | `data/catalog.json`, `catalog.schema.json` | 15 paid products across creative, office, audio, video, engineering, 3D, game development, security and games; swap it with `--catalog` or `RVAI_CATALOG` |
| CLI | `src/cli.ts` | `rvai "..."`, `--offline`, `--demo`, `--json`, `--trace` |

Out of scope for now: accounts and payments.

Next steps: live sources (Wikidata for licenses and official sites, GitHub/GitLab for project health, Flathub/F-Droid/Homebrew/winget for install links, OpenGameArt and itch.io for openly licensed game assets), and a prototype builder that follows the clean-room rules below.

## Clean-room approach

RVAI and everything it helps people build follow these rules:

- **Original work only.** We describe the job a product does in our own words. We never copy a paid product's code, UI layouts, icons, art, sounds, text or levels.
- **No reverse engineering.** RVAI does not decompile, disassemble or reverse engineer paid software, and does not read leaked source code. Requests to do so are refused in code (`checkRequest`) and in Claude's instructions.
- **No trademarks in new work.** Paid product names appear only to say what an alternative replaces (nominative use), with a notice that they belong to their owners. Build plans never name the new tool after the paid product. A test checks that the build-plan concept does not repeat the product's name.
- **Public formats only.** Compatibility with file formats comes from public specifications or one's own test files.
- **No piracy, ever.** Links must be https and are checked against piracy markers (`isSafeUrl`). The whole result is audited before it is shown (`auditOutput`); anything that fails is dropped.

## App Rebuilder: rebuilding from public information

The Rebuild page (`/ui/rebuild.html`) lets someone type the name of an app or website and get their own original version as **one file** that runs on their computer.

1. **Research, in parallel.** Three agents run side by side, each as its own request so the page shows each one finish: the Product Profiler (official name, site, category, audience), the Feature Mapper (user-visible features, core ones marked) and the Stack Detective (a likely tech stack, each guess tied to a public signal such as job posts, engineering blogs or open-source repos the company publishes). The Link Checker then shows the official site only if it is a safe https link that loads.
2. **Questions.** The person ticks the features they want, adds their own ideas as "mods", picks the AI model (OpenRouter: Claude, GPT, Gemini, DeepSeek, Qwen) and confirms their system (OS and processor are auto-detected) and the kind of file: an HTML app that opens in any browser, or a Python desktop window using only the standard library.
3. **Build.** The Namer picks an original name, the App Builder writes the whole app in one file with the chosen model, and the File Checker makes sure it is complete, loads nothing from the internet, needs no extra packages, and contains no piracy terms or unsafe links. If the model's file fails twice, RVAI returns a working offline template instead, so the person always gets a file. The File Checker also compiles every script in the file without running it; a file with a script error is rejected and the model is told what was wrong on its retry.
   Games are built on RVAI's own block-building game engine (`src/game-engine.ts`, written from scratch for RVAI and tested), so they always load and play: the chosen model designs the game (original block names, colors, world style, which systems are on), and the engine turns that design into the file. The person's mods and wishes (for example co-op, low-spec mode, a blue theme) switch on the matching systems.
4. **Naming.** Each file is titled with its own name, then what it is an alternative to and the mods it adds, for example "BlockForge (alternative to Minecraft · mods: co-op on LAN, low-spec mode)". The original name is used only to say what the app replaces; the app's own name may never contain it.

How this stays clean-room:

- **Public information only.** Agents are told to use the official site, public docs, store listings, press and reviews, and never source code, private APIs or anything from decompiling. The tech stack is labeled as an educated guess.
- **No binaries, no downloads.** RVAI never downloads, decompiles, disassembles or inspects the original app. We considered adding binary analysis (as morluto/rea does) and decided against it.
- **Original code and design.** The builder only receives a plain list of features, and is told not to reproduce any product's code, screens, logos, icons, artwork, sounds, wording or name.
- **Notice in every file.** The top of each file says it is original code made with RVAI, that it is not affiliated with or endorsed by the original's owner, and how to run it.
- **Same refusals.** Names, features, mods and notes all go through `checkRequest` (cracks, license bypass, decompiling, asset ripping, cheats) and the prompt-injection scan before any model sees them.

## License-respecting recommendations

- Every alternative carries its license as an SPDX identifier and a link to its official website, never a mirror.
- Free-of-charge software that is not open source (for example Photopea or the free edition of DaVinci Resolve) is shown with the license `Freeware` and labeled "free, not open source". Users can ask for open source only.
- Notes call out license details that matter, such as 0 A.D.'s art being CC BY-SA, or Ardour's official binaries being pay-what-you-want while its source is free.
- Each result ends with an attribution line: where the data came from, that it should be checked at the official site, and that product names are their owners' trademarks.
- Build plans tell people to keep license files, credit every component and asset in a CREDITS or NOTICE file, and choose an open-source license for their own project.

## Decision: not reusing morluto/rea

The reverse-engineering toolkit [morluto/rea](https://github.com/morluto/rea) came up as a possible starting point. We decided not to reuse any of its code, data or approach. The App Rebuilder covers the useful part of the idea, turning an existing product into a list of features to rebuild, using public information instead of the product's binaries. RVAI's promise is that it never helps take apart or copy paid software, so building on a reverse-engineering toolkit would undercut that promise and the clean-room position above. RVAI works only from public information: what a product does, how it feels, and what free projects already offer.

## Open questions

- Should "free" keep including freeware that is not open source? The MVP shows both, labeled.
- Web app, chat bot, or both for the first public version?
- How to review catalog changes (proposed: every entry reviewed by a person before merge, with the official link and license checked).
