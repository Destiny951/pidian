# State Management

> How state is managed in this project.

---

## Overview

The project does not use an external frontend state library. State is owned by feature classes, per-tab state objects, controllers, and provider services.

State should stay as close as possible to the owner that can update and clean it up correctly.

---

## State Categories

- Per-tab chat state lives in `ChatState`.
- Multi-tab coordination lives in `TabManager` and `Tab`.
- Stream/session lifecycle belongs in controllers and runtimes.
- Small UI state can live in focused UI/state classes.
- Persisted plugin settings are owned by `src/app/` storage helpers and provider settings tabs.
- Provider-native session data stays under provider ownership, especially `src/providers/pi/` and `~/.pi` data access.

Examples:

- `src/features/chat/state/ChatState.ts`: per-tab messages, selections, and callbacks.
- `src/features/chat/state/types.ts`: feature state type definitions.
- `src/features/chat/tabs/Tab.ts`: tab-scoped state, runtime, and lifecycle.
- `src/features/chat/tabs/TabManager.ts`: active tab and tab collection coordination.
- `src/features/chat/ui/file-context/state/FileContextState.ts`: focused feature UI state.

---

## When to Use Global State

Avoid global state by default. Promote state only when multiple owners need coordinated access and there is a clear lifecycle owner.

Use these existing owners before adding anything global:

- `ChatState` for data that belongs to one chat tab.
- `TabManager` for cross-tab UI coordination.
- `ClaudianSettingsStorage` / `SharedStorageService` for persisted plugin settings.
- Provider registries for provider-owned services and capabilities.

---

## Server State

This is an Obsidian plugin, not a browser app with server-state caching. Provider/runtime data should cross the provider-neutral runtime boundary.

- Stream chunks are adapted by provider runtimes into provider-neutral events.
- Conversation metadata can carry `providerId` and opaque `providerState`.
- Feature code must not inspect PI-specific fields inside `providerState`.

Examples:

- `src/core/types/chat.ts`: provider-neutral conversation and message types.
- `src/core/runtime/ChatRuntime.ts`: runtime boundary for chat send/stream behavior.
- `src/providers/pi/runtime/PiChatRuntime.ts`: PI-specific adaptation behind the boundary.

---

## Common Mistakes

- Do not introduce Redux/Zustand-style global stores for local feature state.
- Do not share mutable state across tabs unless `TabManager` owns the coordination.
- Do not read provider-specific `providerState` fields from feature/UI code.
- Do not duplicate derived state without a clear invalidation path.
