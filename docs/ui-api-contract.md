# UI connection contract

Status: the UI side is implemented. The live envelope is a **proposal** ([conversational-product-contract.md](conversational-product-contract.md), `0.2-draft`). Anna has not confirmed it, and **no backend integration has been tested**.

## Running the UI

Serve the **repository root** so `ui/` can fetch `../data/*.json`:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open http://127.0.0.1:4173/ui/ . No build, packages, key or framework. Opening `index.html` as a file fails to load the catalog and shows a visible error. Fonts are optional Google Fonts with system fallbacks.

## Modes

| Mode | When | Label |
|---|---|---|
| Scripted demo (default) | "Use connected agent" unchecked | "Scripted demo · no AI model or backend connected"; messages tagged "RevAI · scripted demo (no AI)" |
| Agent selected | checkbox on, no successful reply yet | badge "Agent selected · unverified" |
| Agent responded / failed | after a request | badge "Agent responded" or "Agent selected · last request failed" |

The UI never falls back from a failed live call to scripted output.

## Scripted demo (local, deterministic)

Questions, in order: goal → purpose → features (chips + free text) → device form. The device form fields are:
- `platform`: windows | macos | linux | android | ios | web | null
- `ram_gb`: 0.5–1024 | null
- `gpu`: none | integrated | dedicated | null
- `storage_free_gb`: 0–100000 | null
- `max_project_install_gb`: 0–10000, ≤ storage | null
- `internet`: offline | limited | reliable | null

Blank or "Not sure" means `null` (unknown, never "none").

Discovery runs in the browser and mirrors `find_candidate_projects()` in `catalog/__init__.py` (schema 0.1):
- Exclusions: license missing or needing review, not free/open source, OS not listed. An unknown OS is never excluded.
- `unknown_features` are shown as "not evidenced in catalog (unverified)", never as missing.
- RAM, GPU, storage, size cap and internet are recorded but **not evaluated** (listed under limitations).

Features outside the taxonomy are kept as `custom_features`. A CAD goal mentioning AI gets a proposed `ai_modeling_assistant` ID (proposed, not in the taxonomy).

Routes:
- **Find / Extend** use the base project chosen on its card ("Use this project" / "Extend this project"). The chat buttons fall back to the top-ranked option and say so. If a revision excludes the base (e.g. switching to iOS), the base and route are reset with a notice.
- **Create** is a proposal. For CAD/game/other it stays a proposal until the agent is connected.

Guided revisions ("Change features / device limits / purpose") recompute discovery and plan, keep the transcript, and discard any template artifact.

Explicit cracking, keygen, piracy or licence-bypass requests get a scripted refusal that offers lawful routes. This is a demo convenience; **enforcement belongs to the backend**.

## Website template (local, not AI)

Only for the website **Create** route, and only after the user presses **Create demo website template** following plan review:
- `ui/website-template.js` `createWebsiteTemplate()` builds one static HTML page. `app.js` maps its own brief to the helper's input: `target`, `purpose`, `stated_features`, and `constraints.max_install_gb` ← `max_project_install_gb`, `os` ← `platform`.
- The Preview tab shows "Template preview — not AI-generated", an `<iframe sandbox="">` (no `allow-scripts`), the byte count (HTML source only, not an audited install size), the limitations, the source as text, and a real `.html` download.
- The template has a CSP and loads no remote resources.
- If the size cap is smaller than the source bytes, the error is shown and no artifact exists.
- Artifacts carry `source:"local_template"` and are discarded when goal, purpose, features or device change. A render-time check also refuses to show an artifact made from a different brief.

## Live request (proposal — actual endpoint pending)

Exactly one `POST` to the URL in Connection settings, `Content-Type: application/json`, 60 s timeout:

```json
{"contract_version":"0.2-draft","conversation_id":"c_…","mode":"live",
 "messages":[{"role":"user","content":"…"},{"role":"assistant","content":"…"}],
 "brief":{"goal":"cad","target":"…","purpose":null,"stated_features":[],"custom_features":[],
  "feature_ids":[],"proposed_feature_ids":[],
  "compatibility":{"platform":null,"ram_gb":null,"gpu":null,"storage_free_gb":null,"max_project_install_gb":null,"internet":null},
  "budget":null,"route":null,"base_project_id":null},
 "discovery_spec":{"category":"cad","platform":null,"budget":0,"required_features":[]}}
```

`conversation_id` is client-generated. `discovery_spec` is `null` when no taxonomy category matched.

## Live response handling (what the UI accepts)

The response must be a JSON object containing `assistant_message` or `clarifying_question.prompt`. Optional fields are validated before use; invalid ones are listed as "ignored" in the chat:

- `stage`: shown in the message label. `refused` → "declined" (styled as such); `needs_info` / `clarifying` → question; `error` → error.
- `clarifying_question.options`: string array → quick replies.
- `brief` object: shown as "Revised brief from selected agent" JSON.
- `discovery`: the 0.1 shape (`recommendations[].project.name` required) → Alternatives, labeled as agent-sourced.
- `plan.steps[].title` → Plan tab, labeled as agent-sourced.
- `route`: find | extend | create.
- `steps`: `[{label, status?}]` strings → "Reported by connected agent" list. The UI never invents progress.
- `limitations`: string array, appended to the message.
- `error`: `{code, message}` or a non-2xx status → error message with Retry; the brief is preserved.
- `artifact`: ignored in this checkpoint.

Agent text is always rendered as text, never HTML. No client API keys. The backend owns credentials, CORS, validation, refusal enforcement, model calls and logging.

## Not done / pending Anna

- Agreement on field names.
- A real endpoint URL.
- Any live round-trip.
- Agent artifacts.
- Approval (`review.approved`) round-trip.
