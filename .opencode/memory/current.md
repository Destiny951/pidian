# Current Work Memory

## Current objective
- Fix and verify BUG-04 (tool block UI not rendering for non-first tools in PI turns).

## Active thread
- PI bridge integration is functional; context, session/history, and env propagation bugs were fixed in prior sessions. Currently debugging tool block display in UI.

## Confirmed decisions
- PI SDK must not be imported directly in Obsidian plugin bundle; run PI via Node sidecar bridge (`scripts/pi-bridge-server.mjs`).
- Keep PI provider isolated so Claude/Codex startup is unaffected.
- PI `prepareTurn()` now appends context using shared XML helpers (`appendCurrentNote`, `appendEditorContext`, `appendBrowserContext`, `appendCanvasContext`).
- PI history hydration is implemented from `~/.pi/agent/sessions/.../*.jsonl` via `PiConversationHistoryService`.
- PI runtime session restoration now passes `sessionId` through bridge init and resumes target session.
- PI user-message UI display is aligned with Claude: render `displayContent` (question-only) while preserving full persisted prompt.

## Constraints
- Must not break existing Claude/Codex providers.
- User asked to push only to personal remote (`origin: Destiny951/claudian`), never to `upstream`.
- No commit/push unless explicitly requested by user.

## Progress so far
- Implemented PI provider scaffold + bridge flow (`src/providers/pi/**`, `scripts/pi-bridge-server.mjs`, settings tab, registration).
- Fixed tool-result crash (`content.toLowerCase is not a function`) by normalizing PI tool result content to string in `PiEventAdapter`.
- Fixed BUG-01: selected/current-note/browser/canvas context now encoded into PI prompt.
- Fixed BUG-02: session restore across conversation switching + restart hydration from JSONL.
- Fixed PI history display parity via `displayContent` extraction.
- Fixed BUG-03: bridge process env injection via `plugin.getActiveEnvironmentVariables('pi')` + PATH merge.
- Fixed BUG-04 root cause: `types.ts` defined `toolUseId` but bridge sends `toolCallId` — fixed field name + updated all `PiEventAdapter.ts` references.
- Updated docs: plan report and bug report.
- Created and pushed checkpoint commit to personal remote: `62bf3f1` on `origin/main`.

## Open items
- BUG-04 verification: reload plugin, test with multiple tools, confirm tool blocks display correctly for both.
- BUG-05: skills execution still fails in PI path, `/find-skills` style commands not exposed.
- PI aux services (`PiInlineEditService`, `PiInstructionRefineService`) still use direct SDK import path.

## Next step
- User reloads plugin, sends a multi-tool request (e.g., "测试 web_fetch 和 minimax_web_search") in PI tab, observes whether both tool blocks render in sidebar UI.
