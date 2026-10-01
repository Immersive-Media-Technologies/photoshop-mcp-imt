# Architecture

← Back to [README](../README.md)

PS-MCP-IMT is a local-first bridge between an MCP host (Claude Desktop, Cursor, Claude Code, any
MCP client) and a running Adobe Photoshop. Everything runs on the user's machine; the server
sends nothing anywhere.

```
MCP host (stdio)
  │
  ▼
PhotoshopMCPServer (Node.js)  ── facade: ps_catalog / ps_do / ps_batch … (PS_MCP_FACADE=1)
  │                                      │
  │ ExtendScript                         │ HTTP poll 127.0.0.1:38452 (PS_MCP_UXP=1, shared-secret token)
  │ osascript (macOS) / COM (Windows)    │
  ▼                                      ▼
Adobe Photoshop  ◄───────────  UXP panel plugin «Deep Artisan Bridge» (core.executeAsModal)
```

| Layer                  | Responsibility                                                                                                                                           | Where                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Server core            | MCP protocol, tool and prompt registries, document targeting                                                                                             | `src/core/`                                                                     |
| Facade                 | 9 agent-facing tools over the full registry; categories for `ps_catalog`                                                                                 | `src/da/facade.ts`                                                              |
| ExtendScript transport | platform detection, script execution, queue, busy probe, script timeout                                                                                  | `src/platform/connection.ts`, `*-executor.ts`, `script-timeout.ts`              |
| UXP transport          | bridge HTTP server, plugin client, fallback / prefer logic                                                                                               | `src/platform/uxp-bridge-server.ts`, `uxp-bridge-client.ts`, `uxp-transport.ts` |
| UXP plugin             | panel inside Photoshop: `ping`, `state`, `layers`, `batchplay`, `eval_js`, `export_png`, `save`, `neural_filter`                                         | `uxp-plugin/`                                                                   |
| Tools                  | atomic `photoshop_*` tools (upstream) + `photoshop_distort_layer`                                                                                        | `src/tools/`                                                                    |
| Recipes                | multi-step workflows in one history state                                                                                                                | `src/tools/recipes/`                                                            |
| Errors                 | one envelope `{ ok: false, code, message, suggested_next_tool }`; `photoshop_busy`, `extendscript_timeout`, `scratch_disk_full`, `command_unavailable` … | `src/errors/envelope.ts`                                                        |
| Prompts                | server instructions and `ps.*` prompt templates                                                                                                          | `src/prompts/`                                                                  |
| Analytics              | **no-op** — upstream's telemetry replaced by an empty module with the same interface                                                                     | `src/analytics/`                                                                |

## Transport decision per call

1. ExtendScript first (default). Read-only tools use an 8 s timeout (`PS_MCP_READ_TIMEOUT_MS`),
   everything else the script timeout (`PHOTOSHOP_SCRIPT_TIMEOUT`, `timeout_ms` on `execute_script`).
2. A timeout triggers a 4 s liveness probe outside the queue. No answer → Photoshop is modal →
   `photoshop_busy`, held for 8 s so repeated calls fail immediately.
3. If the UXP plugin has polled the server within the last 3 s, `ps_get_state`, `ps_get_layers`,
   `ps_save_document` and `ps_export_frame` are retried through UXP (`via: uxp`). With
   `PS_MCP_UXP_PREFER=1` UXP is tried first.

## Why two transports

ExtendScript through osascript / COM covers the whole classic DOM and Action Manager, but it is
blocked whenever Photoshop shows a modal dialog or a progress bar, and Adobe has announced the
end of ExtendScript in Photoshop. UXP runs inside Photoshop, keeps working in those states and
is the API Adobe develops; its `batchPlay` is the only route to features such as Neural Filters.
The server keeps both and chooses per call.
