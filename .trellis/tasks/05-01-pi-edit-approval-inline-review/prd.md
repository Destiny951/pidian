# PI Edit Tool Approval - VSCode-Style Diff View PRD

## Summary

Implement a VSCode-style diff approval view for PI `edit` and `write` tool calls. When PI attempts to modify a file, close the original file tab and open a split-pane diff view in the main editor area. Users can review and edit the proposed changes before approving.

## Problem

PI currently runs `edit` and `write` tools without user approval. Users need to:
- Review proposed file changes before they are applied
- Edit the proposed content before approving
- See clear visual distinction between original and modified content

## Goals

- Intercept PI `edit` and `write` tool calls before file mutation
- Show a VSCode-style split-pane diff view in the main editor area
- Left pane: original content (read-only), deleted lines highlighted red
- Right pane: proposed content (editable), new lines highlighted green
- Real-time diff highlighting that updates as user edits the right pane
- Approve writes the right pane content to file, Reject leaves file unchanged
- Close the original file tab before opening diff view (avoid duplicate tabs)

## Non-Goals

- Do not support binary file edits
- Do not implement hunk-level partial approval in MVP
- Do not create modal dialogs or separate windows

## User Experience

### Flow

1. PI calls `edit` or `write` tool
2. Original file tab closes automatically
3. Diff view opens in main editor area with two panes:
   - **Left**: Original content (read-only), lines deleted from original shown with red background
   - **Right**: Proposed content (editable), lines added to proposed shown with green background
4. User can edit the right pane - diff highlighting updates in real-time
5. User clicks ✓ (Approve) or ✕ (Reject) button in header
6. **Approve**: Write right pane content to file, close diff view, reopen file
7. **Reject**: Close diff view, reopen original file unchanged

### Visual Design

```
┌─────────────────────────────────────────────────────────────┐
│ Edit File: path/to/file.md           [+5 -3]    ✕    ✓    │
├────────────────────────────┬────────────────────────────────┤
│ Original (read-only)       │ Proposed (editable)            │
├────────────────────────────┼────────────────────────────────┤
│  1 Line unchanged          │  1 Line unchanged              │
│  2 Line unchanged          │  2 Line unchanged              │
│  3 [red bg] Deleted line   │  3 [green bg] New line         │
│  4 Line unchanged          │  4 Line unchanged              │
│                            │  5 [green bg] Another new line │
└────────────────────────────┴────────────────────────────────┘
```

## Functional Requirements

### Diff View Component

- Custom `ItemView` registered as `VIEW_TYPE_DIFF_APPROVAL`
- Opens via `workspace.getLeaf('split', 'vertical')` in main editor area
- Two CodeMirror 6 editor instances side by side
- Left editor: `EditorState.readOnly.of(true)`
- Right editor: fully editable
- Synchronized scrolling between panes

### Diff Highlighting

- Line-level decorations using `Decoration.line`
- Red background (`.pidian-diff-line-delete`) for deleted lines in left pane
- Green background (`.pidian-diff-line-insert`) for inserted lines in right pane
- Real-time recomputation: when right pane changes, recalculate diff against original

### Action Buttons

- Header contains: file path, stats (+N -M), ✕ (Reject), ✓ (Approve)
- ✓ writes right pane content to file, closes diff view, reopens file
- ✕ closes diff view without modifying file, reopens original file

### File Handling

- Before opening diff view, close the original file's leaf if it exists
- Track the original file path for reopening after decision
- Handle file-not-found case for `write` (create operation)

### Permission Modes

- `normal`: Show diff view for approval
- `yolo`: Auto-approve without showing diff view
- `plan`: Auto-reject with reason

## Technical Requirements

### New Files

- `src/features/diff-view/DiffApprovalView.ts` - ItemView for diff panel
- `src/style/features/diff-panel.css` - Styles for diff view

### Modified Files

- `src/core/types/chat.ts` - Add `VIEW_TYPE_DIFF_APPROVAL`
- `src/main.ts` - Register diff view
- `src/features/chat/controllers/InputController.ts` - Call diff view instead of modal
- `src/utils/diff.ts` - Add diff computation utilities

### Clean Up (Remove Old Code)

- `src/features/diff-view/DiffApprovalModal.ts` - Delete (was modal approach)
- `src/features/diff-view/InlineDiffPreview.ts` - Delete (was inline decoration approach)
- `src/features/diff-view/DiffApprovalView.ts` - Delete if exists (old split-pane version)

## Acceptance Criteria

- [x] PI `edit` shows diff view before writing
- [x] PI `write` shows diff view before writing
- [x] Original file tab closes when diff view opens
- [x] Left pane shows original content, read-only
- [x] Right pane shows proposed content, editable
- [x] Deleted lines have red background in left pane
- [x] Inserted lines have green background in right pane
- [x] Editing right pane updates diff highlighting in real-time
- [x] ✓ applies the approved right pane content through the PI tool call
- [x] ✕ leaves file unchanged
- [x] After decision, diff view closes and original file reopens
- [x] `yolo` mode skips diff view
- [x] No stuck promises or frozen UI after any decision
- [x] `npm run typecheck && npm run lint && npm run test && npm run build` passes

## Implementation Phases

1. Create `DiffApprovalView` ItemView with split panes
2. Implement diff computation and line-level decorations
3. Implement real-time diff updates on right pane edit
4. Implement approve/reject actions with file handling
5. Update `InputController` to use new diff view
6. Clean up old modal/inline implementations
7. Test and verify all acceptance criteria
