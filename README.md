<p align="center"><img src="assets/banner.jpg" alt="PS-MCP-IMT — Photoshop for AI agents" width="1280"></p>

# PS-MCP-IMT — Photoshop for AI agents, with two ways in

An MCP server that lets an AI agent (Claude Desktop, Cursor, ChatGPT or any MCP-compatible
client) drive a running Adobe Photoshop: documents, layers, text, masks, selections, filters,
adjustments, Smart Objects, artboards, generative tools, export — from natural language.

Built by **[Immersive Media Technologies](https://github.com/Immersive-Media-Technologies)** as the
Photoshop backbone of the Deep Artisan agent pipeline, and released so that other agent builders
can use the same layer. A fork of
[alisaitteke/photoshop-mcp](https://github.com/alisaitteke/photoshop-mcp) (merged through 1.7.27)
with a second transport, a small tool surface, honest errors and no telemetry.

**macOS and Windows · Photoshop 2024–2026 · Node.js 18+ (we run 26).** macOS is what we run every
day (Photoshop 2026, 27.9–27.10); the Windows transport (ExtendScript through COM) is inherited from
upstream with its UTF-16 result fix and works the same way — reports from Windows users are welcome.

> [!CAUTION]
> This tool edits real Photoshop documents and sends document contents (names, layer structure,
> text, rendered previews) to the AI service you use. Start with a copy, check your AI provider's
> data policy for NDA work, and keep `ps_execute_script` and `ps_uxp script` (arbitrary code inside
> Photoshop) behind your agent's permission policy.

## Why this one

Most Photoshop MCP servers stop at «the AI can run a script». Two things break that in daily use:
Photoshop goes modal (a dialog, a progress bar, a tool in search mode) and every script call hangs
until a timeout; and the agent drowns in a hundred tool definitions. This fork keeps a **second
transport inside Photoshop (UXP)** for exactly those moments, shows the agent **9 tools** instead of
134, and tells it the truth when something cannot be done.

|                         | **PS-MCP-IMT (this repo)**                                                                                                                                                                                                                                                                                    | alisaitteke/photoshop-mcp                                                                    | mikechambers/adb-mcp                                                    | dcc-mcp/dcc-mcp-photoshop                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| Talks to Photoshop via  | **ExtendScript (osascript / COM) _and_ a UXP panel plugin** — chosen per call, UXP as fallback or first (`PS_MCP_UXP_PREFER=1`)                                                                                                                                                                               | ExtendScript via AppleScript / COM (we are a fork)                                           | UXP plugin → separate WebSocket proxy (Python) → MCP server             | UXP plugin → Rust broker (`adobepy`) → Python MCP server |
| When Photoshop is modal | **`photoshop_busy` in 4 s** with an instruction for the user, 8 s hold; reads / save / export **continue through UXP** (`via: uxp`)                                                                                                                                                                           | 30 s timeout → `extendscript_timeout`, retry ping                                            | —                                                                       | UXP only, so unaffected — but no ExtendScript DOM at all |
| Tool surface            | **134 tools registered, 9 visible** (`ps_catalog` / `ps_do` / `ps_batch` …) — ~900 tokens of definitions per turn instead of ~25 K; every tool reachable through `ps_do`                                                                                                                                      | 118–122 tools, all visible (`photoshop_*` + 16 recipes)                                      | «a subset of functionality» per app, low-level tools (proof of concept) | 40+ typed tools in 8 skill packages                      |
| Headless corner-pin     | **`photoshop_distort_layer`**: four corners → custom warp solved for the homography; verified that `Trnf` + `quadrilateral` is silently ignored in Photoshop 2026 (12 combinations probed)                                                                                                                    | —                                                                                            | —                                                                       | —                                                        |
| Telemetry               | **none** — analytics module is a no-op, feedback nudge removed, server sends nothing                                                                                                                                                                                                                          | anonymous analytics **on by default** (opt-out), product-feedback nudge via `photoshop_ping` | —                                                                       | —                                                        |
| Undo                    | recipes = one history state (upstream); `photoshop_busy` / `command_unavailable` / `extendscript_timeout` / `scratch_disk_full` tell the agent _why_ instead of a generic timeout                                                                                                                             | recipes = one history state; `extendscript_timeout`, `scratch_disk_full`                     | —                                                                       | staged install with `--dry-run` / receipts               |
| Install                 | **one click**: `.mcpb` for Claude Desktop (no Node needed), «Add to Cursor» button, `npx` for any other client; `install.sh` / `install.ps1` with a live self-test that write the client configs; UXP plugin as `.ccx`, UXP Developer Tools or a manual layout — every path documented with its failure modes | `npx -y @alisaitteke/photoshop-mcp`; UXP plugin for Neural Filters only                      | Python 3 + Node + UXP Developer Tools + proxy process                   | `pip install` or binaries; Rust broker                   |
| Verified on             | **Photoshop 2026 (27.9–27.10), macOS, UXP 9.4.1, Russian and English UI** — live sweep of every tool: 193 pass / 0 fail / 11 environment skips (2026-10-01); Windows transport inherited, not run by us                                                                                                       | Windows + macOS                                                                              | Photoshop 26+, macOS + Windows                                          | Windows, Linux, macOS                                    |
| License                 | **IMT Non-Commercial** for our work (attribution + link required, free for non-commercial use); upstream code stays MIT                                                                                                                                                                                       | MIT                                                                                          | MIT                                                                     | MIT                                                      |

Facts about other projects are from their READMEs and repository metadata on GitHub on 2026-10-01
(adb-mcp: 716 stars, last push 2026-07-08, «proof of concept»; dcc-mcp-photoshop: v0.2.0;
alisaitteke/photoshop-mcp: 1.7.27 of 2026-09-30); corrections welcome.

## What you can ask for

- "Open `poster.psd`, put the client's logo on the billboard in perspective — corners at (412,88),
  (1388,140), (1370,690), (430,655) — and keep it editable."
- "Replace the sky with this dusk one (`sky.jpg`), then export a 2000-px JPEG for review."
- "Split this layout into Instagram, X and Story artboards and export each as PNG."
- "Set the headline to Inter Bold 96 pt, tracking −20, only the word _SALE_ in red."
- "Build a frequency-separation stack at 6 px — I'll paint the Low / High layers myself."
- "Photoshop is showing a dialog — tell me what is open and save the document anyway." (the save
  goes through the UXP bridge)

The agent combines the operations itself through `ps_do`, checking `ps_get_state` /
`ps_get_layers` between steps and verifying with `ps_export_frame` (a PNG of the current state).

## Install

Requirements: Adobe Photoshop 2024+ running on this computer (2026 verified). On macOS the first
call asks for permission to control Photoshop through Automation (System Settings → Privacy &
Security → Automation; AppleScript error −1743 means it was denied). Pick the route for your client:

| Client                                                                                                                                                            | Route                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | What you need                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <img src="https://www.google.com/s2/favicons?domain=claude.ai&sz=32" width="16" height="16" alt=""> **Claude Desktop**                                            | download [`photoshop-mcp-imt.mcpb`](https://github.com/Immersive-Media-Technologies/photoshop-mcp-imt/releases/latest/download/photoshop-mcp-imt.mcpb), double-click it, click **Install** — the settings dialog has the switches (compact tool surface, UXP bridge)                                                                                                                                                                                                            | nothing else: Claude Desktop brings its own Node.js                                                                                                       |
| <img src="https://www.google.com/s2/favicons?domain=cursor.com&sz=32" width="16" height="16" alt=""> **Cursor**                                                   | <a href="https://cursor.com/en/install-mcp?name=photoshop&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBpbW1lcnNpdmUtbWVkaWEtdGVjaG5vbG9naWVzL3Bob3Rvc2hvcC1tY3AtaW10Il0sImVudiI6eyJQU19NQ1BfRkFDQURFIjoiMSIsIlBTX01DUF9VWFAiOiIxIn19"><img src="https://cursor.com/deeplink/mcp-install-dark.png" alt="Add to Cursor" height="36"></a> — one click, Cursor writes the config                                                                                               | Node.js 18+ (`npx` fetches the package)                                                                                                                   |
| <img src="https://www.google.com/s2/favicons?domain=antigravity.google&sz=32" width="16" height="16" alt=""> **Google Antigravity**                               | Settings → Customizations → Installed MCP Servers → **View raw config** (or type `/mcp` in the prompt panel) and add the `photoshop` entry from the snippet below to `~/.gemini/config/mcp_config.json`; `install.sh` / `install.ps1` write it for you                                                                                                                                                                                                                          | Node.js 18+                                                                                                                                               |
| <img src="https://www.google.com/s2/favicons?domain=chatgpt.com&sz=32" width="16" height="16" alt=""> **ChatGPT** and other clients that take only remote servers | one command on the Photoshop machine — `npx -p @immersive-media-technologies/photoshop-mcp-imt photoshop-mcp-imt-chatgpt` — starts the server behind a Streamable-HTTP gateway and a tunnel, and prints the public URL to paste into ChatGPT → Settings → Connectors → Create (developer mode, authentication: none). Photoshop stays on your machine; the tunnel is your door — whoever knows the URL can drive Photoshop while it runs, so stop it (Ctrl+C) after the session | Node.js 18+ and a tunnel tool: `cloudflared` (no account; `brew install cloudflared` / `winget install Cloudflare.cloudflared`) or `ngrok` (free account) |
| **Any MCP client** with a JSON config                                                                                                                             | the snippet below in its `mcpServers`                                                                                                                                                                                                                                                                                                                                                                                                                                           | Node.js 18+                                                                                                                                               |

```json
{
  "mcpServers": {
    "photoshop": {
      "command": "npx",
      "args": ["-y", "@immersive-media-technologies/photoshop-mcp-imt"],
      "env": { "PS_MCP_FACADE": "1", "PS_MCP_UXP": "1" }
    }
  }
}
```

**From source, with a live self-test** (the route we run ourselves): clone, then `./install.sh` on
macOS or `.\install.ps1` on Windows. The script checks Photoshop and Node, builds the server and the
UXP plugin, pings the running Photoshop through the real transport, and — after asking — writes
the entry into Claude Desktop's, Cursor's and Google Antigravity's config files (backing them up first). `--no-config`
only prints the snippet; `--yes` skips the questions. The Windows script is not run by us yet.

```bash
git clone https://github.com/Immersive-Media-Technologies/photoshop-mcp-imt.git
cd photoshop-mcp-imt && ./install.sh
```

**Windows.** The server talks to Photoshop through COM (`cscript` + a VBScript shim, results
decoded as UTF-16). Set `PHOTOSHOP_PATH` when Photoshop is not under `C:\Program Files\Adobe`.
Inherited from upstream, not run by us — see «Verified on» above.

| Variable                    | Default                                 | Meaning                                                                                             |
| --------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `PS_MCP_FACADE`             | off                                     | `1` / `true` → the client sees the 9 `ps_*` tools only; everything else through `ps_do`             |
| `PS_MCP_UXP`                | off                                     | `1` / `true` → start the bridge server for the UXP plugin (`127.0.0.1:38452`) and register `ps_uxp` |
| `PS_MCP_UXP_PREFER`         | off                                     | `1` / `true` → UXP first for state / layers / save / export, ExtendScript second                    |
| `PS_MCP_UXP_TOKEN_FILE`     | `~/.deepartisan/state/uxp-bridge.token` | shared secret the plugin must send (`X-DA-Bridge-Token`); created 0600 on first start               |
| `PHOTOSHOP_UXP_BRIDGE_PORT` | `38452`                                 | bridge port                                                                                         |
| `PS_MCP_READ_TIMEOUT_MS`    | `8000`                                  | ExtendScript timeout for read-only tools (fast fallback to UXP when Photoshop is modal)             |
| `PHOTOSHOP_SCRIPT_TIMEOUT`  | `30000`                                 | ExtendScript timeout for everything else; `timeout_ms` on `ps_execute_script` overrides per call    |
| `PHOTOSHOP_PATH`            | auto-detect                             | path to the Photoshop app / executable                                                              |
| `LOG_LEVEL`                 | `1`                                     | 0 debug · 1 info · 2 warn · 3 error (stderr)                                                        |

### The UXP bridge (second transport)

A 10-KB panel plugin, **Deep Artisan Bridge** (`uxp-plugin/`, id `com.deepartisan.ps-bridge`),
lives inside Photoshop and polls the server. It runs `state`, `layers`, `batchplay`, `eval_js`,
`export_png`, `save` and `neural_filter` inside `core.executeAsModal`, so it answers while
ExtendScript is blocked. Install one of three ways, in this order of convenience:

1. Double-click `dist/uxp/deepartisan-ps-bridge.ccx` (Creative Cloud). If Creative Cloud says
   «Plugin Not Compatible» — it does when Photoshop is missing from its installed-apps list —
   use 2 or 3.
2. [UXP Developer Tools](https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/) → Add
   Plugin → `uxp-plugin/manifest.json` → Load.
3. Manual layout into Adobe's UXP plugin folder plus one entry in `PluginsInfo/v1/PS.json` —
   exact paths and the JSON line in [`docs/development.md`](docs/development.md).

Then Photoshop → Plugins → **Deep Artisan Bridge**; leave the panel in your workspace so the plugin
loads with Photoshop. The port is protected by a shared-secret file the server creates on first
start and the plugin reads; a request without it gets 401, `/health` is open and reveals nothing.
Several MCP clients at once (Claude Desktop, Cursor, Deep Artisan …) share one bridge: the first
server owns the port, the others relay to it.
Honest about the boundary: the file is readable by any process of your user account (like an
`.env`) — it protects against other users, sandboxes and a stray client on the port, not against
malware running as you.

## Tools

With `PS_MCP_FACADE=1` the agent sees nine tools:

| Tool                                         | What it does                                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ps_catalog(category?)`                      | categories with counts and operation names; with a category — every operation and its parameters                              |
| `ps_do(operation, args)`                     | run any registered operation by name (`create_text_layer`, `distort_layer`, `recipe_remove_background` …)                     |
| `ps_batch(ops[])`                            | several operations in order, one result per op, stops at the first error (`stopOnError`)                                      |
| `ps_get_state` / `ps_get_layers`             | document and layer state (ExtendScript, 8 s timeout, UXP fallback)                                                            |
| `ps_save_document` / `ps_export_frame(path)` | save (PSD / in place) and a PNG of the current state for the agent to look at — both with UXP fallback                        |
| `ps_execute_script`                          | arbitrary ExtendScript (`timeout_ms` per call) — gate it in your agent policy                                                 |
| `ps_recipe(name, args)`                      | the 16 recipes (remove background, enhance portrait, frequency separation, social variants, CSV → cards, watermark, mockup …) |

`ps_uxp(action: ping | batchplay | script)` appears when the bridge is on: batchPlay descriptors
and JavaScript in the UXP context (`photoshop`, `uxp`, `params`, `await` allowed).

Behind the facade: **134 tools** — 109 atomic `photoshop_*` in 21 categories (document, layer,
image, smart_object, transform, filter, adjust, text, selection, mask, action, history, state,
generative, neural, style, color, data, stack, export, artboard) and 16 recipes,
each recipe one history state. Without the facade flag all of them are exposed directly, as in
upstream. Reference: [`docs/available-tools.md`](docs/available-tools.md); the fork-specific
`photoshop_distort_layer` takes `corners` (four `[x, y]` in document pixels), `mode`
(`perspective` | `bilinear`) and `rasterize` for Smart Objects.

## Safety model for agents

- **One envelope for every failure**: `{ ok: false, code, message, suggested_next_tool }`. The
  codes that matter for an autonomous loop: `photoshop_busy` (Photoshop is modal — tell the user,
  do not retry blindly), `extendscript_timeout` (a script is still running — ping until it
  answers), `scratch_disk_full`, `command_unavailable` (the document state forbids the command —
  not a version problem), `no_active_document`, `generative_credits_exhausted`.
- **`photoshop_ping` never launches Photoshop** and fails while a previous script is still running
  instead of reporting a healthy connection; other tools launch Photoshop when it is closed, as
  upstream does.
- **Gate what Cmd+Z cannot revert**: `ps_execute_script`, `ps_uxp script`, `close_document`,
  `save_document` over the original, batch exports. Everything else is one history state.
- **Nothing leaves the machine** except what your MCP client sends to its model: there is no
  analytics, no feedback prompt, no update check. The UXP bridge listens on `127.0.0.1` only and
  requires the shared-secret header.
- Upstream's live test suite (`npm run test:mcp-all`) edits a scratch document in the running
  Photoshop; run it with no client work open.

## Changes against upstream

See [`CHANGELOG.md`](CHANGELOG.md) (section 0.4.1) and
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md). In short: the UXP bridge as a second
transport with a shared-secret token; the 9-tool facade; `photoshop_distort_layer`; `photoshop_busy`
/ `command_unavailable` and the 8-second read timeout; telemetry, feedback nudge, web UI, website
and packaging removed. Upstream fixes are merged from
[alisaitteke/photoshop-mcp](https://github.com/alisaitteke/photoshop-mcp) by topic, one at a time
(currently through 1.7.27).

## Release history

Each version is described on the
[**Releases**](https://github.com/Immersive-Media-Technologies/photoshop-mcp-imt/releases) page —
what the server does at that version and what the release added:

- [v0.4.4](https://github.com/Immersive-Media-Technologies/photoshop-mcp-imt/releases/tag/v0.4.4) · 2026-10-01 —
  fix: the ChatGPT gateway command under `npx -p`.
- [v0.4.3](https://github.com/Immersive-Media-Technologies/photoshop-mcp-imt/releases/tag/v0.4.3) · 2026-10-01 —
  ChatGPT in one command (gateway + tunnel), client icons in Install.
- [v0.4.2](https://github.com/Immersive-Media-Technologies/photoshop-mcp-imt/releases/tag/v0.4.2) · 2026-10-01 —
  one-click installs: Claude Desktop extension (`.mcpb`), «Add to Cursor», npm package, `install.sh` /
  `install.ps1` that write the client configs.
- [v0.4.1](https://github.com/Immersive-Media-Technologies/photoshop-mcp-imt/releases/tag/v0.4.1) · 2026-10-01 —
  first public release of the IMT fork: the full server (134 tools) on upstream 1.7.27, plus the UXP
  bridge, the facade, headless corner-pin and the modal-Photoshop error model.

Every change, including the upstream history 1.0.0 – 1.7.27, is in [`CHANGELOG.md`](CHANGELOG.md).

## License

**[IMT Non-Commercial License](LICENSE)** — © Immersive Media Technologies.

- **Non-commercial use only.** Selling this software, offering it as or inside a paid product or
  service, or using it in commercial client work requires a separate written license from
  Immersive Media Technologies.
- **Attribution is mandatory.** Every use, copy, fork or derived product must credit the creator,
  visibly to its users: `PS-MCP-IMT by Immersive Media Technologies — https://github.com/Immersive-Media-Technologies`.
- No warranty.

Full terms: [`LICENSE`](LICENSE). Third-party notices: [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
