# RVAI research & discovery

Finds legitimate free or open-source alternatives to a paid product, with evidence and an honest verification status. It searches the curated catalog first and GitHub's public API when the catalog doesn't have enough. Standard library only: Python 3.10 or newer, nothing to install.

```bash
python -m research "Adobe Photoshop" -r layers -r "raw editing" --platform linux
python -m research "Notion" -r databases --json          # not in the catalog: searches GitHub
python -m research "photoshop" --offline --json          # catalog only, no network
python -m unittest discover -s research/tests -t .       # tests, fully offline
```

## Python interface

```python
from research import research_alternatives, export_proposals, load_catalog

result = research_alternatives(
    "Adobe Photoshop",
    ["layers", "raw editing"],                      # free text or the product's feature ids
    {"platforms": ["linux"], "openSourceOnly": False, "budget": 0, "hardware": "4 GB RAM",
     "external": "auto",                            # auto | always | never
     "maxExternal": 5, "verifyLicenses": True},
)
```

The result is plain JSON-serializable data:

| Field | Meaning |
| --- | --- |
| `product` | the catalog product matched by id, name or alias, or `null` |
| `requestedFeatures` | the product's feature ids the comparison used |
| `resolvedRequirements` / `unresolvedRequirements` | how each requirement mapped to feature ids |
| `candidates[]` | one per alternative, ranked: catalog first, then platform fit, coverage, GitHub stars |
| `sources[]` | what each source did: `ok`, `no_match`, `skipped`, `disabled`, `partial`, `error`, `rate_limited` |
| `warnings[]` | anything the caller should tell the user |

Each candidate has `name`, `source` (`catalog` or `github`), `description`, `officialUrl`, `repositoryUrl`, `license`, `openSource`, `platforms` (+ `platformsInferred`), `platformMatch`, `learningCurve`, `features` (the catalog's `full`/`partial`/`plugin` map), `coverage`, `capabilities[]` (per requested feature: status, explanation, evidence), `limitations[]`, `evidence[]` (claim + URL), `verification` (`status`, `checkedAt`, `note`) and `warnings[]`.

## How much to trust a candidate

| `verification.status` | Where the facts come from | Feature statuses used |
| --- | --- | --- |
| `curated` | a human-reviewed catalog entry | `full`, `partial`, `plugin`, `missing` |
| `automated-license-check` | GitHub's license detector run on the repo's license file (linked in `evidence`) | `mentioned`, `unknown` |
| `unverified` | repository metadata only, a lead | `mentioned`, `unknown` |

Rules the module keeps:

- External leads never get `full`, `partial` or `plugin` support, and never get `missing`. A feature named in a description is `mentioned`; anything else is `unknown`.
- `openSource` is `true` only for an OSI-approved license. A missing or unrecognized license gives `license: null, openSource: null`. Free to use doesn't mean open source.
- Platforms from repository topics are marked `platformsInferred: true`. Hardware needs aren't recorded anywhere yet, so a hardware constraint is reported back, not checked.
- Repository text is untrusted data. Descriptions with instructions aimed at an AI agent are withheld and flagged. Text never sets a field. Links and text with piracy markers are dropped, using the same rules as `src/guardrails.ts`.
- Duplicates are removed by name and URL. A repository that duplicates a curated entry is dropped instead of being attached to it.

## External discovery

GitHub's REST search API is free and permitted. No search-engine pages are scraped. It works without credentials at about 10 searches a minute. For 30 a minute, put a token with no scopes in the environment or in the gitignored `.env`:

```bash
GITHUB_TOKEN=...
```

A network failure, rate limit or bad response never breaks the result. Catalog candidates are still returned, and `sources` says what went wrong (and when to retry, for rate limits). To add another provider, give it a `name`, a `search(product_name) -> (leads, notes)` and optionally `license_file(full_name)`, and pass it as `provider=`.

## Proposing catalog entries

```bash
python -m research "photoshop" --external always --export
python -m research "photoshop" --external always --export --overrides review.json --force
```

This writes `research-output/proposed-<product>-<date>.json` (gitignored). It never writes the catalog itself.

- License and `openSource` are filled only from a checked license file. Platforms, learning curve and feature support are never guessed, so entries list what is `missing` under `review.pending`.
- A reviewer supplies those fields in an overrides file keyed by candidate id, for example `{"pixelsuite": {"platforms": ["linux"], "learningCurve": "moderate", "features": {"layers": "full"}}}`. Feature ids must exist on the product.
- Complete entries go under `products` and are validated against `catalog.schema.json` plus the backend's feature-id rule. Such a file loads with `npx tsx src/cli.ts --catalog=research-output/<file>.json "..."`. To add entries to `data/catalog.json`, a person copies them in.

## Calling it from the TypeScript backend

The backend is TypeScript, so it runs the CLI and parses stdout:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export async function researchAlternatives(product: string, requirements: string[], platforms: string[] = []) {
  const args = ["-m", "research", product, "--json", ...requirements.flatMap((r) => ["-r", r]), ...platforms.flatMap((p) => ["--platform", p])];
  const { stdout } = await run(process.env.PYTHON ?? "python", args, { cwd: repoRoot, timeout: 30_000 });
  return JSON.parse(stdout);
}
```

A natural place is a fallback in `src/orchestrator.ts` when `findProduct()` finds no product. Show the `github` candidates as "leads to check", not as picks, since their features aren't verified. The CLI exits with code 1 and a message on stderr for invalid input or a broken catalog.
