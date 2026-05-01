# Component Guidelines

> How components are built in this project.

---

## Overview

This project does not use React components. UI is built with Obsidian DOM APIs and TypeScript classes/functions that create elements with methods such as `createDiv`, `createEl`, and `createSpan`.

Components should be small DOM owners with explicit dependencies and cleanup. Keep orchestration in controllers or view classes, not in reusable UI components.

---

## Component Structure

Use class-based DOM helpers for reusable UI and Obsidian `Modal` subclasses for dialogs.

Typical structure:

```ts
interface ExampleComponentCallbacks {
  onSelect(value: string): void;
}

export class ExampleComponent {
  constructor(
    private readonly parentEl: HTMLElement,
    private readonly callbacks: ExampleComponentCallbacks,
  ) {}

  render(): void {
    this.parentEl.empty();
    const container = this.parentEl.createDiv({ cls: 'claudian-example' });
    container.createEl('button', { text: 'Choose' });
  }
}
```

Examples:

- `src/features/chat/ui/toolbar/ModelSelector.ts`: feature UI class rendered into a parent element.
- `src/shared/components/SelectableDropdown.ts`: shared dropdown component with typed options and callbacks.
- `src/features/chat/ui/NavigationSidebar.ts`: DOM rendering, selection state, and keyboard-friendly controls.
- `src/shared/modals/ConfirmModal.ts`: Obsidian modal using `onOpen` and `onClose`.

---

## Props Conventions

- Prefer local `interface ...Options`, `interface ...Callbacks`, or `interface ...Deps` types in the owning file when the shape is not shared.
- Pass dependencies explicitly through constructors rather than importing singletons.
- Use callbacks for UI events and let controllers/services own side effects.
- Keep provider-owned data behind provider-neutral types and registries.

Examples:

- `src/features/chat/controllers/ConversationController.ts`: controller dependencies and callbacks are explicit.
- `src/features/chat/ui/InputToolbar.ts`: UI composition is driven by typed options/dependencies.
- `src/shared/components/SelectableDropdown.ts`: reusable props are typed near the component.

---

## Styling Patterns

- Use CSS classes, not inline style objects, for stable UI styling.
- Claudian-owned selectors use `.claudian-` and BEM-lite naming: `.claudian-{block}`, `.claudian-{block}-{element}`, `.claudian-{block}--{modifier}`.
- Prefer Obsidian CSS variables such as `--background-*`, `--text-*`, and `--interactive-*`.
- Avoid `!important` unless overriding Obsidian defaults.
- Add new CSS modules under `src/style/` and import them from `src/style/index.css`.

Examples:

- `src/style/CLAUDE.md`: canonical CSS structure and naming rules.
- `src/style/accessibility.css`: accessibility-focused CSS helpers.
- `src/style/index.css`: CSS build import order.

---

## Accessibility

- Add labels or `aria-label` for icon-only controls.
- Use `title` where it improves Obsidian UI discoverability, but do not rely on title as the only accessible name.
- Preserve keyboard interaction for dropdowns, navigation, and modal actions.
- Prefer Obsidian `Setting` components in settings and modal forms when possible.

Examples:

- `src/features/chat/ui/NavigationSidebar.ts`: navigation controls and labels.
- `src/features/chat/controllers/ConversationController.ts`: action button labels and titles.
- `src/shared/modals/ConfirmModal.ts`: modal button structure.

---

## Common Mistakes

- Do not introduce React component patterns or hooks; this codebase is Obsidian DOM-based.
- Do not let reusable components directly mutate chat/session state; expose callbacks and keep state ownership in controllers or state classes.
- Do not read PI-specific provider state from UI components.
- Do not skip cleanup for listeners, active streams, or runtime resources owned by a view/tab.
