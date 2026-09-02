# Mai Sakurajima

> **开发中版本**：当前代码仍在持续开发和验证，接口、数据结构与用户体验可能变更。请勿将当前构建视为稳定发行版，使用前请自行备份数据。

Mai 是本地优先的 Windows 桌面 AI 伴侣。她围绕自然对话、连续会话、长期记忆、麻衣人格、语音与桌宠交互设计，也提供由用户明确操作的日程、专注、知识资料和私人朋友圈功能。

Mai 不是通用 Agent、Coding Agent 或桌面自动化工具。它提供可选的 Work Mode（工作模式），由内部 Action Runtime / Mai Agent Harness 驱动；Chat Mode 仍是独立的 Companion Runtime（陪伴运行时）。Work 默认关闭，不会自动触发；它只可在用户明确选择的 Work Workspace 内，在单次审批后处理受支持的文件操作，且没有 Shell、Git、代码执行、浏览器自动化或自主任务循环。

## 开始开发

```powershell
npm install
npm start
```

常用验证命令以 `package.json` 为准：

```powershell
npm test
npm run dist
```

开始修改前必须先阅读顶层 [`AGENTS.md`](AGENTS.md)。它规定产品边界、数据兼容、安全限制、状态所有权和维护协议。

## 当前能力与限制

- Chat 支持连续会话、流式回复、记忆修正与长期陪伴上下文；
- DeepSeek 是当前可用的模型 Provider；本地 Provider 只是明确返回 unavailable 的未来接口；
- 语音、桌宠、生活助手、知识资料和主动关心均在受控 Main Process 与窄 IPC 边界内运行；
- 知识资料只在用户明确选择文件后导入；前台应用感知默认关闭；
- Chat 不会访问任意本地文件、执行命令或控制系统。
- Work Mode 使用独立的 Work Project / WorkSession 与短生命周期 Action Session；它可使用安全本地工具以及经过 WorkspaceSandbox、CapabilityPolicy 和逐次审批保护的 Workspace 读取与文件操作（含受限 `.docx` 新建/追加），不会写入聊天历史或长期记忆。
- 公开项目不附带壁纸图片。使用者可在设置中主动选择自己有权使用的本地 JPG/PNG；应用只保存一份本地副本，不会将图片上传到仓库。
- 公开项目不附带第三方头像素材。麻衣与用户头像均可自行选择本地 JPG/PNG；应用只保存本地副本。

应用 appId 为 `com.mai.sakurajima.desktop`，用户数据位于 `%APPDATA%\\Mai Sakurajima`。覆盖安装必须保留聊天、记忆、设置、API Key 与备份。

## 文档导航

| 文档 | 负责内容 |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 当前 Renderer / Preload / Main Process 结构、模块职责、IPC 与状态边界 |
| [`docs/CHAT.md`](docs/CHAT.md) | 单轮 Chat Pipeline、Prompt、Provider、写入与副作用顺序 |
| [`docs/ACTION-RUNTIME.md`](docs/ACTION-RUNTIME.md) | 可选行动运行时、独立 session、适配器与能力权限边界 |
| [`docs/MEMORY-AND-DATA.md`](docs/MEMORY-AND-DATA.md) | Schema v16、持久化数据、运行时状态、owner、writer、检索与备份 |
| [`docs/MODEL-PROVIDERS.md`](docs/MODEL-PROVIDERS.md) | ModelGateway、Provider 合约与 DeepSeek / Local 行为 |
| [`docs/MIGRATION-v6.md`](docs/MIGRATION-v6.md) | v5 到 v6 的历史兼容、迁移与回滚注意事项 |
| [`docs/MIGRATION-v7.md`](docs/MIGRATION-v7.md) | v6.1 到 v7 的行动运行时设置兼容说明 |
| [`docs/WALLPAPERS.md`](docs/WALLPAPERS.md) | 用户自选本地壁纸的导入、存储与隐私边界 |
| [`docs/AVATARS.md`](docs/AVATARS.md) | 用户自选本地头像的导入、存储与发布边界 |
| [`docs/REFACTOR-AUDIT-v6.md`](docs/REFACTOR-AUDIT-v6.md) | v6 产品边界与历史重构审计记录 |
| [`docs/AGENT-HARNESS-AUDIT-v7.md`](docs/AGENT-HARNESS-AUDIT-v7.md) | v7 早期 Harness 取舍与历史研究记录，不是当前实现说明 |

安装与日常使用请看 [`Mai-Sakurajima-使用说明.md`](Mai-Sakurajima-使用说明.md)。
