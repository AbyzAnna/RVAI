# Claude review: action record

Claude's open Hackathon 2.0 project reviewed initial catalog PR #1 on October 25, 2026. Its UI work was stopped to avoid overlap; Codex owns UI/catalog, Anna owns backend. Claude requested backend URL/stack confirmation; that question was sent to Murilo and remains pending.

| Review request | Disposition |
| --- | --- |
| Free-text category bridge and shared feature vocabulary | Added data/taxonomy.json, consumed by UI. Keyword suggestions are explicit and user-editable; Anna owns AI interpretation. |
| Actual game package | Source-reviewed Minetest Game as a simple peaceful building/crafting option. See game-demo-evidence.md; runtime remains untested. |
| More candidates/ranking diversity and exclusion example | Catalog expanded to six source-reviewed entries (two per category) with official primary evidence. Do not invent an excluded candidate just to animate a demo. Platform mismatch already demonstrates real exclusions. |
| Stronger evidence | Feature-level evidence URLs retained. Specific official feature/config pages used where available. No fabricated quotes. |
| Schema and fixtures | Added shared example request/response, alternatives.schema.json, and executable metadata/taxonomy tests. JSON Schema is a contract artifact; CI runs the standard-library metadata checks without adding dependencies. |
| Backend statuses, constraints_not_evaluated, score_breakdown, version/warning-object changes | Proposed to Anna; not implemented because she owns backend. Existing v0.1 adapter contract preserved to avoid breaking her work. |
| CORS and HTTP error mapping | Documented in ui-api-contract.md; actual service origin/endpoint awaited. No backend middleware written. |
| Model-key fallback and streaming | Anna owns these. UI labels catalog demo and shows only actual observed local steps. No fake AI progress. |
| Repo layout and same-day timing | UI is dependency-free in ui/, not a second Next.js project in web/. Python/FastAPI remains a backend proposal until Anna confirms. Today workflow includes integration and freeze gates. |
| Auto fallback after live failure | UI keeps the live failure visible and lets the user explicitly select demo mode, avoiding simulated live success. |

The shared interaction reference could not be extracted by either reviewer; Murilo's pasted conversation supplies the goal → discover → compare → gaps → plan flow. Backend implementation and deployment are outside this change.
