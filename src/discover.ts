import { z } from "zod";
import { isSafeUrl, SYSTEM_RULES } from "./guardrails.js";
import { completeJson, type LlmOptions } from "./llm.js";
import { DISCOVERED_PREFIX } from "./recommend.js";
import { Alternative, Category, LearningCurve, Platform, Product, Support, type Catalog, type GoalProfile } from "./schemas.js";

/** What the model returns for a product that isn't in the catalog. Kept simple for strict schemas. */
const Discovery = z.strictObject({
  found: z.boolean(),
  productName: z.string(),
  vendor: z.string(),
  category: Category,
  features: z.array(z.strictObject({ id: z.string(), label: z.string(), weight: z.number() })),
  mustHaves: z.array(z.string()),
  niceToHaves: z.array(z.string()),
  alternatives: z.array(
    z.strictObject({
      name: z.string(),
      url: z.string(),
      license: z.string(),
      openSource: z.boolean(),
      platforms: z.array(Platform),
      learningCurve: LearningCurve,
      supports: z.array(z.strictObject({ featureId: z.string(), support: Support })),
      vibe: z.array(z.string()),
      notes: z.string(),
    }),
  ),
});
type Discovery = z.infer<typeof Discovery>;

const SYSTEM = `The person wants a free replacement for a paid product or game that is not in our catalog.
If you can tell which paid product (or kind of product) they mean, set found to true and give:
- productName and vendor of the paid product, and its category;
- 4 to 7 features that matter most for it: id (lowercase-with-dashes), short label, weight 3 for core, 2 important, 1 extra;
- mustHaves: ids of the features the person asked for or clearly needs (the core ones if they name none); niceToHaves: the rest;
- up to 4 free alternatives that really exist today and are free of charge to use, with the official https website (never a download mirror or app store listing), the SPDX license id ("Freeware" if free but not open source), openSource, platforms, learningCurve, which features each supports (full, partial or plugin; leave out unsupported ones), a few vibe adjectives, and a one-sentence note.
Only list projects you are confident exist, with their real official site. If you can't tell what they want, set found to false and leave the lists empty.

${SYSTEM_RULES}`;

export type UrlCheck = (url: string) => Promise<boolean>;

/** True when the page loads (any status below 400) within a few seconds. */
export const checkUrlLoads: UrlCheck = async (url) => {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "RVAI link check" } });
    await res.body?.cancel().catch(() => {});
    return res.status < 400;
  } catch {
    return false;
  }
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";

export interface DiscoveryResult {
  product: Product;
  profile: GoalProfile;
  dropped: string[];
}

/** Turns the model's answer into a catalog product, keeping only alternatives whose links pass the guardrails and load. */
export async function toDiscoveredProduct(d: Discovery, profile: GoalProfile, catalog: Catalog, urlCheck: UrlCheck): Promise<DiscoveryResult> {
  if (!d.found) throw new Error("could not tell which product the request is about");
  const features = d.features.map((f) => ({ id: slug(f.id), label: f.label, keywords: [], weight: Math.min(3, Math.max(1, Math.round(f.weight))) }));
  const ids = new Set(features.map((f) => f.id));
  const dropped: string[] = [];
  const known = new Set(catalog.products.flatMap((p) => p.alternatives.map((a) => a.url.replace(/\/+$/, ""))));

  const checked = await Promise.all(
    d.alternatives.map(async (a) => {
      const candidate = Alternative.safeParse({
        id: slug(a.name),
        name: a.name,
        url: a.url,
        license: a.license || "unknown",
        openSource: a.openSource,
        platforms: a.platforms,
        learningCurve: a.learningCurve,
        features: Object.fromEntries(a.supports.filter((s) => ids.has(slug(s.featureId))).map((s) => [slug(s.featureId), s.support])),
        vibe: a.vibe.map((v) => v.toLowerCase()),
        notes: a.notes || undefined,
      });
      if (!candidate.success) return void dropped.push(`${a.name}: incomplete entry`);
      if (!isSafeUrl(a.url)) return void dropped.push(`${a.name}: unsafe link`);
      // Links we already vetted in the catalog skip the network check.
      if (!known.has(a.url.replace(/\/+$/, "")) && !(await urlCheck(a.url))) return void dropped.push(`${a.name}: link did not load`);
      return candidate.data;
    }),
  );
  const alternatives = checked.filter((a): a is Alternative => a !== undefined);
  if (alternatives.length === 0) throw new Error(`no alternative could be verified${dropped.length ? ` (${dropped.join("; ")})` : ""}`);

  const product = Product.parse({
    id: `${DISCOVERED_PREFIX}${slug(d.productName)}`,
    name: d.productName,
    vendor: d.vendor || undefined,
    category: d.category,
    features,
    alternatives,
  });
  const mustHaves = [...new Set(d.mustHaves.map(slug).filter((id) => ids.has(id)))];
  const core = features.filter((f) => f.weight === 3).map((f) => f.id);
  const must = mustHaves.length ? mustHaves : core;
  return {
    product,
    dropped,
    profile: {
      ...profile,
      targetProductId: product.id,
      category: product.category,
      mustHaves: must,
      niceToHaves: features.map((f) => f.id).filter((id) => !must.includes(id)),
    },
  };
}

/** Live discovery for requests outside the catalog: ask Claude, then verify every link. */
export async function discoverAlternatives(
  profile: GoalProfile,
  catalog: Catalog,
  llm: LlmOptions,
  urlCheck: UrlCheck = checkUrlLoads,
): Promise<DiscoveryResult> {
  const d = await completeJson(Discovery, "discovery", SYSTEM, profile.query, { ...llm, maxTokens: 6000 });
  return toDiscoveredProduct(d, profile, catalog, urlCheck);
}
