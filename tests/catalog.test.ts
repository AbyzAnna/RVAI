import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { catalogJsonSchema, loadCatalog } from "../src/catalog.js";
import { analyzeWithKeywords } from "../src/analyzer/keyword.js";
import { compareAlternatives } from "../src/compare.js";
import { isSafeUrl } from "../src/guardrails.js";
import { BUILD_THRESHOLD } from "../src/recommend.js";

const catalog = loadCatalog();

describe("seed catalog", () => {
  it("covers about ten paid products across creative, office, dev and games", () => {
    expect(catalog.products.length).toBeGreaterThanOrEqual(10);
    const categories = new Set(catalog.products.map((p) => p.category));
    for (const c of ["creative", "office", "games", "engineering"]) expect(categories).toContain(c);
  });

  it("gives every alternative a license and a safe official https link", () => {
    for (const product of catalog.products) {
      for (const alt of product.alternatives) {
        expect(alt.license, alt.id).not.toHaveLength(0);
        expect(isSafeUrl(alt.url), alt.url).toBe(true);
        if (!alt.openSource) expect(alt.license).toBe("Freeware");
      }
      for (const d of product.officialDiscounts ?? []) expect(isSafeUrl(d.url), d.url).toBe(true);
    }
  });

  it("meets the MVP bar: the top pick covers at least 70% of each product's core must-haves", () => {
    for (const product of catalog.products) {
      const profile = analyzeWithKeywords(`something like ${product.name}`, catalog);
      expect(profile.targetProductId).toBe(product.id);
      const top = compareAlternatives(profile, product).candidates[0];
      expect(top.mustHaveCoverage, `${product.id} -> ${top.name}`).toBeGreaterThanOrEqual(BUILD_THRESHOLD);
    }
  });

  it("rejects a catalog whose alternative points at an unknown feature", () => {
    const bad = structuredClone(catalog);
    bad.products[0].alternatives[0].features["does-not-exist"] = "full";
    const dir = mkdtempSync(join(tmpdir(), "rvai-"));
    const file = join(dir, "catalog.json");
    writeFileSync(file, JSON.stringify(bad));
    expect(() => loadCatalog(file)).toThrow(/unknown feature/);
  });

  it("rejects a catalog that breaks the schema, with a readable message", () => {
    const dir = mkdtempSync(join(tmpdir(), "rvai-"));
    const file = join(dir, "catalog.json");
    writeFileSync(file, JSON.stringify({ products: [{ id: "x", name: "X", category: "office", features: [], alternatives: [] }] }));
    expect(() => loadCatalog(file)).toThrow(/is invalid/);
  });

  it("loads another catalog from a path or RVAI_CATALOG", () => {
    const example = new URL("../examples/catalog.example.json", import.meta.url).pathname;
    expect(loadCatalog(example).products[0].id).toBe("figma");
    expect(loadCatalog(undefined, { RVAI_CATALOG: example }).products[0].id).toBe("figma");
  });

  it("keeps catalog.schema.json in sync with the zod schema (run npm run schema)", () => {
    const committed = JSON.parse(readFileSync(new URL("../catalog.schema.json", import.meta.url), "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(catalogJsonSchema())));
  });
});
