# Chat Feature

Main sidebar chat interface. `ClaudianView` assembles tabs, controllers, renderers, and provider-backed services around the shared `ChatRuntime` boundary.

## Provider Boundary Status

- Chat features depend on `ChatRuntime`, `ProviderCapabilities`, and provider-neutral conversation data.
- Session bookkeeping lives in `Conversation.providerState`; feature code must not read provider-specific fields directly.
- Provider-owned services are resolved through registries.
- Built-in provider surface: PI owns runtime, command catalog, title generation, instruction refine, inline edit, compact, and history replay.

## Key Patterns

- Tabs stay cold until the first send.
- Stream handling stays provider-neutral; PI runtime adapts provider events into `StreamChunk`.
- `/compact` is PI-owned and handled through the bridge sidecar.

## Gotchas

- `ClaudianView.onClose()` must abort active tabs and dispose runtimes.
- `ChatState` is per-tab; `TabManager` still coordinates provider-aware command catalogs even though only PI is built in.
- Bang-bash mode bypasses provider runtimes and executes a local shell command directly; PI does not currently expose it in `ProviderChatUIConfig`.
