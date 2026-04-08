# Durable Memory

## Stable constraints
- Preserve Claude/Codex behavior while integrating PI; PI failures must not break plugin startup.
- Do not commit or push unless explicitly requested.
- When pushing, use personal remote `origin (Destiny951/claudian)` only; do not push to `upstream`.
- Obsidian/Electron runtime cannot safely host direct PI SDK bundle imports (`file://`, `node:*`, `import.meta` issues).

## Architectural / workflow decisions
- PI integration uses bridge architecture: plugin runtime (`src/providers/pi/bridge/PiBridgeClient.ts`) + sidecar (`scripts/pi-bridge-server.mjs`).
- PI provider prompt encoding uses shared XML context helpers (`appendCurrentNote`, `appendEditorContext`, `appendBrowserContext`, `appendCanvasContext`).
- PI history is hydrated from `~/.pi/agent/sessions/<encoded-cwd>/*.jsonl` via `PiConversationHistoryService`.
- Session continuity uses persisted `conversation.sessionId` propagated through bridge init (`sessionId` in protocol).
- UI rendering should show `displayContent` for user bubble, while `content/persistedContent` can include full context payload.

## Conventions to preserve
- Keep PI provider code under `src/providers/pi/**`; keep bridge protocol explicit in `src/providers/pi/bridge/protocol.ts`.
- Prefer provider-specific settings/environment flow similar to Codex/Claude (`plugin.getActiveEnvironmentVariables(providerId)` + PATH merge).
- Validate integration changes with focused tests and build (`npm test ...`, `npm run typecheck`, `npm run build`).
- Keep docs updated when scope or bug status changes (`docs/plans/...`, `docs/bugs/...`).

## Preferences worth keeping
- User prefers direct, evidence-based root-cause analysis before fixes.
- User prefers Chinese responses.
- User is developing in `npm run dev` loop with Obsidian reload for verification.
