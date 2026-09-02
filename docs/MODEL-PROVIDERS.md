# Model Providers（模型提供方）

## 调用关系

```text
ChatRequestService（聊天请求服务）
  -> ModelGateway（模型网关）
  -> ModelProviderRegistry（模型提供方注册表）
  -> Provider.complete（模型提供方完成请求）
```

`ModelGateway` 只公开 `generate`（普通生成）与 `stream`（流式生成），最终都调用当前 Provider 的 `complete`；它不接受工具定义。

## Work 的独立模型适配器

Work 不通过 `ModelGateway` 取得工具调用。`agent/deepseek-agent-adapter.js` 只在 `MaiAgentRuntime -> AgentLoop` 路径中处理 DeepSeek 的工具定义、`tool_calls`、continuation、取消与超时，并把结果交给本地 `ToolOrchestrator`。它可与 Chat 共用安全保存的 API Key 和底层网络基础设施，但不共享 Chat Prompt、结构化回复契约、会话或 Memory 写入。

## DeepSeek

`deepseek-provider.js` 负责：

- API Key 鉴权；
- 模型白名单；
- JSON / SSE；
- token usage；
- HTTP 与网络错误；
- AbortSignal 和超时。

## Local

`local-model-provider.js` 是未来本地推理接入点。当前 metadata（公开元数据）明确 `available: false`，调用会返回 `provider_unavailable`。

只有完成真实后端启动、模型发现、流式、取消、超时、资源错误和打包验证后，才能把它改为可用。

## 禁止

Chat Provider 请求不得携带 `tools`、`tool_choice` 或消费 `tool_calls`。供应商条件判断不得散落到 Chat、Memory 或 Renderer；Work 的 DeepSeek tool-call 协议只能留在独立的 Agent Adapter。
