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
| Seed catalog | `data/catalog.json`, `catalog.schema.json` | 11 paid products across creative, office, audio, video, engineering, 3D and games; swap it with `--catalog` or `RVAI_CATALOG` |
| CLI | `src/cli.ts` | `rvai "..."`, `--offline`, `--demo`, `--json`, `--trace` |

Out of scope for now: a web UI, accounts, live web search, generating prototype code, and payments.

Next steps: a web UI, live sources (Wikidata for licenses and official sites, GitHub/GitLab for project health, Flathub/F-Droid/Homebrew/winget for install links, OpenGameArt and itch.io for openly licensed game assets), and a prototype builder that follows the clean-room rules below.

## Clean-room approach

RVAI and everything it helps people build follow these rules:

- **Original work only.** We describe the job a product does in our own words. We never copy a paid product's code, UI layouts, icons, art, sounds, text or levels.
- **No reverse engineering.** RVAI does not decompile, disassemble or reverse engineer paid software, and does not read leaked source code. Requests to do so are refused in code (`checkRequest`) and in Claude's instructions.
- **No trademarks in new work.** Paid product names appear only to say what an alternative replaces (nominative use), with a notice that they belong to their owners. Build plans never name the new tool after the paid product. A test checks that the build-plan concept does not repeat the product's name.
- **Public formats only.** Compatibility with file formats comes from public specifications or one's own test files.
- **No piracy, ever.** Links must be https and are checked against piracy markers (`isSafeUrl`). The whole result is audited before it is shown (`auditOutput`); anything that fails is dropped.

## License-respecting recommendations

- Every alternative carries its license as an SPDX identifier and a link to its official website, never a mirror.
- Free-of-charge software that is not open source (for example Photopea or the free edition of DaVinci Resolve) is shown with the license `Freeware` and labeled "free, not open source". Users can ask for open source only.
- Notes call out license details that matter, such as 0 A.D.'s art being CC BY-SA, or Ardour's official binaries being pay-what-you-want while its source is free.
- Each result ends with an attribution line: where the data came from, that it should be checked at the official site, and that product names are their owners' trademarks.
- Build plans tell people to keep license files, credit every component and asset in a CREDITS or NOTICE file, and choose an open-source license for their own project.

## Decision: not reusing morluto/rea

The reverse-engineering toolkit [morluto/rea](https://github.com/morluto/rea) came up as a possible starting point. We decided not to reuse any of its code, data or approach. RVAI's promise is that it never helps take apart or copy paid software, so building on a reverse-engineering toolkit would undercut that promise and the clean-room position above. RVAI works only from public information: what a product does, how it feels, and what free projects already offer.

## Open questions

- Should "free" keep including freeware that is not open source? The MVP shows both, labeled.
- Web app, chat bot, or both for the first public version?
- How to review catalog changes (proposed: every entry reviewed by a person before merge, with the official link and license checked).
