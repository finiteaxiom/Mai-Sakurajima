# Ollama 本地聊天

## 使用

1. 启动已安装的 Ollama；使用 `ollama list` 确认本机已有模型。
2. 启动 Mai，在「设置 → 模型」选择「Ollama 本地模型」。
3. 刷新列表，选择模型，保存后测试连接，再开始聊天。测试连接使用简短的合成消息，不发送聊天历史或 Persona。

Ollama 不需要 API Key。首次加载模型可能较慢；可先使用 `qwen3.5:4b`。Mai 不安装、更新或下载模型，不替用户启动 Ollama 服务。服务未启动、模型已删除或显存/内存不足时，检查 Ollama 并刷新列表，或手动换用其他模型来源。

## 数据与运行时边界

- Chat 继续经过 `ChatService -> ChatRequestService -> ModelGateway -> LocalModelProvider`；会话、长期记忆和人格处理仍由原有模块拥有。
- 请求只访问 `http://127.0.0.1:11434`，禁止 HTTP 重定向；拒绝云端命名和带远程路由元数据的模型。模型请求不携带 API Key、工具、图片或任意 Renderer 字段。
- 一轮请求开始时固定 Provider 和模型；中途修改设置不会把当前请求或纯文本重试送到另一来源。失败不会自动使用 DeepSeek。
- 切换来源分别保留 `settings.model.localModel` 与 `settings.deepseek.model`，不清除 DeepSeek Key、不重置历史。配置仍保存在 `%APPDATA%\Mai Sakurajima`。
- 本地推理不等于整个应用离线：Work 仍要求独立的 DeepSeek 配置，天气等已有联网能力不受此开关控制。临时 Workspace 授权继续遵守原有只读边界。

## 上下文与输出

本地 Prompt 估算上限为 12,000 tokens，最多选取 40 条历史上下文；模型上下文取模型声明容量与 16,384 中的较小值，并预留输出预算。记忆、生活和连续性摘要使用紧凑预算，保留核心人格与回复契约。超限明确报错，不静默截断持久化历史，也不提升模型声明的容量。token 数是估算值，不能保证所有模型的分词结果完全一致。

发现请求最多 5 秒，生成默认最多 180 秒；支持用户取消。响应体上限 4 MiB。可关闭 thinking 的模型关闭思考，提供 low 档位的模型选 low，其余保留模型默认行为并给予有限推理预算。独立 `message.thinking` 不进入可见回复或记忆。过长推理、提前断流、工具调用和输出截断返回错误，不保存为完整回复。Mai 仍依赖模型遵循结构化回复契约；小模型的记忆提取、人格一致性和复杂中文对话质量需要实际使用评估。

## 验证与复测

2026-11-11 至 2026-11-12 在 Ollama 0.40.15 验证了 `qwen3.5:4b`、`deepseek-r1:8b`、`gpt-oss:20b` 的真实结构化请求；Qwen 额外走通 Mai 完整聊天、保存、模型来源切换及重启。请求使用合成数据，不读取正式聊天历史。其他已安装模型尚未逐一验收。

- `npm.cmd test`：Provider、Chat、上下文预算、取消、断流、迁移、恢复保护和 Chat smoke。
- `node test/ui-redesign-smoke.js`：真实 Renderer 配合隔离 preload，覆盖本地模型发现、服务失败提示、来源切换和原有界面回归；不等同于真实服务或人工操作。
- 使用 `MAI_OLLAMA_SMOKE_MODEL=qwen3.5:4b` 运行 `node test/packaged-ui-smoke-runner.js <Electron或打包后的exe路径>`：在临时用户目录执行真实本地聊天、保存及重启验证；需本机已启动 Ollama 并下载该模型。

安装升级、其他硬件性能、长期稳定性和所有模型的聊天质量不由这些检查覆盖。

协议依据：[Ollama Chat API](https://docs.ollama.com/api/chat)、[模型列表](https://docs.ollama.com/api/tags)、[结构化输出](https://docs.ollama.com/capabilities/structured-outputs)、[Thinking](https://docs.ollama.com/capabilities/thinking)。
