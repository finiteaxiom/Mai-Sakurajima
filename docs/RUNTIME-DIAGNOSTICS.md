# 正式版运行诊断

入口：聊天窗口 → 设置 → 运行诊断。支持查看近期记录、打开日志目录、主动导出脱敏 JSON。开发环境也启用这套服务；原有开发 LLM 诊断独立保留。

## 文件与保留策略

日志位置是 Electron 当前 `userData/logs/runtime/`。默认 Windows 路径：`%APPDATA%\Mai Sakurajima\logs\runtime\`。自定义 `--user-data-dir` 时跟随隔离目录；界面显示实际路径。

- 当前日志 `runtime.jsonl`，历史 `runtime.1.jsonl` 至 `runtime.4.jsonl`，JSON Lines 格式。
- 每文件上限 2 MiB，最多 5 个，总计约 10 MiB。容量满时淘汰最旧文件。
- 保留最近 14 天；启动后的首次日志写入及之后有写入时每小时清理一次过期记录。应用关闭期间不运行清理任务；读取时也过滤过期记录。
- 写入异步串行，队列上限 500 条，超限丢弃并计数。磁盘失败不阻断业务，面板显示本次写入失败/丢弃计数。正常退出尽力等待最多 1.5 秒落盘；强杀、崩溃或磁盘故障可能丢失队尾，不能视为可靠审计存储。
- 查看最近最多 50 条；导出/内部快照最近最多 1000 条。保留文件中可能还有更多历史。统计是当前进程的模块操作计数，含嵌套操作，不是聊天请求成功率；不是全历史统计。

## 记录内容与关联

字段只有时间、随机 runId/traceId、固定模块/操作名、开始/完成/失败/取消、耗时和白名单错误码。不记录参数、返回正文、Prompt、Memory、文件路径/内容、音频、API Key、任意异常 message/stack。未知错误码归一为 operation_failed。导出不包含本地日志目录。

Main 创建独立的 `ipcMain` 注册代理，所有现有 invoke handler 的参数、返回值和异常继续原样传递。AsyncLocalStorage 在同一异步调用中传播随机 traceId，从 IPC 到 ModelGateway、JSON 写入/读取及文件集事务可以按同一个 ID 排查；并发操作彼此隔离。Voice/Work 的 invoke 入口也自动覆盖。后台模型/持久化操作没有 IPC 父链时另起 trace。

现有 console.error/warn 的控制台输出保持原样，但正式日志只记 console-error/console-warn 及安全错误码，绝不复制字符串。这些泛化事件不保证能独立定位原源码行。额外观察主进程 uncaughtExceptionMonitor、Renderer 进程退出/无响应，以及聊天页 script-error/unhandled-rejection；不改变原异常恢复/崩溃语义。Renderer 报告只允许两个固定事件名，每 sender 每分钟最多 10 条。

未覆盖任意 ipcMain.on/send 的完整耗时、未建立逐个 Work Tool 的持久化事件副本，也没有新增 CPU/显存/后台采样服务。面板内存数值是查看当时的 Main RSS。日志是诊断投影，不是 Chat/Action 的状态 Owner。

## 用户边界

诊断 IPC 仅接受本机 chat.html 顶层 frame；Renderer 不传目录或导出路径。打开目录固定为日志目录；导出由 Main 原生保存对话框选择路径，可取消。没有上传、联网监控、自动发送或读取用户会话内容。

## 实现位置

- `runtime-diagnostics.js`：日志队列、轮转/过期清理、快照、安全字段、关联上下文、IPC 注册代理。
- `diagnostics-ipc.js`：来源校验、固定目录、脱敏导出、限流错误报告。
- `main.js`：初始化及生命周期/控制台挂接，使用稳定 userData，注册诊断 IPC。
- `model-gateway.js`、`json-persistence.js`、`file-set-transaction.js`：业务边界观测，保留同步/异步返回及异常语义。
- `preload.js`：独立 `maiDiagnostics` 窄桥接。
- `renderer/chat.html`、`renderer/diagnostics.js`、`renderer/diagnostics.css`：设置页入口与展示。
- `package.json`：打包包含新 Main 模块，`test:diagnostics` 为专项验证命令。

## 验证

`npm run test:diagnostics` 包括真实 IPC 注册代理 → ModelGateway → JSON writer 的组合测试、并发 trace 隔离、异常/取消、敏感数据排除、轮转、跨实例读取、过期清理、写入失败及队列上限。Electron smoke 使用真实日志/诊断 IPC/页面脚本，Chat 数据和保存/打开目录对话框为替身，userData 位于临时目录。测试不调用真实模型、不读取真实产品数据。自动化 smoke 不等于人工操作或安装包验收。
