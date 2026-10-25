# Four-Section Product Plan: status

Static UI is implemented in `ui/index.html`, `ui/styles.css`, `ui/shell.js` and `ui/shell.test.mjs`. `ui/app.js` is unchanged.
No backend, auth or database work is included; Anna owns those. Brand: **RVAI** (confirmed by the user). The tab label is exactly **RVAI OpenSource**.
About was refreshed using n8n.io as a structural reference; see `docs/n8n-reference-brief.md`.

**Try-first flow (update).** The hero's primary CTA, the "Try first" card and the header's "Try Innovate" button all enter Innovate in preview-demo mode without the sign-up step (`data-try`). Clicking the Innovate nav link opens the dialog, and its "Preview demo" button then goes straight to Innovate. Alternatives stays gated and secondary.

Legend: ✅ implemented (static) · ⏳ pending, needs a user decision or Anna's backend.

## 1. Global navigation ✅
- `<nav aria-label="Main sections">` contains 4 links: About / Alternatives / Innovate / RVAI OpenSource. `aria-current="page"` marks the active link.
- Hash routes: `#about`, `#alternatives`, `#innovate`, `#opensource`. A fresh URL (no hash) or an unknown hash shows About.
- Inactive views get `hidden` and `inert`. The nav stays visible. Back/forward works through `hashchange`. In-app moves use `pushState`.
- After a nav or hash change, focus moves to the view (`tabindex="-1"`).
- These are separate from the nested agent tabs (Brief / Alternatives / Plan / Preview), which are unchanged.

## 2. About (public, landing) ✅
- Hero with mission line, primary CTA "Start building in Innovate", secondary "Search existing alternatives".
- Problem / Mission / Goal cards, Find → Extend → Create, and "What you can make" (websites, CAD-style design tools).
- Evidence: 3 slots marked **Team research/source pending**. No figures, testimonials, authors or counts.
- ⏳ Real evidence and visual references will come from the user.

## 3. Sign-up vs preview demo ✅ (prototype only)
- A modal `<dialog>` explains before the inputs that accounts aren't connected and nothing is saved or sent.
- Name and email are optional, have no `name` attributes, and the form has no action. Values are cleared with `reset()` and never read.
- Primary button: "Continue to demo". Alternative: "Preview demo without signing up".
- After either one: "No account created; authentication will connect later." The header shows "Preview demo · no account".
- Demo state is an in-memory variable. There's no storage or cookies, and it resets on reload.
- Gated views: Alternatives and Innovate open the dialog first. About and OpenSource are public. Once a visitor is in the demo, they aren't asked again.
- ⏳ Anna: real sign-up/auth. Hook point is `#signup-form` plus `startDemo()` in `shell.js`.

## 4. Service chooser ✅
- Innovate is the visually primary choice ("Recommended"); Alternatives is secondary.
- It appears after sign-up/preview, and can be reopened from the header button or the new sidebar button `#choose-service`.
- `#new-chat` still only resets the chat.

## 5. Innovate (wraps the existing app) ✅
- The existing app shell sits unchanged inside `#view-innovate`. Every element ID is preserved and the light blue/teal styling is kept.
- Height is `100dvh` minus the global header. `.main-shell` is `position:relative`, so the mobile workspace overlay stays inside the agent area. On mobile the sidebar starts below the global nav.
- Game starter removed from the sidebar. Only `cad` and `website` `data-example` buttons remain; the category and backend support for games stay.
- The sidebar brand is hidden (the global header carries it). The profile now reads "Demo workspace · No account".

## 6. Alternatives (global, secondary) ✅
- Reads `../data/alternatives.json` and `taxonomy.json` (the 6 real entries).
- Search covers name, feature, license and keywords. Category filters come only from the taxonomy: CAD, Video editing, Block-building games.
- Cards show license, check date, verification status, platforms, source/official/license links and notes. A banner says this is a small curated sample.
- A website query with no match explains that this reflects the sample's gaps, not evidence that no such tools exist.
- "Customize in Innovate" pre-fills `#message-input` and does **not** send. A `#handoff-chip` shows the starting point and stores `data-handoff` JSON. The chip clears on New project. If a project is already open, the chip suggests pressing New project first.
- ⏳ Live search comes from Anna. The agent consuming `data-handoff` is pending.

## 7. RVAI OpenSource (public, future) ✅ empty state
- A banner explains how it differs from Alternatives: original projects made with RevAI vs third-party software.
- Empty state "No published projects yet" with a create CTA. No sample cards.
- "Reuse as-is" vs "Request a customized version" are explained as coming later.
- ⏳ Publishing, the database and the custom-version request all need Anna's backend.

## 8. Tests (`node --test ui/shell.test.mjs`)
- Core IDs: every ID that `app.js` reads appears exactly once, and all IDs are unique. The chat is nested in Innovate.
- Navigation: 4 nav links with exact labels; About is current and the only visible view.
- Router: route resolution and gate helpers.
- No real auth: no password/secret inputs, no form action or names, no storage, cookies or beacons. The only fetch is for the static data files.
- Chooser: Innovate is primary.
- Copy: no numeric claims in About/OpenSource; evidence is marked pending; no game starter.
- Handoff and filtering are checked against the real catalog.
- Browser checks (focus, dialog, history, mobile overlay) still need Codex.

## 9. Open questions
1. ~~Final brand~~ Resolved: RVAI. Remaining "RevAI" strings are in `ui/app.js` (chat message labels) and `ui/website-template.js` (template preview marking, which a test asserts). Renaming them needs the owner of those files.
2. Should a reload keep the demo selection? Currently it doesn't, on purpose.
3. Evidence topics: are the 3 slot titles right, or should they match the user's sources?
