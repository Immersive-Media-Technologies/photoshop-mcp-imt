# Selections and masks: Select Subject, Remove Background, masks, Sky Replacement, selection as prompt

## Scripted operations (category `selection`, `mask`)

| operation | notes |
|---|---|
| `select_rectangle {left, top, right, bottom, mode}` · `select_ellipse {…}` | `mode`: replace (default) · add · subtract · intersect — build compound selections in several calls |
| `select_subject {sample_all_layers}` | Photoshop's Select Subject on the active layer (PS ≥ 23); pixel selection only, no mask |
| `select_all` · `deselect` · `invert_selection` | |
| `expand_selection {pixels}` · `contract_selection {pixels}` · `feather_selection {pixels}` | ≥ 1 px each; feather before fills and masks for soft edges |
| `get_selection_bounds` | `{has_selection, bounds:{left, top, right, bottom, width, height}}` — the readback after every selection step |
| `save_selection {channel_name}` | alpha channel; reload is UI (Select › Load Selection) or `ps_execute_script` |
| `create_layer_mask` | mask from the current selection on the active layer; `delete_layer_mask`, `apply_layer_mask` (bakes it) |
| `apply_gradient_mask {direction, start_pct, end_pct, angle_deg}` | black→white gradient on the active layer's mask (fade) |
| `create_clipping_mask {layer_name}` · `release_clipping_mask` | the clipped layer must sit directly above its base |
| `recipe remove_background {feather_px 0–20, use_generative}` | THE background removal: unlocks the Background layer, native Remove Background → Select Subject → Color Range fallback; `details.method` says which; renames the layer «Subject»; one history state. Do not pre-process (no rasterize / duplicate / hide) |
| `recipe gradient_fade {direction, start_pct, end_pct}` | reveal-all mask if needed + gradient; for a subject fading into the layers below |
| `recipe passport_photo {spec, make_sheet}` | Select Subject → white background → ICAO-style crop → export (`batch-export.md`) |

Masks are not listed by `ps_get_layers`: verify a mask by frame (`ps_export_frame`) or by hiding the layers below.
Selections survive only until the next consumer: `generative_fill`, `generative_remove`, `content_aware_fill`, `create_layer_mask`
and the recipes deselect.

## UI-only selection tools
- **Select › Sky**, **Selection Brush**, **Object Selection** (hover to pick), **Select and Mask** (hair, Refine Hair), **Quick Mask**
  (Q; paint grey for a partial selection — 40 % grey ≈ 40 % effect in a following generative fill; community). After the user makes one:
  `get_selection_bounds`, then continue by script (`create_layer_mask`, `generative_fill` …).
- Object Selection in «search mode» and Select and Mask make Photoshop modal → `photoshop_busy` until closed.

## Selection as prompt (Generative Fill)
- Adobe: with Firefly Image 5 the selection is context, not just a boundary (structure and identity outside it are preserved).
- Community: the shape and size of the selection steer the result; a margin of background helps removals; partner models prefer loose
  selections; select-all with a partner model = «whole frame» editing. Details and credits: `generative.md`.

## Sky Replacement (native, credit-free)
- `sky_replacement {sky_image_path?}` — Edit › Sky Replacement by Action Manager; without a path Photoshop uses its presets. Events
  `skyReplacement` / `replaceSky` / `replaceSkyBackground`, 120 s wait; capability `sky_replacement_native` (≥ 25). Unverified live.
- `recipe sky_blend {sky_image_path, horizon_pct 0–100, feather_pct 0–50, x, y, use_native_sky}` — tries native first when capable,
  else places the sky file with a horizon-gradient mask; verified in the sweep with `use_native_sky:false`.
- Sky presets and the Sky Replacement dialog (foreground lighting, edge shift) stay UI; a generative sky: selection (Select › Sky, UI, or
  a rectangle above the horizon) → `generative_fill {prompt}` or the UI with a partner model.

Sources: helpx «Use selections for generative editing» (2026-08-28), «Remove background in your images», «Select and manage sky
presets»; community tips: photoshoptrainingchannel.com «Generative Fill … ultimate guide».
