# Frontend Development Guidelines

> Best practices for frontend development in this project.

---

## Overview

Claudian's frontend is an Obsidian plugin UI built with TypeScript classes, controllers, and direct DOM APIs rather than React. These guides document the conventions used by the existing codebase: provider-neutral feature and core layers, PI-specific provider adaptors, per-tab chat state, and modular `.claudian-` CSS.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Filled |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props, composition | Filled |
| [Hook Guidelines](./hook-guidelines.md) | Custom hooks, data fetching patterns | Filled |
| [State Management](./state-management.md) | Local state, global state, server state | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | Filled |
| [Type Safety](./type-safety.md) | Type patterns, validation | Filled |

---

## Core Frontend Conventions

- Build UI with Obsidian DOM APIs (`createDiv`, `createEl`, `createSpan`) and explicit cleanup, not React components or hooks.
- Keep `src/core/` and `src/features/` provider-neutral; PI bridge/runtime/history/settings logic belongs under `src/providers/pi/`.
- Keep `ChatState` tab-scoped and use `TabManager`/`Tab` for cross-tab coordination and lifecycle cleanup.
- Register CSS modules through `src/style/index.css`, use `.claudian-` selectors, and prefer Obsidian CSS variables.

Examples: `src/features/chat/ClaudianView.ts`, `src/features/chat/state/ChatState.ts`, `src/features/chat/tabs/TabManager.ts`, `src/providers/pi/runtime/PiChatRuntime.ts`, and `src/style/CLAUDE.md`.

---

**Language**: All documentation should be written in **English**.
