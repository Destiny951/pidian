# Hook Guidelines

> How hooks are used in this project.

---

## Overview

React hooks are not used in this project. No custom `use*` hook pattern exists in `src/`; shared stateful logic is implemented with classes, controllers, managers, and provider-neutral services.

When adding frontend behavior, follow the existing Obsidian class/controller patterns instead of introducing React or hook-style abstractions.

---

## Custom Hook Patterns

Use these alternatives instead of hooks:

- Controller classes for user actions and side effects.
- Manager classes for lifecycle coordination.
- State classes for mutable feature state with explicit getters/setters.
- Small UI classes for DOM ownership and rendering.
- Factories/registries for provider-owned services.

Examples:

- `src/features/chat/controllers/ConversationController.ts`: action orchestration without hooks.
- `src/features/chat/controllers/StreamController.ts`: streaming lifecycle coordination.
- `src/features/chat/tabs/Tab.ts`: tab-scoped composition and cleanup.
- `src/features/chat/tabs/TabManager.ts`: multi-tab coordination.

---

## Data Fetching

There is no React Query, SWR, or component-level fetch cache. Runtime and provider calls flow through service/runtime boundaries.

- Chat sends and stream reads go through `ChatRuntime` and provider adaptors.
- PI-specific data is fetched or replayed inside `src/providers/pi/`.
- Feature code uses provider-neutral registries and services.

Examples:

- `src/core/runtime/ChatRuntime.ts`: provider-neutral chat runtime contract.
- `src/providers/pi/runtime/PiChatRuntime.ts`: PI runtime adaptor.
- `src/providers/pi/history/`: PI history hydration and replay ownership.

---

## Naming Conventions

- Do not create `useSomething` functions unless the project adopts React in the future.
- Name stateful collaborators by role: `*Controller`, `*Manager`, `*State`, `*Service`, `*Runtime`, or focused UI names such as `ModelSelector`.
- Keep small helper functions local unless there is proven reuse.

---

## Common Mistakes

- Do not add React as an implementation dependency for new UI.
- Do not port hook examples from web apps into Obsidian DOM code.
- Do not hide provider/runtime side effects inside generic helpers; keep lifecycle visible in controllers, tabs, or provider services.
