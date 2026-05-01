# PI 集成问题记录（2026-04-09）

## 背景

当前 PI provider 已可在 Obsidian/Claudian 中启用并发起对话，但在上下文透传、历史会话恢复、extensions/skills 运行环境、skills 快捷命令映射上存在功能缺口。

---

## BUG-01：选中文本上下文未进入 PI 提示词

- 现象：输入“将我选中的文本换成2”时，界面显示 `2 lines selected`，但 PI 回复“我没有看到您选中的任何文本”。
- 复现步骤：
  1. 在编辑器中选中两行文本
  2. 在 PI 对话框发送替换指令
  3. 观察 PI 无法识别选区
- 预期：PI 应接收到 `editorSelection.selectedText` 并据此执行编辑。
- 实际：PI runtime 仅使用 `request.text`，忽略 `editorSelection/currentNotePath/browserSelection/canvasSelection`。
- 初步定位：`src/providers/pi/runtime/PiChatRuntime.ts` 的 `prepareTurn()` 未做上下文编码。

---

## BUG-02：切换到历史 PI 会话后，后续对话丢失历史上下文

- 现象：在 Claudian 的“历史会话”中打开之前的 PI 对话，再继续聊天，PI 不带前文语境，表现像新会话。
- 复现步骤：
  1. 建立 PI 对话 A 并发送多轮消息
  2. 切换到其他会话
  3. 回到对话 A 并继续发送消息
  4. 观察 PI 对前文无记忆
- 预期：恢复历史对话后，PI 应延续既有会话上下文。
- 实际：恢复历史后上下文未注入/未续接到同一 PI session。
- 可能原因：当前 Bridge/Runtime 的 session 恢复与 `conversation.sessionId/providerState` 对齐不完整。

---

## BUG-03：PI 调用 extensions（minimax）时环境变量不可见

- 现象：PI 可识别 minimax 扩展工具，但执行时报缺少密钥；终端直接运行同工具正常（能读取 `MINIMAX_CN_API_KEY`）。
- 复现步骤：
  1. 在系统终端确认 minimax 工具可正常读取环境变量
  2. 在 Claudian 的 PI 中触发 minimax 扩展调用
  3. 观察报错（密钥/环境缺失）
- 预期：PI 子进程与扩展执行环境应继承用户有效环境变量。
- 实际：Bridge 子进程环境与终端环境不一致（或 cwd/agentDir 导致扩展读取路径错误）。
- 可能原因：Obsidian GUI 启动进程的环境变量不完整，Bridge 仅继承 `process.env`，未做补齐与校验。

---

## BUG-04：PI skills 调用失败且未映射为 `/` 快捷命令

- 现象：PI skills 调用报错，且已有 skills 未映射为 Claudian 输入框中的 `/` 命令（例如 `/find-skills`）。
- 复现步骤：
  1. 在 PI 对话中请求调用某个已安装 skill
  2. 观察调用失败或不可用
  3. 输入 `/` 查看命令列表，未出现 PI skills 快捷项
- 预期：
  - PI skills 可被正常加载执行
  - 常用 skills 可在 Claudian 中通过 `/skill-name` 快捷触发
- 实际：skills 侧与 extensions 类似存在运行环境问题，且命令目录尚未接入 PI skills 映射。
- 可能原因：
  - Bridge 进程环境与 PI 预期运行环境不一致
  - `ProviderWorkspaceServices.commandCatalog` 尚未为 PI 实现 skills 列表桥接

---

## 影响范围

- 影响 PI provider 的核心可用性（上下文编辑、历史连续性、扩展工具、skills 工作流）。
- 不影响现有 Claude/Codex provider。

## 优先级建议

1. BUG-01（上下文透传）
2. BUG-02（历史会话续接）
3. BUG-03（环境变量与执行环境）
4. BUG-04（skills 执行与 `/` 命令映射）
