# Journal - qzl (Part 1)

> AI development session journal
> Started: 2026-05-01

---

## 2026-05-01 Completion Review

- Completed PI model selector refactor: async model options, bridge `list_models`/`set_model`, runtime session reset on model changes, grouped toolbar layout, and updated tests.
- Completed PI edit/write approval flow: bridge preflight previews, main-editor split diff approval view, editable proposed content, synchronized scrolling, live diff decorations, and approve/reject routing.
- Review cleanup fixed approval semantics so the diff view does not write files before PI execution; approved edited content is now passed back to the bridge and applied through the pending tool call after source-change validation.
- Review cleanup removed model-switch debug logging and replaced diff decoration reconfiguration with CodeMirror state effects to preserve editor extensions during live updates.

## 2026-05-01 Refactor Pass

- Replaced the diff approval view's local `number[][]` LCS implementation with shared `buildLineDiffLines()` utility code backed by rolling rows and a compact direction matrix, reducing repeated algorithm code and avoiding large nested array allocation during live edits.
- Updated the bridge preview diff builder to use the same compact LCS strategy, keeping approval previews behaviorally equivalent while reducing memory pressure for larger file diffs.
- Collapsed `DiffApprovalView` global state from separate params/instance/resolve variables into a single pending request object with one decision exit path, reducing cancellation races when replacing active diff views.
- Reworked `ModelSelector` rendering from button/dropdown double-fetching plus a `rendering` guard into signature-based model caching and render-version invalidation, so settings changes refresh correctly while unchanged renders reuse one model request.

## 2026-05-01 Model Switch Bug Fix

- Root cause: toolbar model values use PI model provider IDs such as `omlx` and `minimax-cn`; `Tab.onModelChange()` treated those as non-PI chat providers and updated a temporary bridge process instead of the active PI runtime, so the live session kept using its old model.
- Confirmed from PI SDK source that `createAgentSession()` resolves the initial model from existing session metadata first, then `SettingsManager.getDefaultProvider()`/`getDefaultModel()`; therefore an already-running session must be aborted and recreated for model changes to apply.
- Fixed active PI tab switching to call `tab.service.setModel(provider, modelId)` and only use a temporary bridge when no runtime is active yet.
- Made `PiBridgeClient.reset()` wait for `reset_ok`, so model switching does not race the next `init` request.
- Made bridge `set_model` flush PI `SettingsManager` writes before acknowledging and use the vault cwd for project-aware settings resolution.
- Follow-up fix: PI SDK restores existing session metadata before settings defaults, so model switching now records a one-shot bridge model override and passes it into `createAgentSession()` while reusing the same `SessionManager`.
- Follow-up fix: `PiChatRuntime.setModel()` preserves the desired PI `sessionId` across reset, so the next session keeps the existing conversation history instead of starting a fresh PI session.
- PI-only refactor: blank tabs, provider resolution, model routing, enabled-provider lookup, and blank-tab command catalog resolution now treat all model values as PI models under the single `pi` provider instead of deriving chat providers from `provider/modelId`.
