---
name: ps
description: Drive Adobe Photoshop through PS-MCP-IMT (ps_get_state, ps_get_layers, ps_catalog, ps_do, ps_batch, ps_recipe, ps_export_frame, ps_uxp) and use Photoshop's AI tools — Generative Fill / Expand / Remove, Generate Image and Background, partner models (Gemini, FLUX, GPT Image), reference images, Prompt to edit, Markup, Harmonize, Generative Upscale, the Remove tool, Select Subject, Neural Filters, AI Assistant, Firefly Boards — on localized Photoshop in any UI language too. Read at the start of any Photoshop task. This file is the router; open only the reference it points to.
revision: 1
updated_at: 2026-10-28
---

# Photoshop — agent skill

Scope: controlling Photoshop through PS-MCP-IMT, where scripting ends, which reference to read.
Facts: Photoshop 2026 (27.9–27.11), helpx pages checked 2026-10-28. Adobe MAX is 10–12 Nov 2026: model lists and credit rates will move.

## 1. Tools

| tool | use |
|---|---|
| `ps_get_state` | First call of a session and after every edit: hasDocument, openDocumentCount, document.id/name/size/colorMode/artboards, activeLayer (kind, isBackground), hasSelection. Cheap. Also the liveness check: `photoshop_busy` here = Photoshop is modal. |
| `ps_get_layers` | Layer tree: name, kind, visible, opacity, blendMode (groups nested). Names are the handles for every `layer_name` parameter. |
| `ps_catalog` | No arguments: every operation by category (once per session). `{category}`: parameters. Categories: document layer image smart_object transform filter adjust text selection mask action history state generative neural style color data stack export artboard recipe. |
| `ps_do {operation, args}` | One operation. Pass `document_id` (from `ps_get_state`) on edits when more than one tab is open. `ps_do get_capabilities` once before any AI feature — flags derive from the version, not from credits or sign-in. |
| `ps_batch {ops, stopOnError}` | Operations whose args are all known up front; stops at the first error; not atomic — earlier steps stay applied, each as its own history state. |
| `ps_recipe {name, args}` | 16 multi-step recipes, one history state each (`ps_catalog {category:"recipe"}` for parameters). A matching recipe beats 5+ atomic calls. |
| `ps_export_frame {path}` | PNG of the current view to an absolute path (folder created). Read it. No file access → `ps_do get_preview {max_dimension_px}` returns a JPEG inline. |
| `ps_save_document {path?, format?}` | Save in place or as a copy (PSD · JPEG · PNG). A copy before anything irreversible. |
| `ps_execute_script {script}` | ES3 ExtendScript ending in `return`; only when no operation covers the step; never to redo an operation that reported `command_unavailable`. `timeout_ms` for long loops. |
| `ps_uxp {action}` | Only with the UXP bridge (PS-MCP-IMT Bridge panel open in Photoshop): `ping` · `batchplay {descriptors}` · `script {code, args}` (UXP JS, `await` allowed) — runs inside Photoshop even while it is modal. |
| `ps_skill {doc}` | A reference of this skill by file name without `.md`, e.g. `{doc:"generative"}`. |

## 2. Order of work

1. **State.** `ps_get_state` → `ps_get_layers`. Several tabs: `ps_do list_documents`, then `document_id` on every edit. Unknown install: `ps_do get_capabilities`.
2. **Safety net.** Scripted undo exists: `ps_do undo {steps}`, `redo`, `get_history`; a recipe consumes one state. Undo does not revert a save over the original, `close_document`, files written to disk or credits spent → before flatten / merge / destructive filters / generative work: `ps_save_document {path:"<document folder>/<name>_backup.psd"}`, or `duplicate_layer` and work on the copy.
3. **Operate.** Name what you create (`rename_layer`) so later turns can target it. Adjustment-layer operations (`adjust_curves`, `apply_lut`, …) are non-destructive; filters and generative operations change pixels on the active layer.
4. **Verify by values, then picture.** `ps_get_layers` (the layer exists, visible, blend mode), `get_selection_bounds`, `get_document_info` (size after crop / expand / upscale); then `ps_export_frame` and look at it. A generative result with `wait.completed:false` is still rendering — poll `get_history` before judging the frame.
5. **Finish.** `ps_save_document`; report file paths and what stays unverified.

## 3. Addressing

- **Active document.** Operations act on the active tab unless `document_id` is given. `open_image`, `create_document`, `edit_smart_object_contents`, `image_stack` and Generative Upscale open or switch documents → `ps_get_state` again; `set_active_document {document_id | index | document_name}`.
- **Active layer.** Most operations (opacity, blend mode, filters, transforms, text, fill, selection → mask) act on the active layer: `select_layer_by_name {name}` first (exact, case-sensitive, first depth-first match). Operations with a `layer_name` / `layer` parameter (mask, Smart Object, style, `distort_layer`, `create_clipping_mask`) search recursively themselves.
- **Background layer.** Flagged `activeLayer.isBackground` in `ps_get_state`; its name is localized («Background» only in English) — never match it by name. Filters, transforms, fill and Smart Object conversion refuse it (`background_layer`, `command_unavailable`); recipes unlock it themselves; otherwise `duplicate_layer` and work on the copy, or `rasterize_layer` converts it.
- **Coordinates.** Document pixels, origin top-left. Selections and crops: `left, top, right, bottom`. `place_image {x, y}` = the placed layer's top-left (not Photoshop's centred Place). `distort_layer {corners:{tl,tr,br,bl}}` in document pixels. Font sizes in points, colours as 0–255 RGB, blend modes by UI name in capitals (`MULTIPLY`, `SOFTLIGHT`, `COLOR`).
- **Selections are state.** `select_rectangle {mode}` / `select_ellipse` / `select_subject` / `select_all` → `expand_selection` / `contract_selection` / `feather_selection` / `invert_selection` → the consumer (`create_layer_mask`, `content_aware_fill`, `generative_fill`, `generative_remove`); most consumers deselect. `get_selection_bounds` confirms; `save_selection {channel_name}` keeps one.
- **Any UI language.** Errors are classified by Photoshop's error number: `code` is the same on every language, `message` keeps the localized text. Fonts: PostScript name (`list_fonts`). Actions: `play_action` needs the set and action names as this Photoshop's Actions panel shows them — an unknown name returns `invalid_arguments` listing the real names, retry with one. The Background layer by flag (above). Blend modes, formats, directions, presets: English enum values everywhere.
- **Modal Photoshop** (a dialog, a progress bar, Object Selection in search mode, Generative Fill rendering in the UI): ExtendScript stops → `photoshop_busy` within ~4 s with an instruction for the user; repeats fail at once for 8 s. Do not retry blindly: tell the user what to close, or let `ps_get_state` / `ps_get_layers` / `ps_save_document` / `ps_export_frame` go through UXP (`via: uxp`) when the bridge is on. `extendscript_timeout` = a script is still running: `ps_do ping` until it succeeds, then re-read.

## 4. Scripting boundary → reference

Photoshop 2026 scripts Generative Remove and Generate Image through Action Manager (`syntheticFill`); the model picker, reference images, Prompt to edit, Markup, Harmonize, Generate Background, the Remove tool and the AI Assistant have no scripting API. Neural Filters need the UXP bridge. Every generative step spends Adobe credits (`gotchas.md` §Credits).

| feature | route | read |
|---|---|---|
| Generative Fill · Generative Remove · Generate Image | `generative_fill {prompt}` on a selection · `generative_remove` · `generate_image` — Firefly default model, paid credits, verified live on 27.11 (a Generative Layer per call); partner models, reference images, variations: UI, paid credits | `references/generative.md` |
| Generative Expand | `generative_expand {direction, amount_px, prompt}` — enlarges the canvas and outpaints the strip, verified live · UI Crop tool → Generative Expand, Firefly models only, paid credits | `references/generative.md` |
| Prompt to edit, Markup, Generate Background, Generate Similar, Enhance Detail | UI, paid credits | `references/generative.md` |
| Remove tool (Find distractions), Content-Aware Fill | UI, credit-free · `content_aware_fill` · `recipe remove_distraction` · `image_stack` | `references/retouch.md` |
| Harmonize, Generative Upscale, AI Sharpen / AI Denoise, Neural Filters | UI, paid credits · `generative_upscale {target_scale}` — renders 1–3 min behind a progress dialog, answers `generative_timeout`, the result is a NEW active document (poll `ps_get_state`), verified live · `neural_filter` (UXP bridge, unverified) | `references/retouch.md` |
| Select Subject, Remove Background, masks, selection as prompt, Quick Mask, Sky Replacement | `select_subject` · `recipe remove_background` · mask operations · `sky_replacement` (credit-free; `replaceSky` answers «not available» on a synthetic image — unverified on a real photo) · `recipe sky_blend`; Select Sky, Quick Mask, Select and Mask: UI | `references/selection-masking.md` |
| Frequency separation, dodge & burn, portrait, curves, LUTs, grades, styles, type | recipes `frequency_separation` · `dodge_burn` · `enhance_portrait` · `apply_color_grade`; `adjust_curves`, `apply_lut`, `apply_layer_style`, `create_text_layer` … | `references/color-retouch.md` |
| Batch: CSV → cards, watermark, mockups, social variants, carousel, artboards, web export | recipes `csv_to_cards` · `batch_watermark` · `batch_mockup_replace` · `export_social_variants` · `split_carousel` · `prepare_for_web`; `export_artboards`, `export_as` | `references/batch-export.md` |
| AI Assistant (Photoshop Beta), Firefly Boards, Actions | UI · `play_action` | `references/ai-assistant.md` |
| jobs that combine several tools | — | `references/combos.md` |
| modal Photoshop, UXP bridge, history, credits and the 2K cap, localized names, Windows | — | `references/gotchas.md` |

## 5. UI-only steps

1. Do the scriptable part first: backup, active document, active layer, the selection (`get_selection_bounds` confirms it), canvas, layer order, adjustment layers hidden.
2. Steps that spend credits or send pixels to Adobe's or a partner's cloud (every generative step, partner models, Topaz, AI Assistant): ask the user first and state the cost from the feature's reference.
3. Computer use available → the click path from the reference; screenshot only the Contextual Task Bar / Properties panel; never while `ps_*` writes run (a rendering generation makes Photoshop modal → `photoshop_busy`). Otherwise send the user the exact click path in one message and wait.
4. Verify as in §2 step 4: `ps_get_layers` shows the new Generative Layer or result layer, then a frame. Never report a UI step as done without readback.

## 6. Failures

- `isError` or `ok:false` → failed. Follow `suggested_next_tool`, except `rasterize_layer` for background removal — the recipe handles the Background layer.
- `command_unavailable` → document state (locked layer, group, a single layer to merge), not a version problem → `ps_get_layers`, change the target. `user_cancelled` → Photoshop refused or the user cancelled → `ps_get_state`.
- `generative_unavailable` / `generative_credits_exhausted` / `version_unsupported` → degrade: `content_aware_fill`, `recipe remove_distraction`, `image_stack`, a manual composite; or hand the step to the UI.
- "Success" but no visible change → re-read; Action Manager can answer `ok` without acting (why perspective goes through `distort_layer`, never a `quadrilateral` script).
