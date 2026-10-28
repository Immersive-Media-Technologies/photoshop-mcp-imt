# Recipes that combine tools

[S] = by script through PS-MCP-IMT, [U] = UI step (SKILL.md §5), [¢] = spends credits. Safety net and verification: SKILL.md §2.
Feature details live in the reference named in each step.

## 1. Replace an object with a partner-model fill
1. [S] `ps_save_document {path:"…_backup.psd"}` → `select_layer_by_name` → selection: `select_subject` for a subject, else
   `select_rectangle` → `expand_selection {pixels: 8–20}` (margin) → `get_selection_bounds`. Hide adjustment layers
   (`set_layer_visibility {visible:false}`).
2. [U ¢] Generative Fill → model (Gemini 3.1 / FLUX.2 for prompt adherence, Firefly Image 5 for blending) → prompt that names what to keep
   → Generate → pick a variation (generative.md §UI route, §Cost).
3. [S] `ps_get_layers` (new Generative Layer on top) → restore adjustment layers → `ps_export_frame`.

## 2. Remove a person: credit-free first
1. [S] `select_rectangle` / user's lasso → `recipe remove_distraction {feather_px: 2, use_generative:false}` → frame.
2. Seams or repeated texture → [U] Remove tool, Generative AI on, Create new layer ticked (retouch.md §Remove tool) → [S] frame.
3. Still wrong → [S ¢] `generative_remove {feather_px: 2}` on a fresh selection, or [U ¢] Generative Fill with an empty prompt.
4. Several frames of the scene exist → [S] `image_stack {files, mode:"median"}` instead of any AI.

## 3. Composite a product into a scene and harmonize
1. [S] `place_image {filePath, x, y}` → `rasterize_layer` (Harmonize needs pixels) → `rename_layer` → `scale_layer` / `move_layer` /
   `fit_layer_to_document`; perspective onto a plane: `distort_layer {corners}` (rasterize first).
2. [U ¢] Harmonize from the Contextual Task Bar → variation (retouch.md §Harmonize).
3. [S] contact shadow: `apply_layer_style {style:"drop_shadow", opacity: 45, size: 20, distance: 6, angle: <scene light>}` on the
   product layer → `ps_export_frame`; Harmonize's own shadow may make it unnecessary — compare both frames.

## 4. Extend a crop for a new aspect ratio
1. [S] `get_document_info` (size) → decide the side; `ps_save_document` copy.
2. [S ¢] `generative_expand {direction:"right", prompt:""}` → check `get_document_info` again; or [U ¢] Crop tool handles out →
   Generative Expand, Firefly model, one side at a time (generative.md).
3. [S] `ps_get_layers` → `ps_export_frame`; seams → selection along the seam → `generative_fill` with an empty prompt [¢].

## 5. Background swap for e-commerce
1. [S] `recipe remove_background {feather_px: 1}` → `details.method` → frame.
2. [S] new background: `place_image` → `move_layer_to_position {targetLayerName:"Subject", position:"BELOW"}` or `fill_layer` on a new
   layer; or [U ¢] Generate background from the Contextual Task Bar with a prompt.
3. [S] `recipe prepare_for_web {max_dimension_px: 2048, format:"jpeg", path}` per deliverable; many SKUs → `batch_mockup_replace` with
   a Smart Object template (batch-export.md).

## 6. Portrait: smooth, sculpt, grade
1. [S] `recipe enhance_portrait {intensity:"medium"}` (or `frequency_separation {radius_px: 6}` for hand work) → `recipe dodge_burn`.
2. [U] the user paints FS Low / FS High and the Dodge & Burn layer (color-retouch.md §Hand-over) → [S] frame.
3. [S] `recipe apply_color_grade {preset:"warm_film"}` → `adjust_vibrance {vibrance: 20}` → `ps_export_frame`; blemishes left: [U] Remove tool.

## 7. Sky: native, then generative
1. [S] `sky_replacement {sky_image_path}` (credit-free, unverified) → frame; refused → `recipe sky_blend {sky_image_path, horizon_pct}`.
2. A sky that does not exist as a file: [U] Select › Sky → [S] `get_selection_bounds` → `feather_selection {pixels: 4}` →
   [S ¢] `generative_fill {prompt:"…"}` or [U ¢] Generative Fill with a partner model.

## 8. Low-resolution source to print
1. [S] `recipe remove_distraction` / Remove tool clean-up first (upscaling bakes artefacts in).
2. [S ¢] `generative_upscale {target_scale: 2}` (unverified) or [U ¢] Image › Generative Upscale (Firefly ≤ 6144 px; Topaz Gigapixel for
   detail, premium) → the result is a new document → [S] `list_documents` → `set_active_document` → `ps_save_document {path}`.
3. [S] sharpen for the medium: `apply_sharpen` on a duplicate, or `prepare_for_web` for screens.

## 9. Personalised cards from a spreadsheet
1. [U] once: template PSD with variables (Image › Variables › Define) — text and pixel-replacement layers named like the CSV header.
2. [S] `recipe csv_to_cards {csv_path, output_dir, format:"PNG"}` → `details.exported`, `output_paths`; open one result (`open_image`)
   → `ps_export_frame` to check.

## 10. One design, every platform
1. [S] lock the master: `ps_save_document` copy → `recipe export_social_variants {platforms:[…]}` (centre crop) for photos.
2. Layouts that need re-composition: `create_artboard` per size → `select_layer_by_name` / `move_layer` / `set_text_style` per board →
   `export_artboards {folder, format:"PNG"}`. Carousel: `recipe split_carousel {slides: 5}`.

## 11. Photoshop is modal mid-job
[S] `photoshop_busy` → stop writing; `ps_get_state` (`via: uxp` if the bridge is on) tells the state; tell the user which dialog or tool
to close (gotchas.md §Modal) → `ps_do ping` → re-read → continue from the last verified step. Never resend the write that timed out
without re-reading: it may have applied.
