# PRD: PI Model Selector Refactor

## 背景

当前 Pidian 是 PI-only 插件，但 ModelSelector 的设计仍然沿用了多 provider 架构：
- `ModelSelector` 原本用于选择 provider（Claude、Codex、PI 等）
- 现在应该改为选择 PI 内置的模型

同时，UI 布局需要调整，将相关组件放在一起。

## 问题分析

### 1. 模型列表不完整

**现状**：
- `PiChatUIConfig.getModelOptions()` 只读取 `~/.pi/agent/models.json` 中的自定义模型
- 未包含 PI SDK 内置模型（OpenAI、DeepSeek、MiniMax 等内置 provider 的模型）
- 未包含 `auth.json` 中配置的 provider 的模型

**PI SDK 模型来源**：
1. **内置模型**：`@mariozechner/pi-ai` 的 `models.generated.js`（预定义的 provider 和 model）
2. **认证配置**：`~/.pi/agent/auth.json`（如 `minimax-cn` 的 API key）
3. **自定义模型**：`~/.pi/agent/models.json`（用户自定义的 provider 和 model）

PI SDK 的 `ModelRegistry` 会合并这三者，但当前实现只读取了第 3 项。

### 2. 模型切换未生效

**现状**：
- 用户在 ModelSelector 切换模型后，只更新了 Pidian 的 `settings.model`
- 未通知 PI SDK 切换模型
- PI session 使用的是 PI 自己的 `settings.json` 中的 `defaultProvider` 和 `defaultModel`

**需要**：
- 切换模型时调用 PI SDK 的 `SettingsManager.setDefaultModelAndProvider()`
- 重启 PI session 使新模型生效

### 3. UI 布局不合理

**现状**：
- `ModelSelector` 在左侧
- `PermissionToggle` 在中间
- `ExternalContextSelector` 在右侧

**需求**：
- `ModelSelector`、`PermissionToggle`、`ExternalContextSelector` 放在一起，位于工具栏左侧
- 其他组件（ThinkingBudgetSelector、ServiceTierToggle、McpServerSelector、ContextUsageMeter）在右侧

## 需求

### 需求 1：完整的模型列表

**目标**：ModelSelector 显示 PI 的完整可用模型列表（内置 + 自定义）

**方案**：将 `ProviderChatUIConfig.getModelOptions()` 改为异步接口

**理由**：
- PI 的完整模型列表需要通过 bridge 异步获取
- 同步缓存方案需要管理缓存失效，增加复杂度
- 异步接口改动范围可控，调用点都在 async 上下文

**验收标准**：
- [ ] ModelSelector 显示 PI SDK 的内置模型
- [ ] ModelSelector 显示 `auth.json` 配置的 provider 的模型
- [ ] ModelSelector 显示 `models.json` 自定义模型
- [ ] 模型按 provider 分组显示

### 需求 2：模型切换生效

**目标**：用户切换模型后，PI session 使用新模型

**方案**：
1. 在 `onModelChange` 回调中调用 `bridge.setModel(provider, modelId)`
2. 重启 PI session（调用 `session.abort()` 后重新初始化）

**验收标准**：
- [ ] 切换模型后，PI 的 `settings.json` 的 `defaultProvider` 和 `defaultModel` 更新
- [ ] 新的对话使用新模型
- [ ] 切换模型后 UI 显示正确

### 需求 3：UI 布局调整

**目标**：相关组件放在一起

**方案**：
1. 创建 `pidian-toolbar-left-group` 容器
2. 将 `ModelSelector`、`PermissionToggle`、`ExternalContextSelector` 放入该容器

**验收标准**：
- [ ] ModelSelector、PermissionToggle、ExternalContextSelector 在工具栏左侧连续排列
- [ ] 其他组件在右侧
- [ ] 布局在不同屏幕宽度下正常显示

## 非需求

- 不支持多 provider（保持 PI-only）
- 不保留旧的 provider 选择逻辑
- 不修改其他 toolbar 组件的行为

## 技术约束

1. **PI SDK 依赖**：
   - `ModelRegistry.create()` 加载模型列表
   - `SettingsManager.setDefaultModelAndProvider()` 切换模型
   - 切换模型需要重启 session

2. **异步接口约束**：
   - `ProviderChatUIConfig.getModelOptions()` 需要改为 `async`
   - 所有调用点需要加 `await`

3. **向后兼容**：
   - 模型格式从 `pi` 改为 `provider/modelId`（如 `minimax-cn/MiniMax-M2.7`）
   - 需要处理旧格式迁移

## 风险

1. **异步改造风险**：可能有遗漏的同步调用点
   - 缓解：全面搜索调用链，逐一验证

2. **模型切换风险**：重启 session 可能丢失未保存的对话
   - 缓解：提示用户或自动保存

3. **测试影响**：单元测试需要更新
   - 缓解：逐步修复测试用例

## 时间估算

| 任务 | 估算时间 |
|------|----------|
| 异步接口改造 | 2h |
| 模型列表获取 | 1h |
| 模型切换逻辑 | 1h |
| UI 布局调整 | 0.5h |
| 测试修复 | 1h |
| **总计** | **5.5h** |

## 成功指标

1. 用户可以选择 PI 的任意可用模型
2. 切换模型后新模型立即生效
3. UI 布局清晰合理
4. 所有测试通过
