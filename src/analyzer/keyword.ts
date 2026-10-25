import type { Catalog, GoalProfile, Platform, Product } from "../schemas.js";

const PLATFORM_WORDS: Array<[RegExp, Platform[]]> = [
  [/\b(windows|win ?1[01]|pc)\b/i, ["windows"]],
  [/\b(mac|macbook|macos|imac|os x)\b/i, ["mac"]],
  [/\b(linux|ubuntu|fedora|debian|mint|arch)\b/i, ["linux"]],
  // Chromebooks run web apps and, through their Linux container, Linux apps.
  [/\b(chromebook|chromeos|chrome os)\b/i, ["web", "linux"]],
  [/\b(browser|web)\b/i, ["web"]],
  [/\bandroid\b/i, ["android"]],
  [/\b(ipad|iphone|ios)\b/i, ["ios"]],
];

export const VIBE_WORDS: Record<string, string[]> = {
  cozy: ["cozy", "cosy", "chill", "relaxing", "calm"],
  playful: ["playful", "fun"],
  simple: ["simple", "easy", "basic", "lightweight"],
  friendly: ["friendly", "beginner", "intuitive"],
  professional: ["professional", "industry"],
  clean: ["clean", "minimal", "minimalist"],
  classic: ["classic", "retro", "old-school", "nostalgic"],
  modern: ["modern", "sleek"],
  creative: ["creative", "artistic"],
  strategic: ["strategic", "strategy", "tactical"],
  beautiful: ["beautiful", "pretty", "gorgeous"],
  familiar: ["familiar", "same layout", "looks like", "feels like"],
  technical: ["technical", "powerful"],
  fast: ["fast", "quick", "snappy"],
  blocky: ["blocky", "voxel", "pixel"],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (text: string, word: string) => new RegExp(`(^|[^a-z0-9])${escape(word.toLowerCase())}([^a-z0-9]|$)`, "i").test(text);

/** Finds the paid product the person names, preferring the longest matching alias. */
export function detectProduct(catalog: Catalog, query: string): Product | undefined {
  let best: { product: Product; len: number } | undefined;
  for (const product of catalog.products) {
    for (const alias of [product.name, ...product.aliases]) {
      if (hasWord(query, alias) && (!best || alias.length > best.len)) best = { product, len: alias.length };
    }
  }
  if (best) return best.product;

  // A free tool named instead ("something like Blender"): compare against what it replaces.
  for (const product of catalog.products) {
    for (const alt of product.alternatives) {
      const names = [alt.id, alt.name.split(" (")[0], ...(alt.name.match(/\(formerly ([^)]+)\)/)?.slice(1) ?? [])];
      if (names.some((n) => n.length > 2 && hasWord(query, n))) return product;
    }
  }

  // No name given: infer from feature keywords ("I want to make beats" -> a music product).
  let top: { product: Product; hits: number } | undefined;
  let tie = false;
  for (const product of catalog.products) {
    const hits = product.features.filter((f) => f.keywords.some((k) => hasWord(query, k))).length;
    if (!top || hits > top.hits) {
      top = { product, hits };
      tie = false;
    } else if (hits === top.hits) tie = true;
  }
  return top && top.hits >= 2 && !tie ? top.product : undefined;
}

/** Offline goal analyzer: deterministic keyword matching against the catalog. */
export function analyzeWithKeywords(query: string, catalog: Catalog): GoalProfile {
  const product = detectProduct(catalog, query);
  const mentioned = product ? product.features.filter((f) => f.keywords.some((k) => hasWord(query, k))).map((f) => f.id) : [];
  // Catalog lists each product's core features first; use them when the person names none.
  const mustHaves = mentioned.length > 0 ? mentioned : (product?.features.slice(0, 4).map((f) => f.id) ?? []);
  const niceToHaves = product ? product.features.map((f) => f.id).filter((id) => !mustHaves.includes(id)) : [];

  const platforms = [...new Set(PLATFORM_WORDS.filter(([re]) => re.test(query)).flatMap(([, p]) => p))];
  const vibe = Object.entries(VIBE_WORDS)
    .filter(([, words]) => words.some((w) => hasWord(query, w)))
    .map(([vibeId]) => vibeId);

  const skillLevel = /\b(beginner|new to|first time|kid|kids|child|simple|easy|never used)\b/i.test(query)
    ? "beginner"
    : /\b(professional|advanced|expert|studio|industry)\b/i.test(query)
      ? "advanced"
      : "intermediate";

  const labels = new Map(product?.features.map((f) => [f.id, f.label]) ?? []);
  return {
    query,
    targetProductId: product?.id ?? null,
    category: product?.category ?? "other",
    tasks: mustHaves.map((id) => labels.get(id) ?? id),
    mustHaves,
    niceToHaves,
    platforms,
    skillLevel,
    vibe,
    openSourceOnly: /\b(open[- ]source only|only open[- ]source|foss only|only foss|libre only|no freeware)\b/i.test(query),
    source: "keyword",
  };
}
