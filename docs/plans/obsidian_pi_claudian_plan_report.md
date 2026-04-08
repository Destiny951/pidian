# Obsidian 接入 PI Agent 实施计划报告

## 1. 项目结论

**fork Claudian，以“Bridge 子进程”方式接入本地 PI agent。**

原因：

- Claudian 已具备成熟的 Obsidian 宿主壳能力（侧边栏聊天、inline edit、diff 预览、`@mention`、skills/slash commands、多会话）
- PI 官方 SDK 面向 Bun/Node 嵌入，"本地 PI 是唯一 agent 引擎"
- Obsidian 插件运行时对 `file://` / `import.meta` / `node:*` 动态导入存在限制
- 不重写、不换壳，只在 provider 层接入；PI SDK 在独立 Node 进程运行

---

## 2. 项目目标

### 2.1 主目标

- **A：笔记内联改写/编辑能力** — PI 作为写作伙伴
- **B：在 Obsidian 侧边栏中内联 PI agent**

### 2.2 非目标

- agent 任务调度、spec/plan/review 工作流、skills 内部逻辑、工具选择策略、orchestration — 由 PI 自己负责

**插件是宿主壳，PI 才是唯一大脑。**

---

## 3. 最终架构（更新）

```
Claudian Shell
├─ core runtime / provider registry
├─ sidebar / inline-edit / context UI
└─ providers/
   ├─ claude/
   ├─ codex/
   └─ pi/
       ├─ registration.ts
       ├─ capabilities.ts
       ├─ settings.ts
       ├─ ui/PiChatUIConfig.ts
       ├─ runtime/
       │   └─ PiChatRuntime.ts          (仅负责 ChatRuntime + Bridge 调用)
       ├─ bridge/
       │   ├─ PiBridgeClient.ts         (主插件内 IPC 客户端)
       │   └─ protocol.ts               (请求/响应/事件协议)
       ├─ history/
       │   └─ PiConversationHistoryService.ts
       ├─ aux/
       │   ├─ PiInlineEditService.ts
       │   ├─ PiInstructionRefineService.ts
       │   └─ PiTitleGenerationService.ts
       └─ adapters/
           └─ PiEventAdapter.ts

scripts/
└─ pi-bridge-server.mjs                 (子进程：真正 import PI SDK)
```

**原则**：主插件 bundle 不直接加载 `@mariozechner/pi-coding-agent`，避免启动期污染 Claude/Codex。

**文件数（PI 相关）**：12 个（provider 10 个 + bridge 2 个）+ `scripts/pi-bridge-server.mjs`。

---

## 4. PI SDK 实测结果

### 4.1 验证脚本

- `.context/pi-verify-ext.mjs` — 扩展加载、工具调用验证
- `.context/pi-verify-readonly.mjs` — 只读 session 验证
- `.context/pi-verify-session.mjs` — Session 生命周期验证（6 项全通过）

### 4.2 验证结论

| 验证项 | 结果 | 说明 |
|--------|------|------|
| `createAgentSession()` | ✓ | Session 正常创建 |
| Extensions 自动发现 | ✓ | `minimax-mcp` 被正确加载 |
| Extension tools 调用 | ✓ | `minimax_web_search`, `web_fetch` 可用 |
| 文本流 | ✓ | `message_update.assistantMessageEvent.type === 'text_delta'` |
| 工具调用事件（顶层） | ✓ | `tool_execution_start/end` 是顶层事件，不在 `message_update` 下 |
| 多轮 history 累积 | ✓ | `session.state.messages` 跨 `prompt()` 调用累积 |
| `session.abort()` | ✓ | 可中断当前操作 |
| `continueSession` | ✓ | 可用 |
| 自定义 system prompt | ✓ | `DefaultResourceLoader({ systemPrompt })` 可用 |
| Inline edit `<replacement>` | ✓ | PI 返回正确标签 |
| `session.messages === session.state.messages` | ✓ | 同一引用 |
| 无双重文本发射 | ✓ | 文本只发送一次，无需去重 |

### 4.3 PI → Claudian StreamChunk 映射

PI 事件分**两层**：
- **顶层事件**：`agent_start`、`turn_start`、`message_start`、`message_update`、`message_end`、`turn_end`、`tool_execution_start`、`tool_execution_end`、`agent_end`
- **内嵌事件**（在 `message_update` 的 `assistantMessageEvent` 中）：`thinking_start/delta/end`、`toolcall_start/delta/end`、`text_start/delta/end`

**注意**：PI **无双重文本发射**，文本只通过 `text_delta` 发送一次，无需去重（对比 Claude SDK）。

| PI 顶层事件 | 内嵌 assistantMessageEvent.type | StreamChunk |
|-------------|--------------------------------|-------------|
| `message_update` | `text_delta` | `{ type: 'text', content: delta }` |
| `message_update` | `thinking_delta` | `{ type: 'thinking', content: delta }` |
| `message_update` | `toolcall_start/delta/end` | LLM 工具决策（累积参数） |
| `tool_execution_start` | — | `{ type: 'tool_use', id, name, input }` |
| `tool_execution_end` | — | `{ type: 'tool_result', id, content, isError }` |
| `agent_end` | — | `{ type: 'done' }` |

### 4.4 System Prompt 注入方式

PI 的 system prompt **不通过 `session.prompt()` 注入**，而是通过 ResourceLoader：

```typescript
const resourceLoader = new DefaultResourceLoader({
  cwd: vaultPath,
  agentDir,
  systemPrompt: customSystemPrompt,
  noExtensions: false,
  noSkills: true,
  noPromptTemplates: true,
  noThemes: true,
});
await resourceLoader.reload();

const { session } = await createAgentSession({
  cwd: vaultPath,
  agentDir,
  resourceLoader,
  tools: [...],
});
```

### 4.5 Inline Edit 实现方式

使用**同一个 session**，inline edit 时通过 `setActiveToolsByName()` 切换为只读工具集：

```typescript
// 主聊天 session 创建时（完整工具）
const { session } = await createAgentSession({
  cwd: vaultPath,
  agentDir,
  tools: [readTool, grepTool, findTool, lsTool, bashTool, editTool, writeTool],
});

// Inline edit 时切换为只读
session.setActiveToolsByName(['readTool', 'grepTool', 'findTool', 'lsTool', 'bashTool']);
// PI 不直接写文件，只返回 <replacement> 标签
// parseInlineEditResponse() 解析，Claudian diff preview + apply

// Inline edit 结束后切回完整工具
session.setActiveToolsByName(['readTool', 'grepTool', 'findTool', 'lsTool', 'bashTool', 'editTool', 'writeTool']);
```

**注意**：`setActiveToolsByName()` 是 PI SDK 内置方法（`AgentSession` 第 267 行），动态切换工具列表，不需要创建新 session。

### 4.6 集成错误复盘（本次新增）

在 Obsidian 插件环境中，直接把 PI SDK 打进主 bundle 触发了以下问题：

1. `Not allowed to load local resource: file:///.../pi-coding-agent/dist/index.js`
2. `createRequire(...)` / `fileURLToPath(...)` 在 bundling 后出现 `filename/path undefined`
3. `import('node:fs|os|path|http|crypto')` 被 `app://obsidian.md` 视为跨域请求，触发 CORS 拦截
4. PI provider 在启动期注册后，插件初始化链路报错，导致主界面和已有 provider 体验受影响

**教训与约束（强制执行）**：

- 不在主插件 bundle 中直接 import PI SDK 及其依赖链
- PI provider 默认关闭，必须通过显式开关开启
- PI 失败时只影响 PI 自身，不影响 Claude/Codex 启动和 UI
- 先做隔离与回滚路径，再做功能接入

---

## 5. 完整实现文件清单

### 核心接口（7 个）

| 文件 | 职责 | 对应 Claude |
|------|------|-----------|
| `registration.ts` | ProviderRegistration 对象，注册到 ProviderRegistry | `claude/registration.ts` |
| `capabilities.ts` | 声明 PI 支持哪些功能（plan mode 等） | `CLAUDE_PROVIDER_CAPABILITIES` |
| `ui/PiChatUIConfig.ts` | 侧边栏 UI 配置（图标、布局） | `ClaudeChatUIConfig` |
| `settings.ts` | provider 设置读写 | `settings.ts` |
| `runtime/PiChatRuntime.ts` | ChatRuntime 接口，query() 实现 | `ClaudeChatRuntime.ts` |
| `adapters/PiEventAdapter.ts` | PI 事件 → StreamChunk 映射 | `transformClaudeMessage.ts` |
| `history/PiConversationHistoryService.ts` | 会话历史存取 | `ClaudeConversationHistoryService.ts` |

### Bridge 隔离层（2 个 + 1 脚本）

| 文件 | 职责 |
|------|------|
| `bridge/PiBridgeClient.ts` | 主插件进程中管理子进程连接、请求/响应、流式事件桥接 |
| `bridge/protocol.ts` | 定义桥接协议（init/prompt/cancel/reset/event/error） |
| `scripts/pi-bridge-server.mjs` | 子进程服务端，实际 import PI SDK 并维护 session |

### Workspace 服务（0 个 — PI 无 MCP/CLI）

PI 是纯 SDK，无可执行 CLI，无 MCP 支持：
- `PiWorkspaceServices.ts` — **不需要**
- `PiCliResolver.ts` — **不需要**

PI 的 commands/skills 由 SDK 自动从 `~/.pi/agent/` 发现，不需要 Claudian 管理的 workspace 服务。

### Inline Edit（1 个）

| 文件 | 职责 | 对应 Claude |
|------|------|-----------|
| `aux/PiInlineEditService.ts` | InlineEditService 接口，复用 `core/prompt/inlineEdit.ts` | `ClaudeInlineEditService` |

### 辅助服务（2 个）

| 文件 | 职责 | 对应 Claude |
|------|------|-----------|
| `aux/PiInstructionRefineService.ts` | `#` 模式指令精炼 | `ClaudeInstructionRefineService` |
| `aux/PiTitleGenerationService.ts` | 新会话自动生成标题 | `ClaudeTitleGenerationService` |

### 辅助服务（0 个 — 已移除）

- `PiApprovalHandler.ts` — **不需要**。PI 无 approval 机制，工具直接执行。
- `PiTaskResultInterpreter.ts` — **不需要**。PI 无 Claude 风格的子 agent 任务。

### 历史存储（0 个 — PI Session 内置持久化）

PI 的 `AgentSession` 已内置：
- 自动 session 持久化（JSONL 文件）
- 多轮 history 累积（`session.state.messages`）
- Session 分支/fork 管理（`branch()`、`navigateTree()`）

不需要额外的 `PiHistoryStore`。`PiConversationHistoryService` 只需直接读取 PI session 的 messages。

**共 12 个 provider 文件 + 1 个 bridge 脚本。**

---

## 6. 分阶段实施计划

### Phase 0：环境准备与验证 ✅

**完成。**

- [x] Claudian dev 环境跑通
- [x] PI SDK 验证脚本（ext/readonly/session 3 个）
- [x] PI 事件流映射表确认
- [x] Inline edit 只读 session 方案验证
- [x] System prompt via ResourceLoader 验证
- [x] Session 生命周期验证（cancel、continueSession、history 累积）
- [x] Claude provider 架构代码阅读

---

### Phase 1：稳定性回滚与隔离基线 ✅

**目标**：先确保 fork 不破坏原 Claudian 体验，再继续 PI 接入。

#### 工作项

1. 撤销 PI 对主插件启动路径的侵入性改动
2. 恢复 `claude/codex` 正常注册与启动
3. 建立“PI 默认关闭”的策略（后续仅在显式开关后启用）
4. 验证 Obsidian 中插件可正常加载，界面恢复

#### 验收标准

- [x] 插件可正常启用，界面恢复
- [x] Claude/Codex 不受影响
- [x] 无 `node:*` 动态导入导致的启动期 CORS 报错

---

### Phase 2：Bridge 聊天主链路（核心文件 7 个 + Bridge）

**目标**：Claudian 能识别 PI provider，能开 tab，能发消息聊天。

#### 工作项

1. `registration.ts` — `ProviderRegistration` 对象（受开关控制）
2. `capabilities.ts` — `PI_PROVIDER_CAPABILITIES`，声明支持的功能
3. `ui/PiChatUIConfig.ts` — 侧边栏 UI 配置
4. `settings.ts` — PI provider 设置读写
5. `bridge/protocol.ts` — 桥接协议定义
6. `bridge/PiBridgeClient.ts` — 子进程连接与流式转发
7. `scripts/pi-bridge-server.mjs` — 子进程内创建 PI session
8. `runtime/PiChatRuntime.ts` — 实现 `ChatRuntime`，通过 Bridge `query()` → `AsyncGenerator<StreamChunk>`
9. `adapters/PiEventAdapter.ts` — PI 事件 → `StreamChunk` 映射
10. `history/PiConversationHistoryService.ts` — 历史服务

#### 验收标准

- [ ] Claudian 设置页可选择 PI provider
- [ ] 开新 tab 时 PI runtime 被创建
- [ ] 发送消息，PI 能回复
- [ ] 文本流在侧边栏实时显示
- [ ] PI 进程异常仅影响 PI，不影响 Claude/Codex

---

### Phase 3：Inline Edit（+1 个）

**目标**：PI 能处理内联编辑请求，diff preview 正常。

#### 工作项

11. `aux/PiInlineEditService.ts` — 实现 `InlineEditService`，复用 `core/prompt/inlineEdit.ts`

#### 验收标准

- [ ] 选中文字 → PI 编辑 → diff preview 显示
- [ ] 光标位置编辑正常
- [ ] apply 后文件内容正确
- [ ] Clarification fallback 正常（PI 输出无标签文本时）

---

### Phase 4：辅助服务（+2 个）

**目标**：完整功能集。

#### 工作项

12. `aux/PiInstructionRefineService.ts` — 指令精炼
13. `aux/PiTitleGenerationService.ts` — 标题生成

#### 验收标准

- [ ] `#` 指令精炼模式可用
- [ ] 新会话自动生成标题

**注**：`PiApprovalHandler` 和 `PiTaskResultInterpreter` 已移除 — PI 无对应机制。

**注**：历史持久化不需要单独文件。PI 的 `AgentSession` 内置 session 持久化。

---

## 7. 风险分析

### 风险 1： Claudian provider seam 与 PI SDK 事件模型不完全对齐

**状态**：已验证，映射表在 Section 4.3。

**应对**：按映射表实现，不追求首版完整暴露所有内部状态。

### 风险 2： Obsidian 运行时与 PI SDK 模块系统不兼容

**状态**：已暴露并确认（`file://` 拦截、`node:*` 动态导入 CORS、`import.meta`/`createRequire` 兼容问题）。

**应对**：采用 Bridge 子进程方案；主插件禁止直接加载 PI SDK 依赖链。

### 风险 3： Inline edit 与普通文件写入双轨

**状态**：已解决 — 只读 session 方案（Section 4.5）。

### 风险 4： PI 有无 PreToolUse hook

**状态**：已确认 — **没有**。Inline edit 使用只读 session 绕过。

### 风险 5： 会话真源冲突

**状态**：已约定 — PI session 为事实源，Claudian 只存 UI 绑定信息。

### 风险 6： PI 故障外溢到主插件

**状态**：已纳入设计约束。

**应对**：PI 默认关闭 + Bridge 隔离 + 崩溃仅影响 PI tab，不阻塞插件启动。

---

## 8. 核心代码复用

这些 Claude/Codex provider 的代码**PI 可直接复用**：

| 模块 | 路径 | 复用方式 |
|------|------|---------|
| `buildInlineEditPrompt()` | `src/core/prompt/inlineEdit.ts` | 直接 import |
| `parseInlineEditResponse()` | `src/core/prompt/inlineEdit.ts` | 直接 import |
| `getInlineEditSystemPrompt()` | `src/core/prompt/inlineEdit.ts` | 直接 import |
| `ProviderRegistry` | `src/core/providers/ProviderRegistry.ts` | 直接使用 |
| `ChatRuntime` 接口 | `src/core/runtime/ChatRuntime.ts` | 实现相同接口 |
| `InlineEditService` 接口 | `src/core/providers/types.ts` | 实现相同接口 |
| `StreamChunk` 类型 | `src/core/types/chat.ts` | 直接使用 |

---

## 9. 验收清单

### Phase 1 — 稳定性回滚与隔离基线

- [x] 插件启动恢复正常
- [x] Claude/Codex 正常
- [x] PI 不再污染主启动路径

### Phase 2 — Bridge 核心聊天（7 个核心 + Bridge）

- [ ] PI provider 可选择
- [ ] 能开 PI tab
- [ ] 消息发送和流式回复正常
- [ ] 文本 delta 实时显示
- [ ] PI 子进程异常可隔离

### Phase 3 — Inline Edit（1 个文件）

- [ ] 选区编辑 + diff preview
- [ ] 光标编辑 + diff preview
- [ ] apply 后文件正确
- [ ] Clarification fallback 正常

### Phase 4 — 辅助服务（2 个文件）

- [ ] 指令精炼
- [ ] 标题生成
