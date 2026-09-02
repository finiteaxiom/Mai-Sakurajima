# v6 产品回归审计（历史记录）

本文保留 v6 产品边界调整时的审计结论，不描述当前模块架构。当前架构请见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 审计结论

v5.12 已经偏向双 Runtime 产品：Agent 有独立会话、Task State、工具循环、Workspace、Permission 和审批 UI。这些能力与 Mai 的陪伴定位不直接相关，并显著扩大维护与安全边界。

## 分类

### A 直接移除

- Agent Runtime / Service / Coordinator；
- Task State；
- Tool Registry / Runtime / Orchestrator；
- Workspace Sandbox；
- Permission Level 和 Approval；
- Agent IPC、Preload API、Renderer 模式开关；
- Agent 专用测试和旧 UI smoke。

### B 迁移后保留

- 模型客户端能力迁入 `ModelGateway + Provider`；
- 旧 Agent 会话迁入只读 `legacyAgentArchive`；
- Codex 风格白色高对比布局改造成陪伴界面。

### C 保留并重命名职责

- 左侧项目/最近区域改为共同计划和最近对话；
- 右侧执行状态改为陪伴上下文；
- 设置中的模型能力改为 Provider 来源。

### D 原样保护

- Chat、Memory、Persona、Voice、Desktop Pet；
- 朋友圈、生活、日程、专注和知识资料；
- appId、userData、API Key 和备份；
- 历史会话重命名、窗口关闭修复与流式错误路径。

## 当时的后续原则

继续小步提取 `main.js` 中的 Memory、Life、Knowledge 和 IPC 注册职责，但不得借此恢复通用 Agent 能力。
