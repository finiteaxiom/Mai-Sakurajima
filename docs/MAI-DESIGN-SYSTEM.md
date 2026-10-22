# Mai Design System

Mai 的界面是桌面伴侣的环境，而不是管理后台。Renderer 以对话为 Level 1，导航、输入与模式为 Level 2，模型、记忆、Workspace 与运行状态为可收起的 Level 3。

## Foundation

`renderer/mai-design.css` 是统一的视觉 token 源：

- Color：`--mai-bg-*`、`--mai-surface*`、`--mai-text-*`、`--mai-border*`、`--mai-accent*`；
- Radius：small、medium、large、panel、pill；
- Spacing：4、8、12、16、20、24、32；
- Glass：surface、border、frame/panel blur 与 shadow；
- Motion：fast、normal、slow 与统一 easing。

已有页面级样式仍负责结构与组件细节；它们应复用 token，而不为同一概念重新定义任意颜色、圆角或动画时长。

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

当前外壳采用暖白、雾灰、薰衣草紫选中态与淡玫瑰用户消息。深色及系统主题使用同一套语义 token；透明与模糊集中在顶栏、侧栏和输入区域，正文使用高不透明度表面保护可读性。`wallpaper.css` 仅负责用户本地壁纸与选择器，不再覆盖整个界面的颜色。

- Chat：Mai 回复以头像标记与文字为主，用户消息才保留轻量表面；composer 是底部的悬浮主操作。
- Work：与 Chat 共用外壳和 tokens。内容窗口宽度达到 1320px 时显示项目、文件和工作对话三栏；低于该宽度时文件与运行详情进入抽屉，通过页签切换并复用同一棵 Explorer DOM，只通过已有 `agent:*` IPC 访问。
- Settings：外观选项有限且与壁纸并列，避免把每个 CSS 属性暴露为配置。

Chat / Work 分段切换位于应用内容顶栏，继续调用原有模式切换与忙碌保护。Chat 陪伴信息在所有窗口宽度下默认收起；正文阅读宽度上限为 760px。小窗口侧栏内容独立滚动，保留底部语音、设置和账户入口。

`renderer/ui-presentation.js` 只管理视图：历史批量加载不播放逐条入场动画；阅读旧消息时新内容不强制滚到底部，并提供“回到底部”按钮。弹窗和抽屉限制焦点范围、隔离隐藏内容，关闭后恢复触发按钮焦点。模式过渡可中断；系统减少动画以及用户 off / reduced 偏好优先，关闭装饰性动画与过渡。

## Local verification

UI 改版增加 `node test/ui-redesign-smoke.js`，使用真实 Electron Renderer、合成 preload 和临时 userData。覆盖 900×640、1180×820、1440×900 内容尺寸的 Chat / Work、500 条历史、阅读位置保持、文件预览、弹窗焦点、主题、字号与减少动画。截图及 JSON 报告默认写入系统临时目录的 `mai-ui-redesign`，可用 `MAI_UI_REDESIGN_OUTPUT` 指定输出目录。它不调用真实模型，也不代表用户的最终视觉验收。

本次开发已执行 `npm.cmd test`（322 项测试及迁移、恢复保护、P0 Chat flow）；现有 `packaged-ui-smoke-runner.js` 与 `packaged-chat-close-smoke-runner.js` 使用本地 Electron 可执行文件执行通过。这些是源码运行检查，不是安装包、语音硬件或真实模型联调验收；未测量稳定 60fps，也未进行发布打包。

## Process boundaries

本次视觉系统没有改变架构职责：Renderer 只处理呈现和短暂交互状态；Preload 只暴露固定 IPC；Main Process 继续拥有设置规范化、保存与任何系统能力。Chat Runtime 与 Work / Action Runtime 的数据和执行边界不变。
