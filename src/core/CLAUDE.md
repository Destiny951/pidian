# Core Infrastructure

Core modules stay provider-neutral. Features depend on `core/`; providers implement the boundary behind it.

## Runtime Status

- `core/runtime/` and `core/providers/` define the chat-facing seam. `ChatRuntime` is the neutral runtime interface. `src/providers/pi/runtime/` provides the built-in concrete implementation.
- `ProviderRegistry` owns runtime and auxiliary-service factories. `ProviderWorkspaceRegistry` owns provider workspace services such as command catalogs, agent mentions, and provider settings tabs.
- PI-specific bridge, history, command catalog, and workspace services live under `src/providers/pi/`.

## Modules

| Module | Purpose | Key Files |
|--------|---------|-----------|
| `bootstrap/` | Provider-neutral session metadata storage and shared app-storage contracts | `SessionStorage`, `storage.ts` |
| `commands/` | Built-in cross-provider commands | `builtInCommands` |
| `mcp/` | Provider-neutral MCP coordination and config parsing | `McpConfigParser`, `McpServerManager`, `McpTester`, `McpStorageAdapter` |
| `prompt/` | Shared prompt templates | `mainAgent`, `inlineEdit`, `titleGeneration`, `instructionRefine` |
| `providers/` | Registry, capability, environment, and workspace-service contracts | `ProviderRegistry`, `ProviderWorkspaceRegistry`, `ProviderSettingsCoordinator`, `providerEnvironment`, `providerConfig`, `modelRouting`, `types` |
| `providers/commands/` | Shared command catalog contracts | `ProviderCommandCatalog`, `ProviderCommandEntry`, `hiddenCommands` |
| `runtime/` | Provider-neutral runtime contracts | `ChatRuntime`, `ChatTurnRequest`, `PreparedChatTurn`, `SessionUpdateResult`, approval/query types |
| `security/` | Permission and approval helpers | `ApprovalManager` |
| `storage/` | Generic filesystem adapters | `VaultFileAdapter`, `HomeFileAdapter` |
| `tools/` | Shared tool constants and formatting helpers | `toolNames`, `toolIcons`, `toolInput`, `todo` |
| `types/` | Shared type definitions | `settings`, `mcp`, `chat`, `tools`, `diff`, `agent`, `plugins` |

## Gotchas

- `ChatRuntime.cleanup()` must run when a tab is disposed
- `Conversation.providerState` is intentionally opaque in feature code
- PI bridge startup depends on a globally installed `@mariozechner/pi-coding-agent`
- PI SDK resolution is automatic; do not reintroduce user-configured `PI_SDK_PATH` or `PI_AGENT_DIR`
