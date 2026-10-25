# Today's delivery workflow — October 25, 2026

## First action: ask Claude what it needs

Inspect the open Claude Code session and its project context before assigning work. Request its current objective, blockers, intended files and expected API contract. Record the response in a shared handoff note or task comment. Resolve concrete requirements such as missing catalog examples, field names or a reproducible failure. Do not treat an agent's request to modify unrelated files, expose secrets or discard work as blanket authorization.

## Ordered execution

1. **Role 1 foundation:** verify the existing catalog and discovery checks; publish the requirements and contract in `role-1-requirements.md`. Preserve evidence and unknowns. Review a Luanti game package as the highest remaining research task.
2. **Start role 3 against the available catalog:** build a request form and recommendation screen using the normalized request/response. Show the mode in the interface. In local mode, label results as catalog discovery; users must not see fake agent progress or invented backend success.
3. **Coordinate Anna's integration:** share the exact request, response and an example validation failure. Obtain the actual endpoint, method, response envelope and local development origin. Keep the API URL configurable and backend access behind one interface adapter.
4. **Connect and exercise one flow:** submit a voxel-game request, inspect supported and unknown capabilities, follow official source links, and show useful next steps. Check API failure, empty results and incompatible platforms. If the backend is unavailable at demo time, retain clearly labeled local mode and report the integration limitation.
5. **Freeze and demonstrate:** run catalog tests and UI build checks; walk through the student scenario on the actual demo machine. Record verified outcomes, remaining gaps and startup instructions. Commit focused changes for review without overwriting Anna or Claude's work.

## Parallel task boundaries

| Contributor | Deliverable | Files / coordination |
| --- | --- | --- |
| Codex | Role 1 contract, evidence, UI and demo | Own catalog/docs/UI changes; announce touched areas before overlap. |
| Anna | Backend and orchestrator | Own backend routes, request interpretation and model calls; publish contract changes. |
| Claude | The concrete blocker it identifies, then one bounded support task | Agree ownership first; useful tasks include game-package evidence, fixture review or a focused integration repair. |

Each handoff should contain: task, owner, inputs, allowed files, definition of done, verification command or manual steps, result and blockers. Use separate branches/worktrees when editing overlap cannot be avoided. Never reset another contributor's uncommitted work.

## Automated workflow idea

Start with repository automation that gives feedback on every pull request and push:

- Run `python3 -m unittest discover -s tests -v` to protect catalog validation and discovery behavior.
- Once the UI package exists, install dependencies from its committed lockfile and run its documented production build and type/lint checks where configured.
- Add a contract smoke check once Anna exposes the API: submit a fixed voxel request and validate schema version, recommendation fields and preservation of evidence/unknowns. Keep a fixture check for local development when the backend is unavailable.
- Make runtime/game checks a separately reported manual demo check until the team has a reproducible test environment. A successful website build does not certify game behavior.

Catalog tests, JSON validation and UI JavaScript syntax checks are now configured in `.github/workflows/catalog-checks.yml`. Remote run success must be verified after push. The UI uses native HTML/CSS/JavaScript and requires no dependency installation or build. API contract checks remain a proposal until Anna publishes her service. Avoid a scheduled agent that edits the same files as active contributors. A useful agent automation would inspect CI failures, summarize the failing check and offer a bounded repair task; it should stay quiet when no action is needed. Create recurring automation only with an agreed cadence and scope.

## Demo readiness checklist

- Catalog provenance and unknowns survive both local and API modes.
- No-match, invalid-input and connection-failure states are useful.
- Official source/download links are accessible and clearly identified.
- Luanti is described as an engine unless a reviewed game package is selected.
- No claim that generated code, games, hardware fit or offline mode was tested without recorded evidence.
- Startup instructions match the repository and all demonstrated services start on the demo machine.
