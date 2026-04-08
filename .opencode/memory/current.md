# Current Work Memory

## Current objective
- Continue PI integration hardening in Obsidian, focusing on BUG-03 (extensions env) and BUG-04 (skills execution + `/` commands).

## Active thread
- Bridge-based PI provider is implemented and usable in UI; context + session/history bugs were fixed and user-verified; remaining issues are environment propagation and skills command integration.

## Confirmed decisions
- PI SDK must not be imported directly in Obsidian plugin bundle; run PI via Node sidecar bridge (`scripts/pi-bridge-server.mjs`).
- Keep PI provider isolated so Claude/Codex startup is unaffected.
- PI `prepareTurn()` now appends context using shared XML helpers (`appendCurrentNote`, `appendEditorContext`, `appendBrowserContext`, `appendCanvasContext`).
- PI history hydration is implemented from `~/.pi/agent/sessions/.../*.jsonl`; restart now restores messages in sidebar.
- PI runtime session restoration now passes `sessionId` through bridge init and resumes target session.
- PI user-message UI display is aligned with Claude: render `displayContent` (question-only) while preserving full persisted prompt.

## Constraints
- Must not break existing Claude/Codex providers.
- User asked to push only to personal remote (`origin: Destiny951/claudian`), never to `upstream`.
- No commit/push unless explicitly requested by user.

## Progress so far
- Implemented PI provider scaffold + bridge flow (`src/providers/pi/**`, `scripts/pi-bridge-server.mjs`, settings tab, registration).
- Fixed tool-result crash (`content.toLowerCase is not a function`) by normalizing PI tool result content to string in `PiEventAdapter`.
- Fixed BUG-01: selected/current-note/browser/canvas context is now encoded into PI prompt; user verified fix.
- Fixed BUG-02 (part 1): session restore across conversation switching now works via bridge sessionId restore.
- Fixed BUG-02 (part 2): restart hydration implemented; historical PI messages now load from JSONL after app restart.
- Fixed PI history display parity: strip XML context for UI via `displayContent` extraction.
- Updated docs: plan report and bug report (`docs/plans/obsidian_pi_claudian_plan_report.md`, `docs/bugs/pi_integration_issues_2026-04-09.md`).
- Created and pushed checkpoint commit to personal remote: `62bf3f1` on `origin/main`.

## Open items
- BUG-03: extensions can be discovered but runtime env vars (e.g. `MINIMAX_CN_API_KEY`) are missing in PI bridge process.
- BUG-04: skills execution still fails in PI path, and `/find-skills` style commands are not exposed in PI command catalog.
- PI aux services (`PiInlineEditService`, `PiInstructionRefineService`) still use direct SDK import path and should be bridged/isolated.

## Next step
- Investigate and fix BUG-03 by wiring PI bridge process env from provider-scoped settings (`plugin.getActiveEnvironmentVariables('pi')`) plus safe PATH merge, then reproduce minimax extension call in Obsidian.
