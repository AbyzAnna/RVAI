import { describe, expect, it, vi } from "vitest";
import { analyzeWithOpenRouter, hasOpenRouterKey, OPENROUTER_URL } from "../src/analyzer/openrouter.js";
import { loadCatalog } from "../src/catalog.js";
import { run } from "../src/orchestrator.js";
import type { Recommendation } from "../src/schemas.js";

const catalog = loadCatalog();
const goal = {
  targetProductId: "autocad",
  category: "engineering",
  tasks: ["draw floor plans"],
  mustHaves: ["2d-drafting", "dwg-support", "not-a-feature"],
  niceToHaves: [],
  platforms: ["mac"],
  skillLevel: "beginner",
  vibe: ["Simple"],
  openSourceOnly: false,
};

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
const completion = (content: string | null, extra: object = {}) => ({
  choices: [{ finish_reason: "stop", message: { content, ...extra } }],
});

describe("OpenRouter analyzer", () => {
  it("sends a strict JSON schema request and maps the answer to a profile", async () => {
    const fetch = reply(completion(JSON.stringify(goal)));
    const p = await analyzeWithOpenRouter("floor plans on my mac", catalog, { apiKey: "test-key", fetch });
    expect(p).toMatchObject({ source: "openrouter", targetProductId: "autocad", mustHaves: ["2d-drafting", "dwg-support"], vibe: ["simple"] });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(OPENROUTER_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("anthropic/claude-opus-5.5");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
    expect(body.messages[0].content).toContain("Never help decompile");
  });

  it("fails clearly without a key, on HTTP errors, refusals and bad JSON", async () => {
    await expect(analyzeWithOpenRouter("x", catalog, { env: {} })).rejects.toThrow(/OPENROUTER_API_KEY/);
    await expect(analyzeWithOpenRouter("x", catalog, { apiKey: "k", fetch: reply({ error: "no credits" }, 402) })).rejects.toThrow(/HTTP 402/);
    await expect(analyzeWithOpenRouter("x", catalog, { apiKey: "k", fetch: reply(completion(null, { refusal: "no" })) })).rejects.toThrow(/declined/);
    await expect(analyzeWithOpenRouter("x", catalog, { apiKey: "k", fetch: reply(completion("{not json")) })).rejects.toThrow();
  });

  it("reads the key from the environment", () => {
    expect(hasOpenRouterKey({})).toBe(false);
    expect(hasOpenRouterKey({ OPENROUTER_API_KEY: "k" })).toBe(true);
  });
});

describe("orchestrator with OpenRouter", () => {
  it("uses OpenRouter when only OPENROUTER_API_KEY is set", async () => {
    const fetch = reply(completion(JSON.stringify(goal)));
    const { result, trace } = await run("I need to draw floor plans", { env: { OPENROUTER_API_KEY: "k" }, fetch });
    expect(trace[1]).toMatchObject({ step: "analyze", status: "ok", detail: "openrouter" });
    expect((result as Recommendation).target?.id).toBe("autocad");
  });

  it("falls back to keywords when OpenRouter keeps failing", async () => {
    const fetch = reply({ error: "down" }, 503);
    const { trace } = await run("something like AutoCAD", { env: { OPENROUTER_API_KEY: "k" }, fetch });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(trace[1].status).toBe("fallback");
    expect(trace[1].detail).toMatch(/HTTP 503.*used keyword analyzer/);
  });
});
