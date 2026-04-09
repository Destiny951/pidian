# Claudian (Fork Edition)

`Claudian` 是一个 Obsidian 桌面端插件，把 AI 编码 Agent 直接嵌到你的知识库侧边栏里。

你的 Vault 会成为 Agent 的工作目录，支持读写文件、搜索、bash 命令、多轮会话和上下文引用。

## Fork 来源

本仓库基于以下项目 fork 并持续演进：

- 上游项目: `YishenTu/claudian`
- 上游地址: `https://github.com/YishenTu/claudian`

感谢上游提供的多 Provider 架构、聊天侧边栏基础能力、以及与 Obsidian 的深度集成。

## 我在这个 Fork 中做的核心改进

以下是本 fork 的重点改动方向，尤其是 PI Provider 相关：

- 新增 PI Provider 的桥接架构（Node sidecar bridge），避免在 Obsidian 插件运行时直接打包 PI SDK。
- 补齐 PI 会话恢复链路: 会话 `sessionId` 传递、切换会话恢复、重启后 JSONL 历史回放。
- 修复 PI 工具调用渲染问题: `toolUseId`/`toolCallId` 字段不一致导致的 tool block 丢失。
- 新增 PI skills 下拉命令目录: 支持通过 `/skill:xxx` 快捷触发。
- 统一 user context 渲染: skill、current note、editor/browser/canvas/context files 进入同一折叠 context UI，而不是泄露原始注入文本。
- 修复历史会话切换与 UI 状态错位问题，避免“高亮会话和实际会话不一致”。
- 优化 PI 环境变量注入与 PATH 继承，降低 sidecar 启动和工具调用失败概率。

## 主要能力

- 多 Provider 聊天（Claude / Codex / PI）
- 多标签会话与历史会话切换
- Slash 命令、Skill 触发、`@` 上下文引用
- Inline Edit（文本就地改写，差异预览）
- Plan Mode（先规划后执行）
- MCP 服务器接入（Provider 能力范围内）

## 运行要求

- Obsidian `>= 1.4.5`
- 仅桌面端（macOS / Linux / Windows）
- 对应 Provider 的 CLI 或运行环境（按你启用的 Provider 准备）

## 安装

### 方式 1: 从 Release 安装（推荐）

1. 下载 `main.js`、`manifest.json`、`styles.css`
2. 放到你的 Vault 插件目录:

```text
/path/to/vault/.obsidian/plugins/claudian/
```

3. 在 Obsidian 社区插件里启用 `Claudian`

### 方式 2: 从源码开发

```bash
git clone <this-fork-repo-url>
cd claudian
npm install
npm run dev
```

## 开发常用命令

```bash
# 类型检查
npm run typecheck

# 单元测试
npm test

# 生产构建
npm run build
```

## 架构概览

```text
src/
├── core/                 # Provider-neutral contracts/runtime/registry
├── providers/
│   ├── claude/
│   ├── codex/
│   └── pi/               # PI provider + bridge client + history adapter
├── features/chat/        # chat tabs/controllers/renderers
├── features/inline-edit/
├── features/settings/
├── shared/
├── utils/
└── style/
```

## 数据与隐私说明

- 会话元数据存储在 Vault 本地。
- Provider 原生会话记录由各 Provider 自身机制维护（如本地 JSONL 会话目录）。
- 本 fork 不内置遥测上报逻辑。

## 许可证

MIT License，见 `LICENSE`。

## 致谢

- [Obsidian](https://obsidian.md)
- [Anthropic Claude](https://www.anthropic.com/)
- [OpenAI Codex](https://github.com/openai/codex)
- 上游项目 [YishenTu/claudian](https://github.com/YishenTu/claudian)
