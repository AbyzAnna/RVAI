import { describe, expect, it, vi } from "vitest";
import { fakeClient } from "./helpers.js";
import { analyzeWithClaude, hasApiCredentials } from "../src/analyzer/claude.js";
import { analyzeWithKeywords, detectProduct } from "../src/analyzer/keyword.js";
import { loadCatalog } from "../src/catalog.js";

const catalog = loadCatalog();

describe("keyword analyzer", () => {
  it("finds the product, the named features, platform, feel and skill level", () => {
    const p = analyzeWithKeywords("I'm a beginner and want a simple Photoshop replacement with layers and masks on Linux", catalog);
    expect(p.targetProductId).toBe("photoshop");
    expect(p.mustHaves).toEqual(["layers", "masks"]);
    expect(p.niceToHaves).not.toContain("layers");
    expect(p.platforms).toEqual(["linux"]);
    expect(p.vibe).toContain("simple");
    expect(p.skillLevel).toBe("beginner");
    expect(p.source).toBe("keyword");
  });

  it("treats a Chromebook as web plus Linux", () => {
    expect(analyzeWithKeywords("video editor for my Chromebook", catalog).platforms).toEqual(["web", "linux"]);
  });

  it("uses the product's core features when none are named", () => {
    const p = analyzeWithKeywords("something like AutoCAD", catalog);
    expect(p.mustHaves).toEqual(catalog.products.find((x) => x.id === "autocad")!.features.slice(0, 4).map((f) => f.id));
  });

  it("infers the product from the task when no name is given", () => {
    expect(detectProduct(catalog, "I want to make beats with midi and synths")?.id).toBe("ableton-live");
  });

  it("maps a named free tool to the paid product it replaces", () => {
    expect(detectProduct(catalog, "something like Blender")?.id).toBe("maya");
    expect(detectProduct(catalog, "a game like Minetest")?.id).toBe("minecraft");
  });

  it("prefers the longest alias and respects word boundaries", () => {
    expect(detectProduct(catalog, "a free Premiere Pro")?.id).toBe("premiere-pro");
    expect(detectProduct(catalog, "steps to learn painting")).toBeUndefined();
  });

  it("detects an open-source-only request and an unknown product", () => {
    const p = analyzeWithKeywords("open source only alternative to Canva", catalog);
    expect(p.openSourceOnly).toBe(true);
    expect(p.targetProductId).toBeNull();
    expect(p.mustHaves).toEqual([]);
  });
});

describe("Claude analyzer", () => {
  const parsed = {
    targetProductId: "photoshop",
    category: "creative",
    tasks: ["retouch photos"],
    mustHaves: ["layers", "masks", "made-up-feature"],
    niceToHaves: ["layers", "brushes"],
    platforms: ["mac"],
    skillLevel: "intermediate",
    vibe: ["Professional"],
    openSourceOnly: false,
    clarifyingQuestion: null,
    answerOptions: [],
  };

  it("maps structured output to a profile and drops feature ids not in the catalog", async () => {
    const client = fakeClient([{ stop_reason: "end_turn", parsed_output: parsed }]);
    const p = await analyzeWithClaude("photoshop for mac", catalog, { client });
    expect(p.source).toBe("claude");
    expect(p.mustHaves).toEqual(["layers", "masks"]);
    expect(p.niceToHaves).toEqual(["brushes"]);
    expect(p.vibe).toEqual(["professional"]);
    const request = (client.messages.parse as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(request.model).toBe("claude-sonnet-5-5");
    expect(request.output_config.format).toBeDefined();
    expect(request.system).toContain("Never help decompile");
  });

  it("throws on a refusal so the orchestrator can fall back", async () => {
    const client = fakeClient([{ stop_reason: "refusal", parsed_output: null }]);
    await expect(analyzeWithClaude("x", catalog, { client })).rejects.toThrow(/declined/);
  });

  it("throws when nothing parsable came back", async () => {
    const client = fakeClient([{ stop_reason: "max_tokens", parsed_output: null }]);
    await expect(analyzeWithClaude("x", catalog, { client })).rejects.toThrow(/no parsable/);
  });

  it("reads credentials from the environment", () => {
    expect(hasApiCredentials({})).toBe(false);
    expect(hasApiCredentials({ ANTHROPIC_API_KEY: "test" })).toBe(true);
  });
});
