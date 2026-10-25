# UI connection contract (proposal for Anna)

The interface lives in `ui/`. Serve the **repository root**, not only ui/, so the catalog is available:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open http://localhost:4173/ui/ . No build, npm packages, key, or frontend framework required. Fonts are optional external Google Fonts; system fallbacks work without them.

Default mode is **Catalog demo**, clearly labeled as deterministic local matching without AI. Goal text is collected but demo filtering uses the category and exact normalized feature IDs; a small client-side keyword hint suggests a category, which the user can change; this is not model interpretation. Shared category/feature IDs and labels are in data/taxonomy.json. Browser matching mirrors the catalog discovery slice. Six curated entries (two per category) exercise comparison; this is not a complete catalog. Luanti and Minetest Game are related engine/game components, not independent turnkey substitutes.

## Proposed live connection

Connection settings allow the endpoint to be entered when Anna supplies it. POST JSON with `goal`, `category`, `platform`, `budget` (0), `required_features` (string array), `hardware_constraints` (`ram_gb` number/null, `dedicated_gpu` null) and `internet`. Response must match `find_candidate_projects` output: `schema_version`, `status`, `recommendations`, `excluded`, `limitations`. See `docs/integration.md`. This is a proposal, not a claim that Anna's backend supports it. If her `/agent/run` wraps this in another object, adapt ui/app.js at its fetch boundary only.

No client API keys. Backend owns model credentials, validation, tool loop, license gate, retries and logging. Backend must configure CORS for the UI origin if hosted separately. No automatic fallback from a failed live call to demo output; users choose explicitly. Timeout is 20 seconds. Backend results must supply project feature_evidence links and declared license sources. Backend-generated text is rendered as text, never HTML.

## Acceptance today

- Three example scenarios populate goal/category/features correctly.
- Free/open-source result cards show official source and license links.
- Feature coverage is labeled as documented coverage, not quality or compatibility.
- Unsupported platform produces an honest empty state.
- Unverified hardware, offline use and licenses remain visible.
- Engine candidate explains the missing game package.
- Backend failure/timeout stays visible, with no simulated live agent trace.
- Responsive layout, labeled controls, keyboard focus and polite status announcements.
- Live endpoint acceptance check happens with Anna's real service before claiming integration.
