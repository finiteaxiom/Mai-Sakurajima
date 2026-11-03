# 阶段 B：聊天、首次连接与操作反馈

日期：2026-11-03（Asia/Shanghai）。基线：`255d7dff371b77e1099cc1c6cc74bdb933156edf`。

结论：当前支持场景的第二阶段实现与隔离验证通过。普通文字 Chat 的流式展示、真实服务及原生实机验收不在本轮完成声明内。

## 实现与问题闭环

| 场景 | 修改结果 | 实现位置 |
| --- | --- | --- |
| A-01 保存期间草稿覆盖 | 保存、保存并测试、两种主动消息预览统一串行入口；提交期间普通字段不可编辑、其他提交/还原/清除 Key 不可触发；关闭重开保留忙碌状态 | `renderer/chat.js`、`settings-view.js` |
| 保存反馈 | 保存失败保留输入与 dirty；后续操作失败明确告知设置已经保存；提供既有诊断入口；保留凭据存储警告 | `renderer/chat.js` |
| A-02 主路径原始异常 | Chat 请求、取消和设置提交使用安全、可操作的通用提示，不显示原始异常；不新增正文或密钥日志 | `renderer/chat.js` |
| A-03 停止反馈 | 保留取消中状态，确认成功才显示已停止；取消失败不假装完成；拒绝取消时按 Coordinator 刷新记录；过期结果不覆盖新会话 | `renderer/chat.js`，复用原 Coordinator |
| A-05 首次引导 | 桌宠欢迎词提示双击打开聊天、首次连接模型；未配置时发送不会清空输入，也不请求模型；连接成功刷新空聊天入口 | `renderer/app.js`、`chat.js` |
| 失败恢复 | 空输入恢复失败文本；后来输入的新草稿不被覆盖；编辑后重试仅聚焦，不自动发请求 | `renderer/chat.js` |
| 语音部分输出失败 | 明确片段不代表完整回复；继续由 Coordinator 取消 stream 并清理临时消息，不投影虚假的完整回复 | `renderer/chat.js` |
| 空列表 | 日程、长期记忆提供聚焦现有添加字段的入口，不生成示例数据 | `renderer/chat.html`、`chat.js` |
| 主题和键盘 | 错误提示跟随明暗 token，修正深色模式浅色提示底；模态焦点循环跳过被锁定的 inert 控件 | `renderer/product-layout.css`、`ui-presentation.js` |

`main.js` 仅更新内置 UI smoke 对用户错误文案的断言；生产 Main、Preload、IPC、Provider、持久化和取消所有权未改变。未引入新的框架或重写请求生命周期。

设置锁使用 inert 保留各控件原有 disabled 依赖关系，不把导航与诊断整体锁住。壁纸、头像、衣橱仍沿用独立操作；本轮没有更换素材或恢复 Live2D。

## 验证

提交候选通过 `git checkout-index` 导出至独立临时目录，依赖目录链接到现有 node_modules；没有复制工作区其他未提交源码、package.json 或测试清理。APPDATA/userData 指向隔离资料。最终源码与暂存内容一致。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| `npm.cmd test` | 345/345 通过，随后迁移、恢复保护、P0 Chat flow 均成功 | [业务记录](business-tests.txt) |
| `node test/ui-feedback-smoke.js` | 31 项通过，errors=[]；真实 Renderer/Coordinator + 合成 IPC | [状态回归记录](screenshots/report.json) |
| `node test/ui-redesign-smoke.js` | 通过；500 条历史、Chat/Work 各尺寸、草稿与外观回退、模态焦点等 | [Renderer 记录](renderer-smoke.txt)、[结构化结果](regression/report.json) |
| `MAI_UI_SAVE_ERROR_SMOKE=1` + `node test/packaged-ui-smoke-runner.js node_modules/electron/dist/electron.exe` | 真实 Main/Preload 保存失败时，字节不变、内存配置回滚，呈现安全文案 | [Main 记录](main-smoke.txt) |
| `node test/packaged-chat-close-smoke-runner.js node_modules/electron/dist/electron.exe` | 窗口销毁、引用释放、无未捕获错误 | [关闭记录](close-smoke.txt) |
| 静态及视觉检查 | 暂存差异检查、脚本语法检查；审阅保存失败、请求失败、深色窄窗口等截图 | 下列截图 |

新增业务测试使用实际语音发送函数与 Coordinator，注入匹配 requestId 的 delta 后令请求失败，确认取消 stream、无最终 assistant 消息、无成功终态投影。它没有调用麦克风或真实 TTS。

状态 smoke 验证：四个保存入口互斥、慢成功/慢失败、分类切换和关闭重开、保存成功但测试失败、重复发送与停止、取消成功/失败/拒绝、草稿恢复、组合输入和 Shift+Enter 事件、多行输入、日程与记忆空状态、连续内容更新时旧消息阅读位置、回到底部、明暗窄布局及错误正文对比度至少 4.5:1。

截图：

- [首次连接](screenshots/first-connection.png)、[桌宠首次提示](screenshots/first-run-pet.png)
- [保存中](screenshots/saving.png)、[保存失败](screenshots/save-failed.png)
- [确认停止](screenshots/cancelled.png)、[请求失败与草稿](screenshots/chat-failed.png)
- [浅色长文本](screenshots/reading-light.png)、[深色长文本](screenshots/reading-dark.png)

验证过程中，新 smoke 最初把顶层 await 直接传给普通脚本执行环境，已改为 async 函数再通过；这属于夹具错误。截图审阅发现深色提示对比度问题后修正了产品样式，增加明暗对比度及操作可用性检查。跨轮次执行中旧进程会话失效、Renderer 记录未完成，已重新执行对应 smoke；没有把空输出当作通过。

## 边界与后续

- **错误分类**：现有 `ipcRenderer.invoke` 异常没有可靠的结构化 Provider 错误码。本轮使用通用描述及设置/诊断入口，没有解析任意异常字符串。A-02 的主路径可用性已改善，但可靠的网络/限流/认证分类仍是明确后续项；其他模块原有错误处理未做全局替换。
- **文字流式**：普通 `sendMessage` 仍取得完整回复后显示。连续 DOM 更新测试只证明阅读位置保护，不代表实现了文字流式 Provider/IPC。阶段 A 的“部分回复中断”设计对普通文字聊天仍为条件设计。
- **语音**：验证了现有 delta 与取消/失败生命周期；没有验证真实 TTS、麦克风或云端网络中断。
- **人工验收**：本轮为隔离自动化及截图审阅，未操作正式用户资料。组合输入事件不等于实际 Windows 输入法、多屏/DPI 或全新安装验收，后者留在阶段 E。
- **其他阶段**：A-04 折叠侧栏留在阶段 C；素材规范留在阶段 D；本轮不打包 NSIS、不改用户历史数据。
- **工作区**：既有 README、头像/壁纸/迁移文档、历史文档归档、package.json、旧测试清理与其他 artifacts、logs、manual_build 均不纳入本批提交。最终提交与推送 SHA 以 Git 和交付消息为准。
