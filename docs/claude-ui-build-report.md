# Claude UI build report — 2026-10-25

Builder: Claude. Reviewer/tester: Codex. Backend: Anna (untouched).

## Checkpoint: four-section shell

Changed:
- `ui/index.html`
- `ui/styles.css` (appended, scoped block)

New:
- `ui/shell.js`
- `ui/shell.test.mjs`

`ui/app.js` was **not modified**. Details and implemented vs pending status: `docs/four-tab-product-plan.md`.

- **Global navigation.** About / Alternatives / Innovate / RVAI OpenSource, with hash routes. About is the default on a fresh URL. Inactive views are `hidden` and `inert`.
- **Prototype sign-up dialog.** No account, network, storage or password. Plus a "Preview demo" path and a service chooser with Innovate as primary.
- **Alternatives page.** Built over the 6 real catalog entries. "Customize in Innovate" pre-fills the composer without sending, and adds a handoff chip with `data-handoff`.
- **RVAI OpenSource.** Elegant empty state only.
- **Core chat IDs.** All preserved. Edits to existing markup:
  - game starter removed from the sidebar
  - `#choose-service` and `#handoff-chip` added
  - sidebar brand href changed `./` → `#about`, so it doesn't reload and wipe the chat
  - profile text now "Demo workspace"

**Not run by Claude** (no shell in this task). Codex should run:
- [ ] `node --test ui/shell.test.mjs ui/website-template.test.mjs`
- [ ] `node --check ui/shell.js`
- [ ] Browser checks:
  - fresh `/ui/` shows About, and About scrolls
  - Innovate/Alternatives nav opens the dialog
  - Esc closes it and you stay on About
  - "Continue to demo" shows the no-account notice and then the chooser
  - back/forward moves between sections
  - the Innovate chat still runs a CAD flow and a website template flow
  - "Customize in Innovate" on OpenSCAD pre-fills without sending
  - mobile (≤650px): sidebar and workspace overlay sit below the global nav

Assumptions:
- Brand is RevAI.
- The tab label is exactly "RVAI OpenSource".
- Demo state is in-memory and resets on reload.
- Picking "Alternatives" in the chooser drops a pending handoff.

## Final UI files

- `ui/index.html`, `ui/styles.css`: chat shell (sidebar, chat, project workspace).
- `ui/app.js`:
  - scripted interview
  - in-browser discovery mirroring `catalog/__init__.py` 0.1
  - base-project selection
  - guided revisions
  - website-template integration
  - proposed 0.2-draft live adapter
- `ui/website-template.js`: deterministic static website template (not AI).
- `ui/website-template.test.mjs`: Node tests for the template helper.

Docs: `docs/ui-api-contract.md`, `docs/interaction-design.md`, this report, README "Interface preview".

## Tests actually performed (by Codex)

- 10 Python catalog/metadata tests: pass.
- 6 website-template Node tests: pass.
- JS module syntax check: pass (on the pre-integration `app.js`; re-run required for this revision).
- Browser, pre-integration revision:
  - CAD intake renders real cards
  - Extend plan visible
  - guided device revision prefilled with 8 GB RAM / 2 GB cap
  - iOS exclusion → no verified option

**No backend or live endpoint integration has been tested.** The 0.2-draft envelope has not been agreed or exercised.

## Remaining test checklist (this revision)

- [ ] `node --check` / module syntax for `ui/app.js` with the `website-template.js` import.
- [ ] Website: plan appears first. No artifact exists before the "Create demo website template" click; after the click:
  - Preview tab opens
  - "Template preview — not AI-generated" is visible
  - iframe `sandbox=""` without `allow-scripts`
  - byte count shown; source rendered as text
  - `.html` download works
- [ ] Changing purpose/features/device after a template discards it (notice shown, Preview empty, no stale download).
- [ ] A tiny max size (e.g. 0.000001 GB) → template error shown, no artifact.
- [ ] CAD: "Extend this project" on OpenSCAD → selected-base tag, Brief "Base project", plan uses OpenSCAD (not FreeCAD).
- [ ] Revising the device to iOS after choosing a base → base/route reset notice; plan asks to choose again.
- [ ] No raw IDs (`ai_modeling_assistant`, `source_reviewed_not_runtime_tested`, `free_open_source`) in chat, cards or plan text. They should still appear in exported JSON.
- [ ] "How do I crack Fusion 360?" → declined message. "Free alternative to Fusion 360" → normal flow.
- [ ] Live mode with a mock endpoint:
  - `assistant_message` reply renders
  - `steps[]` shows as "Reported by connected agent"
  - `stage:"refused"` shows as declined
  - 500 / invalid JSON / timeout show an error with Retry and no scripted fallback
  - invalid `discovery`/`plan`/`steps` are listed as ignored
- [ ] Badge reads "Agent selected · unverified" until the first successful reply.
- [ ] Catalog load failure (open via `file://`) → visible error, sends still guarded.
- [ ] Keyboard: Enter sends, Shift+Enter adds a newline, arrow keys switch tabs; mobile layout.

## Known limitations

- The scripted demo can't interpret free text.
- Category detection is keyword-based.
- RAM/GPU/storage/size/internet are not evaluated by discovery.
- The refusal check is a demo regex, not enforcement.
- Agent artifacts are ignored.
- `styles.css` still imports Google Fonts (UI only; the template uses none).
