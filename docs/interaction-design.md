# Interaction design: conversation to useful result

The UI is a chat (left) with a project workspace (right: Brief, Alternatives, Plan, Preview). It follows find → extend → create and never pretends a scripted demo understands free text.

## Flow (scripted demo)

1. **Goal**: a free-text goal. A keyword hint picks a catalog category, a website, or "uncategorized". The goal is kept word for word (e.g. "Fusion 360 … with an AI helper").
2. **Purpose**: who it is for and what they can't do today.
3. **Features**: suggestion chips plus free text. Recognized features map to the taxonomy; anything else stays visible as "unverified".
4. **Device & limits**: an inline form for OS, RAM, GPU, free storage, max install/project size and internet. Every field is optional; unknown stays `null`.
5. **Alternatives**: catalog cards with evidence links, declared license, unverified hardware/offline/size lines, unknowns and notes, plus an Excluded list with reasons. The website and uncategorized paths say "this curated catalog has no entries", not "none exist".
6. **Route**: Find / Extend on a user-chosen base project (buttons on each card), or Create. Every plan ends with an **Acceptance check**.
7. **Revise**: "Change features / device limits / purpose" re-asks the question (the form is prefilled) and recomputes everything. An invalidated base or template is dropped with a visible notice.
8. **Website Create only**: plan review → explicit **Create demo website template** → sandboxed preview + HTML download, labeled "Template preview — not AI-generated".

## Honesty rules

- **Labels**: scripted, template and agent content are labeled by source. The badge reads "Agent selected · unverified" until a real reply arrives.
- **Unknown vs missing**: unknown is never shown as missing; features without evidence are "not evidenced in catalog (unverified)".
- **No fake activity**: no fake progress, installs or tests. Agent `steps[]` are shown only when the backend reports them, as "Reported by connected agent".
- **Proposals**: CAD, game and other Create routes are proposals until Anna's agent is connected.
- **Refusals**: cracking or licence-bypass requests get a short scripted refusal with lawful alternatives. Real enforcement is backend-side.
- **Wording**: user-facing text uses friendly labels; internal IDs stay in the exported JSON.

## Agent display slots (pending backend)

- Assistant message or clarifying question (with options)
- Revised brief
- 0.1 discovery
- Plan steps
- Reported steps
- Limitations
- `refused` / `needs_info` / `error` states with Retry

Approval of real builds and agent artifacts needs Anna's backend; the UI shows no decorative execution buttons.
