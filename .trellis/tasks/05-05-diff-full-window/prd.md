# Diff 视图全窗口显示

## Summary

将 DiffApprovalView 的打开方式从垂直分栏改为同标签组内新标签页，使 diff 视图占据主窗口全部 UI 空间，而不是分栏显示一半。同时不关闭原文件标签页，diff 完成后直接切回。

## Problem

### 当前行为

`DiffApprovalView.showDiff()` 的实现（`DiffApprovalView.ts:284-314`）：

1. 查找目标文件的 markdown 视图并 `leaf.detach()` 关闭该标签页
2. 关闭已有的 diff 视图
3. 使用 `getLeaf('split', 'vertical')` 创建新的纵向分栏

### 问题分析

**问题 1：强制垂直分栏**
- `getLeaf('split', 'vertical')` 在 Obsidian 中创建一个**新的纵向分栏**（新的 tab group）
- 这会将主窗口一分为二，左右各占一半
- 用户报告：即使有多个标签页，默认主窗口只显示一个标签页的内容，其他标签页不显示（Obsidian 单标签展示模式）
- 但 diff 视图强制分栏后，主窗口被切成两半，违背了用户的单标签展示偏好

**问题 2：多余的标签页**
- 旧标签页被 detach 后，Obsidian 的 tab group 仍保留（可能显示空白标签）
- `getLeaf('split', 'vertical')` 又创建新的 tab group
- 结果主窗口出现两个 tab group，UI 展示难看

**问题 3：结束后无法恢复干净状态**
- `reopenOriginalFile()` 使用 `getLeaf('tab')` 在**某个** tab group 里重新打开文件
- 不一定能恢复到原来的单一 tab group 状态

### 用户期望

> diff 视图标签页打开时自动占主窗口所有的 UI 显示，原标签页的内容不显示。这样可以做到不关闭原标签页，又完全显示 diff 视图标签页的内容。

## Goals

1. Diff 视图打开时占据主窗口 100% 宽度（全窗口）
2. 不关闭原文件标签页（保留以便 diff 完成后切回）
3. Diff 完成后自动切回原文件标签页
4. 主窗口始终保持一个 tab group 的整洁布局

## Non-Goals

- 不改变 diff 视图内部的左右双栏布局（保持原有的 original/proposed split pane）
- 不改变 diff 视图的 approve/reject 交互逻辑
- 不支持 hunk-level 部分审批

## User Experience

### 改造后的流程

1. PI 调用 `edit` 或 `write` 工具
2. Pidian 拦截，找到目标文件当前所在的标签页
3. 在**同一个 tab group** 中打开 diff 视图标签页（使用 `getLeaf('tab')`）
4. Diff 视图标签页获得焦点，占据主窗口全部空间
5. 原文件标签页仍然存在，但在 Obsidian 的单标签展示模式下不可见
6. 用户在 diff 视图中 review 并 approve/reject
7. Approve：将编辑内容写入文件 → 关闭 diff 标签页 → 激活原文件标签页（此时内容已更新）
8. Reject：关闭 diff 标签页 → 激活原文件标签页（内容不变）

### 对比现有体验

| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| 窗口布局 | 垂直分栏（50/50） | 全窗口（100%） |
| 原文件标签 | 被 detach 关闭 | 保留，diff 完成后切回 |
| Tab group 数量 | 可能出现 2 个 | 始终 1 个 |
| 恢复状态 | 用 getLeaf('tab') 重新打开（可能位置不同） | 直接激活原标签页（位置不变） |

## Functional Requirements

### FR-1：Diff 视图在同一个 tab group 中以新标签页打开

- 替换 `getLeaf('split', 'vertical')` 为 `getLeaf('tab')`
- 这会在当前活跃 tab group 中创建新标签页，不会创建分栏

### FR-2：不关闭原文件标签页

- 移除 showDiff 中 detach 目标文件 markdown 视图的逻辑
- 保留：关闭已有 diff 视图的逻辑（防止重复打开 diff）

### FR-3：diff 完成后切回原文件标签页

- `handleApprove()` 和 `handleReject()` 中：
  - 先关闭 diff 标签页（`this.leaf.detach()`）
  - 然后找到原文件标签页并激活（`workspace.setActiveLeaf()` 或 `leaf.openFile()`）
- 如果原文件标签页在 diff 过程中被用户手动关闭了，则 fallback 到 `getLeaf('tab')` 重新打开

### FR-4：approve 后原文件标签页内容刷新

- Approve 时 PI 已经通过 bridge 写入了文件内容
- 切回原文件标签页后需要确保显示最新内容
- 可以通过 `vault.trigger('modify', file)` 或直接重新 `leaf.openFile(file)` 刷新

## Technical Requirements

### Modified Files

| 文件 | 修改内容 |
|------|----------|
| `src/features/diff-view/DiffApprovalView.ts` | showDiff 改用 `getLeaf('tab')`；移除 detach 逻辑；approve/reject 后切回原标签页 |

### 关键代码变更点

#### `DiffApprovalView.showDiff()`

**Before:**
```typescript
// 1. 关闭目标文件的 markdown 视图
for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
  if (leaf.view instanceof MarkdownView && leaf.view.file?.path === filePath) {
    leaf.detach();
    break;
  }
}

// 2. 关闭已有 diff 视图
for (const leaf of plugin.app.workspace.getLeavesOfType(VIEW_TYPE_DIFF_APPROVAL)) {
  leaf.detach();
}

// 3. 创建新分栏
const leaf = plugin.app.workspace.getLeaf('split', 'vertical');
```

**After:**
```typescript
// 1. 记录目标文件的标签页引用（不关闭）
let originalLeaf: WorkspaceLeaf | null = null;
for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
  if (leaf.view instanceof MarkdownView && leaf.view.file?.path === filePath) {
    originalLeaf = leaf;
    break;
  }
}

// 2. 关闭已有 diff 视图
for (const leaf of plugin.app.workspace.getLeavesOfType(VIEW_TYPE_DIFF_APPROVAL)) {
  leaf.detach();
}

// 3. 在同一 tab group 中打开 diff 视图
const leaf = plugin.app.workspace.getLeaf('tab');

// 4. 保存 originalLeaf 引用到 pendingRequest 供后续使用
```

#### `DiffApprovalView.handleApprove()` / `handleReject()`

**Before:**
```typescript
private async handleApprove(): Promise<void> {
  const editedContent = this.rightEditor?.state.doc.toString() ?? this.proposedContent;
  this.resolveDecision({ decision: 'approve', editedContent });
  await this.reopenOriginalFile();
  this.leaf.detach();
}
```

**After:**
```typescript
private async handleApprove(): Promise<void> {
  const editedContent = this.rightEditor?.state.doc.toString() ?? this.proposedContent;
  this.resolveDecision({ decision: 'approve', editedContent });

  // 优先切回原标签页
  if (this.originalLeaf && this.originalLeaf.view instanceof MarkdownView) {
    this.leaf.detach();
    this.plugin.app.workspace.setActiveLeaf(this.originalLeaf, { focus: true });
    // 刷新文件内容
    const file = this.params?.filePath
      ? this.plugin.app.vault.getAbstractFileByPath(this.params.filePath)
      : null;
    if (file instanceof TFile) {
      await this.originalLeaf.openFile(file);
    }
  } else {
    // fallback: 关闭 diff 并重新打开文件
    await this.reopenOriginalFile();
    this.leaf.detach();
  }
}
```

### 需要注意的边界情况

1. **原文件未在编辑器中打开**：`originalLeaf` 为 null，fallback 到 `reopenOriginalFile()` 的现有逻辑
2. **新建文件（write create）**：原文件不存在，无需切回，只需关闭 diff
3. **用户在 diff 期间手动关闭了原文件标签页**：`originalLeaf` 引用可能已失效（leaf detached），需要检查 `leaf.view` 是否仍然有效
4. **Diff 视图被用户手动关闭（点 X）**：`onClose()` 已经处理了 cancel 逻辑，也需要切回原标签页

## Implementation Phases

### Phase 1：修改 showDiff 打开方式
- 将 `getLeaf('split', 'vertical')` 改为 `getLeaf('tab')`
- 移除目标文件 markdown 视图的 detach 逻辑
- 记录 originalLeaf 引用

### Phase 2：修改 approve/reject 切回逻辑
- handleApprove：关闭 diff → 激活原标签页 → 刷新内容
- handleReject：关闭 diff → 激活原标签页
- onClose（用户手动关闭）：cancel → 激活原标签页

### Phase 3：边界情况处理
- originalLeaf 失效检测
- 新建文件的 fallback
- 多标签页场景测试

## Acceptance Criteria

- [ ] Diff 视图打开时占据主窗口 100% 宽度（无分栏）
- [ ] 原文件标签页不被关闭（仍然存在于 tab group 中）
- [ ] Approve 后 diff 标签页关闭，原文件标签页激活并显示最新内容
- [ ] Reject 后 diff 标签页关闭，原文件标签页激活，内容不变
- [ ] 主窗口始终只有 1 个 tab group
- [ ] 新建文件（write create）场景正常工作
- [ ] 原文件未在编辑器打开时 fallback 正常工作
- [ ] `npm run typecheck && npm run lint && npm run test && npm run build` 通过
