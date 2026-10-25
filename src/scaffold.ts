import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLEAN_ROOM_RULES } from "./recommend.js";
import type { Recommendation } from "./schemas.js";

/**
 * Writes a starter folder for an original project: a brief in plain words, the clean-room rules,
 * a credits file to fill in, and a note on choosing a license. It never copies anything from the
 * paid product, and the files avoid its name except to say what the project replaces.
 */
export function scaffoldProject(rec: Recommendation, dir: string): string[] {
  if (existsSync(dir) && readdirSync(dir).length > 0) throw new Error(`${dir} is not empty`);
  mkdirSync(dir, { recursive: true });

  const plan = rec.buildPlan;
  const best = rec.picks[0];
  const features = plan?.featuresToBuild.length
    ? plan.featuresToBuild
    : (best?.gaps.map((g) => g.label) ?? []);
  const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- (add the features you need)");

  const files: Record<string, string> = {
    "README.md": `# My original project

A free tool for: ${rec.query}

This project was started with [RVAI](https://github.com/AbyzAnna/RVAI). It is an original work: it does a similar job in its own way, with its own name, code and art.

Start with [BRIEF.md](BRIEF.md), keep [CLEAN_ROOM.md](CLEAN_ROOM.md) in mind, and record every library and asset in [CREDITS.md](CREDITS.md).
`,
    "BRIEF.md": `# Brief

Fill this in using your own words. Do not paste text, screenshots or layouts from any paid product.

## Who it is for

(Who will use it, and what can't they afford today?)

## The job it does

${plan?.concept ?? `A free way to ${rec.query}.`}

## First features to build

${list(features)}

## How it should feel

(A few words on the vibe: simple, cozy, professional, playful...)

## What already exists

${rec.picks.length ? rec.picks.map((p) => `- ${p.name} (${p.license}): ${p.url}`).join("\n") : "- Nothing suitable was found."}

${best ? `Consider building on or contributing to ${best.name} instead of starting from zero, if its license fits your plans.` : ""}
`,
    "CLEAN_ROOM.md": `# Clean-room rules

${CLEAN_ROOM_RULES.map((r) => `- ${r}`).join("\n")}
`,
    "CREDITS.md": `# Credits

List every library, font, icon, image, sound and model you use, with its author, license and link.

| What | Author | License | Link |
| --- | --- | --- | --- |
| | | | |
`,
    "LICENSE-CHOICE.md": `# Choosing a license

Pick an open-source license before you publish, then replace this file with a LICENSE file containing its full text.

- **MIT** or **Apache-2.0**: anyone can reuse your code, even in closed products.
- **GPL-3.0-or-later**: anyone can reuse it, but changed versions must stay open source.
- **AGPL-3.0-or-later**: like GPL, and also covers software offered as a web service.

If you build on an existing project, your license must be compatible with its license. See https://choosealicense.com and https://spdx.org/licenses/.
`,
  };

  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return Object.keys(files);
}
