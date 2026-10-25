# Conversational product contract — proposal 0.2-draft

Status: **proposal for agreement**, not a description of an existing backend. Author: Claude (builder). Codex orchestrates and tests; Anna owns backend, API URL, model integration and implementation. Discovery adapter 0.1 (`docs/role-1-requirements.md`) stays the source of truth until all three agree to this draft.

## Mission
RevAI is a ChatGPT/Claude-style conversation. A user names paid software ("Fusion 360") or a general idea ("a site for my bakery"). RevAI asks, one question at a time: purpose; specific capabilities and additions (e.g. Fusion-style CAD *plus* AI-assisted modeling); OS, RAM, GPU, free storage, maximum project + install size, internet; budget. It then routes:
- **Find** — existing open-source options cover the requested features with evidence.
- **Extend** — a candidate partly fits; plan an original add-on/plugin for the gaps.
- **Create** — nothing fits; scope an original prototype (websites included).

Rules: unknown is not missing. Open source alone is not legal clearance (licenses are `declared_license_only`). All Create/Extend work is original implementation; no proprietary copying, cracking, decompiling or trademark/UI cloning.

## Request (UI → backend, each turn)
```json
{"contract_version":"0.2-draft","conversation_id":"c_123","mode":"live",
 "messages":[{"role":"user","content":"I want Fusion 360 but free, with an AI helper"}],
 "brief":{"goal":"cad","purpose":"design 3D-printable brackets",
  "custom_features":["AI suggests geometry from a text prompt"],
  "feature_ids":["parametric_modeling","stl_export","ai_modeling_assistant"],
  "compatibility":{"platform":"windows","ram_gb":8,"gpu":null,"storage_free_gb":null,
   "max_project_install_gb":2,"internet":null},
  "budget":0},
 "discovery_spec":{"category":"cad","platform":"windows","budget":0,
  "required_features":["parametric_modeling","stl_export"]}}
```
- `messages` is the full transcript (stateless backend allowed); `conversation_id` is client-generated until Anna decides otherwise.
- `brief` is the UI's current understanding; backend may return a revised brief. `null` = not yet asked/unknown, never "none".
- `feature_ids` use `data/taxonomy.json`. IDs not in the taxonomy (e.g. `ai_modeling_assistant`, any `website` category) are **proposed** and must be returned as unknown until added.
- `discovery_spec` is exactly the 0.1 adapter input, so Anna can call `find_candidate_projects` unchanged.
- **Accepted but not evaluated (0.1):** `ram_gb`, `gpu`, `storage_free_gb`, `max_project_install_gb`, `internet`, `purpose`, `custom_features`. Responses must say so in `limitations`.

## Response (backend → UI)
```json
{"contract_version":"0.2-draft","conversation_id":"c_123","mode":"live",
 "stage":"clarifying | recommending | planning | artifact_ready | error",
 "assistant_message":"Which OS are you on, and how much free disk space?",
 "clarifying_question":{"field":"compatibility.storage_free_gb","prompt":"...","options":null},
 "brief":{"...":"revised brief, same shape"},
 "route":"find | extend | create | null",
 "discovery":{"schema_version":"0.1","status":"matches","recommendations":[],"excluded":[],"limitations":[]},
 "plan":{"route":"extend","base_project_id":"freecad","summary":"...",
  "steps":[{"id":"s1","title":"...","status":"proposed"}],
  "gaps":["ai_modeling_assistant"],"unverified":["8GB RAM fit","2GB size cap"],
  "legal_notes":["declared license only; review before redistribution"]},
 "artifact":null,
 "review":{"requires_user_approval":true,"approved":false},
 "limitations":["hardware and size constraints not evaluated"],
 "error":null}
```
- `discovery` is the **unmodified 0.1 response** nested; evidence, `unknown_features`, and `compatibility_status:"needs_verification"` pass through untouched.
- `clarifying_question` is non-null only in `clarifying`. Exactly one question per turn.
- `artifact` (only after approval): `{"id","kind":"static_website_template|code_scaffold","generated_by":"template|backend","files":[{"path","bytes","sha256"}],"license":"MIT|...","download_url":null,"preview_html":null}`.
- `error`: `{"code","message","retryable"}` with `stage:"error"`; UI shows it verbatim, never silently falls back.

## Mode and approval boundary
- `mode:"scripted_demo"` is the UI default and is visibly labeled "Scripted demo — no AI or backend". It must never say an AI built, installed, or tested an app.
- `mode:"live"` only when Anna's endpoint (URL supplied by Anna) responds; label the source.
- Nothing is generated before `review.approved=true` from an explicit user click. Plans are proposals.
- A static website template may be shown and downloaded *as a template* (`generated_by:"template"`). Actual tailored generation requires Anna's backend.
- HTML previews render in `<iframe sandbox>` with no `allow-scripts`, no network fetches.
- Never display fake tool execution (no simulated "installing…", "running tests…", progress logs) unless the backend reports a real event.

## Acceptance scenarios
1. **Fusion + AI helper, 8GB RAM, 2GB cap → Extend.** Brief shows `cad`, `ai_modeling_assistant` as unknown/gap; FreeCAD/OpenSCAD listed with evidence; route `extend`; plan for an original assistant add-on; RAM and size listed under `unverified`; approval required.
2. **Custom website → Create.** No catalog match; route `create` with scoped plan (pages, stack, hosting constraint); after approval, artifact metadata with files + sha256; sandboxed script-free preview; demo mode labels it a template.
3. **Unsupported mobile / no match.** `platform:"ios"` with no curated match → `discovery.status:"no_match"`, exclusion reasons shown, explicit "we don't know of a verified option", create proposal offered, not asserted feasible.
4. **Failed live request.** Network/5xx/invalid JSON → `stage:"error"` panel with message and Retry; brief preserved; no switch to scripted results without a visible notice.
5. **User revises a feature.** "Actually I don't need STL export" → next response's brief drops `stl_export`, discovery and plan recompute, change visible in the brief panel.

## Pipeline tests (Codex)
- 0.1 adapter tests still pass; `discovery_spec` fixtures produce identical 0.1 output.
- Fixtures for each scenario: request JSON, expected `stage`, `route`, nulls preserved.
- UI tests: demo label present; error panel; iframe sandbox lacks `allow-scripts`; no artifact before approval; unknown features never rendered as "missing".

## Ownership and same-day checkpoints (2026-10-25)
- **Anna:** endpoint, URL, envelope agreement, model prompts, brief extraction, artifact generation, HTTP codes.
- **Codex:** fixtures, tests, UI integration, orchestration. **Claude:** this doc, scoped UI/template work on request.
- CP1: Anna accepts/edits field names (or says "0.1 only"). CP2: one live round-trip of scenario 1 fixture. CP3: error + revision scenarios pass. CP4: demo walkthrough, labels reviewed.

## Open questions
- Stateless (`messages` resent) vs server-held conversation? Who mints `conversation_id`?
- Do `ai_modeling_assistant` and a `website` category enter `taxonomy.json`, and who sources evidence?
- Extend/Create decision rule: coverage threshold or model judgment? Must be documented either way.
- Artifact storage, download URL lifetime, and license chosen for generated code.
- Streaming responses: in scope today or not?
