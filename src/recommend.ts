import type { BuildPlan, Catalog, CandidateScore, FeatureMatrix, GoalProfile, Pick, Product, Recommendation } from "./schemas.js";

/** Below this share of must-haves covered by the top pick, RVAI plans an original tool. */
export const BUILD_THRESHOLD = 0.7;
export const MAX_PICKS = 3;
export const DISCOVERED_PREFIX = "discovered-";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const CLEAN_ROOM_RULES = [
  "Describe the job to be done in your own words; never copy the paid product's code, UI layouts, icons, art, sounds or text.",
  "Do not decompile, disassemble or reverse engineer the paid product, and do not read its leaked source.",
  "Use your own name and branding; do not use the paid product's trademarks, logos or characters.",
  "Build only on components whose licenses allow it, keep their license files, and credit them in a NOTICE or CREDITS file.",
  "Use openly licensed assets (CC0, CC BY, CC BY-SA) and record the author and license of each one.",
  "Read and match file formats only from public specifications or your own test files.",
];

function whyText(c: CandidateScore, product: Product, profile: GoalProfile): string {
  const parts = [`covers ${pct(c.mustHaveCoverage)} of your must-haves`];
  if (c.platformMatch) parts.push("runs on your platform");
  else parts.push("is not available on the platform you named");
  parts.push(c.openSource ? `open source (${c.license})` : "free of charge but not open source");
  if (profile.vibe.length > 0 && c.vibeMatch === 1) parts.push("matches the vibe you described");
  else if (profile.vibe.length > 0 && c.vibeMatch > 0) parts.push("close to the vibe you described");
  if (c.learningFit < 0.5) parts.push("has a steep learning curve for a beginner");
  return `${c.name} ${parts.join(", ")}. A free option for what you would use ${product.name} for.`;
}

function toPick(c: CandidateScore, rank: number, product: Product, profile: GoalProfile): Pick {
  const alt = product.alternatives.find((a) => a.id === c.alternativeId)!;
  const label = (id: string) => product.features.find((f) => f.id === id)?.label ?? id;
  const order = (id: string) => (profile.mustHaves.includes(id) ? 0 : 1);
  const gapIds = [...c.missing, ...c.partial, ...c.plugin].sort((a, b) => order(a) - order(b));
  return {
    rank,
    name: c.name,
    url: c.url,
    license: c.license,
    openSource: c.openSource,
    score: c.score,
    mustHaveCoverage: c.mustHaveCoverage,
    platformMatch: c.platformMatch,
    why: whyText(c, product, profile),
    gaps: gapIds.map((id) => ({
      featureId: id,
      label: label(id),
      status: c.missing.includes(id) ? ("missing" as const) : c.plugin.includes(id) ? ("plugin" as const) : ("partial" as const),
      workaround: alt.workarounds?.[id] ?? null,
    })),
    ...(alt.notes ? { notes: alt.notes } : {}),
  };
}

function buildPlan(profile: GoalProfile, product: Product | undefined, top: CandidateScore | undefined): BuildPlan {
  const label = (id: string) => product?.features.find((f) => f.id === id)?.label ?? id;
  const gaps = top
    ? profile.mustHaves.filter((id) => !top.covered.includes(id)).map(label)
    : profile.mustHaves.length > 0
      ? profile.mustHaves.map(label)
      : profile.tasks;
  const vibe = profile.vibe.length > 0 ? ` with a ${profile.vibe.join(", ")} vibe` : "";
  const what = product ? `${product.category} tool` : "tool";
  const reason = !product
    ? "This request is not in RVAI's catalog yet, so there is no vetted free alternative to rank."
    : !top
      ? "No free alternative in the catalog fits your filters."
      : !top.platformMatch
        ? `None of the free alternatives in the catalog run on ${profile.platforms.join(" or ")}.`
        : `The best free pick, ${top.name}, covers only ${pct(top.mustHaveCoverage)} of your must-haves (the bar is ${pct(BUILD_THRESHOLD)}).`;

  const foundation = top
    ? [`Extend ${top.name} (${top.license}) through its plug-in or scripting system if it has one, so you only build the missing parts.`]
    : [];
  foundation.push(
    "Pick permissively licensed libraries (MIT, Apache-2.0, BSD) or copyleft ones (GPL, LGPL, MPL) whose terms you are happy to follow; check each id on the SPDX license list.",
    "Find assets on openly licensed sources such as OpenGameArt or Wikimedia Commons, and record each license.",
  );

  return {
    reason,
    concept: `An original ${what}${vibe} that helps with: ${(gaps.length ? gaps : profile.tasks).join(", ") || "the job you described"}. It gets the same job done in its own way, under its own name.`,
    featuresToBuild: gaps,
    suggestedFoundation: foundation,
    steps: [
      "Write a one-page brief in your own words: who it is for, the jobs it does, and the vibe it should have.",
      "List the smallest set of features that makes it useful, starting with the gaps above.",
      "Choose the base (an existing open-source project or libraries) and confirm every license is compatible with yours.",
      "Build a rough prototype of one gap and try it with a few real users.",
      "Choose an open-source license for your project, add LICENSE and CREDITS files, and publish the code.",
    ],
    cleanRoomRules: CLEAN_ROOM_RULES,
  };
}

export function buildRecommendation(
  profile: GoalProfile,
  matrix: FeatureMatrix,
  catalog: Catalog,
): Recommendation {
  const product = catalog.products.find((p) => p.id === matrix.productId);
  const ranked = matrix.candidates.slice(0, MAX_PICKS);
  const picks = product ? ranked.map((c, i) => toPick(c, i + 1, product, profile)) : [];
  const top = matrix.candidates[0];
  const needsBuild = !product || !top || top.mustHaveCoverage < BUILD_THRESHOLD || !top.platformMatch;

  const discovered = product?.id.startsWith(DISCOVERED_PREFIX) ?? false;
  return {
    status: "ok",
    query: profile.query,
    source: discovered ? "discovered" : "catalog",
    target: product ? { id: product.id, name: product.name, vendor: product.vendor } : null,
    picks,
    discounts: product?.officialDiscounts ?? [],
    buildPlan: needsBuild ? buildPlan(profile, product, top) : null,
    attribution: discovered
      ? "These alternatives were found live by Claude because the request isn't in RVAI's catalog. Each link was checked to load, but licenses and features were not reviewed by a person, so check the official site before relying on them. Product names are trademarks of their owners and are used only to say what an alternative replaces."
      : `Licenses and links come from RVAI's seed catalog${catalog.version ? ` (version ${catalog.version})` : ""}; check each project's official site for current terms. Product names are trademarks of their owners and are used only to say what an alternative replaces.`,
  };
}
