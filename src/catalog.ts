import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Catalog, type Product } from "./schemas.js";

export const DEFAULT_CATALOG_PATH = fileURLToPath(new URL("../data/catalog.json", import.meta.url));

const cache = new Map<string, Catalog>();

/**
 * Loads and validates a catalog. The path comes from the argument, then the RVAI_CATALOG
 * environment variable, then the bundled seed catalog. Throws if the file breaks the schema.
 */
export function loadCatalog(path?: string, env: NodeJS.ProcessEnv = process.env): Catalog {
  const file = path ?? env.RVAI_CATALOG ?? DEFAULT_CATALOG_PATH;
  const hit = cache.get(file);
  if (hit) return hit;

  const parsed = Catalog.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`catalog ${file} is invalid:\n${z.prettifyError(parsed.error)}`);
  const catalog = parsed.data;
  for (const product of catalog.products) {
    const ids = new Set(product.features.map((f) => f.id));
    for (const alt of product.alternatives) {
      for (const id of [...Object.keys(alt.features), ...Object.keys(alt.workarounds ?? {})]) {
        if (!ids.has(id)) throw new Error(`catalog: ${alt.id} references unknown feature "${id}" of ${product.id}`);
      }
    }
  }
  cache.set(file, catalog);
  return catalog;
}

export function findProduct(catalog: Catalog, id: string | null): Product | undefined {
  return id ? catalog.products.find((p) => p.id === id) : undefined;
}

/** JSON Schema for catalog files, generated from the zod schema (see catalog.schema.json). */
export function catalogJsonSchema(): object {
  return {
    ...z.toJSONSchema(Catalog, { io: "input", target: "draft-2020-12" }),
    title: "RVAI catalog",
    description: "Paid products, their features, and the free or open-source alternatives that replace them.",
  };
}
