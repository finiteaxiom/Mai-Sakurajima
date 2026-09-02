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
transparency: 45..90
uiScale: 85..120
chatDensity: comfortable | compact
motion: full | reduced
```

Chat 通过 `chat:get-config` 取得公开偏好并通过既有 `chat:save-config` 保存；`chat:set-appearance` 仅是同一受限 Main 设置域的窄 IPC，供需要立即保存外观偏好的 Renderer 使用。`renderer/appearance.js` 只将公开设置投影为 data attributes 和 CSS custom properties；它不拥有持久化状态，也不接触 filesystem、Key 或模型配置。

壁纸仍是独立白名单设置：`Wallpaper → overlay → glass surface → content`。外观偏好不接受任意背景文件路径。

## Screen principles

- Chat：Mai 回复以头像标记与文字为主，用户消息才保留轻量表面；composer 是底部的悬浮主操作。
- Work：与 Chat 共用外壳和 tokens。Workspace Explorer 及运行详情保持在可收起 Inspector 内，只通过已有 `agent:*` IPC 访问。
- Settings：外观选项有限且与壁纸并列，避免把每个 CSS 属性暴露为配置。

## Process boundaries

本次视觉系统没有改变架构职责：Renderer 只处理呈现和短暂交互状态；Preload 只暴露固定 IPC；Main Process 继续拥有设置规范化、保存与任何系统能力。Chat Runtime 与 Work / Action Runtime 的数据和执行边界不变。
