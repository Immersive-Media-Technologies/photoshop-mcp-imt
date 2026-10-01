# Development

Build, lint, and test PS-MCP-IMT locally.

← Back to [README](../README.md)

### From Source

```bash
git clone https://github.com/Immersive-Media-Technologies/photoshop-mcp-imt.git
cd photoshop-mcp-imt
npm install
npm run build
```

### Build

```bash
npm run build        # server + UXP plugin (.ccx)
npm run build:mcpb   # Claude Desktop extension → release/photoshop-mcp-imt-<version>.mcpb
```

### Watch Mode

```bash
npm run dev
```

### Lint & Format

```bash
npm run lint
npm run format
```

### Integration tests (requires running Photoshop)

```bash
npm run build:server
npm run spike:issue-2     # issue #2 targeted regression (10 checks)
npm run test:mcp-local    # prompt-layer smoke
npm run test:mcp-all      # full sequential tool sweep
npm run spike:photoshop-actions  # generative AI action probes → scripts/output/generative-probe-report.json
npm run verify:photoshop-prompts
npm run test:unit         # vitest, offline
```

### UXP bridge plugin

The panel plugin in `uxp-plugin/` is the second transport (not only Neural Filters — see
[architecture.md](architecture.md)). Install options:

1. `npm run build:uxp` → `dist/uxp/deepartisan-ps-bridge.ccx` → double-click (Creative Cloud).
   If Creative Cloud answers «Plugin Not Compatible» (it does when Photoshop is missing from its
   installed-apps list), use 2 or 3.
2. [Adobe UXP Developer Tools](https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/) →
   **Add Plugin** → `uxp-plugin/manifest.json` → **Load** (after `manifest.json` changes: Unload,
   then Load — not Reload).
3. Manual layout: copy `uxp-plugin/` to
   `~/Library/Application Support/Adobe/UXP/Plugins/External/com.deepartisan.ps-bridge_1.1.0/`
   (Windows: `%APPDATA%\Adobe\UXP\Plugins\External\…`) and add the entry to
   `…/Adobe/UXP/PluginsInfo/v1/PS.json`:
   `{"hostMinVersion":"24.0.0","name":"Deep Artisan Bridge","path":"$localPlugins/External/com.deepartisan.ps-bridge_1.1.0","pluginId":"com.deepartisan.ps-bridge","status":"enabled","type":"uxp","versionString":"1.1.0"}`
   — restart Photoshop → Plugins → Deep Artisan Bridge.

Open the panel once and leave it in your workspace: the plugin loads with the panel and keeps
polling the server (`127.0.0.1:38452`, override with `PHOTOSHOP_UXP_BRIDGE_PORT`). Start the
server with `PS_MCP_UXP=1`; it creates the shared-secret token file on first start
(`~/.deepartisan/state/uxp-bridge.token`, 0600; path for the server: `PS_MCP_UXP_TOKEN_FILE` —
the plugin reads the default path). Gotcha: UXP 9.4 rejects `network.domains` entries with a
port, so the manifest declares `"domains": "all"`.

### Generative AI tools

Firefly tools (`photoshop_generative_*`, `photoshop_generate_image`, `photoshop_sky_replacement`) require:

- Photoshop 24+ (Generative Fill) or 27+ (Generative Upscale)
- Signed-in Adobe account with generative credits
- Optional live smoke: `PHOTOSHOP_AI_SMOKE=1 npm run test:mcp-all`

## Integration test results

Upstream's local MCP integration tests run against a live Photoshop instance over stdio (same
path as Cursor / Claude Desktop). The table below is upstream's record on **Photoshop 26.5.0**
(macOS); our own live checks (Photoshop 2026 27.9–27.10, macOS) are listed in the README.

_Re-run `npm run test:mcp-all` to refresh._

| Suite                    | Command                            | Result                                                                                                       |
| ------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Issue #2 regression      | `npm run spike:issue-2`            | Targeted checks (metadata, layers, place, Smart Object transform, jsString escapes, fonts, alert, CJK names) |
| Full tool + recipe sweep | `npm run test:mcp-all`             | **119 pass**, **0 fail**, **4 skip** (123 total)                                                             |
| Prompt-layer smoke       | `npm run test:mcp-local`           | 16 prompt templates + core recipes                                                                           |
| Prompt ↔ recipe parity   | `npm run verify:photoshop-prompts` | 12↔12 strict match + 4 guides                                                                                |

**Tool coverage:** 134 tools registered (109 atomic `photoshop_*`, 16 recipes, 9 facade tools; `ps_uxp`
with the bridge) — re-run `npm run test:mcp-all` for a fresh pass count.

**Intentional skips** (environment-dependent, not regressions):

| Tool                                    | Reason                                                               |
| --------------------------------------- | -------------------------------------------------------------------- |
| `photoshop_play_action`                 | Requires a real Actions palette entry on the machine                 |
| `photoshop_select_subject`              | Requires a recognizable subject in the active layer                  |
| `photoshop_recipe_remove_background`    | Synthetic test canvas has no recognizable subject for Select Subject |
| `photoshop_recipe_batch_mockup_replace` | Requires a Smart Object mockup PSD                                   |

**PS 26 compatibility notes** (ExtendScript): layer masks use `stringID make`;
mask apply uses `delete` + `apply: true`; hue/saturation uses `Hst2` descriptors;
frequency separation uses `applyImageEvent` calculation descriptors. See
[`src/api/extendscript.ts`](../src/api/extendscript.ts) and
[`src/tools/recipes/_shared.ts`](../src/tools/recipes/_shared.ts).

Prerequisites: Photoshop installed and scriptable; run from the repo root after
`npm run build:server`.

## Usage Examples

Prompt the AI assistant in natural language — the MCP server picks the right tools.

### Create a Simple Design

> Create an 800×600 RGB document, add a light blue background layer, center the text "My Design" at 64pt, then save as `design.psd` on the Desktop.

### Batch Process Images

> Open my image, resize to 1920×1080, save as a high-quality JPEG to the Desktop, then close without saving the PSD.

### Design with Stock Images (Pexels)

Combine with a [Pexels MCP server](https://github.com/modelcontextprotocol/servers) if configured:

> Search Pexels for "nature landscape", place the downloaded photo in a 1920×1080 document, fit to fill the canvas, add "Beautiful Nature" as overlay text at the top, save as `nature-design.psd`.

## Quick Start Examples

### Common Use Cases

| Task                     | Prompt Example                                                             |
| ------------------------ | -------------------------------------------------------------------------- |
| **Basic Design**         | "Create 1920x1080 document, add blue background, center text 'Hello'"      |
| **Photo Edit**           | "Open photo.jpg, apply auto levels, sharpen 100%, save as edited.jpg"      |
| **Stock Image**          | "Place image.jpg, fit to fill canvas, add overlay text 'Summer 2026'"      |
| **Layer Effects**        | "Set active layer blend mode to MULTIPLY, opacity 80%"                     |
| **Filters**              | "Apply 10px Gaussian blur to current layer"                                |
| **Text Styling**         | "Change text to Helvetica 64pt, color red, center aligned"                 |
| **Batch Work**           | "Resize to 1080x1080, auto contrast, save as square.jpg, close"            |
| **Masks**                | "Select rectangle 100,100 to 500,500, create layer mask"                   |
| **Portrait recipe**      | "Enhance portrait at medium intensity with skin smoothing, then preview"   |
| **Background removal**   | "Remove background from active layer, 2px feather, non-destructive mask"   |
| **Web export**           | "Prepare for web + export Instagram and X post variants to exports folder" |
| **Color grade**          | "Apply warm_film color grade as adjustment layers"                         |
| **Frequency separation** | "Build FS stack at 6px — I'll paint the Low/High layers myself"            |
| **State check**          | "Ping Photoshop, get capabilities, then get_state before editing"          |

## Context Tracking

Each tool returns comprehensive context information about the current state of Photoshop, including:

- **Document Info**: Name, dimensions, resolution, color mode, layer count
- **Active Layer Info**: Name, type, opacity, blend mode, visibility, lock state
- **Selection State**: Whether a selection is active
- **Operation Result**: Specific details about what was changed

This allows AI assistants to maintain awareness of which document is active,
which layer is being worked on, and current layer properties across multiple
commands.

**Example Response:**

```javascript
{
  "applied": true,
  "filter": "Gaussian Blur",
  "radius": 10,
  "wasRasterized": true,
  "context": {
    "hasDocument": true,
    "document": {
      "name": "design.psd",
      "width": 1920,
      "height": 1080,
      "resolution": 72,
      "colorMode": "RGBColorMode",
      "layerCount": 3,
      "hasSelection": false
    },
    "activeLayer": {
      "name": "Background",
      "kind": "NORMAL",
      "opacity": 100,
      "blendMode": "NORMAL",
      "visible": true,
      "locked": false,
      "isBackground": false
    }
  }
}
```
