import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { run } from "../src/orchestrator.js";
import { scaffoldProject } from "../src/scaffold.js";
import type { Recommendation } from "../src/schemas.js";
import { createServer } from "../src/server.js";

describe("scaffold", () => {
  it("writes a starter kit with the brief, clean-room rules, credits and license note", async () => {
    const { result } = await run("Something like Photoshop with generative AI fill and content-aware fill for my raw photos", { offline: true });
    const dir = join(mkdtempSync(join(tmpdir(), "rvai-")), "kit");
    const files = scaffoldProject(result as Recommendation, dir);
    expect(files).toEqual(["README.md", "BRIEF.md", "CLEAN_ROOM.md", "CREDITS.md", "LICENSE-CHOICE.md"]);
    const brief = readFileSync(join(dir, "BRIEF.md"), "utf8");
    expect(brief).toContain("- Generative AI fill");
    expect(brief).toContain("GIMP (GPL-3.0-or-later)");
    expect(readFileSync(join(dir, "CLEAN_ROOM.md"), "utf8")).toMatch(/reverse engineer/);
  });

  it("refuses to write into a folder that isn't empty", async () => {
    const { result } = await run("something like GIMP", { offline: true });
    const dir = mkdtempSync(join(tmpdir(), "rvai-"));
    writeFileSync(join(dir, "keep.txt"), "mine");
    expect(() => scaffoldProject(result as Recommendation, dir)).toThrow(/not empty/);
  });
});

describe("web server", () => {
  const server = createServer({ offline: true });
  let base = "";
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("serves the RVAI web app, its catalog files and health, and keeps files inside their folders", async () => {
    const root = await fetch(base + "/", { redirect: "manual" });
    expect(root.status).toBe(302);
    expect(root.headers.get("location")).toBe("/ui/");
    const app = await fetch(base + "/ui/");
    expect(app.headers.get("content-type")).toMatch(/text\/html/);
    expect(await app.text()).toContain("shell.js");
    expect((await fetch(base + "/ui/app.js")).headers.get("content-type")).toMatch(/javascript/);
    expect((await fetch(base + "/data/catalog.json")).status).toBe(200);
    expect((await fetch(base + "/ui/../package.json")).status).toBe(404);
    expect((await fetch(base + "/ui/%2e%2e/package.json")).status).toBe(404);
    expect(await (await fetch(base + "/api/health")).json()).toEqual({ ok: true, ai: null });
  });

  it("serves the simple page and the examples", async () => {
    const page = await fetch(base + "/simple");
    expect(page.headers.get("content-type")).toMatch(/text\/html/);
    expect(await page.text()).toContain("Find alternatives");
    const { examples } = await (await fetch(base + "/api/examples")).json();
    expect(examples.length).toBeGreaterThan(3);
  });

  it("runs the pipeline for a request", async () => {
    const res = await fetch(base + "/api/recommend", { method: "POST", body: JSON.stringify({ query: "free Office for my Mac" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.result.target.id).toBe("microsoft-office");
    expect(body.trace[0].step).toBe("guard-input");
  });

  it("refuses piracy and rejects empty or oversized requests", async () => {
    const refused = await (await fetch(base + "/api/recommend", { method: "POST", body: JSON.stringify({ query: "keygen for AutoCAD" }) })).json();
    expect(refused.result.status).toBe("refused");
    expect((await fetch(base + "/api/recommend", { method: "POST", body: "{}" })).status).toBe(400);
    expect((await fetch(base + "/api/recommend", { method: "POST", body: JSON.stringify({ query: "x".repeat(5000) }) })).status).toBe(400);
    expect((await fetch(base + "/nope")).status).toBe(404);
  });
});
