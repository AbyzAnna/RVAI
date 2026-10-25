// Regenerates catalog.schema.json from the zod schema: npm run schema
import { writeFileSync } from "node:fs";
import { catalogJsonSchema } from "../src/catalog.js";

writeFileSync(new URL("../catalog.schema.json", import.meta.url), JSON.stringify(catalogJsonSchema(), null, 2) + "\n");
console.log("wrote catalog.schema.json");
