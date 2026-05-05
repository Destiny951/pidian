# Compact 按钮统一流式渲染路径

## Summary

将侧边栏 ContextUsageMeter 的 compact 按钮改为走 `/compact` 输入命令的同一条流式渲染链路，让 PI 的 compact 输出实时逐块渲染到聊天框，而不是当前的无反馈 RPC 等待。

## Problem

当前存在两条完全独立的 compact 执行路径：

### 路径 A：输入框 `/compact` 命令（有流式输出）
1. 用户在输入框键入 `/compact` → `InputController.sendMessage()`
2. `isCompact = /^\/compact(\s|$)/i.test(content)` 正则检测
3. 进入正常流式循环 `agentService.query()` → `PiChatRuntime.query()`
4. PI 通过 prompt 流式返回 text/thinking/tool_use 等 StreamChunk
5. `StreamController.handleStreamChunk()` 逐块渲染到聊天框
6. 用户能看到 PI 实时输出 compact 过程

### 路径 B：侧边栏 compact 按钮（无流式输出）
1. ContextUsageMeter 弹窗中点击 "Compact context" 按钮 → `onCompact` 回调
2. 直接调用 `runtime.compact()` (`PiChatRuntime.compact()`)
3. `PiBridgeClient.compact()` 发送 `{ type: 'compact', id }` 给 bridge 进程，等待 `{ type: 'compact_done' }` 响应
4. 纯 RPC 调用，没有流式输出通道
5. UI 仅通过 `contextUsageMeter.setCompacting(true)` 设为 "Compacting..." 状态
6. 聊天区域完全静默，用户只看到转圈，无法判断是否卡死

### 问题：`/compact` 不在斜杠命令下拉列表中
- `BUILT_IN_COMMANDS`（`builtInCommands.ts`）只有 `clear`、`new`、`add-dir`、`resume`、`fork`
- `/compact` 只在 `InputController` 中用正则匹配，未注册到命令列表
- 所以用户在输入框打 `/` 时，下拉列表中不会出现 `compact` 命令
- PI provider 的命令目录（`ProviderCommandCatalog`）也没有注册 compact

## Goals

1. 侧边栏 compact 按钮与输入框 `/compact` 走同一条流式渲染链路
2. compact 过程中的 PI 输出实时渲染到聊天框
3. 保持现有的 compact 结果处理（usage 更新、`context_compacted` 边界、Notice 提示）
4. 可选：让 `/compact` 出现在斜杠命令下拉列表中

## Non-Goals

- 不修改 PI bridge 的 compact 协议
- 不修改 `PiBridgeClient.compact()` 的 RPC 行为（保留作为备用路径）
- 不改变 compact 的功能语义

## User Experience

### 改造后的流程

1. 用户点击侧边栏 ContextUsageMeter 弹窗中的 "Compact context" 按钮
2. Pidian 自动将 `/compact` 填入输入框并发送
3. 进入正常 `sendMessage()` 流式循环
4. PI 的 compact 输出（text/thinking 等）逐块渲染到聊天框
5. 流式完成后自动处理 usage 更新和 `context_compacted` 边界渲染
6. ContextUsageMeter 显示更新后的 usage 数据

### 对比现有体验

| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| 聊天框反馈 | 完全静默，只有转圈 | PI 输出实时渲染，可见进度 |
| 执行链路 | `runtime.compact()` RPC | `sendMessage()` → 流式循环 |
| 用户感知 | 不确定是否卡死 | 清楚看到 PI 正在工作 |
| 取消操作 | 无法取消（RPC 等待中） | 可用 Esc 中断 |

## Functional Requirements

### FR-1：侧边栏 compact 按钮走 sendMessage 路径

- `Tab.ts` 中 `onCompact` 回调改为调用 `inputController.sendMessage({ content: '/compact' })`
- 不再直接调用 `runtime.compact()`
- 按钮点击后关闭 ContextUsageMeter 弹窗（现有行为）

### FR-2：ContextUsageMeter compacting 状态同步

- `sendMessage` 检测到 `isCompact` 时，通过某种机制通知 `ContextUsageMeter.setCompacting(true)`
- 流式完成（或中断）时 `setCompacting(false)`
- 可以利用现有的 `StreamController.showRunStatus('Compacting context...')` 已有逻辑（`InputController.ts:352`）

### FR-3：compact 结果处理

- 流式路径中 `context_compacted` StreamChunk 已经由 `StreamController.handleStreamChunk()` 处理（`StreamController.ts:180-189`）
- usage 更新通过 `StreamChunk type: 'usage'` 正常流式返回
- 需要确保不再依赖旧的 `runtime.compact()` 返回值来更新 usage

### FR-4（可选）：`/compact` 注册到斜杠命令下拉列表

- 将 `compact` 添加到 `BUILT_IN_COMMANDS` 数组（`builtInCommands.ts`）
- 新增 `action: 'compact'` 类型到 `BuiltInCommandAction`
- `InputController.executeBuiltInCommand` 中增加 `compact` case 处理
- 或者将 compact 注册到 PI provider 的 `ProviderCommandCatalog`
- 需注意：当前 `/compact` 走的是 prompt 文本发送到 PI 的方式，而 builtInCommand 的 action 是本地执行，两者语义不同

## Technical Requirements

### Modified Files

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/tabs/Tab.ts` | `onCompact` 回调改为调用 `sendMessage({ content: '/compact' })` |
| `src/features/chat/ui/toolbar/ContextUsageMeter.ts` | 可能需要调整 compacting 状态同步逻辑 |

### 需要验证的关键点

1. **`sendMessage()` 的调用可达性**：`onCompact` 回调在 `Tab.ts:881` 定义，需要确认 `inputController` 引用是否在 `onCompact` 回调的作用域内可用
2. **compact 结果的 usage 更新**：流式路径中的 `usage` StreamChunk 是否包含 compact 后的最新 usage 数据
3. **`context_compacted` 边界的保存**：流式路径中 `renderCompactBoundary()` 已经在 `StreamController` 中实现，保存到 conversation 时是否正确

## Implementation Phases

### Phase 1：验证流式路径的 compact 行为
- 在输入框手动输入 `/compact`，确认 PI 确实通过流式返回 compact 输出
- 确认流式完成后 usage 数据和 `context_compacted` 边界是否正确

### Phase 2：改造 onCompact 回调
- 修改 `Tab.ts` 中 `onCompact` 回调
- 将 `runtime.compact()` RPC 调用替换为 `inputController.sendMessage({ content: '/compact' })`
- 确保 `sendMessage` 引用在 `onCompact` 作用域内可用

### Phase 3：compacting 状态同步
- `isCompact` 检测时设置 `ContextUsageMeter.setCompacting(true)`
- 流式完成或中断时 `setCompacting(false)`
- 可通过 `sendMessage` 的 finally 块或 `context_compacted` chunk 处理触发

### Phase 4：可选 - 斜杠命令注册
- 评估是否值得将 `/compact` 添加到命令列表
- 注意路径差异：prompt 发送 vs 本地 action

## Acceptance Criteria

- [ ] 侧边栏 compact 按钮点击后，PI 的 compact 输出实时渲染到聊天框
- [ ] 流式过程中用户能看到文本/thinking 逐块出现
- [ ] compact 完成后 usage 数据正确更新
- [ ] `context_compacted` 边界正确渲染
- [ ] compact 过程中可用 Esc 中断
- [ ] ContextUsageMeter 的 compacting 状态正确同步
- [ ] 原有输入框 `/compact` 命令行为不变
- [ ] `npm run typecheck && npm run lint && npm run test && npm run build` 通过
