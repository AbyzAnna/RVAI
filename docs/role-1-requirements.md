# Role 1 requirements — discovery and verification

Owner: Codex, with Claude assisting on bounded research or integration tasks. Anna owns role 2 (backend and orchestration); Codex owns role 3 (interface and working demo). Role 1 provides the verified inputs that roles 2 and 3 consume. Target: a reviewable hackathon demonstration today, October 25, 2026.

## Mission and demo scope

Help a student with no software budget find a legitimate starting point for a block-building experience, understand which requested capabilities it supports, and obtain practical next steps. The product must distinguish sourced facts from unverified suitability. It must not imply that it can reproduce any commercial application or has already generated, installed, or tested a game.

The first complete workflow is voxel-game discovery. CAD and video editing remain secondary catalog examples. Luanti is currently an engine candidate, not a complete game recommendation: a separately reviewed game package is necessary before describing the result as a playable alternative.

## Required outputs and acceptance criteria

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| R1-01 | Maintain a machine-readable curated catalog in `data/alternatives.json`. | Each entry has a stable unique ID, category, name, official URL, upstream repository, declared license and license source, supported platforms with source, features with per-feature evidence, verification date, notes, and explicit unknowns. |
| R1-02 | Return deterministic discovery results through `find_candidate_projects`. | Same request and catalog produce the same ordering; category and platform exclusions have explicit reasons; only curated free/open-source entries qualify. Existing unit tests pass. |
| R1-03 | Preserve feature uncertainty. | Requested capabilities without evidence appear in `unknown_features`, never as supported or conclusively missing. Feature coverage means only supported requested features divided by requested features. |
| R1-04 | Keep constraint claims honest. | Hardware and offline fit remain unverified until source review and appropriate testing exist. UI displays this even when a platform matches. |
| R1-05 | Complete the voxel demo research gap. | Review one compatible Luanti game package from official upstream sources. Record the game and asset licenses separately, upstream/release source, engine compatibility evidence, supported demo capabilities, installation steps, and remaining uncertainties. Do not invent this evidence or silently treat engine features as game features. |
| R1-06 | Make discovery consumable by Anna and the UI. | A documented versioned request/response below, example fixtures, visible error/no-result handling, and one agreed backend mapping. UI may use local catalog mode while the API is unavailable, clearly identified as such. |
| R1-07 | Supply a demonstrable outcome. | Student submits category, OS and capabilities; sees candidate, supported and unknown features, evidence links, limitations, and official next steps. A working game claim additionally requires an actual launch/save/reload check on the tested environment. |

## Current evidence and remaining research

Current entries are Luanti, Minetest Game, FreeCAD, OpenSCAD, Shotcut and Kdenlive, marked `source_reviewed_not_runtime_tested` with verification date 2026-10-25. These are the catalog's existing recorded claims, not a new runtime verification performed by this document. Existing catalog evidence points to official sites and upstream repositories. License review is `declared_license_only`; dependencies and assets have not undergone a complete audit.

Before adding a Luanti game package, research in this order:

1. Identify an actively available game from its official repository and official distribution listing; record retrieval date and a release tag or commit where practical.
2. Verify code, textures, sounds and other asset license declarations; retain attribution requirements and flag incomplete declarations.
3. Verify which engine version the game supports and obtain official installation instructions. Link to upstream downloads; do not bundle binaries or content merely because the engine is open source.
4. Check evidence for terrain generation, placing/removing blocks, creative building, saving/reloading and crafting. Request only capabilities supported by the selected demo; unverified capabilities remain unknown.
5. If a runtime is available, test launching, creating a world, placing/removing a block and save/reload. Record OS, engine/game versions, steps and actual outcome. Hardware performance and offline use require separate checks.

A missing runtime test does not block a discovery UI demonstration. It does block labeling the game as tested or offering a functional “Play now” action. AlternativeTo can help discover names; authoritative claims must be checked upstream. Cutter and binary analysis are outside today's discovery workflow.

## Normalized contract — implemented baseline 0.1

Anna can import `catalog.find_candidate_projects(specification)` directly. The existing adapter is the source of truth until a coordinated version change.

```json
{
  "category": "voxel_game",
  "platform": "windows",
  "budget": 0,
  "required_features": ["voxel_engine", "world_saving", "crafting"],
  "hardware_constraints": {"ram_gb": 8, "dedicated_gpu": false},
  "internet": "limited"
}
```

`category` is a required nonempty string. Current catalog categories are `voxel_game`, `cad`, `video_editor`. `platform` is optional and accepts `windows`, `macos`, `linux`, `android`, `ios`, `web`. `budget` defaults to zero and must be a nonnegative number; it does not expand the free/open-source scope. `required_features` defaults to an empty string list. Hardware and internet fields are passed as context but are not evaluated by this adapter.

The response has `schema_version: "0.1"`, `status: "matches" | "no_match"`, `recommendations`, `excluded`, and `limitations`. Each recommendation contains `project` (full catalog entry), `supported_features`, `unknown_features`, `missing_features`, `feature_coverage`, `compatibility_status`, and `warnings`. Coverage is null when no features were requested. `missing_features` is currently empty because the dataset does not record verified negative capability claims. `compatibility_status` is currently `needs_verification`. Exclusions contain `id` and `reasons`.

Input validation raises `ValueError`. Anna chooses HTTP status codes and endpoint shape; do not claim an API route already exists. Preserve the response's evidence and unknown fields at that boundary. A future game-package record should use a reviewed schema extension describing its relationship to the engine; do not silently change current consumers.

## Ownership and handoff

- **Codex / role 1:** catalog quality, evidence, game-package research, deterministic discovery behavior, fixtures and documentation.
- **Anna / role 2:** request interpretation, backend validation, orchestrator, feature analysis, model integration, API response mapping and backend execution boundaries.
- **Codex / role 3:** accessible request form, catalog/results presentation, evidence links, loading/error/no-result states, local mode and API adapter, demo walkthrough.
- **Claude:** inspect current project needs first, report its required inputs, then take an explicitly bounded task with a file owner and acceptance checks. Coordinate before editing files another contributor owns.

Role 1 exit gate: catalog and adapter checks pass; evidence and unknowns are visible; game-package readiness is explicitly reported; Anna has the versioned contract. Role 3 can begin now against that stable baseline while remaining role 1 research proceeds. End-to-end backend completion remains Anna's responsibility.

## Progress after Claude review

The catalog now has six entries with two per category; Minetest Game supplies a separately evidenced crafting/building candidate with Luanti dependency explicitly noted. See catalog-expansion-evidence.md and game-demo-evidence.md. Runtime checks remain pending. UI consumes the shared taxonomy and provides user-editable keyword category suggestions. Examples and catalog schema are committed contract artifacts. Ten Python checks plus JavaScript syntax verification pass locally. No new backend implementation was added.
