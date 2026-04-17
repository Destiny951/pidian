# CLAUDE.md

## Project Overview

Pidian is an Obsidian plugin that embeds the PI agent runtime in a sidebar and inline-edit flow.

## Architecture Status

- Product status: Claudian is PI-only. The provider-neutral registry, settings projection, and tab shell remain, but the only built-in provider is `pi`.
- App shell: `src/app/` owns shared settings defaults and plugin-level storage helpers. `src/core/` owns provider-neutral runtime, registry, tool, and type contracts.
- Provider boundary: `src/core/runtime/` and `src/core/providers/` define the chat-facing seam. `ProviderRegistry` creates runtimes and provider-owned auxiliary services. `ProviderWorkspaceRegistry` owns workspace services such as command catalogs, agent mention providers, and provider settings tabs.
- PI adaptor: `src/providers/pi/` owns the bridge client, runtime, history hydration, command catalog, and PI-specific settings UI.
- Conversations: `Conversation` still carries `providerId` and opaque `providerState`, but built-in sessions now default to `pi`.

## Commands

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm run lint:fix
npm run test
npm run test:watch
npm run test:coverage
```

## Architecture

| Layer | Purpose | Details |
|-------|---------|---------|
| **app** | Shared defaults and plugin-level storage helpers | `defaultSettings`, `ClaudianSettingsStorage`, `SharedStorageService` |
| **core** | Provider-neutral contracts and infrastructure | See [`src/core/CLAUDE.md`](src/core/CLAUDE.md) |
| **providers/pi** | PI bridge + runtime adaptor | `bridge/`, `runtime/`, `history/`, `ui/` |
| **features/chat** | Main sidebar interface | See [`src/features/chat/CLAUDE.md`](src/features/chat/CLAUDE.md) |
| **features/inline-edit** | Inline edit modal and provider-backed edit services | `InlineEditModal` plus provider-owned inline edit services |
| **features/settings** | Shared settings shell with provider tabs | General tab plus the PI settings tab renderer |
| **shared** | Reusable UI building blocks | Dropdowns, modals, mention UI, icons |
| **i18n** | Internationalization | 10 locales |
| **utils** | Cross-cutting utilities | env, path, markdown, diff, context, file-link, image, browser, canvas, session, subagent helpers |
| **style** | Modular CSS | See [`src/style/CLAUDE.md`](src/style/CLAUDE.md) |

## Storage

| Path | Contents |
|------|----------|
| `.claudian/claudian-settings.json` | Shared Claudian app settings plus provider-specific configuration |
| `.claudian/sessions/*.meta.json` | Provider-neutral session metadata |
| `~/.pi/agent` | PI agent resources and config |
| `~/.pi` | PI-native session data |

## Development Notes

- Prefer PI-native behavior over reimplementing PI features locally.
- PI SDK resolution is automatic; do not reintroduce user-configured `PI_SDK_PATH` or `PI_AGENT_DIR`.
- Runtime exploration should use real data under `~/.pi/`.
- Comments: comment why, not what.
- Run `npm run typecheck && npm run lint && npm run test && npm run build` after editing.
