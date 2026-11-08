# OpenCode TUI 配色 → 桌面聊天区

把终端 TUI 内置 `opencode` 主题的配色移植到桌面端聊天区，并在此之上做了几处可读性调整。侧栏、设置、菜单、弹窗等其他区域保持你在 Settings → Appearance → Theme 里选的主题。

## 为什么用 CSS 而不是 Theme

- 桌面主题（`Theme`）作用于整个窗口，无法只改聊天区。
- 聊天区的正文、工具行、代码块读的是 **v2 token**（`--v2-text-text-base`、`--v2-background-bg-layer-02` 等），**不读 `--markdown-*`**。早先那版全窗口主题覆盖了 `markdown-*`，但聊天正文不消费这些变量，所以看起来没生效。
- 现在用 `Style` 注入作用域 CSS：变量声明在聊天容器上靠继承生效，改不动的地方补元素级规则。

## 文件

| 文件 | 作用 |
| --- | --- |
| `generate.mjs` | 读 `../opencode/packages/tui/src/theme/assets/v2/opencode.json`，解析 `$hue.*` / `$token` 引用，生成下面两个文件；**所有定制都只改这里** |
| `chat.css` | 生成的作用域 CSS：dark / light 各一段配色规则，外加与明暗无关的对齐、布局、交互规则 |
| `gui-experimental.cjs` | GUI 插件，内联同一份 CSS 并 `ctx.add(Style, …)`；免构建 |
| `README.md` | 本文件 |

重新生成：

```sh
cd opencode-theme && bun generate.mjs
```

## 作用域挂载点

2.2.6 里的稳定挂载点：

- `[data-slot="session-timeline-scroll"]`：时间线 ScrollView 根节点
- `[data-component="session-composer-dock"]`：输入框 dock
- `[data-slot="session-chat-panel"]`：整个聊天面板（只用于面板底色）

明暗由 `<html data-color-scheme="dark|light">` 决定，所以选择器形如：

```css
[data-color-scheme="dark"] :is([data-slot="session-timeline-scroll"], [data-component="session-composer-dock"]) { … }
```

## 从 TUI 搬过来的部分

- 正文、次要文字、边框、滚动条颜色
- 代码高亮：`function → syntax-primitive`、`number → syntax-constant` 是桌面 `highlight-theme.tsx` 固定的角色映射
- Markdown 角色：标题、加粗、斜体、引用、列表标记、分隔线。桌面样式没有对应变量（统一取 `text-base` / `text-muted`），用元素规则实现
- diff 前景色与折叠区背景色

## 额外调整（不是 TUI 的，是按需求做的）

| 项 | 当前值 | 桌面原生值 |
| --- | --- | --- |
| 聊天面板底色 | dark `#141414` / light `#fafafa` | 与区外同色 |
| 用户输入块 | 靠左、铺满整行 | 靠右气泡，`max-width: min(82%, 64ch)` |
| 用户气泡 | interactive 色 18% tint、无圆角、左侧 3px 竖条锚点 | 灰底、10px 圆角 |
| 消息操作行 | 常驻显示：用户消息的 meta 行与气泡角 chevron、助手消息的复制等操作行 | 原生在 `@media (hover: hover)` 下 `opacity: 0`，需悬停才显现 |
| 表格 | 偶数行灰底、列间 0.5px 竖线；行高与内边距为原生 | 行高 16px、单元格上下 10px、无斑马纹、无列分隔线 |
| 思考区（reasoning） | 只恢复颜色：标题/斜体/引用/行内代码 `inherit`，加粗与列表标记 `text-muted`；行高、字号、块间距均为应用原生 | 应用本就弱化颜色，我们的元素级着色规则会盖住它，故显式让回颜色 |
| 聊天列宽 | 1200px（`--container-session`，声明在 `[data-slot="session-chat-panel"]`） | `--container-session`：默认 744px；focused 488px / wide 1000px |

**列宽这一条会覆盖 Settings → General → Timeline width 的选择**：CSS 变量声明在聊天面板这个后代上，优先于 `:root` 的继承值，但只作用于聊天区。语义是 `max-width`——窗口不够宽时仍铺满可用宽度，不会溢出；宽窗口下内容居中封顶 1200px。想回到内置三档，删掉 `generate.mjs` 里的 `chatWidth()` 即可。preparing/pending 状态的渲染不在 `session-chat-panel` 内，那一瞬仍是应用原宽度。

**行高、块间距、字号、表格行高与内边距均为应用原生值**，所以没列进上表。曾把 `--font-size-base` 降到 13px、正文行高改 1.45、块间距收紧、表格钉 32px 行高，现已全部撤掉；要再加回，改 `generate.mjs` 里 `chatCss()` 的 `elements` 与 `userBubble()`。工具行、表格、思考区这些写死 13px 的地方不受字号变量影响。

聊天区底色由祖先面板框绘制，变量只向下继承，所以作用域内必须同时写 `background-color`，光改变量改不到背景。

## 安装 / 更新

```sh
cp -R opencode-theme/. ~/.config/opencode/plugins/opencode-theme/
```

目标目录已存在时必须用 `/.` 合并内容，否则会嵌套出一层。应用会热重载插件，不需要重启。

验证：

```sh
opencode plugin list
opencode api get "/api/plugin/gui?id=opencode-theme"
```

## 维护约定

- **只输出有消费者的变量**。`--markdown-*`、`surface-diff-add-*` / `surface-diff-delete-*`、`syntax-object/success/warning/critical` 在桌面端无人读取，已删除，别再加回来。
- **判断消费方别只 grep `var(--name)`**：`syntax-*` 由 `highlight-theme.tsx` 作为 CSS 变量名交给代码高亮库，在代码块 token 元素上解析，构建 CSS 里几乎没有 `var(--syntax-*)`；`diff-*` 的消费者在 `diff-changes.css` / `file.css`，它们挂在时间线工具行内。
- **选择器先确认挂载点在聊天区**：`user-message-meta-tail` 只在 btw 侧面板（`gui-plugins/src/btw/panel.tsx`）渲染，不在 `session-timeline-scroll` / `session-composer-dock` 内，相关规则已删除。
- 生成后先用替身 `@opencode/plugin/gui` 求值一次 `gui-experimental.cjs`，确认 `setup` 只注册 `Style`、CSS 里没有 `:root`。
- 作用域依赖上述 `data-slot` / `data-component` 挂载点，升级 OpenCode 后先复核它们是否还在。
- GUI 插件 API 在 2.2.6 仍为 experimental。

## 已知差异

- 只影响聊天区：字体族、阴影、动效、侧栏、设置页、菜单和弹窗都保持原主题。
- 代码块底色与聊天区同色（TUI 里代码块没有独立底色），所以比默认主题更“平”。
- 颜色值来自 TUI 主题解析，没有做逐像素截图校对。
