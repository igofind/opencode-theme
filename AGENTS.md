# opencode-theme 项目约定

本文件给修改本仓库的人或 AI 协作者看：说明改动边界、生成链路和必须守住的技术约束，避免改坏「只影响桌面聊天区」这个核心目标。使用说明、目录结构与定制清单见 `README.md`；本文件只写改动约束与维护方式。

## 项目定位

OpenCode Desktop 的 GUI `Style` 插件（`./gui-experimental`），把终端 TUI `opencode` 主题的配色移植到**聊天区**，外加几处聊天区定制。侧栏、设置、菜单、弹窗、底部工具面板等区域保持用户在 Settings → Appearance → Theme 选的主题。

插件 ID 由 `package.json` 的 `name`（`opencode-theme`）决定；`exports` 把 `./gui-experimental` 映射到 `dist/gui-experimental.cjs`。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `src/generate.mjs` | 唯一源文件：解析 `assets/opencode.json` 的 `$hue.*` / `$token` 引用，生成 `dist/` 两个产物。**所有定制只改这里** |
| `assets/opencode.json` | OpenCode `v2.2.6` TUI 主题快照，MIT（许可见 `assets/LICENSE`），让生成不依赖本机其他目录 |
| `dist/chat.css` | 生成的作用域 CSS，供人核对；勿手改 |
| `dist/gui-experimental.cjs` | 生成的 CJS 插件入口，内联同一份 CSS 并 `ctx.add(Style, …)`；勿手改 |
| `scripts/verify.mjs` | 产物校验，见下 |
| `package.json` | 清单：`name` / `exports` / `scripts` |
| `README.md` | 使用说明、目录结构、定制清单、作用域挂载点 |
| `LICENSE` / `assets/LICENSE` | 本项目与上游 OpenCode 的 MIT 许可 |

**`dist/` 是交付产物，必须提交**，不要写进 `.gitignore`：clone 仓库后靠它加载插件，无需构建。

## 生成与校验

```sh
bun run generate   # 重写 dist/chat.css 与 dist/gui-experimental.cjs
bun run verify     # 校验产物，失败退出码非 0
```

改完 `src/generate.mjs` 必须跑这两条。`verify` 用替身 `@opencode/plugin/gui` 求值产物，覆盖：清单与入口、`node --check`、`setup` 只注册一次 `Style`、内联 CSS 与 `dist/chat.css` 逐字节一致、无 `:root` / `line-height` / `padding:`、作用域与保留项。

`src/generate.mjs` 和 `scripts/verify.mjs` 都是纯 ESM、只用 Node 内置模块；没有 bun 时可直接 `node src/generate.mjs`、`node scripts/verify.mjs`。生成器只读仓库内 `assets/opencode.json`。

## 安装 / 同步

首次安装（仓库即插件包，clone 到配置目录即可用，无需构建）：

```sh
git clone https://github.com/igofind/opencode-theme.git ~/.config/opencode/plugins/opencode-theme
```

本地开发同步（在仓库根目录执行）：

```sh
rsync -a --delete --exclude=.git ./ ~/.config/opencode/plugins/opencode-theme/
```

`--delete` 不能省：结构调整后旧文件会残留在已安装目录。别用 `cp -R`，它不删旧文件。从父工作区执行时把 `./` 换成 `opencode-theme/`。应用会热重载，不要重启或动后台服务。

验证加载：

```sh
opencode plugin list
opencode api get "/api/plugin/gui?id=opencode-theme"
```

`plugin list` 应出现 `opencode-theme`；返回的 bundle 应含 `Style`、聊天区选择器与 `--container-session: 1200px`。

## 改动约束

- **只改聊天区**。配色变量声明在 `[data-slot="session-timeline-scroll"]` 与 `[data-component="session-composer-dock"]` 上靠继承生效；面板底色和列宽 `--container-session: 1200px` 用 `[data-slot="session-chat-panel"]`（它是时间线、输入框、拖拽遮罩的共同祖先，能让边缘对齐）。**不要写 `:root`，不要注册全局 `Theme`**，否则影响其他区域。列宽覆盖会盖掉 Settings → General → Timeline width，删 `src/generate.mjs` 的 `chatWidth()` 即恢复内置三档。
- **聊天区底色由祖先面板框绘制**，变量只向下继承，所以作用域内必须同时写 `background-color`，光改变量改不到背景。
- **桌面聊天正文读 v2 token**（`--v2-text-text-*`、`--v2-background-bg-*`、`--syntax-*`），**不读 `--markdown-*`**。标题、加粗、引用等没有独立变量，需要在同一作用域内补元素级规则。
- **只输出有消费者的变量**。`--markdown-*`、`surface-diff-add-*` / `surface-diff-delete-*`、`syntax-object/success/warning/critical` 在桌面端无人读取，已删除，别再加回来；新增变量前先在 OpenCode `v2.2.6` 源码里 grep 消费方。
- **判断消费方别只 grep `var(--name)`**：`syntax-*` 由 `highlight-theme.tsx` 作为 CSS 变量名交给代码高亮库，在代码块 token 元素上解析；`diff-*` 的消费者在 `diff-changes.css` / `file.css`，挂在时间线工具行内。
- **选择器先确认挂载点在聊天区**：`user-message-meta-tail` 只在 btw 侧面板（`gui-plugins/src/btw/panel.tsx`）渲染，不在上述两个容器内，相关规则已删除。
- **`package.json` 的 `exports` 只映射 `./gui-experimental`，不要加 `"."` 条目**：`Host.resolve` 会用包名解析空子路径当作 server 入口，加了会误指向 GUI bundle。
- **行高、块间距、字号、表格行高与内边距均为应用原生，不要再加回来**。曾降到 13px 字号、1.45 行高、收紧块间距、32px 表格行高，已全部撤销。主体是 TUI 配色搬运；额外定制只有：用户消息靠左铺满、气泡 tint/竖条/无圆角、表格斑马纹与列竖线、消息操作行常驻、思考区颜色让回、面板底色灰度、列宽 1200px。**改动前先确认是用户需求，不要自作主张「美化」**；清单见 `README.md`。
- 作用域依赖上述 `data-slot` / `data-component` 挂载点，升级 OpenCode 后先复核它们是否还在；GUI 插件 API 在 2.2.6 仍为 experimental。
