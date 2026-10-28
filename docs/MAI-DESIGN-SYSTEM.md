# Mai Design System

Mai 的界面是桌面伴侣的环境，而不是管理后台。Renderer 以对话为 Level 1，导航、输入与模式为 Level 2，模型、记忆、Workspace 与运行状态为可收起的 Level 3。

## Foundation

`renderer/mai-design.css` 是统一的视觉 token 源：

- Color：`--mai-bg-*`、`--mai-surface*`、`--mai-text-*`、`--mai-border*`、`--mai-accent*`；
- Radius：small、medium、large、panel、pill；
- Spacing：4、8、12、16、20、24、32；
- Glass：surface、border、frame/panel blur 与 shadow；
- Motion：fast、normal、slow 与统一 easing。

已有页面级样式仍负责结构与组件细节；它们应复用 token，而不为同一概念重新定义任意颜色、圆角或动画时长。`renderer/product-layout.css` 承接已审阅的聊天层级、导航归组和全页设置布局，继续复用 `mai-design.css` 的颜色与主题变量，不建立另一套主题存储。

## Appearance preferences

外观偏好保存在现有 `settings.appearance`，并由 Main Process 规范化：

```text
theme: auto | light | dark
glassIntensity: soft | balanced | clear
transparency: 58..90
uiScale: 90..110
chatDensity: comfortable | compact | relaxed
motion: off | full | reduced
```

Chat 通过 `chat:get-config` 取得公开偏好并通过既有 `chat:save-config` 保存；`chat:set-appearance` 仅是同一受限 Main 设置域的窄 IPC，供需要立即保存外观偏好的 Renderer 使用。`renderer/appearance.js` 只将公开设置投影为 data attributes 和 CSS custom properties；它不拥有持久化状态，也不接触 filesystem、Key 或模型配置。

壁纸仍是独立白名单设置：`Wallpaper → overlay → glass surface → content`。外观偏好不接受任意背景文件路径。

## Screen principles

正常启动时，`startup-animation.js` 显示独立的无边框启动窗口，播放 `renderer/media/mai-startup-v1.mp4`（第一版，3 秒、60 fps）。播放结束、点击跳过或按 Esc 后继续原有桌宠启动流程。播放失败自动略过，主进程设置 8 秒兜底；用户 off / reduced 或系统减少动画时跳过。该窗口不配置 preload、不访问用户数据、不增加 IPC。媒体随 renderer 打包，保留用户壁纸和头像仍只能在运行时选择的边界。

当前外壳采用暖白、雾灰、低饱和紫选中态与淡紫灰用户消息。深色及系统主题使用同一套语义 token；透明与模糊集中在顶栏、侧栏和输入区域，正文使用高不透明度表面保护可读性。`wallpaper.css` 仅负责用户本地壁纸与选择器，不再覆盖整个界面的颜色。

- Chat：Mai 回复以头像标记与文字为主，用户消息才保留轻量表面；composer 是底部的悬浮主操作。
- Work：与 Chat 共用外壳和 tokens。内容窗口宽度达到 1320px 时显示项目、文件和工作对话三栏；低于该宽度时文件与运行详情进入抽屉，通过页签切换并复用同一棵 Explorer DOM，只通过已有 `agent:*` IPC 访问。
- Settings：占据主内容区域，保留既有模态焦点边界和返回按钮。分类为外观、陪伴偏好、语音、模型连接、数据与隐私、诊断与关于；内容独立滚动，保存与状态反馈固定在底部。全部既有设置字段保留。

Chat / Work 分段切换位于应用内容顶栏，继续调用原有模式切换与忙碌保护。Chat 陪伴信息在所有窗口宽度下默认收起，模型与记忆状态移入这个面板；正文所在区域宽度上限约 700px。侧栏以「一起生活」归组生活陪伴、日程和共同计划，以「记忆与资料」归组长期记忆与个人资料库。分组不合并领域数据；最近对话和朋友圈保留独立入口。底部保留衣橱和设置，不显示账户卡片。

窗口宽度不超过 780px 时主导航默认收起，通过顶栏按钮展开，选择功能后关闭；设置分类改为横向导航。语音通话按钮仍位于 Chat 输入框内的发送按钮前，与左侧的一次性语音输入区分；Work 隐藏语音通话入口。用户头像更换入口位于设置中。

`renderer/settings-view.js` 只维护当前分类和未保存提示，字段节点不因切换分类重建。普通设置沿用 `chat:save-config`；外观在设置内预览，离开设置时恢复保存值。未保存输入留在当前窗口，重新打开可继续编辑；「还原未保存更改」从已保存配置重新填充，关闭软件不会持久化草稿。保存失败不清空输入。壁纸、头像、衣橱仍按独立操作立即生效。「保存并测试连接」「保存并试主动聊天」「保存并试女友消息」明确表示会保存普通设置，再执行原有操作。

未配置模型的新会话提供「连接模型」，直接进入模型分类。普通 Chat 发送失败后，若输入框没有新草稿，则恢复失败文本并提供「编辑后重试」入口；不自动重发、不复用过期 Workspace 授权，不改变 Main 对消息是否持久化的判断。

`renderer/ui-presentation.js` 只管理视图：历史批量加载不播放逐条入场动画；阅读旧消息时新内容不强制滚到底部，并提供“回到底部”按钮。弹窗和抽屉限制焦点范围、隔离隐藏内容，关闭后恢复触发按钮焦点。模式过渡可中断；系统减少动画以及用户 off / reduced 偏好优先，关闭装饰性动画与过渡。

## Local verification

`node test/ui-redesign-smoke.js` 使用真实 Electron Renderer、合成 preload 和临时 userData。覆盖 900×640、1180×820、1440×900 的 Chat / Work、760×680 的设置与导航、500 条历史、阅读位置保持、文件预览、弹窗焦点、主题、字号与减少动画。设置回归覆盖全部分类、跨分类与重新打开的草稿、保存失败保留、保存夹具结果、外观预览还原和固定保存栏；Chat 回归覆盖首次连接入口与发送失败草稿恢复。截图及 JSON 报告默认写入系统临时目录的 `mai-ui-redesign`，可用 `MAI_UI_REDESIGN_OUTPUT` 指定输出目录。它不调用真实模型，也不代表用户的最终视觉验收。

业务验证使用 `npm.cmd test` 的单元测试及迁移、恢复保护、P0 Chat flow。UI smoke 是源码渲染器检查，不能替代安装包、真实模型、语音硬件、多屏或不同 Windows DPI 的实际验收。每轮实际执行记录与截图应以对应报告为准，不把历史通过结果当作当前发布结论。

## Process boundaries

本次视觉系统没有改变架构职责：Renderer 只处理呈现和短暂交互状态；Preload 只暴露固定 IPC；Main Process 继续拥有设置规范化、保存与任何系统能力。Chat Runtime 与 Work / Action Runtime 的数据和执行边界不变。
