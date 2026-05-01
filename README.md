# Pidian

Pidian is an Obsidian desktop plugin that embeds the PI coding agent in a sidebar and inline-edit workflow.

Your vault becomes PI's working directory, so the agent can read and write files, search notes, run bash, use PI skills/prompts, and continue native PI sessions from inside Obsidian.

## Highlights

- PI-only architecture: one built-in provider (`pi`) with selectable PI models such as OMLX and MiniMax.
- Native PI sessions: Pidian reuses PI session storage under `~/.pi` and keeps conversation history across model switches.
- Model selector: loads available PI models from the PI SDK/model registry and switches the active PI session model through the bridge.
- Edit/write approval: PI file mutations open a VSCode-style split diff view with a read-only original pane and editable proposed pane before approval.
- Sidebar chat: multi-tab conversations, history restore, slash commands, PI skills/prompts, `@` context references, image context, MCP selection, and `/compact`.
- Inline edit: provider-backed inline edit flow for selected editor text.

## Requirements

- Obsidian `>= 1.4.5`
- Desktop only: macOS, Linux, or Windows
- Node.js available to Obsidian's environment
- Global PI install:

```bash
npm install -g @mariozechner/pi-coding-agent
```

Pidian resolves PI automatically:

- PI agent directory: `~/.pi/agent`
- PI SDK entry: `$(npm root -g)/@mariozechner/pi-coding-agent/dist/index.js`

There is no user-facing `PI_AGENT_DIR` or `PI_SDK_PATH` setting.

## Install From Release

1. Download these release assets from GitHub:

| File | Description |
|------|-------------|
| `main.js` | Bundled plugin code |
| `manifest.json` | Obsidian plugin manifest |
| `styles.css` | Plugin styles |
| `pi-bridge-server.mjs` | PI bridge sidecar process |

2. Place them in your vault plugin directory:

```text
/path/to/vault/.obsidian/plugins/pidian/
```

3. Enable `Pidian` in Obsidian community plugins.

## Development

```bash
git clone https://github.com/Destiny951/claudian.git
cd claudian
npm install
npm run dev
```

Verification commands:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Architecture

```text
src/
├── app/                  # Shared settings/storage defaults
├── core/                 # PI-facing provider/runtime contracts and infrastructure
├── providers/pi/         # PI bridge, runtime adapter, history, commands, settings UI
├── features/chat/        # Sidebar chat, tabs, controllers, renderers, toolbar
├── features/diff-view/   # Main-editor diff approval view for PI edit/write tools
├── features/inline-edit/ # Inline edit modal and PI-backed edit services
├── features/settings/    # Settings shell
├── shared/               # Reusable UI components
├── utils/                # Cross-cutting helpers
└── style/                # Modular CSS
```

The codebase keeps the provider boundary where it is useful, but the product is PI-only: model values such as `minimax-cn/MiniMax-M2.7` are PI model identifiers, not separate chat providers.

## Storage

| Path | Contents |
|------|----------|
| `.claudian/pidian-settings.json` | Pidian plugin settings |
| `.claudian/sessions/*.meta.json` | Provider-neutral Obsidian-side session metadata |
| `~/.pi/agent` | PI agent resources, auth, models, settings |
| `~/.pi` | PI-native session data |

## Privacy

- Pidian does not add telemetry.
- Conversation/session data stays in your vault metadata and PI's local session storage unless your selected PI model/provider sends prompts to a remote API.
- Model traffic is governed by the PI model/provider you select.

## Fork Lineage

Pidian started as a fork of [`YishenTu/claudian`](https://github.com/YishenTu/claudian). The current fork is maintained by [Destiny951](https://github.com/Destiny951) and focuses on PI-only workflows.

## License

MIT License. See `LICENSE`.
