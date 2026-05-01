# Implementation Plan: PI Model Selector Refactor

## 实现状态：✅ 已完成

**完成日期**: 2026-05-01

## 实现步骤

### Phase 1: 异步接口改造 ✅

#### 1.1 修改类型定义

**文件**: `src/core/providers/types.ts`

**改动**:
```typescript
// Before
getModelOptions(settings: Record<string, unknown>): ProviderUIOption[];

// After
getModelOptions(settings: Record<string, unknown>): ProviderUIOption[] | Promise<ProviderUIOption[]>;
```

**理由**: 保持向后兼容，支持同步和异步两种返回值

#### 1.2 修改 ProviderSettingsCoordinator

**文件**: `src/core/providers/ProviderSettingsCoordinator.ts`

**改动函数**:
- [x] `projectProviderState()` → `async projectProviderState()`
- [x] `projectActiveProviderState()` → `async projectActiveProviderState()`
- [x] `getProviderSettingsSnapshot()` → `async getProviderSettingsSnapshot()`
- [x] `normalizeAllModelVariants()` → `async normalizeAllModelVariants()`
- [x] `reconcileProviders()` → `async reconcileProviders()`
- [x] `reconcileAllProviders()` → `async reconcileAllProviders()`

**关键改动**:
```typescript
// 第 135 行
const modelOptions = await uiConfig.getModelOptions(settings);

// 第 145 行
|| modelOptions.some(option => option.value === currentModel)

// 第 152 行
&& modelOptions.some(option => option.value === savedModelValue);
```

#### 1.3 修改调用点

**文件**: `src/main.ts`
- [x] 第 269 行: `await ProviderSettingsCoordinator.projectActiveProviderState()`
- [x] 第 304 行: `await this.normalizeModelVariantSettings()`
- [ ] 第 447 行: `await this.reconcileModelWithEnvironment()`

**文件**: `src/features/chat/tabs/Tab.ts`
- [ ] 第 91 行: `await ProviderSettingsCoordinator.getProviderSettingsSnapshot()`
- [ ] 第 138 行: `await ProviderSettingsCoordinator.getProviderSettingsSnapshot()`

**文件**: `src/features/chat/PidianView.ts`
- [ ] 第 90 行: 改 `refreshModelSelector()` 为 `async refreshModelSelector()`
- [ ] 第 90 行: `await ProviderSettingsCoordinator.getProviderSettingsSnapshot()`

**文件**: `src/features/chat/controllers/StreamController.ts`
- [ ] 第 323 行: `await ProviderSettingsCoordinator.getProviderSettingsSnapshot()`

### Phase 2: 模型列表获取

#### 2.1 Bridge 接口（已完成）

**文件**: `scripts/pi-bridge-server.mjs`
- [x] `handleListModels()` - 列出所有可用模型
- [x] `handleSetModel()` - 切换模型

**文件**: `src/providers/pi/bridge/protocol.ts`
- [x] `PiModelInfo` 接口
- [x] `list_models` 请求/响应类型
- [x] `set_model` 请求/响应类型

**文件**: `src/providers/pi/bridge/PiBridgeClient.ts`
- [x] `listModels()` 方法
- [x] `setModel()` 方法

#### 2.2 修改 PiChatUIConfig

**文件**: `src/providers/pi/ui/PiChatUIConfig.ts`

**改动**:
```typescript
export const piChatUIConfig: ProviderChatUIConfig = {
  async getModelOptions(): Promise<ProviderUIOption[]> {
    try {
      // 方案 A: 直接读取 PI 的配置文件（同步）
      // 方案 B: 通过 bridge 获取（需要 bridge 实例）
      
      // 暂时用方案 A，因为 bridge 需要在 runtime 初始化时才能访问
      const models = await loadPiModelsFromBridge();
      return models;
    } catch {
      return [{ value: 'pi', label: 'PI', description: 'Local PI agent' }];
    }
  },
  // ...
};
```

**问题**: `PiChatUIConfig` 是静态对象，无法访问 bridge 实例

**解决方案**:
1. 在 `ProviderRegistry` 注册 PI 时传入 bridge factory
2. 或者改为读取 PI SDK 的模型配置文件（但需要知道文件路径）

**最终方案**: 
- 读取 `~/.pi/agent/models.json`（自定义模型）
- 读取 PI SDK 的内置模型列表（通过 bridge 的 `list_models`）
- 合并两者

由于 `getModelOptions` 需要异步获取完整列表，而 `PiChatUIConfig` 是静态对象，需要：
1. 将 `piChatUIConfig` 改为工厂函数
2. 或者在 PI runtime 初始化时注入 bridge 实例

#### 2.3 实现方案（最终）

**方案**: 在 PI runtime 初始化时缓存模型列表

**文件**: `src/providers/pi/runtime/PiChatRuntime.ts`

```typescript
// 构造时缓存模型列表
constructor(plugin: PidianPlugin, bridge: PiBridgeClient) {
  this.plugin = plugin;
  this.bridge = bridge;
  this.adapter = new PiEventAdapter();
  
  // 初始化时获取并缓存模型列表
  this.initializeModelCache();
}

private async initializeModelCache(): Promise<void> {
  try {
    const { models } = await this.bridge.listModels();
    cachePiModels(models);
  } catch (error) {
    console.error('Failed to load PI models:', error);
  }
}
```

**文件**: `src/providers/pi/ui/PiChatUIConfig.ts`

```typescript
let cachedModels: ProviderUIOption[] | null = null;

export function cachePiModels(models: PiModelInfo[]): void {
  cachedModels = models.map(m => ({
    value: `${m.provider}/${m.id}`,
    label: m.name,
    description: `${m.provider} - ${m.contextWindow} tokens`,
    group: m.provider,
  }));
}

export const piChatUIConfig: ProviderChatUIConfig = {
  async getModelOptions(): Promise<ProviderUIOption[]> {
    // 如果有缓存，返回缓存
    if (cachedModels) {
      return cachedModels;
    }
    
    // 否则返回 models.json 的模型（fallback）
    return loadPiModelsFromConfig();
  },
  // ...
};
```

### Phase 3: 模型切换逻辑

#### 3.1 添加 PI Runtime 的 setModel 方法

**文件**: `src/providers/pi/runtime/PiChatRuntime.ts`

```typescript
async setModel(provider: string, modelId: string): Promise<void> {
  // 1. 调用 bridge 切换模型
  await this.bridge.setModel(provider, modelId);
  
  // 2. 重启 session
  await this.abort();
  this.sessionId = null;
  this.ready = false;
  
  // 3. 重新初始化
  await this.ensureReady(this.cwd);
}
```

#### 3.2 修改 onModelChange 回调

**文件**: `src/features/chat/tabs/Tab.ts`

```typescript
onModelChange: async (model: string) => {
  // 解析 provider/modelId
  const [provider, modelId] = model.includes('/') 
    ? model.split('/') 
    : ['pi', model];
  
  // 更新 settings
  await updateTabProviderSettings(tab, plugin, (settings) => {
    settings.model = model;
  });
  
  // 通知 PI runtime 切换模型
  if (tab.service?.setModel) {
    await tab.service.setModel(provider, modelId);
  }
  
  // 更新 UI
  tab.ui.modelSelector?.updateDisplay();
}
```

### Phase 4: UI 布局调整

#### 4.1 创建左侧工具栏容器

**文件**: `src/features/chat/ui/InputToolbar.ts`

```typescript
export function createInputToolbar(parentEl: HTMLElement, callbacks: ToolbarCallbacks) {
  const leftGroup = parentEl.createDiv({ cls: 'pidian-toolbar-left-group' });
  
  const modelSelector = new ModelSelector(leftGroup, callbacks);
  const permissionToggle = new PermissionToggle(leftGroup, callbacks);
  const externalContextSelector = new ExternalContextSelector(leftGroup);
  
  const thinkingBudgetSelector = new ThinkingBudgetSelector(parentEl, callbacks);
  const serviceTierToggle = new ServiceTierToggle(parentEl, callbacks);
  const mcpServerSelector = new McpServerSelector(parentEl);
  const contextUsageMeter = new ContextUsageMeter(parentEl);
  
  // ...
}
```

#### 4.2 添加 CSS 样式

**文件**: `src/style/components/input.css`

```css
.pidian-input-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-shrink: 0;
  padding: 4px 6px 6px 6px;
  gap: 8px;
}

.pidian-toolbar-left-group {
  display: flex;
  align-items: center;
  gap: 4px;
}
```

### Phase 5: 测试修复

#### 5.1 更新单元测试

**文件**: `tests/unit/core/providers/ProviderSettingsCoordinator.test.ts`

- [x] 更新测试数据使用新的模型格式 `provider/modelId`
- [x] 将测试改为异步（使用 `async/await`）

**文件**: `tests/unit/providers/pi/*.test.ts`

- [x] 添加 `listModels` 和 `setModel` 的测试
- [x] Mock bridge client

#### 5.2 集成测试

- [x] 测试模型列表显示完整
- [x] 测试模型切换生效
- [x] 测试 UI 布局正确

## 检查清单

### Phase 1: 异步接口改造
- [x] 修改 `types.ts` 的 `getModelOptions` 类型定义
- [x] 修改 `ProviderSettingsCoordinator` 的 6 个方法为 async
- [x] 修改 `main.ts` 的 3 个调用点
- [x] 修改 `Tab.ts` 的 2 个调用点
- [x] 修改 `PidianView.ts` 的 `refreshModelSelector()` 为 async
- [x] 修改 `StreamController.ts` 的 1 个调用点
- [x] 修改 `ModelSelector.ts` 的 `getAvailableModels()` 为 async
- [x] 修改 `ModelSelector.ts` 的 `updateDisplay()` 为 async
- [x] 修改 `ModelSelector.ts` 的 `renderOptions()` 为 async

### Phase 2: 模型列表获取
- [x] 在 `PiChatRuntime` 初始化时调用 `bridge.listModels()` 缓存模型
- [x] 实现 `cachePiModels()` 函数
- [x] 修改 `PiChatUIConfig.getModelOptions()` 使用缓存

### Phase 3: 模型切换逻辑
- [x] 在 `PiChatRuntime` 添加 `setModel()` 方法
- [x] 修改 `Tab.ts` 的 `onModelChange` 回调
- [x] 添加模型切换后的 session 重启逻辑

### Phase 4: UI 布局调整
- [x] 修改 `InputToolbar.ts` 创建左侧工具栏容器
- [x] 添加 CSS 样式 `.pidian-toolbar-left-group`

### Phase 5: 测试修复
- [x] 更新 `ProviderSettingsCoordinator.test.ts`
- [x] 添加 PI bridge 测试
- [x] 手动测试模型切换
- [x] 手动测试 UI 布局

## Completion Review

- Provider UI model discovery is asynchronous so PI can expose models from bridge-backed `ModelRegistry.getAvailable()` rather than only local `models.json` entries.
- Model values use the PI `provider/modelId` shape, and model switching updates PI settings through the bridge before resetting the active runtime session.
- The input toolbar groups model selection, permission mode, and external context controls together on the left while keeping budget/tier/MCP/context usage controls on the right.
- Tests and settings/chat call sites were updated for async model options and the PI-only Pidian naming surface.
- Refactor pass changed `ModelSelector` to use settings-signature model caching plus render-version invalidation, avoiding duplicate model loads for button/dropdown rendering and dropping stale async results safely.
- Bug fix: active PI tabs now switch models through the live `PiChatRuntime.setModel()` instead of a temporary bridge client, ensuring the current session is reset and recreated with the selected PI model.
- Bug fix: bridge `set_model` now flushes PI settings writes and `reset()` waits for `reset_ok`, avoiding races where the next session could still read stale model settings.
- Bug fix: existing PI sessions now keep their session history across model switches by preserving the target `sessionId` and passing the selected model as an explicit PI SDK session creation override.
- PI-only refactor: model values such as `omlx/...` and `minimax-cn/...` are no longer interpreted as chat provider IDs; provider routing is fixed to the single `pi` provider while the toolbar still exposes multiple PI models.

## 回滚计划

如果出现问题，可以回滚到当前状态：
1. `getModelOptions` 恢复为同步
2. 只读取 `models.json`
3. 移除 `pidian-toolbar-left-group` 容器

## 注意事项

1. **模型格式迁移**: 旧格式 `pi` 需要迁移到 `provider/modelId`
2. **缓存失效**: 如果用户修改 `models.json` 或 `auth.json`，需要刷新缓存
3. **错误处理**: bridge 调用失败时需要 fallback
4. **性能**: 避免频繁调用 `listModels()`
