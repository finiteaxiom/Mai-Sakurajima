# 阶段 C：组件及周边页面一致性

日期：2026-11-04。开发基线：`25ed3d5c65f6bfa284d930cb7e6a435e3430dc53`。

## 范围与结果

本批统一现有组件与周边窗口，不改 Chat / Work 数据边界、IPC、Main 计时或持久化；未启动阶段 D 的衣橱素材工作，也未恢复冻结的 Live2D 制作。

| 问题 | 结果 | 代码位置 |
| --- | --- | --- |
| 折叠侧栏分组文字拥挤，展开组内容挤入窄栏（阶段 A 的 A04） | 显示「生活」「资料」短标签，保留完整可访问名称；激活时展开侧栏与分组 | `renderer/chat.html`、`chat.js`、`product-layout.css` |
| 生活陪伴与番茄钟仍混用旧浅色主题值，深色主按钮与资料说明对比不足 | 共用主题别名、主次按钮、危险操作、焦点与禁用状态；修正深色资料说明和编辑入口 | `renderer/mai-design.css` |
| 生活陪伴标题残留旧版本；页签缺少当前页语义 | 移除旧版本号，增加 `aria-current` | `renderer/assistant.html`、`assistant.js` |
| 非空资料列表创建按钮失败 | 原条目变量 `document` 遮蔽 DOM 的 `document`；改为 `entry`，用非空 fixture 验证实际列表渲染 | `renderer/assistant.js` |
| 资料移动弹窗缺少完整键盘边界 | 背景/隐藏弹窗 inert，Tab 双向循环，Escape 取消，取消及成功移动后恢复对应按钮焦点 | `renderer/assistant.js` |
| 番茄钟等待 IPC 时，刷新可能提前启用按钮；活动计时仍可改预设 | pending 状态跨 500ms tick 保持锁定；预设与字段同步禁用；失败保留原计时状态 | `renderer/timer.js` |

只替换折叠分组中本轮失效的布局规则，保留其他旧 CSS 的现有用途，没有批量清空样式文件。

## 控件状态对照

| 控件 | 普通 / 悬停 | 焦点 / 选中 | 禁用 / 等待 | 错误 / 空状态 |
| --- | --- | --- | --- | --- |
| 主次按钮 | accent 与 surface 分工；hover 使用语义表面 | 共用可见焦点边框 | 不透明禁用色；计时显示正在开始/取消 | 失败解除等待，可按原入口重试 |
| 输入框、选择框、开关 | 文本、边框与 accent-color 跟随主题 | 输入边框与键盘 outline | 计时或保存等待禁止冲突编辑 | 保留输入，不用颜色单独表示错误 |
| 分组、页签 | 折叠短标签与完整名称分离 | 当前生活页签 aria-current；计时预设 aria-pressed | 活动计时不可改预设 | 分组展开后保留原功能入口 |
| 弹窗 | 共用浮层表面和标题层级 | Tab / Shift+Tab、Escape、恢复焦点 | 背景和隐藏弹窗 inert | 原错误区域保留 |
| Work 抽屉 | 保持 Explorer / 详情两页签 | 原有焦点与 Escape 边界 | 不维护另一套 Runtime 状态 | 审批仍为 Main 原生对话框 |
| 提示与空列表 | 次级文字、边框使用 token | 保留阶段 B 的空状态行动入口 | 不将 fixture 输出视为真实服务结果 | 生活、资料、记忆、日程等原语义不变 |

## 验证与证据

为排除工作区既有未提交文件的影响，从 Git 暂存区导出独立候选目录，共用本机依赖，并为检查设置临时 APPDATA/userData。未使用正式用户数据进行业务操作。

| 实际命令 | 结果与范围 |
| --- | --- |
| `npm.cmd test` | 345 项通过；迁移、恢复保护、P0 Chat flow smoke 通过，见 `business-tests.txt` |
| `node test/ui-consistency-smoke.js` | 68 项通过：真实 Electron Renderer、合成 IPC；见 `screenshots/report.json` 与 `consistency-smoke.txt` |
| `node test/ui-redesign-smoke.js` | 通过；Chat / Work 多尺寸、设置、焦点、阅读位置和主题回归，见 `renderer-smoke.txt`、`regression/` |
| `node test/ui-feedback-smoke.js` | 31 项通过；慢保存、取消、错误恢复及输入交互，见 `feedback-smoke.txt`、`feedback/` |
| `node test/packaged-ui-smoke-runner.js node_modules/electron/dist/electron.exe` | 开启 `MAI_UI_SAVE_ERROR_SMOKE=1`，Main / Preload 与保存失败回滚检查通过，见 `main-smoke.txt` |
| `node test/packaged-chat-close-smoke-runner.js node_modules/electron/dist/electron.exe` | 通过，关闭后窗口与 WebContents 释放，见 `close-smoke.txt` |

新增检查覆盖：记忆、日程、共同生活、朋友圈、语音设置、诊断、Work Explorer/详情，生活陪伴的今天/日历待办/学习专注/承诺/应用感知/知识库/设置七页，以及番茄钟。新截图在 `screenshots/`，包含明暗主题、资料移动和计时等待/错误；原 UI 回归另外覆盖 760、900、1180、1440 内容宽度。截图是 Electron 自动化产物，不是手动操作记录或 Windows DPI 矩阵。

截图复核发现旧 `light-theme.css` 的高优先级粉色资料说明仍穿透主题，已增加对应语义规则，并同步修正资料弹窗标题、说明和关闭按钮的深色对比，再重新渲染确认。最初头像选择测试误以为设置与选择器嵌套；实际设计为选择器取代设置，已纠正测试预期。一次候选目录检查因临时目录缺少依赖联接而未运行，恢复联接后重跑；这些失败不计作产品通过证据。

## 边界与后续

- 本轮是源码运行与合成 IPC 检查；未验证真实模型、真实资料移动、麦克风、多屏、原生输入法、不同系统 DPI 或 NSIS 安装升级。
- Work 审批代码仍经 Main 原生 `dialog.showMessageBox`，拒绝为默认选项；复核其边界并保留现有业务测试，没有用自制界面替代审批，也没有声称执行过真实原生审批操作。实机流程留待阶段 E。
- 截图所用合成示例与本机已有资源仅用于本地验证，不引入新头像或壁纸运行资源。
- 原有 README、package.json、历史文档归档、测试清理、素材与其他 artifacts 改动保留在工作区，不随本次提交。候选目录路径文件是本地辅助记录，不提交。
- 本报告与阶段 C 源码同批提交；确切提交号以 Git 历史及最终交付回复为准。不生成安装包。
