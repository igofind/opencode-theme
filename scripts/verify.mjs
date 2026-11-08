// Verifies the generated dist/ artifacts. Run after `bun run generate`.
// Uses only Node built-ins so a fresh clone can verify itself without installing anything.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const abs = (relative) => path.join(root, relative)
const read = (relative) => readFileSync(abs(relative), "utf8")

let failed = 0
const check = (label, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}`)
  if (!ok) failed += 1
}

// 1. The manifest must keep the plugin id and map ./gui-experimental to a real CommonJS file.
const pkg = JSON.parse(read("package.json"))
check("package name is opencode-theme", pkg.name === "opencode-theme")
const entry = pkg.exports?.["./gui-experimental"]
check("exports maps ./gui-experimental", typeof entry === "string")
check("no '.' export (would be misread as a server entry)", pkg.exports?.["."] === undefined)
check("exported entry exists", typeof entry === "string" && existsSync(abs(entry)))
check("exported entry is .cjs", typeof entry === "string" && entry.endsWith(".cjs"))

// 2. The bundle must be valid CommonJS and register exactly one Style with the CSS from chat.css.
const bundlePath = "dist/gui-experimental.cjs"
const bundle = read(bundlePath)
try {
  execFileSync(process.execPath, ["--check", abs(bundlePath)], { stdio: "pipe" })
  check("bundle passes node --check", true)
} catch {
  check("bundle passes node --check", false)
}

const gui = { Plugin: { define: (definition) => definition }, Style: Symbol("Style") }
const module = { exports: {} }
const require = (name) => {
  if (name === "@opencode/plugin/gui") return gui
  throw new Error(`unexpected require: ${name}`)
}
const added = []
try {
  new Function("require", "module", "exports", bundle)(require, module, module.exports)
  check("bundle default export has setup()", typeof module.exports.setup === "function")
  if (typeof module.exports.setup === "function") {
    module.exports.setup({ add: (type, item) => added.push({ type, item }) })
  }
} catch (error) {
  console.log(`FAIL  bundle evaluation threw: ${String(error)}`)
  failed += 1
}
check("setup registers exactly one item", added.length === 1)
check("the item is a Style", added.length === 1 && added[0].type === gui.Style)

const css = added.length === 1 ? added[0].item : ""
const disk = read("dist/chat.css")
check("inlined CSS equals dist/chat.css byte-for-byte", css === disk)

// 3. Scope, and the declarations deliberately kept or reverted.
const has = (text) => css.includes(text)
check("no :root (chat-area-only)", !has(":root"))
check("no global Theme registration", !/add\(\s*Theme/.test(bundle))
check("scoped to timeline/composer", has('[data-slot="session-timeline-scroll"]') && has('[data-component="session-composer-dock"]'))
check("panel scope for background + width", has('[data-slot="session-chat-panel"]'))
check("keeps --container-session: 1200px", has("--container-session: 1200px"))
check("keeps syntax colors", has("--syntax-comment"))
check("keeps zebra striping", has("nth-child(even)"))
check("keeps table column lines", has("border-inline-end"))
check("keeps always-visible actions", has("opacity: 1"))
check("keeps left-aligned user messages", has("align-items: flex-start"))
check("no line-height", !has("line-height"))
check("no margin-top/bottom", !/margin-(top|bottom)/.test(css))
check("no padding:", !has("padding:"))

// 4. The bundled theme source parses (the generator reads this file).
try {
  JSON.parse(read("assets/opencode.json"))
  check("assets/opencode.json is valid JSON", true)
} catch {
  check("assets/opencode.json is valid JSON", false)
}

console.log(failed === 0 ? "\nverify: PASS" : `\nverify: ${failed} check(s) FAILED`)
process.exit(failed === 0 ? 0 : 1)
