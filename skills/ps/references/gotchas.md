# Cross-cutting gotchas

Feature-specific limits are in each feature's reference; this file holds what applies across them.

## Modal Photoshop and `photoshop_busy`
- Any dialog, progress bar, a tool in a modal state (Object Selection searching, Select and Mask, Liquify, Camera Raw), a rendering
  generation in the UI and an AI Assistant turn stop ExtendScript. The server answers `photoshop_busy` after ~4 s (not 30) and
  rejects repeats for 8 s. Read tools time out after 8 s (`PS_MCP_READ_TIMEOUT_MS`), everything else after 30 s
  (`PHOTOSHOP_SCRIPT_TIMEOUT`; `timeout_ms` per `ps_execute_script`), generative operations after 120 s, batch recipes after 600 s.
- `extendscript_timeout`: the script is still running inside Photoshop; MCP abort does not stop it → `ps_do ping` until it succeeds,
  only then `ps_get_state`. A write that timed out may have applied — re-read before repeating it.
- `scratch_disk_full`: Photoshop's OS drive has < 10 GB free; it freezes until space is freed and Photoshop restarted.
- `user_cancelled` (error 8007) also comes back for some commands Photoshop refuses, not only for a user's Cancel.

## The UXP bridge (second transport)
- The panel plugin **Photoshop-MCP-IMT Bridge** (Plugins menu) polls the server; with `PS_MCP_UXP=1` the server opens `127.0.0.1:38452` with a
  shared-secret token. «Bridge reachable» = the plugin polled within the last 3 s — the panel must have been opened once per Photoshop
  launch (leave it in the workspace). While Photoshop is modal, `ps_get_state`, `ps_get_layers`, `ps_save_document` (PSD / in place)
  and `ps_export_frame` fall back to it (`via: uxp`); `PS_MCP_UXP_PREFER=1` makes it first.
- `ps_uxp {action:"batchplay", descriptors}` and `{action:"script", code}` run anything batchPlay can do, inside `executeAsModal`
  (an ordinary document change). The UXP DOM is not the ExtendScript DOM: no `app.activeDocument.activeLayer` style code there.
- Not available on Windows on ARM (Photoshop loads no third-party UXP plugins there); Creative Cloud may refuse the `.ccx`
  («Plugin Not Compatible») → UXP Developer Tools or the manual layout (README).

## History and undo
- `undo {steps}` / `redo` / `get_history` work by script (verified live). Recipes = one history state; a `ps_batch` = one per op.
- Not undoable: a save over the original, `close_document {save:false}`, files written by export recipes, credits spent, AI Sharpen /
  Denoise on the layer (undoable only while the history holds it). Generative Upscale writes a new document — the original stays.
- Generative results from the UI are Generative Layers (masked, variations kept in Properties); scripted generative calls should
  show the same layer — confirm with `ps_get_layers`.

## Credits, resolution, availability
- Firefly: 1 credit per generation; partner models 10–80 (generative.md §Cost; «for a limited time», change expected at MAX, Nov 2026).
  Topaz features 10/20/35. Balance: the account menu in Photoshop. Credit-free: Remove tool, Content-Aware Fill, Sky Replacement, Select
  Subject / Remove Background, Neural Filters, every recipe without `use_generative`.
- Output per generation ≈ 2K (community; Adobe's FAQ, Feb 2026, still says 1024 × 1024) → tile large fills, then upscale. Enhance
  Detail only on variations > 1024 px. Generative Upscale: Firefly ≤ 6144 px, Gigapixel ≤ 56 MP, Bloom ≤ 9 MP.
- Generative features need internet and a signed-in account; not offered in China (Adobe FAQ) — assume the same for Russia and
  Belarus as in other Firefly apps; enterprise and education accounts may have them or partner models disabled.
  `get_capabilities` cannot see this: ask the user before planning generative routes, and plan the credit-free alternative.
- Gemini 2.5 (Nano Banana) is retired from 27.11; model names on helpx lag the app — trust the model picker.

## Localized names and other scripting traps
- Layer, set and action names are in the UI language or whatever the user typed; the Background layer is «Фон», «Hintergrund», «背景» —
  use the `isBackground` flag. Enum values (blend modes, formats, presets, directions) are English on every language.
- Fonts: PostScript names (`list_fonts`); display names can be localized (CJK on a Japanese UI).
- `select_layer_by_name` is exact and case-sensitive; duplicates in different groups → first depth-first match → rename first.
- `place_image {x, y}` is the top-left of the placed layer; Photoshop's own Place centres. `crop_document` is for cutting; to enlarge the canvas use
  `ps_execute_script` with `app.activeDocument.resizeCanvas(...)` (anchor matters), then `get_document_info`.
- `Trnf` with `quadrilateral` is accepted and ignored by Photoshop 2026 → perspective only through `distort_layer`.
- `ps_execute_script` without `return` reports `undefined` even when the edit applied; the facade sends your `script` as `code`.
- Filters refuse Smart Objects and the Background layer; `fit_layer_to_document` / `scale_layer` refuse the Background layer.

## Windows
- COM transport (`cscript`); «General Photoshop error» between back-to-back calls is retried automatically (`PSMCP_BUSY_RETRY_MS`).
  `PHOTOSHOP_PATH` when Photoshop is outside `C:\Program Files\Adobe`. Paths with backslashes are fine in JSON when escaped.
- Non-ASCII names come back correctly (UTF-16 results); UI-language errors are classified by number as on macOS.
- Windows on ARM: no UXP bridge (above); everything else as on x64.

Sources: README and CHANGELOG of Photoshop-MCP-IMT (1.0.0, 0.4.x); helpx «Generative AI features in Photoshop on Desktop FAQ» (2026-02-23),
«Partner models in Adobe products» (2026-10-23), «Generative AI model retirement»; the live sweep notes (2026-10-01 / 10-04).
