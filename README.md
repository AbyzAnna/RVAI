# RevAI (RVAI)
The goal is to make technology accessible to everyone without simply copying or cracking paid software.

## Mission

RevAI helps someone get the tool they need in three steps, in order:

1. **Find existing alternatives**: free, open, or legitimately accessible projects that already do the job.
2. **Extend a suitable project**: when something close exists, adapt or build on it instead of starting over.
3. **Create an original prototype**: when nothing fits, sketch a new one (websites included).

## Team responsibilities

- **Claude**: implements the UI.
- **Codex**: orchestrates, reviews, and tests.
- **Anna**: owns the backend and AI generation.

## Initial catalog foundation

See [catalog setup and scope](docs/catalog-foundation.md) and [backend handoff](docs/integration.md). This is role 1 groundwork; the backend and interface remain in development.

## Interface preview

Serve the repository root and open the UI:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Then visit http://127.0.0.1:4173/ui/ .

### Connect Anna's backend (live mode)

Anna's pipeline (`origin/main`, `npm run web`) serves `POST /api/recommend`. It sends no CORS headers, so serve the UI through the dev proxy, which forwards `/api/*` on the same origin:

```sh
# terminal 1, in a checkout of origin/main
npm install && npm run web            # http://127.0.0.1:3000 (offline keyword analyzer without an API key)
# terminal 2, in this repo
python3 scripts/dev_server.py         # UI on http://127.0.0.1:4173/ui/, /api/* -> :3000 (--api to change)
```

Then, in Innovate, open **Connection settings**, keep the endpoint `/api/recommend` and tick **Use connected agent**. `ui/rvai-adapter.js` maps her `{result, trace}` into the chat, the Alternatives cards (gaps and workarounds), the Plan tab (when she returns a `buildPlan`) and a refusal with legal options. Her trace is shown as reported, and nothing is invented locally. The fixtures in `docs/examples/recommend.*.json` are real responses from her server. If the backend is down, the chat shows a 502 with Retry and no scripted fallback. No frontend installation or API key required. See [UI connection contract](docs/ui-api-contract.md), [role 1 requirements](docs/role-1-requirements.md), and [today’s workflow](docs/today-workflow.md).

What the preview is and is not:

- The chat conversation is a **scripted local demo, not AI**: goal → purpose → features → device limits → catalog alternatives (evidence, unknowns, exclusions) → Find/Extend (pick a base project) or Create → plan with acceptance check. Guided revisions recompute everything.
- For the website Create route, after reviewing the plan you can press **Create demo website template** to get a sandboxed preview and an HTML download. It is a deterministic local template, **not AI generation**.
- CAD/game/other Create routes are **proposals only** until Anna's agent is connected.
- **Live mode with Anna's `/api/recommend` was checked in Chrome on 2026-10-25** against her `origin/main` in offline mode (keyword analyzer, no API key): a recommendation with a build plan, a refusal, and backend-down. Claude-backed analysis and live discovery were not exercised. Any other endpoint URL still receives the *proposed* `0.2-draft` envelope ([contract](docs/conversational-product-contract.md)). See the [UI build report](docs/claude-ui-build-report.md).

## Checks

CI (`.github/workflows/catalog-checks.yml`) runs with no dependency installs:

- Python catalog/metadata tests: `python -m unittest discover -s tests -v`
- JSON validation of `data/*.json`
- Syntax check of every `ui/*.js` file as an ES module
- UI Node tests: `node --test ui/*.test.mjs` (website template, shell, backend adapter)
- Dev proxy test: `tests/test_dev_server.py` (part of the unittest run)
