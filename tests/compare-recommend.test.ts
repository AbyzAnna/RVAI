import { describe, expect, it } from "vitest";
import { analyzeWithKeywords } from "../src/analyzer/keyword.js";
import { findProduct, loadCatalog } from "../src/catalog.js";
import { compareAlternatives, scoreAlternative, WEIGHTS } from "../src/compare.js";
import { buildRecommendation, BUILD_THRESHOLD, MAX_PICKS } from "../src/recommend.js";
import type { GoalProfile } from "../src/schemas.js";

const catalog = loadCatalog();
const photoshop = findProduct(catalog, "photoshop")!;
const gimp = photoshop.alternatives.find((a) => a.id === "gimp")!;

const profile = (over: Partial<GoalProfile> = {}): GoalProfile => ({
  query: "q",
  targetProductId: "photoshop",
  category: "creative",
  tasks: [],
  mustHaves: ["raw-editing", "generative-ai", "content-aware-fill"],
  niceToHaves: ["brushes"],
  platforms: [],
  skillLevel: "intermediate",
  vibe: [],
  openSourceOnly: false,
  source: "keyword",
  ...over,
});

describe("feature comparison", () => {
  it("weights coverage by feature weight: full 1, plug-in 0.75, partial 0.5", () => {
    const s = scoreAlternative(profile(), gimp, photoshop);
    // raw-editing (weight 3) partial, generative-ai (1) plug-in, content-aware-fill (2) plug-in
    expect(s.mustHaveCoverage).toBe(0.625); // (1.5 + 0.75 + 1.5) / 6
    expect(s.covered).toEqual(["brushes"]);
    expect(s.plugin).toEqual(["generative-ai", "content-aware-fill"]);
    expect(s.partial).toEqual(["raw-editing"]);
    expect(s.missing).toEqual([]);
    const expected = WEIGHTS.mustHave * 0.625 + WEIGHTS.niceToHave + WEIGHTS.vibe * 0.5 + WEIGHTS.platform + WEIGHTS.learning * 0.7;
    expect(s.score).toBeCloseTo(expected, 3);
  });

  it("counts a missing feature as zero", () => {
    const krita = photoshop.alternatives.find((a) => a.id === "krita")!;
    const s = scoreAlternative(profile(), krita, photoshop);
    expect(s.mustHaveCoverage).toBe(0);
    expect(s.missing).toEqual(["raw-editing", "generative-ai", "content-aware-fill"]);
  });

  it("favors easy tools for beginners", () => {
    const krita = photoshop.alternatives.find((a) => a.id === "krita")!;
    expect(scoreAlternative(profile({ skillLevel: "beginner" }), krita, photoshop).learningFit).toBe(1);
    expect(scoreAlternative(profile({ skillLevel: "beginner" }), gimp, photoshop).learningFit).toBe(0.2);
  });

  it("is deterministic", () => {
    const p = profile({ vibe: ["artistic"] });
    expect(compareAlternatives(p, photoshop)).toEqual(compareAlternatives(p, photoshop));
  });

  it("treats browser apps as available on desktop platforms", () => {
    const photopea = photoshop.alternatives.find((a) => a.id === "photopea")!;
    expect(scoreAlternative(profile({ platforms: ["linux"] }), photopea).platformMatch).toBe(true);
    expect(scoreAlternative(profile({ platforms: ["ios"] }), photopea).platformMatch).toBe(false);
  });

  it("drops freeware when the person wants open source only", () => {
    const names = compareAlternatives(profile({ openSourceOnly: true }), photoshop).candidates.map((c) => c.name);
    expect(names).not.toContain("Photopea");
  });

  it("ranks the vibe match higher when coverage ties", () => {
    const p = profile({ mustHaves: ["layers"], niceToHaves: [], vibe: ["artistic"] });
    expect(compareAlternatives(p, photoshop).candidates[0].name).toBe("Krita");
  });
});

describe("recommendations", () => {
  it("returns ranked picks with gaps, workarounds and official discounts", () => {
    const p = profile();
    const rec = buildRecommendation(p, compareAlternatives(p, photoshop), catalog);
    expect(rec.picks.length).toBeLessThanOrEqual(MAX_PICKS);
    expect(rec.picks.map((x) => x.rank)).toEqual([1, 2, 3]);
    const gap = rec.picks.find((x) => x.name === "GIMP")!.gaps.find((g) => g.featureId === "generative-ai")!;
    expect(gap.status).toBe("plugin");
    expect(gap.workaround).toMatch(/open model/);
    expect(rec.discounts[0].url).toMatch(/^https:\/\/www\.adobe\.com/);
    expect(rec.attribution).toMatch(/trademarks/);
  });

  it(`adds an original-tool plan when the top pick covers under ${BUILD_THRESHOLD * 100}% of must-haves`, () => {
    const p = profile();
    const rec = buildRecommendation(p, compareAlternatives(p, photoshop), catalog);
    expect(rec.buildPlan).not.toBeNull();
    expect(rec.buildPlan!.featuresToBuild).toContain("Generative AI fill");
    expect(rec.buildPlan!.cleanRoomRules.join(" ")).toMatch(/reverse engineer/);
    expect(rec.buildPlan!.concept).not.toMatch(/Photoshop/);
  });

  it("adds a plan when no alternative runs on the person's platform", () => {
    const p = profile({ mustHaves: ["layers", "masks"], platforms: ["ios"] });
    const rec = buildRecommendation(p, compareAlternatives(p, photoshop), catalog);
    expect(rec.buildPlan?.reason).toMatch(/run on ios/);
  });

  it("skips the plan when coverage is good enough", () => {
    const p = profile({ mustHaves: ["layers", "masks"] });
    expect(buildRecommendation(p, compareAlternatives(p, photoshop), catalog).buildPlan).toBeNull();
  });

  it("plans an original tool for requests outside the catalog, without repeating the product name", () => {
    const p = analyzeWithKeywords("a free Canva for my class posters", catalog);
    const rec = buildRecommendation(p, compareAlternatives(p, undefined), catalog);
    expect(rec.target).toBeNull();
    expect(rec.picks).toEqual([]);
    expect(rec.buildPlan!.reason).toMatch(/not in RVAI's catalog/);
    expect(rec.buildPlan!.concept).not.toMatch(/Canva/);
  });
});
