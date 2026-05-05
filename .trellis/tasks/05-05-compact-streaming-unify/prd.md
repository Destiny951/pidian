# Compact 按钮 UI 反馈优化

## Summary

优化侧边栏 ContextUsageMeter compact 按钮的 UI 反馈，在 RPC compact 等待期间在聊天框显示进度信息，让用户知道系统正在工作而不是卡死。

## Problem

侧边栏 compact 按钮点击后，PI 的 `runtime.compact()` RPC 调用是一个阻塞请求（发送 `{ type: 'compact' }` 给 bridge，等待 `{ type: 'compact_done' }` 响应）。期间 UI 仅通过 `contextUsageMeter.setCompacting(true)` 将小圆环设为 "Compacting..." 状态，但聊天区域完全静默，用户可能以为卡死。

### 排除的方案：流式 `/compact` prompt

最初考虑将 compact 按钮改为走 `sendMessage({ content: '/compact' })` 流式路径。但通过 PI session 日志分析发现：

- **`/compact` 作为 prompt 发送给 PI**：PI 只是当作普通对话，生成一个几百字的"压缩摘要"文本。**不会产生 `compaction` 条目，不会删除旧消息，反而膨胀 context**。
- **RPC `compact` 命令**：PI 内部用 LLM 生成详细摘要（~10k chars），选择截断点（`firstKeptEntryId`），删除截断点之前的所有消息，替换为 1 条 `compaction` 条目。这才是真正减少 context tokens 的操作。
- **两步叠加的问题**：先流式 prompt 后 RPC compact，流式产生的消息也被算入 RPC compact 的保留区域，导致净压缩效果打折（实测 55k→44k 而非预期的更大降幅）。

**结论：必须使用 RPC `compact()` 来实际压缩 context，不能用流式 prompt 替代。**

## Goals

1. RPC compact 等待期间，在聊天框显示可见的进度信息
2. Compact 完成后，在聊天框显示压缩结果（如 summary 摘要）
3. 不增加 PI session 的 context tokens
4. 保持现有的 compact 功能正确性（usage 更新、Notice 提示等）

## User Experience

### 改造后的流程

1. 用户点击 ContextUsageMeter 弹窗中的 "Compact context" 按钮
2. 聊天框中出现 "Compacting context..." 提示（带 spinner）
3. RPC `runtime.compact()` 执行中...
4. 完成后，将 RPC 返回的 summary 渲染到聊天框（替代 spinner）
5. `context_compacted` 边界渲染
6. Usage 更新、Notice 提示

### 关键数据

| 阶段 | 用户可见 |
|------|----------|
| 点击按钮 → RPC 开始 | "Compacting context..." spinner 在聊天框 |
| RPC 执行中 | spinner 持续转动 |
| RPC 完成 | Summary 文本渲染到聊天框，boundary 显示 |

## Functional Requirements

### FR-1：Compact 开始时在聊天框显示进度

- 在调用 `runtime.compact()` 前，创建一个 assistant 消息并在聊天框渲染
- 消息内容为 "Compacting context..."（带 spinner 样式）
- 相当于 `StreamController.showRunStatus()` 的效果，但渲染到聊天消息区域

### FR-2：Compact 完成后渲染结果

- RPC 返回的 `summary` 文本渲染到聊天框（替换 "Compacting..." 占位）
- 渲染 `context_compacted` 边界
- 如果 summary 为空或过长，可以截取或跳过

### FR-3：不膨胀 PI context

- 所有 UI 反馈仅在 Pidian 侧渲染，不向 PI session 发送任何 prompt
- 不使用 `sendMessage()` 路径

## Technical Requirements

### Modified Files

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/tabs/Tab.ts` | `onCompact` 回调中添加聊天框 UI 反馈 |

### 实现思路

利用现有的 `tab.renderer` 和 `tab.state` 直接在聊天区域创建消息：

```typescript
// 1. 创建占位 assistant 消息
const compactMessage = {
  id: `pi-compact-${compactedAt}`,
  role: 'assistant',
  content: 'Compacting context...',
  timestamp: compactedAt,
};
tab.state.addMessage(compactMessage);
const msgEl = tab.renderer.addMessage(compactMessage);

// 2. RPC compact
const result = await runtime.compact();

// 3. 更新消息内容为 summary
compactMessage.content = result.summary ?? 'Context compacted.';
compactMessage.contentBlocks = [{ type: 'context_compacted' }];
// 重新渲染或更新 msgEl
```

## Acceptance Criteria

- [ ] Compact 按钮点击后，聊天框立即显示 "Compacting context..." 提示
- [ ] RPC 执行期间用户能看到进度指示（spinner 或文字）
- [ ] Compact 完成后，聊天框显示压缩结果（summary 或 boundary）
- [ ] Usage 正确更新（和纯 RPC 路径一致）
- [ ] Notice 提示正确显示 token 变化
- [ ] 不增加 PI session 的 context tokens
- [ ] `npm run typecheck && npm run lint && npm run test && npm run build` 通过
