# Claudian (PI Fork)

`Claudian` 是一个 Obsidian 桌面端插件，把 PI agent 直接嵌到知识库侧边栏里。

你的 Vault 会成为 Agent 的工作目录，支持读写文件、搜索、bash、多轮会话、技能触发与上下文引用。

## Fork 来源

- 上游项目: `YishenTu/claudian`
- 上游地址: `https://github.com/YishenTu/claudian`

感谢上游提供的多 Provider 架构、聊天侧边栏基础能力、以及与 Obsidian 的深度集成。

## 本 Fork 的改进

相比上游项目，本 fork 做了以下核心改进：

### 架构精简

- **移除 Claude/Codex Provider**：删除了所有 Claude SDK 和 Codex app-server 相关代码，精简为 PI-only 架构
- **移除 @anthropic-ai/claude-agent-sdk 依赖**：显著减小包体积和依赖复杂度
- **删除冗余 Provider 代码**：移除 MCP 管理、CLI 解析、子代理系统等 PI 不需要的模块
- **删除测试文件**：清理了 Claude/Codex 相关的单元测试和集成测试

### PI Provider 增强

- **自动路径推导**：PI agent 目录和 SDK 入口自动检测，无需手动配置 `PI_AGENT_DIR` 和 `PI_SDK_PATH`
- **Bridge 架构**：通过 Node sidecar bridge 运行 PI SDK，避免 Obsidian/Electron 运行时的兼容性问题
- **会话恢复**：完整支持会话切换、重启后 JSONL 历史回放
- **工具调用渲染**：修复 tool block UI 显示问题
- **环境变量传递**：正确继承父进程环境变量，支持 PI extensions 正常运行

### 代码质量

- **移除 console.log**：生产代码无 console 输出
- **精简文档**：更新 CLAUDE.md 和 README，聚焦 PI-only 架构
- **统一上下文渲染**：skill、current note、editor/browser/canvas 进入统一折叠 UI

## 主要能力

- PI agent 聊天
- 多标签会话与历史会话切换
- Slash 命令、PI skills、`@` 上下文引用
- Inline Edit（文本就地改写，差异预览）
- `/compact` 压缩

## 运行要求

- Obsidian `>= 1.4.5`
- 仅桌面端（macOS / Linux / Windows）
- Node.js
- 全局安装 `@mariozechner/pi-coding-agent`

## 安装

先安装 PI agent：

```bash
npm install -g @mariozechner/pi-coding-agent
```

插件会自动推导：

- PI agent 目录：`~/.pi/agent`
- PI SDK 入口：`$(npm root -g)/@mariozechner/pi-coding-agent/dist/index.js`

不再需要在插件设置里手动填写 `PI_AGENT_DIR` 或 `PI_SDK_PATH`。

### 从 Release 安装

1. 下载以下 4 个文件：
   - `main.js`
   - `manifest.json`
   - `styles.css`
   - `pi-bridge-server.mjs`（必需，PI bridge sidecar）

2. 放到你的 Vault 插件目录：

```text
/path/to/vault/.obsidian/plugins/claudian/
```

3. 在 Obsidian 社区插件里启用 `Claudian`

### 从源码开发

```bash
git clone https://github.com/Destiny951/claudian.git
cd claudian
npm install
npm run dev
```

```bash
npm run typecheck
npm run test
npm run build
```

## 架构概览

```text
src/
├── core/                 # provider-neutral contracts/runtime/registry
├── providers/
│   └── pi/               # PI provider + bridge client + history adapter
├── features/chat/
├── features/inline-edit/
├── features/settings/
├── shared/
├── utils/
└── style/
```

## 数据与隐私说明

- 会话元数据存储在 Vault 本地
- PI 原生会话记录由 `~/.pi` 下的本地目录维护
- 本 fork 不内置遥测上报逻辑

## 许可证

MIT License，见 `LICENSE`。

## 维护者

本 Fork 由 [Destiny951](https://github.com/Destiny951) 维护。

## 致谢

- [Obsidian](https://obsidian.md)
- [PI Coding Agent](https://www.npmjs.com/package/@mariozechner/pi-coding-agent)
- 上游项目 [YishenTu/claudian](https://github.com/YishenTu/claudian)