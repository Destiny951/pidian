# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

Frontend quality is enforced through TypeScript, ESLint, Jest, and the Obsidian DOM conventions used across the codebase. After editing code, run the project verification sequence from `AGENTS.md`:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

For documentation-only changes, at minimum verify the changed docs and task state; full code checks are not required unless code changed.

---

## Forbidden Patterns

- Do not introduce React patterns, hooks, or dependencies into the Obsidian DOM UI.
- Do not let provider-specific PI logic leak into provider-neutral feature code.
- Do not skip runtime cleanup for active tabs, streams, event listeners, or provider runtimes.
- Do not add CSS without registering it in `src/style/index.css`.
- Do not use `!important` except when overriding Obsidian defaults.
- Do not add generic abstractions, wrappers, or fallback behavior without a concrete need.

---

## Required Patterns

- Keep `src/core/` provider-neutral.
- Resolve provider-owned services through registries instead of direct feature imports.
- Keep `ChatState` per-tab and coordinate cross-tab behavior through `TabManager`.
- Use `.claudian-` CSS classes and Obsidian CSS variables for plugin-owned UI.
- Add accessible names for icon-only controls and preserve keyboard behavior.
- Use type-only imports where applicable.
- Comments should explain why, not what.

Examples:

- `src/features/chat/CLAUDE.md`: chat/provider boundary and lifecycle gotchas.
- `src/core/CLAUDE.md`: core provider-neutrality rules.
- `src/style/CLAUDE.md`: CSS naming, build, and theme rules.

---

## Testing Requirements

- Unit tests live under `tests/unit/` and mirror source structure.
- DOM-heavy tests should use shared test helpers and mocks rather than relying on real Obsidian APIs.
- Add or update tests when behavior changes; documentation-only edits do not need Jest changes.
- Prefer the smallest focused test that covers the changed behavior.

Examples:

- `tests/unit/features/chat/state/ChatState.test.ts`: state behavior tests.
- `tests/unit/shared/components/SelectableDropdown.test.ts`: shared DOM component tests.
- `tests/unit/providers/pi/PiChatRuntime.test.ts`: provider runtime behavior tests.
- `tests/helpers/mockElement.ts`: DOM mock helper.

---

## Code Review Checklist

- Does the change preserve the provider boundary between `features/`, `core/`, and `providers/pi/`?
- Is state owned by the smallest correct lifecycle owner?
- Are DOM components typed with explicit options/deps/callbacks?
- Are CSS classes registered, prefixed, theme-aware, and free of unnecessary `!important`?
- Are cleanup paths covered for listeners, streams, tabs, and runtimes?
- Are relevant tests added or updated for behavior changes?
- Do `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` pass when code changes?
