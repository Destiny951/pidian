# Implementation Checklist

## Phase 1: 异步接口改造

### 1.1 类型定义
- [x] `src/core/providers/types.ts`: 修改 `getModelOptions` 返回类型为 `ProviderUIOption[] | Promise<ProviderUIOption[]>`

### 1.2 ProviderSettingsCoordinator (6 个方法)
- [x] `src/core/providers/ProviderSettingsCoordinator.ts:121`: `projectProviderState()` → `async projectProviderState()`
- [x] `src/core/providers/ProviderSettingsCoordinator.ts:281`: `projectActiveProviderState()` → `async projectActiveProviderState()`
- [x] `src/core/providers/ProviderSettingsCoordinator.ts:71`: `getProviderSettingsSnapshot()` → `async getProviderSettingsSnapshot()`
- [x] `src/core/providers/ProviderSettingsCoordinator.ts:251`: `normalizeAllModelVariants()` → `async normalizeAllModelVariants()`
- [x] `src/core/providers/ProviderSettingsCoordinator.ts:213`: `reconcileProviders()` → `async reconcileProviders()`
- [x] `src/core/providers/ProviderSettingsCoordinator.ts:202`: `reconcileAllProviders()` → `async reconcileAllProviders()`

### 1.3 main.ts 调用点 (3 处)
- [x] `src/main.ts:269`: 加 `await` 调用 `projectActiveProviderState()`
- [x] `src/main.ts:304`: 加 `await` 调用 `normalizeModelVariantSettings()`
- [x] `src/main.ts:447`: 加 `await` 调用 `reconcileModelWithEnvironment()`

### 1.4 Tab.ts 调用点 (2 处)
- [x] `src/features/chat/tabs/Tab.ts:91`: 加 `await` 调用 `getProviderSettingsSnapshot()`
- [x] `src/features/chat/tabs/Tab.ts:138`: 加 `await` 调用 `getProviderSettingsSnapshot()`

### 1.5 PidianView.ts 调用点 (1 处)
- [x] `src/features/chat/PidianView.ts:85`: 改 `refreshModelSelector()` 为 `async refreshModelSelector()`
- [x] `src/features/chat/PidianView.ts:90`: 加 `await` 调用 `getProviderSettingsSnapshot()`

### 1.6 StreamController.ts 调用点 (1 处)
- [x] `src/features/chat/controllers/StreamController.ts:323`: 加 `await` 调用 `getProviderSettingsSnapshot()`

### 1.7 ModelSelector.ts (3 处)
- [x] `src/features/chat/ui/toolbar/ModelSelector.ts:27`: 改 `getAvailableModels()` 为 `async getAvailableModels()`
- [x] `src/features/chat/ui/toolbar/ModelSelector.ts:46`: 改 `updateDisplay()` 为 `async updateDisplay()`
- [x] `src/features/chat/ui/toolbar/ModelSelector.ts:60`: 改 `renderOptions()` 为 `async renderOptions()`

### 1.8 其他调用点
- [x] `src/features/settings/PidianSettings.ts:287`: 改为异步填充 dropdown
- [x] `src/features/chat/tabs/Tab.ts:75`: 改 `getBlankTabModelOptions()` 为 async

## Phase 2: 模型列表获取

### 2.1 Bridge 接口 (已完成)
- [x] `scripts/pi-bridge-server.mjs`: 实现 `handleListModels()`
- [x] `scripts/pi-bridge-server.mjs`: 实现 `handleSetModel()`
- [x] `src/providers/pi/bridge/protocol.ts`: 定义 `PiModelInfo` 接口
- [x] `src/providers/pi/bridge/PiBridgeClient.ts`: 实现 `listModels()` 方法
- [x] `src/providers/pi/bridge/PiBridgeClient.ts`: 实现 `setModel()` 方法

### 2.2 模型缓存
- [x] `src/providers/pi/ui/PiChatUIConfig.ts`: 实现 `cachePiModels()` 函数
- [x] `src/providers/pi/ui/PiChatUIConfig.ts`: 修改 `getModelOptions()` 使用缓存
- [x] `src/providers/pi/runtime/PiChatRuntime.ts`: 在初始化时调用 `bridge.listModels()` 并缓存

## Phase 3: 模型切换逻辑

### 3.1 PiChatRuntime
- [x] `src/providers/pi/runtime/PiChatRuntime.ts`: 添加 `setModel(provider, modelId)` 方法
- [x] `src/providers/pi/runtime/PiChatRuntime.ts`: 实现模型切换后的 session 重启

### 3.2 onModelChange 回调
- [x] `src/features/chat/tabs/Tab.ts:770`: 修改 `onModelChange` 回调
- [x] `src/features/chat/tabs/Tab.ts`: 解析 `provider/modelId` 格式
- [x] `src/features/chat/tabs/Tab.ts`: 调用 `tab.service.setModel()`

## Phase 4: UI 布局调整

### 4.1 InputToolbar
- [x] `src/features/chat/ui/InputToolbar.ts`: 创建 `pidian-toolbar-left-group` 容器
- [x] `src/features/chat/ui/InputToolbar.ts`: 将 ModelSelector、PermissionToggle、ExternalContextSelector 放入容器

### 4.2 CSS
- [x] `src/style/components/input.css`: 添加 `.pidian-toolbar-left-group` 样式

## Phase 5: 测试修复

### 5.1 单元测试
- [x] `tests/unit/core/providers/ProviderSettingsCoordinator.test.ts`: 更新测试数据
- [x] `tests/unit/core/providers/ProviderSettingsCoordinator.test.ts`: 改为异步测试
- [x] `tests/unit/providers/pi/PiChatUIConfig.test.ts`: 改为异步测试
- [x] `tests/unit/features/chat/ui/InputToolbar.test.ts`: 更新测试为异步
- [x] 所有测试通过 (98 suites, 2434 tests)

### 5.2 集成测试
- [x] 手动测试：模型列表显示完整（3 个模型：minimax-cn 和 omlx）
- [x] 手动测试：模型切换生效（settings.json 正确更新）
- [x] 手动测试：UI 布局正确（无重复渲染）

## Phase 6: 质量检查

- [x] 运行 `npm run typecheck` ✅
- [x] 运行 `npm run lint` ✅
- [x] 运行 `npm run build` ✅
- [x] 运行 `npm run test` ✅ (98 passed, 2434 tests)
- [x] 修复 bridge server: `ModelRegistry.create(AuthStorage, modelsJsonPath)` ✅
- [x] 修复 bridge server: 使用 `modelRegistry.getAvailable()` 获取可用模型 ✅
- [x] 修复模型列表重复渲染：添加 `rendering` 标志防止并发渲染 ✅

## Phase 7: 文档更新

- [x] 更新 `implementation.md` 标记完成状态
- [x] 更新 `task.json` 标记完成
- [x] 清理调试日志

## 完成总结

### 已实现功能

1. **完整的模型列表**：
   - 使用 `ModelRegistry.getAvailable()` 只返回有 auth 配置的模型
   - 包括 `auth.json` 配置的 provider 和 `models.json` 定义的自定义模型
   - 显示 3 个可用模型：`minimax-cn/MiniMax-M2.7`, `minimax-cn/MiniMax-M2.7-highspeed`, `omlx/gemma-4-26b-a4b-it-4bit`

2. **正确的默认模型**：
   - 从 PI settings 读取 `defaultProvider` 和 `defaultModel`
   - UI 显示 PI 实际使用的默认模型

3. **有效的模型切换**：
   - 通过 bridge 更新 PI settings 文件
   - 销毁当前 session 以使用新模型
   - 新 session 在创建时读取更新的 settings

4. **修复的 UI 布局**：
   - 解决模型列表重复渲染问题
   - 添加 `rendering` 标志防止并发渲染
   - 正确的 provider 分组显示

### 技术实现

- 异步接口：`getModelOptions()` 返回 `Promise<ProviderUIOption[]>`
- Bridge 集成：`list_models` 和 `set_model` 命令
- Auth 处理：`AuthStorage` 和 `ModelRegistry` 正确初始化
- Session 管理：切换模型时销毁并重建 session
- UI 优化：防止并发渲染，正确分组显示
