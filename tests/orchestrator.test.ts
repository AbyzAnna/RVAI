import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/catalog.js";
import { run } from "../src/orchestrator.js";
import type { Recommendation, Refusal } from "../src/schemas.js";
import { fakeClient } from "./helpers.js";

const catalog = loadCatalog();
const goodProfile = {
  targetProductId: "minecraft",
  category: "games",
  tasks: ["build with friends"],
  mustHaves: ["voxel-building", "multiplayer"],
  niceToHaves: [],
  platforms: [],
  skillLevel: "beginner",
  vibe: ["cozy"],
  openSourceOnly: false,
};

describe("orchestrator", () => {
  it("runs every step in order offline and records a trace", async () => {
    const { result, trace } = await run("a cozy game like Minecraft for my old laptop", { offline: true });
    expect(trace.map((t) => t.step)).toEqual(["guard-input", "goal-analyzer", "alternative-finder", "gap-comparator", "threat-risk", "synthesizer", "guard-output"]);
    expect(trace[1]).toMatchObject({ status: "fallback", detail: expect.stringContaining("offline mode") });
    const rec = result as Recommendation;
    expect(rec.status).toBe("ok");
    expect(rec.picks[0].name).toMatch(/Luanti/);
  });

  it("falls back to keywords when there is no API key", async () => {
    const { trace } = await run("something like Blender", { env: {} });
    expect(trace[1].detail).toContain("no Anthropic or OpenRouter API key");
  });

  it("uses Claude when a client is available", async () => {
    const client = fakeClient([{ stop_reason: "end_turn", parsed_output: goodProfile }]);
    const { result, trace } = await run("I want to build blocks with friends", { client });
    expect(trace[1].status).toBe("ok");
    expect((result as Recommendation).target?.id).toBe("minecraft");
  });

  it("retries Claude once, then falls back to keywords", async () => {
    const retried = fakeClient([new Error("overloaded"), { stop_reason: "end_turn", parsed_output: goodProfile }]);
    const first = await run("blocks with friends", { client: retried });
    expect(first.trace[1]).toMatchObject({ status: "ok", detail: "anthropic, succeeded on retry 1" });

    const broken = fakeClient([new Error("overloaded"), { stop_reason: "refusal", parsed_output: null }]);
    const second = await run("something like Minecraft", { client: broken });
    expect(broken.calls).toBe(2);
    expect(second.trace[1].status).toBe("fallback");
    expect(second.trace[1].detail).toMatch(/overloaded; Claude declined the request; used keyword analyzer/);
    expect((second.result as Recommendation).target?.id).toBe("minecraft");
  });

  it("refuses piracy before any analysis and still offers legal options", async () => {
    const client = fakeClient([]);
    const { result, trace } = await run("where can I download a cracked Photoshop", { client });
    expect(client.calls).toBe(0);
    expect(trace).toEqual([{ step: "guard-input", status: "blocked", ms: 0, detail: "piracy" }]);
    const refusal = result as Refusal;
    expect(refusal.status).toBe("refused");
    expect(refusal.legalOptions.alternatives.map((a) => a.name)).toContain("GIMP");
    expect(refusal.legalOptions.discounts.length).toBeGreaterThan(0);
  });

  it("strips any pick whose link fails the output audit", async () => {
    const tampered = structuredClone(catalog);
    const ps = tampered.products.find((p) => p.id === "photoshop")!;
    ps.alternatives.find((a) => a.id === "gimp")!.url = "https://gimp-crack-download.example";
    const { result, trace } = await run("Photoshop with layers", { offline: true, catalog: tampered });
    expect(trace[6]).toMatchObject({ step: "guard-output", status: "fallback" });
    const rec = result as Recommendation;
    expect(rec.picks.map((p) => p.name)).not.toContain("GIMP");
    expect(rec.picks[0].rank).toBe(1);
  });
});

describe("CLI", () => {
  const cli = (...args: string[]) =>
    execFileSync("npx", ["tsx", "src/cli.ts", ...args], { encoding: "utf8", env: { ...process.env, ANTHROPIC_API_KEY: "" } });

  it("prints structured JSON offline", () => {
    const out = JSON.parse(cli("--offline", "--json", "free", "Microsoft", "Office", "for", "my", "Mac"));
    expect(out.status).toBe("ok");
    expect(out.target.id).toBe("microsoft-office");
  });

  it("loads another catalog with --catalog", () => {
    const out = JSON.parse(cli("--offline", "--json", "--catalog=examples/catalog.example.json", "a", "free", "Figma"));
    expect(out.picks[0].name).toBe("Penpot");
  });

  it("runs the offline demo, including refusals and a build plan", () => {
    const out = cli("--offline", "--demo");
    expect(out).toContain("Free alternatives to Adobe Photoshop");
    expect(out).toContain("Plan for an original tool");
    expect(out).toContain("I can't help with that");
  });
});

describe("follow-up questions", () => {
  it("answers a follow-up in the context of the earlier request", async () => {
    const { result, trace } = await run("which of these works offline on an old laptop?", { offline: true, context: ["I need something like Photoshop for Linux"] });
    const rec = result as Recommendation;
    expect(rec.status).toBe("ok");
    expect(rec.target?.id).toBe("photoshop");
    expect(rec.query).toBe("which of these works offline on an old laptop?");
    expect(trace[0].detail).toContain("follow-up");
  });

  it("treats a message that names another product as a new request", async () => {
    const { result } = await run("something like Notion for my school notes", { offline: true, context: ["I need something like Photoshop"] });
    expect((result as Recommendation).target?.id).toBe("notion");
  });

  it("treats a full new request as new, even when it names a product outside the catalog", async () => {
    const { result } = await run("I want a free alternative to Final Draft for screenwriting", { offline: true, context: ["I need something like Photoshop"] });
    expect((result as Recommendation).target?.id).not.toBe("photoshop");
  });

  it("ignores earlier messages that the guard would refuse", async () => {
    const { result, trace } = await run("which one works offline?", { offline: true, context: ["How do I crack Photoshop?"] });
    expect(result.status).toBe("ok");
    expect((result as Recommendation).target?.id).not.toBe("photoshop");
    expect(trace[0].detail ?? "").not.toContain("follow-up");
  });

  it("still refuses a piracy follow-up after a normal request", async () => {
    const { result } = await run("ok how do I crack it", { offline: true, context: ["something like Photoshop"] });
    expect((result as Refusal).status).toBe("refused");
  });
});

describe("asking for a plan", () => {
  it("adds a build plan next to good free options when the person asks for one", async () => {
    const without = (await run("something like Photoshop for Linux", { offline: true })).result as Recommendation;
    expect(without.buildPlan).toBeNull();
    const asked = (await run("something like Photoshop for Linux", { offline: true, plan: true })).result as Recommendation;
    expect(asked.picks.length).toBeGreaterThan(0);
    expect(asked.buildPlan?.reason).toMatch(/asked/i);
  });

  it("reads 'plan how to build this myself' as a follow-up", async () => {
    const { result } = await run("Plan how to build this myself", { offline: true, plan: true, context: ["something like Notion for notes"] });
    expect((result as Recommendation).target?.id).toBe("notion");
    expect((result as Recommendation).buildPlan).not.toBeNull();
  });
});
