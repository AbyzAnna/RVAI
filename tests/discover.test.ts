import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/catalog.js";
import { toDiscoveredProduct } from "../src/discover.js";
import { run } from "../src/orchestrator.js";
import type { GoalProfile, Recommendation } from "../src/schemas.js";
import { fakeClient } from "./helpers.js";

const catalog = loadCatalog();

const discovery = {
  found: true,
  productName: "Adobe Acrobat",
  vendor: "Adobe",
  category: "office",
  features: [
    { id: "Edit Text", label: "Edit PDF text", weight: 3 },
    { id: "sign", label: "Sign documents", weight: 3 },
    { id: "ocr", label: "OCR", weight: 7 },
  ],
  mustHaves: ["edit-text", "sign", "made-up"],
  niceToHaves: ["ocr"],
  alternatives: [
    { name: "Good PDF", url: "https://goodpdf.example", license: "MIT", openSource: true, platforms: ["windows"], learningCurve: "easy",
      supports: [{ featureId: "edit-text", support: "full" }, { featureId: "sign", support: "partial" }, { featureId: "bogus", support: "full" }],
      vibe: ["Simple"], notes: "A fine tool.", workarounds: [{ featureId: "sign", tip: "Use the free signing add-on." }, { featureId: "bogus", tip: "dropped" }] },
    { name: "Dead Link PDF", url: "https://dead.example", license: "MIT", openSource: true, platforms: ["windows"], learningCurve: "easy",
      supports: [], vibe: [], notes: "", workarounds: [] },
    { name: "Pirate PDF", url: "https://pdf-crack.example", license: "Freeware", openSource: false, platforms: ["windows"], learningCurve: "easy",
      supports: [], vibe: [], notes: "", workarounds: [] },
    { name: "Plain HTTP PDF", url: "http://plain.example", license: "MIT", openSource: true, platforms: ["windows"], learningCurve: "easy",
      supports: [], vibe: [], notes: "", workarounds: [] },
  ],
};

const baseProfile: GoalProfile = {
  query: "edit and sign PDFs like Acrobat",
  targetProductId: null,
  category: "other",
  tasks: [],
  mustHaves: [],
  niceToHaves: [],
  platforms: ["windows"],
  skillLevel: "beginner",
  vibe: [],
  openSourceOnly: false,
  source: "claude",
};

const urlCheck = async (url: string) => !url.includes("dead");

describe("live discovery", () => {
  it("keeps only alternatives whose links are safe and load, and normalizes ids and weights", async () => {
    const d = await toDiscoveredProduct(discovery as never, baseProfile, catalog, urlCheck);
    expect(d.product.id).toBe("discovered-adobe-acrobat");
    expect(d.product.features.map((f) => [f.id, f.weight])).toEqual([["edit-text", 3], ["sign", 3], ["ocr", 3]]);
    expect(d.product.alternatives.map((a) => a.name)).toEqual(["Good PDF"]);
    expect(d.product.alternatives[0].features).toEqual({ "edit-text": "full", sign: "partial" });
    expect(d.product.alternatives[0].workarounds).toEqual({ sign: "Use the free signing add-on." });
    expect(d.dropped.join(" ")).toMatch(/Dead Link PDF: link did not load/);
    expect(d.dropped.join(" ")).toMatch(/Pirate PDF: unsafe link/);
    expect(d.dropped.join(" ")).toMatch(/Plain HTTP PDF: incomplete entry/);
    expect(d.profile).toMatchObject({ targetProductId: "discovered-adobe-acrobat", mustHaves: ["edit-text", "sign"], niceToHaves: ["ocr"] });
  });

  it("fails when nothing can be verified or the product is unclear", async () => {
    await expect(toDiscoveredProduct({ ...discovery, alternatives: [discovery.alternatives[1]] } as never, baseProfile, catalog, urlCheck)).rejects.toThrow(/could be verified/);
    await expect(toDiscoveredProduct({ ...discovery, found: false } as never, baseProfile, catalog, urlCheck)).rejects.toThrow(/could not tell/);
  });

  it("runs between analyze and compare for requests outside the catalog, and labels the result", async () => {
    const goal = { targetProductId: null, category: "office", tasks: [], mustHaves: [], niceToHaves: [], platforms: ["windows"], skillLevel: "beginner", vibe: [], openSourceOnly: false, clarifyingQuestion: null, answerOptions: [] };
    const client = fakeClient([
      { stop_reason: "end_turn", parsed_output: goal },
      { stop_reason: "end_turn", parsed_output: discovery },
    ]);
    const { result, trace } = await run("edit and sign PDFs like Acrobat", { client, urlCheck });
    expect(trace.map((t) => t.step)).toEqual(["guard-input", "goal-analyzer", "alternative-finder", "gap-comparator", "threat-risk", "synthesizer", "guard-output"]);
    const rec = result as Recommendation;
    expect(rec.source).toBe("discovered");
    expect(rec.picks[0].name).toBe("Good PDF");
    expect(rec.picks[0].gaps.find((g) => g.featureId === "sign")?.workaround).toBe("Use the free signing add-on.");
    expect(rec.attribution).toMatch(/not reviewed by a person/);
  });

  it("falls back to a build plan when discovery fails", async () => {
    const goal = { targetProductId: null, category: "other", tasks: ["x"], mustHaves: [], niceToHaves: [], platforms: [], skillLevel: "beginner", vibe: [], openSourceOnly: false, clarifyingQuestion: null, answerOptions: [] };
    const client = fakeClient([{ stop_reason: "end_turn", parsed_output: goal }, new Error("overloaded")]);
    const { result, trace } = await run("something nobody has heard of", { client, urlCheck });
    expect(trace[2]).toMatchObject({ step: "alternative-finder", status: "fallback" });
    expect((result as Recommendation).source).toBe("catalog");
    expect((result as Recommendation).buildPlan).not.toBeNull();
  });

  it("is skipped offline and when turned off", async () => {
    const offline = await run("edit PDFs like Acrobat", { offline: true });
    expect(offline.trace[2]).toMatchObject({ step: "alternative-finder", detail: "catalog" });
    const client = fakeClient([{ stop_reason: "end_turn", parsed_output: { targetProductId: null, category: "other", tasks: [], mustHaves: [], niceToHaves: [], platforms: [], skillLevel: "beginner", vibe: [], openSourceOnly: false, clarifyingQuestion: null, answerOptions: [] } }]);
    const off = await run("edit PDFs like Acrobat", { client, discover: false });
    expect(off.trace[2]).toMatchObject({ step: "alternative-finder", detail: "catalog" });
  });
});
