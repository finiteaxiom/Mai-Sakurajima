# 存储与运行时状态性能基线

## 基准范围

使用 `npm run benchmark:storage -- --output docs/performance/storage-performance-latest.json` 可重跑合成数据基准。Runner 创建临时 Electron `userData`，并通过 `MAI_EXPECTED_USER_DATA_DIR` 与 `app.getPath('userData')` 的解析结果比对；结束后删除该临时目录。基准不读取真实用户目录，不发起网络请求，也不记录凭据。

Electron Main smoke 使用实际 `main.js` 的 Memory load/normalization、`publicChatState()`、`buildSystemPrompt()`、`chatSendHandler`、`ChatService` 与 `saveMemory()`。Chat 提交样本使用本地时间直接回复路径，不调用 Provider。Work 测量使用启动加载后的真实 `WorkStore`。Action 测量使用真实 `ActionRuntimeManager` 和只返回固定合成结果的测试 runtime，不执行工具或 Workspace 操作。

基准中同步调用的 wall time 表示 Electron Main 同步处理期间的阻塞时间，不代表 GUI 绘制或输入延迟。heap 数值是采样块前后的 `heapUsed`，未强制 GC，包含进程基线和 GC 噪声。同步投影/Prompt 操作先预热一次，再收集 5 个样本；Memory 和 Work load 各收集 3 个样本；Chat/Work 轮次各收集 5 个样本；每个 Action 批次收集 3 个独立样本，列表与状态各采样 5 次。基准报告保留精确样本、median 和 p95，不设置单次性能门槛。

合成输入在所有 cap 之内，且没有将多个维度同时推到最大值：Memory 有 55 段会话、12,958 条消息，其中一段有 1,998 条，留出一轮两条消息的空间；Work 有 20 个项目、800 段 WorkSession、40,000 条消息（每项目 40 段、每记录 50 条）。序列化后的输入 JSON 分别为 3,394,165 bytes 和 6,946,969 bytes。Chat 另验证了 1,998 条消息时一轮可以提交至 2,000 条，满额后返回 `CHAT_HISTORY_LIMIT_REACHED` 且文件字节不变。

## ActionSession 终态缓存

`ActionRuntimeManager` 现在只在内存保留最近进入终态的 500 个 ActionSession，按进入终态顺序 FIFO 淘汰。运行中或仍有关联 controller 的记录不会被清理。`execute()` 仍返回本轮最终 session，当前 session 在执行结束时仍可由 `getSession()` 和 `listSessions()` 取得；被淘汰的 id 继续使用原有未知 id 的 `null` 语义。此缓存只包含运行时状态，不改变 Chat 或 WorkStore 持久化。

| 已执行批次 | 基线缓存 / 列表 | 新缓存 / 列表 | 列表 median（基线 → 新） | 列表 JSON bytes（基线 → 新） | 批次执行 median（基线 → 新） |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 100 / 100 | 100 / 100 | 0.124 → 0.169 ms | 32,873 → 32,873 | 1.410 → 1.833 ms |
| 500 | 500 / 500 | 500 / 500 | 0.560 → 0.530 ms | 165,673 → 165,673 | 5.723 → 6.071 ms |
| 1,000 | 1,000 / 1,000 | 500 / 500 | 1.461 → 0.509 ms | 331,674 → 166,002 | 15.344 → 14.290 ms |

本机这组 1,000 次样本中，列表 median 从 1.461 ms 降为 0.509 ms，序列化大小减少约 50%；执行批次 median 从 15.344 ms 变为 14.290 ms，p95 从 21.825 ms 变为 14.495 ms。100 和 500 次场景的执行耗时有小幅非单调波动，不据此宣称加速。该优化的直接收益是缓存和列表 payload 不再随历史终态数无限增长。

采样时，Action cache 清理前后实际 Memory 文件字节和 Chat 消息数保持不变（12,970 条）；Work 文件字节和 Work 消息数也保持不变（40,010 条）。这些计数包含基准前面执行的合成 Chat/Work 提交样本。详见 [基线原始报告](performance/storage-performance-baseline.json) 和 [修改后原始报告](performance/storage-performance-after.json)。

## 限制

500 是 session 数量上限，不是字节上限。每个 ActionSession 的 `result` 或 `task` 体积可能不同，因此少数特别大的结果仍可能使缓存占用较多内存；本阶段没有裁剪结果字段或改变事件/结果契约。ActionSession 仍不是历史记录。对应的 WorkSession 可保留用户消息、最终回复和有边界的操作摘要，但不会恢复已淘汰 ActionSession 的完整运行时结果。

Work 的完整 JSON load、snapshot 与消息提交也在基准中测量，但本阶段没有改动这些数据路径。它们的表现不应从 Action cache 的结果推断。
