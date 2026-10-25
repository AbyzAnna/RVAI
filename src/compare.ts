import type { Alternative, CandidateScore, FeatureMatrix, GoalProfile, Platform, Product, Support } from "./schemas.js";

export const WEIGHTS = { mustHave: 0.55, niceToHave: 0.2, vibe: 0.1, platform: 0.1, learning: 0.05 } as const;

/** How much a level of support counts toward coverage. A plug-in works but takes setup. */
export const SUPPORT_CREDIT: Record<Support, number> = { full: 1, plugin: 0.75, partial: 0.5 };

const round = (n: number) => Math.round(n * 1000) / 1000;

// A browser app works anywhere a desktop browser does.
const BROWSER_PLATFORMS: Platform[] = ["web", "windows", "mac", "linux"];

function runsOn(alt: Alternative, wanted: Platform[]): boolean {
  if (wanted.length === 0) return true;
  const available = alt.platforms.includes("web") ? new Set([...alt.platforms, ...BROWSER_PLATFORMS]) : new Set(alt.platforms);
  return wanted.some((p) => available.has(p));
}

/** Weighted share of the wanted features an alternative supports (1 when nothing is wanted). */
function coverage(ids: string[], alt: Alternative, weightOf: (id: string) => number): number {
  const total = ids.reduce((sum, id) => sum + weightOf(id), 0);
  if (total === 0) return 1;
  const points = ids.reduce((sum, id) => {
    const support = alt.features[id];
    return sum + (support ? SUPPORT_CREDIT[support] * weightOf(id) : 0);
  }, 0);
  return points / total;
}

const LEARNING_FIT: Record<GoalProfile["skillLevel"], Record<Alternative["learningCurve"], number>> = {
  beginner: { easy: 1, moderate: 0.6, steep: 0.2 },
  intermediate: { easy: 1, moderate: 1, steep: 0.7 },
  advanced: { easy: 1, moderate: 1, steep: 1 },
};

export function scoreAlternative(profile: GoalProfile, alt: Alternative, product?: Product): CandidateScore {
  const weightOf = (id: string) => product?.features.find((f) => f.id === id)?.weight ?? 1;
  const wanted = [...profile.mustHaves, ...profile.niceToHaves];
  const mustHaveCoverage = coverage(profile.mustHaves, alt, weightOf);
  const niceToHaveCoverage = coverage(profile.niceToHaves, alt, weightOf);
  const platformMatch = runsOn(alt, profile.platforms);
  // No stated vibe counts as neutral, so it neither helps nor hurts the ranking.
  const vibeMatch = profile.vibe.length === 0 ? 0.5 : profile.vibe.filter((v) => alt.vibe.includes(v)).length / profile.vibe.length;
  const learningFit = LEARNING_FIT[profile.skillLevel][alt.learningCurve];

  const score =
    WEIGHTS.mustHave * mustHaveCoverage +
    WEIGHTS.niceToHave * niceToHaveCoverage +
    WEIGHTS.vibe * vibeMatch +
    WEIGHTS.platform * (platformMatch ? 1 : 0) +
    WEIGHTS.learning * learningFit;

  const withSupport = (s: Support) => wanted.filter((id) => alt.features[id] === s);
  return {
    alternativeId: alt.id,
    name: alt.name,
    license: alt.license,
    openSource: alt.openSource,
    url: alt.url,
    platformMatch,
    mustHaveCoverage: round(mustHaveCoverage),
    niceToHaveCoverage: round(niceToHaveCoverage),
    vibeMatch: round(vibeMatch),
    learningFit,
    score: round(score),
    covered: withSupport("full"),
    plugin: withSupport("plugin"),
    partial: withSupport("partial"),
    missing: wanted.filter((id) => !alt.features[id]),
  };
}

/** Deterministic feature matrix: same profile and catalog always give the same ranking. */
export function compareAlternatives(profile: GoalProfile, product: Product | undefined): FeatureMatrix {
  if (!product) return { productId: null, features: [], candidates: [] };
  const candidates = product.alternatives
    .filter((alt) => !profile.openSourceOnly || alt.openSource)
    .map((alt) => scoreAlternative(profile, alt, product))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.platformMatch) - Number(a.platformMatch) ||
        Number(b.openSource) - Number(a.openSource) ||
        a.name.localeCompare(b.name),
    );
  return {
    productId: product.id,
    features: product.features
      .filter((f) => profile.mustHaves.includes(f.id) || profile.niceToHaves.includes(f.id))
      .map((f) => ({ id: f.id, label: f.label, weight: f.weight, mustHave: profile.mustHaves.includes(f.id) })),
    candidates,
  };
}
