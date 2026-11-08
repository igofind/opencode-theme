// Generates the chat-area-only style port of the TUI "opencode" theme.
//
// Input : ../opencode/packages/tui/src/theme/assets/v2/opencode.json
// Output: chat.css (scoped to the timeline + composer), gui-experimental.cjs (registers it via Style)
//
// Why CSS and not a Theme: the desktop chat prose reads the v2 token set, and a Theme applies to the
// whole window. Scoping CSS custom properties to the chat containers leaves every other region on the
// user's selected theme. The port is colors plus a few chat-area tweaks listed in README.md.

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const source = path.resolve(here, "../opencode/packages/tui/src/theme/assets/v2/opencode.json")
const doc = JSON.parse(readFileSync(source, "utf8"))

const isObj = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

function merge(base, override) {
  if (!isObj(override)) return Array.isArray(override) ? override.slice() : override
  const out = isObj(base) ? { ...base } : {}
  for (const [key, value] of Object.entries(override)) out[key] = merge(out[key], value)
  return out
}

function at(tree, dotted) {
  let current = tree
  for (const key of dotted.split(".")) {
    if (!isObj(current) || !(key in current)) throw new Error(`missing token: ${dotted}`)
    current = current[key]
  }
  return current
}

function resolveHues(hue) {
  const out = {}
  for (const [name, value] of Object.entries(hue)) if (!(typeof value === "string" && value.startsWith("$hue."))) out[name] = value
  for (const [name, value] of Object.entries(hue)) {
    if (!(typeof value === "string" && value.startsWith("$hue."))) continue
    const alias = value.slice(5)
    if (!out[alias]) throw new Error(`unknown hue alias: ${name} -> ${alias}`)
    out[name] = out[alias]
  }
  return out
}

function resolveMode(mode) {
  const tree = merge(doc.base, doc[mode] ?? {})
  const hues = resolveHues(tree.hue ?? {})

  const value = (input, seen = new Set()) => {
    if (typeof input !== "string" || input === "transparent") return input
    if (input.startsWith("$hue.")) {
      const [name, step] = input.slice(5).split(".")
      const scale = hues[name]
      if (!scale || !step) throw new Error(`unresolved hue reference: ${input}`)
      return scale[step]
    }
    if (input.startsWith("$")) {
      const dotted = input.slice(1)
      if (seen.has(dotted)) throw new Error(`reference cycle: ${dotted}`)
      return value(at(tree, dotted), new Set([...seen, dotted]))
    }
    return input
  }

  const hex = (dotted) => {
    const resolved = value(at(tree, dotted))
    if (typeof resolved !== "string" || !resolved.startsWith("#"))
      throw new Error(`token is not a hex color: ${dotted} -> ${resolved}`)
    return resolved
  }

  return {
    get: hex,
    hue: (name, step) => {
      const scale = hues[name]
      if (!scale?.[step]) throw new Error(`missing hue step: ${name}.${step}`)
      return scale[step]
    },
  }
}

// The chat containers carry these attributes in 2.2.6: the timeline's ScrollView and the composer dock.
// Variables set here inherit into the transcript only; menus and dialogs render in portals and keep the app theme.
const CHAT = `:is([data-slot="session-timeline-scroll"], [data-component="session-composer-dock"])`

function chatCss(mode) {
  const t = resolveMode(mode)
  const scope = `[data-color-scheme="${mode}"] ${CHAT}`
  const markdownScope = `${scope} [data-component="markdown"]`

  // The chat pane sits a notch lighter than the flanking panels so it reads as a distinct column.
  // This is a deliberate departure from the TUI's background.base, per user request.
  const chatBackground = mode === "dark" ? "#141414" : "#fafafa"
  const border = t.get("border.base")
  const prose = t.get("markdown.text")
  const muted = t.get("text.muted")
  const link = t.get("markdown.link")
  const linkHover = t.hue("interactive", "100")
  const inlineCode = t.get("markdown.code")
  const filePath = t.get("text.feedback.warning.base")

  // Desktop code highlighting maps function -> syntax-primitive and number -> syntax-constant.
  // Only the roles highlight-theme.tsx actually reads are emitted; the app never consults
  // syntax-object/success/warning/critical, so they are left out.
  const syntax = {
    "syntax-comment": t.get("syntax.comment"),
    "syntax-keyword": t.get("syntax.keyword"),
    "syntax-primitive": t.get("syntax.function"),
    "syntax-variable": t.get("syntax.variable"),
    "syntax-property": t.get("syntax.variable"),
    "syntax-string": t.get("syntax.string"),
    "syntax-constant": t.get("syntax.number"),
    "syntax-type": t.get("syntax.type"),
    "syntax-operator": t.get("syntax.operator"),
    "syntax-punctuation": t.get("syntax.punctuation"),
    "syntax-regexp": t.get("syntax.string"),
    "syntax-info": t.get("syntax.operator"),
    "syntax-diff-add": t.get("diff.text.added"),
    "syntax-diff-delete": t.get("diff.text.removed"),
    "syntax-diff-unknown": t.get("syntax.keyword"),
  }

  // The prose stylesheet has no variables for these roles, so they feed the element rules below.
  const roles = {
    heading: t.get("markdown.heading"),
    strong: t.get("markdown.strong"),
    emphasis: t.get("markdown.emphasis"),
    blockQuote: t.get("markdown.blockQuote"),
    listItem: t.get("markdown.listItem"),
    horizontalRule: t.get("markdown.horizontalRule"),
  }

  // Only tokens with real consumers in the transcript: inline diff stats (diff-changes.css) and
  // collapsed diff regions (file.css). The app never reads the surface-diff add/delete ramp.
  const diff = {
    "text-diff-add-base": t.get("diff.text.added"),
    "text-diff-delete-base": t.get("diff.text.removed"),
    "surface-diff-hidden-base": t.get("diff.background.added"),
    "surface-diff-hidden-strong": t.get("diff.background.removed"),
  }

  // The transcript reads the v2 set; prose, tool rows and the composer all take their colors from here.
  const variables = {
    "v2-text-text-base": prose,
    "v2-text-text-muted": muted,
    "v2-text-text-faint": muted,
    "v2-text-text-accent": link,
    "v2-text-text-accent-hover": linkHover,
    "v2-text-text-code-accent": inlineCode,
    "v2-text-text-code-path": filePath,
    "v2-background-bg-base": chatBackground,
    // Code blocks and inline code fill sit on the chat pane background so they read as part of it.
    "v2-background-bg-layer-02": chatBackground,
    "v2-border-border-base": border,
    "v2-border-border-muted": border,
    ...syntax,
    ...diff,
  }

  const declarations = Object.entries(variables)
    .map(([name, color]) => `  --${name}: ${color};`)
    .join("\n")

  // Only color rules remain here: line-height, margins, padding and row heights are deliberately left
  // at the app's defaults. Headings, emphasis and quotes have no dedicated variable in the desktop
  // prose (the stylesheet colors them all from text-base/text-muted), so the TUI roles need element
  // rules inside the same scope. Plain inline code is colored from --v2-text-text-base (body text),
  // not the code variable, so it also needs a rule. Path code keeps its warning color and link code
  // its accent via :not([data-inline-code-kind]).
  const elements = [
    [`blockquote`, `color: ${roles.blockQuote};`],
    [`:is(h1, h2, h3, h4, h5, h6)`, `color: ${roles.heading};`],
    [`:is(strong, b)`, `color: ${roles.strong};`],
    [`:is(em, i)`, `color: ${roles.emphasis};`],
    [`li::marker`, `color: ${roles.listItem};`],
    [`hr`, `border-top: 1px solid ${roles.horizontalRule};`],
    [`:not(pre) > code:not([data-inline-code-kind])`, `color: ${inlineCode};`],
    // Column dividers match the row separators already in use (0.5px, muted border).
    [`:is(th, td):not(:last-child)`, `border-inline-end: 0.5px solid var(--v2-border-border-muted);`],
    // Zebra striping applies to cells so the table's rounded wrapper and row borders stay intact.
    [`tbody tr:nth-child(even) > td`, `background-color: ${mode === "dark" ? "#202020" : "#f0f0f0"};`],
  ]
    .map(([selector, body]) => `${markdownScope} ${selector} {\n  ${body}\n}`)
    .join("\n\n")

  // The transcript's frame owns the visible pane, including its header and edges. Select only a panel
  // frame that contains the timeline, so sidebars and bottom tool panels keep the app's background.
  const panelScope = `[data-color-scheme="${mode}"] [data-slot="session-chat-panel"]`
  return `/* ${mode}: TUI "opencode" colors, chat area only. Generated by generate.mjs. */
${panelScope} {
  background-color: ${chatBackground};
}

${scope} {
${declarations}
  background-color: ${chatBackground};
}

${elements}`
}

// Left-align the user's own messages. The desktop right-aligns them (chat-bubble style) via flex-end
// plus margin-inline-start: auto on the body/attachments and a flex-end meta row. Flip those to the
// start side. Alignment is mode-independent, so this block is not scoped by data-color-scheme.
function userMessageAlign() {
  return `/* Left-align user messages in the chat area. Generated by generate.mjs. */
${CHAT} [data-component="user-message"] {
  align-items: flex-start;
}

${CHAT} [data-component="user-message"] [data-slot="user-message-body"] {
  align-items: stretch;
  width: 100%;
  max-width: 100%;
  margin-inline: 0;
}

${CHAT} [data-component="user-message"] [data-slot="user-message-attachments"] {
  justify-content: flex-start;
  margin-inline: 0;
}

/* The footer meta is a full-width sibling of the bubble, so flipping the bubble alone leaves the
   model/agent labels on the right. Only [data-slot="user-message-meta"] needs the change:
   copy-wrapper and meta-wrap each hold one flex-1 child, so their own justify-content is inert. */
${CHAT} [data-component="user-message"] [data-slot="user-message-meta"] {
  justify-content: flex-start;
  text-align: start;
}`
}

// Distinguish the user's own bubbles: a faint tint of the mode's interactive color and a leading accent
// bar as a visual anchor. Shape (no radius) and the left-aligned layout come from userMessageAlign().
// Mode-scoped because the tint and accent differ between light and dark.
function userBubble(mode) {
  const t = resolveMode(mode)
  const accent = t.hue("interactive", "200")
  const scope = `[data-color-scheme="${mode}"] ${CHAT}`
  const text = `${scope} [data-component="user-message"] [data-slot="user-message-text"]`
  return `/* ${mode}: user bubble tint and leading anchor. Generated by generate.mjs. */
${text} {
  background: color-mix(in srgb, ${accent} 18%, transparent);
  border-inline-start: 3px solid ${accent};
  border-radius: 0;
}`
}

// The app hides each message's action row behind hover (`@media (hover: hover) { opacity: 0 }`).
// Show them permanently. Only slots rendered inside the chat scope are listed; user-message-meta-tail
// lives in the /btw side panel (gui-plugins/src/btw/panel.tsx), outside both chat containers. The run's
// meta-line dedup (`--user-run-meta`) is a separate mechanism and stays as the app designed it.
function alwaysShowActions() {
  return `/* Always-visible message actions in the chat area. Generated by generate.mjs. */
${CHAT} [data-component="user-message"] :is([data-slot="user-message-copy-wrapper"], [data-slot="user-message-menu"]) {
  opacity: 1;
  pointer-events: auto;
}

${CHAT} [data-component="text-part"] [data-slot="text-part-copy-wrapper"] {
  opacity: 1;
  pointer-events: auto;
}`
}

// The reasoning block is de-emphasised by design: the app flattens its colors to text-muted/inherit.
// Our element-level color rules reach it because they are descendant selectors, so hand the colors
// back. Its 13px font-size, line-height and block spacing are the app's own and untouched here.
// Colors use variables, so they follow the active mode without a per-mode copy.
function reasoningColors() {
  const base = `${CHAT} [data-component="reasoning-part"] [data-component="markdown"]`
  return `/* Reasoning keeps the app's muted colors. Generated by generate.mjs. */
${base} :is(h1, h2, h3, h4, h5, h6),
${base} :is(em, i),
${base} blockquote,
${base} :not(pre) > code:not([data-inline-code-kind]) {
  color: inherit;
}

${base} :is(strong, b),
${base} li::marker {
  color: var(--v2-text-text-muted);
}`
}

// Timeline width is --container-session (:root 744px, or 488/1000px per data-timeline-width).
// Tailwind's md:max-w-session resolves to max-width: var(--container-session) on the row, composer and
// dropzone wrappers, all descendants of session-chat-panel. Custom properties inherit, so declaring it
// on that common ancestor widens the whole chat column at once and keeps their edges aligned, without
// touching :root. This overrides the built-in Timeline width setting inside the chat area only.
function chatWidth() {
  return `/* Chat column width. Generated by generate.mjs. */
[data-slot="session-chat-panel"] {
  --container-session: 1200px;
}`
}

const css = [
  chatCss("dark"),
  chatCss("light"),
  userMessageAlign(),
  userBubble("dark"),
  userBubble("light"),
  alwaysShowActions(),
  reasoningColors(),
  chatWidth(),
].join("\n\n") + "\n"
writeFileSync(path.join(here, "chat.css"), css)

// A GUI-only plugin needs no build: the app evaluates this CommonJS file with the shared
// @opencode/plugin/gui module and reads its default export. Relative requires are not available in the
// bundle, so the CSS is inlined.
const plugin = `// Generated by generate.mjs. Applies the TUI "opencode" colors to the chat area only.
const { Plugin, Style } = require("@opencode/plugin/gui")

const css = ${JSON.stringify(css)}

module.exports = Plugin.define({
  setup(ctx) {
    ctx.add(Style, css)
  },
})
`
writeFileSync(path.join(here, "gui-experimental.cjs"), plugin)

for (const mode of ["dark", "light"]) {
  const t = resolveMode(mode)
  console.log(`${mode}: prose ${t.get("markdown.text")} on ${t.get("background.base")}, muted ${t.get("text.muted")}`)
}
console.log("wrote chat.css and gui-experimental.cjs")
