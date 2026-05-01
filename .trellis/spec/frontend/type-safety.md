# Type Safety

> Type safety patterns in this project.

---

## Overview

The project uses TypeScript with strict null checks, `noImplicitAny`, isolated modules, and bundler module resolution. ESLint enforces type-only imports and sorted imports/exports.

Type definitions should make ownership boundaries explicit: shared provider-neutral contracts in `src/core/`, feature-local types near the feature, and provider-specific types inside the provider package.

---

## Type Organization

- Put shared app/runtime/chat contracts in `src/core/types/` or `src/core/runtime/`.
- Put feature-local types in the feature folder, commonly `types.ts` or local interfaces.
- Keep provider-specific types under `src/providers/pi/`.
- Prefer local `Deps`, `Options`, and `Callbacks` interfaces for constructor contracts that are not reused elsewhere.
- Use `import type` for type-only imports.

Examples:

- `src/core/types/chat.ts`: shared conversation/message contracts.
- `src/core/types/settings.ts`: shared settings contracts.
- `src/core/runtime/ChatRuntime.ts`: provider-neutral runtime interface.
- `src/features/chat/state/types.ts`: chat feature state types.
- `src/features/chat/controllers/ConversationController.ts`: local dependency/callback typing.

---

## Validation

There is no project-wide runtime validation library such as Zod or Yup. Runtime checks are implemented where data crosses uncertain boundaries.

- Treat provider-owned state as opaque unless the provider layer decodes it.
- Prefer `unknown` or `Record<string, unknown>` at provider boundaries over assuming a concrete shape in feature code.
- Validate external or persisted data close to where it is read.

Examples:

- `src/core/types/chat.ts`: provider state is modeled opaquely.
- `src/core/providers/types.ts`: provider contracts define capabilities and services.
- `src/providers/pi/`: PI-specific code owns PI-specific decoding and adaptation.

---

## Common Patterns

- Use path aliases such as `@/features/...` for cross-directory source imports.
- Use explicit interfaces for public contracts and constructor dependency shapes.
- Keep generic helpers narrow; do not create broad type utilities for one-off code.
- Prefer provider-neutral interfaces in feature code.
- Let TypeScript infer obvious local values, but type public methods, callbacks, and exported contracts.

Examples:

- `src/features/chat/tabs/Tab.ts`: type-only imports and explicit tab dependencies.
- `src/shared/components/SelectableDropdown.ts`: typed reusable option/callback shapes.
- `src/main.ts`: plugin entrypoint imports and typed plugin class boundaries.

---

## Forbidden Patterns

- Do not use feature code to assert PI-specific shapes from `providerState`.
- Do not add `any` to bypass type errors; `no-explicit-any` is disabled for compatibility, but new code should prefer `unknown` plus narrowing.
- Do not add broad compatibility shims or fallback types without a concrete persisted/external consumer need.
- Do not export types from a feature solely because another feature could hypothetically need them later.
