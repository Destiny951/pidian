# Directory Structure

> How frontend code is organized in this project.

---

## Overview

Claudian is an Obsidian plugin, so frontend code is TypeScript that builds DOM views, modals, controllers, and feature services rather than React pages. Keep provider-neutral UI and runtime contracts separate from PI-specific implementation.

Primary rule: place code by ownership boundary first, then by feature role.

---

## Directory Layout

```text
src/
|-- app/                 # shared settings defaults and plugin-level storage helpers
|-- core/                # provider-neutral runtime, registry, tool, and type contracts
|-- features/
|   |-- chat/            # main sidebar chat UI, controllers, renderers, tabs, state
|   |-- inline-edit/     # inline edit modal and provider-backed edit flow
|   +-- settings/        # shared settings shell and provider tab rendering
|-- providers/
|   +-- pi/              # PI bridge, runtime adaptor, history, command catalog, PI UI
|-- shared/              # reusable components, dropdowns, modals, icons, mention UI
|-- style/               # modular CSS, imported from src/style/index.css
|-- i18n/                # locale files
|-- utils/               # cross-cutting utilities
+-- main.ts              # Obsidian plugin entrypoint
```

---

## Module Organization

- `src/features/chat/` is feature-first and subdivided by responsibility: `controllers/`, `rendering/`, `services/`, `state/`, `tabs/`, `ui/`, and `utils/`.
- `src/core/` must stay provider-neutral. Feature code should depend on `ChatRuntime`, provider registries, and shared types from `core`, not on PI internals.
- `src/providers/pi/` owns all PI-specific bridge/runtime/history/settings behavior. Do not add PI-specific reads to feature code.
- `src/shared/` is for reusable UI pieces that have no chat-specific or provider-specific ownership.
- `src/style/` mirrors UI areas and must be registered through `src/style/index.css` when a new CSS module is added.

---

## Naming Conventions

- Use PascalCase for class/component files such as `ClaudianView.ts`, `ModelSelector.ts`, and `ConfirmModal.ts`.
- Use lower-case folder names grouped by responsibility: `controllers`, `state`, `tabs`, `ui`, `services`.
- Keep feature-local types near the feature, usually in `types.ts` or a local interface in the owning file.
- Use `@/` imports for source paths when importing across directories.
- CSS classes owned by the plugin use the `.claudian-` prefix and BEM-lite naming documented in `src/style/CLAUDE.md`.

---

## Examples

- `src/features/chat/ClaudianView.ts`: assembles the chat sidebar around tabs, controllers, renderers, and provider-backed services.
- `src/features/chat/controllers/InputController.ts`: controller code stays under the chat feature instead of shared UI.
- `src/features/chat/state/ChatState.ts`: per-tab chat state is isolated in the feature state folder.
- `src/features/chat/ui/toolbar/ModelSelector.ts`: focused UI class under a nested feature UI folder.
- `src/shared/components/SelectableDropdown.ts`: reusable component outside chat-specific ownership.
- `src/providers/pi/runtime/PiChatRuntime.ts`: provider-specific runtime implementation kept behind the provider boundary.

---

## Anti-Patterns

- Do not put PI-specific fields or bridge logic in `src/features/chat/`.
- Do not add shared abstractions for one-off feature code; keep code in the owning feature until reuse is real.
- Do not add CSS files without importing them from `src/style/index.css`.
