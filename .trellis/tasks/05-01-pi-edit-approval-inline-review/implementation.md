# PI Edit Tool Approval - VSCode-Style Diff View Implementation

## 实现状态：✅ 已完成

**完成日期**: 2026-05-01

## Architecture Overview

```
PI SDK beforeToolCall
  -> pi-bridge-server.mjs approval request
  -> PiBridgeClient pending approval
  -> PiChatRuntime approval callback
  -> InputController.handleApprovalRequest()
  -> DiffApprovalView.showDiff()
  -> User approves/rejects
  -> Approval decision sent back to bridge
  -> PI tool allowed or blocked
```

## Core Components

### DiffApprovalView (ItemView)

Custom Obsidian view that renders a VSCode-style split-pane diff editor.

**Location**: `src/features/diff-view/DiffApprovalView.ts`

**Key features**:
- Extends `ItemView` with `VIEW_TYPE_DIFF_APPROVAL`
- Two CodeMirror 6 `EditorView` instances (left: read-only original, right: editable proposed)
- Line-level decorations for diff highlighting
- Real-time diff recomputation on right pane edit
- Header with file path, stats, and action buttons (✓ ✕)

### Data Flow

```
InputController.handleApprovalRequest()
  -> Close original file tab if open
  -> Open DiffApprovalView in main editor area
  -> Pass diff data (filePath, operation, diffLines)
  -> User reviews/edits
  -> User clicks ✓ or ✕
  -> On ✓: Write right pane content to file
  -> Close diff view
  -> Reopen original file
  -> Return decision to callback
```

## Implementation Details

### DiffApprovalView Class

```typescript
export class DiffApprovalView extends ItemView {
  static currentParams: DiffApprovalParams | null = null;
  static currentInstance: DiffApprovalView | null = null;
  
  private leftEditor: EditorView | null = null;   // Read-only original
  private rightEditor: EditorView | null = null;  // Editable proposed
  private originalContent: string;
  private proposedContent: string;
  private originalFile: TFile | null;
  private originalLeaf: WorkspaceLeaf | null;
  
  // Key methods:
  async onOpen(): Promise<void>;
  async onClose(): Promise<void>;
  private createEditor(container, content, readOnly): EditorView;
  private updateDiffDecorations(): void;
  private handleApprove(): void;
  private handleReject(): void;
  
  static async showDiff(plugin, params): Promise<{decision, editedContent}>;
}
```

### Diff Computation

Use line-level LCS diff to identify:
- Deleted lines (exist in original, not in proposed) → red background in left pane
- Inserted lines (exist in proposed, not in original) → green background in right pane

```typescript
function computeLineDiff(original: string, proposed: string): {
  leftDecorations: Array<{line: number, type: 'delete'}>;
  rightDecorations: Array<{line: number, type: 'insert'}>;
}
```

### Real-Time Diff Updates

Listen to right editor changes and recompute diff:

```typescript
rightEditor.dispatch({
  effects: StateEffect.appendConfig.of(
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        this.updateDiffDecorations();
      }
    })
  )
});
```

### File Handling

```typescript
// Before opening diff view:
// 1. Find and close original file's leaf
const leaves = plugin.app.workspace.getLeavesOfType('markdown');
for (const leaf of leaves) {
  if (leaf.view instanceof MarkdownView && leaf.view.file?.path === filePath) {
    originalLeaf = leaf;
    leaf.detach(); // Close but remember for reopening
    break;
  }
}

// On approve:
await plugin.app.vault.modify(file, rightEditor.state.doc.toString());

// On reject:
// File already unchanged, just reopen

// After decision:
const newLeaf = plugin.app.workspace.getLeaf('tab');
await newLeaf.openFile(file);
```

### CodeMirror Configuration

```typescript
const extensions = [
  lineNumbers(),
  EditorView.lineWrapping,
  EditorState.readOnly.of(readOnly),
  decorationField, // StateField with line decorations
  EditorView.theme({
    '.pidian-diff-line-delete': { 
      backgroundColor: 'rgba(255, 80, 80, 0.2)' 
    },
    '.pidian-diff-line-insert': { 
      backgroundColor: 'rgba(80, 200, 80, 0.2)' 
    },
  }),
];
```

## CSS Styles

**Location**: `src/style/features/diff-panel.css`

```css
.pidian-diff-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.pidian-diff-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.pidian-diff-panes {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.pidian-diff-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--background-modifier-border);
}

.pidian-diff-action-btn {
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.pidian-diff-action-btn.approve {
  color: var(--color-green);
}

.pidian-diff-action-btn.reject {
  color: var(--color-red);
}
```

## Files to Modify

| File | Change |
|------|--------|
| `src/core/types/chat.ts` | Add `VIEW_TYPE_DIFF_APPROVAL` |
| `src/core/types/index.ts` | Export `VIEW_TYPE_DIFF_APPROVAL` |
| `src/main.ts` | Register `DiffApprovalView` |
| `src/features/chat/controllers/InputController.ts` | Call `DiffApprovalView.showDiff()` |
| `src/style/features/diff-panel.css` | Add diff view styles |
| `src/style/index.css` | Import `diff-panel.css` |

## Files to Delete (Cleanup)

| File | Reason |
|------|--------|
| `src/features/diff-view/DiffApprovalModal.ts` | Replaced by DiffApprovalView |
| `src/features/diff-view/InlineDiffPreview.ts` | Replaced by DiffApprovalView |
| `src/features/diff-view/DiffApprovalView.ts` (old) | Will be rewritten |

## Testing Plan

### Unit Tests

- Diff computation produces correct line decorations
- Real-time diff updates on edit
- Approve writes correct content
- Reject leaves file unchanged

### Integration Tests

- End-to-end flow: PI edit → diff view → approve → file modified
- End-to-end flow: PI edit → diff view → reject → file unchanged
- Original file tab management

### Manual Tests

1. Open a markdown file
2. Ask PI to edit it
3. Verify: original tab closes, diff view opens
4. Verify: left pane shows original, right pane shows proposed
5. Verify: deleted lines red, new lines green
6. Edit right pane
7. Verify: diff highlighting updates
8. Click ✓
9. Verify: diff view closes, file reopens with changes
10. Repeat with ✕, verify file unchanged

## Definition of Done

- [x] DiffApprovalView renders split-pane diff
- [x] Left pane read-only with red deleted lines
- [x] Right pane editable with green inserted lines
- [x] Real-time diff updates on right pane edit
- [x] ✓ applies the approved right pane content through the PI tool call and reopens file
- [x] ✕ leaves file unchanged and reopens
- [x] Old modal/inline code removed
- [x] All tests pass
- [x] `npm run typecheck && npm run lint && npm run test && npm run build` passes

## Completion Review

- PI `edit` and `write` calls are intercepted in the bridge `beforeToolCall` path and surfaced to the Obsidian UI as file mutation approval requests.
- `DiffApprovalView` provides a main-editor split diff with read-only original content, editable proposed content, synchronized scrolling, keyboard shortcuts, and live line highlighting.
- Approval returns the final proposed editor content to the bridge, which verifies the source file has not changed and then rewrites the pending PI tool input before allowing execution.
- Reject and cancel decisions leave the target file unchanged and unblock the pending approval promise.
- Refactor pass centralized front-end diff calculation through `buildLineDiffLines()` and replaced nested LCS arrays with compact typed-array direction tracking for lower allocation cost during live diff recomputation.
- Refactor pass simplified approval lifecycle state into a single pending request, removing separate global params/instance/resolve state.
