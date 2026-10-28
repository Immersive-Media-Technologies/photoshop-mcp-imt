# Retouch AI: Remove tool, Harmonize, Generative Upscale, AI Sharpen / Denoise, Neural Filters

Credits and availability: `gotchas.md`. helpx checked 2026-10-28.

## Remove tool (UI; credit-free in Photoshop 2026)
Click path: Tools panel → **Remove** tool (opens the Contextual Task Bar) → brush slightly larger than the object → loop around it.
- Task bar: **Find distractions** (General distractions · People · Wires and cables — detects and removes in one go), Add to / Subtract
  from, **Remove after each stroke**, **Create new layer** (non-destructive — ask the user to tick it so the result is a layer you can read).
- Options bar **Mode**: *Auto (may use generative AI)* · *Generative AI is on* with **Cloud** or **Device** (on-device model, downloaded
  once; Device greyed out = hardware below the requirements) · *Generative AI is off*. No credits are charged by the Remove tool
  (community; Adobe's credit tables list no rate for it).
- Known issues (helpx): crashes → update GPU drivers, Preferences › Image Processing › Remove Tool Processing: **More stable**;
  «Required components are being downloaded» → wait, do not switch tools; component download errors → ≥ 1 GB free, restart.
- The first strokes download components and make Photoshop modal → `photoshop_busy` for script calls until done.

Scripted alternatives, credit-free: `content_aware_fill` on a selection (needs one; `generative_no_selection`-style error otherwise),
`recipe remove_distraction {feather_px, use_generative:false}`, `image_stack {files, mode:"median"}` for tourists across aligned frames
(opens a new document). With credits: `generative_remove` (`generative.md`).

## Harmonize (UI, Firefly credits)
Matches colour, light, shadows and tone of a placed subject to the background.
- Only on a **pixel layer** — not Smart Objects, text or adjustment layers (helpx). `place_image` creates a Smart Object →
  `rasterize_layer` first, then `select_layer_by_name`, position and scale by script (`move_layer`, `scale_layer`,
  `fit_layer_to_document`).
- Click path: Contextual Task Bar → **Harmonize** → pick a variation. No button: Window › Contextual Task Bar, and check the layer kind.
- The UXP route `neural_filter {filter:"harmonize", reference_layer_id}` sends the Neural Filters gallery descriptor
  (`neuralGalleryFilters › harmonization`) — the older beta filter, not the task-bar Harmonize; unverified live, filter must be
  downloaded once in Filter › Neural Filters.

## Generative Upscale
- UI: **Image › Generative Upscale** → 2× or 4× → model: **Firefly Upscaler** (up to 6144 × 6144 px) · **Topaz Gigapixel** (premium
  plans; up to 56 MP; preserves detail; 10 credits ≤ 25 MP, 20 credits 25–56 MP) · **Topaz Bloom** (premium; up to 9 MP; invents detail;
  35 credits) → **Upscale** → the result opens as a **new document** with a new name → `ps_get_state`, `list_documents`, then work there.
- Script: `generative_upscale {target_scale: 2|4}` — events `generativeUpscale` / `superResolution` / `enhanceDetail`, 120 s wait,
  Photoshop ≥ 27 (`get_capabilities.generative_upscale`); unverified live; no model choice. Without credits: `resize_image` (bicubic).

## AI Sharpen / AI Denoise (Topaz; UI, paid credits)
Filter › **AI Sharpen** / **AI Denoise** → one button. Files up to 56 MP; 10 credits ≤ 25 MP, 20 credits 25–56 MP. **Destructive**: the
current layer is replaced, no new layer → `duplicate_layer {newName}` first by script, undo through history. Scripted sharpening
without credits: `apply_sharpen`, `apply_high_pass` + `SOFTLIGHT`/`OVERLAY`, `recipe prepare_for_web` (sharpen for screen on export).

## Neural Filters (UXP bridge)
`neural_filter {filter: skin_smoothing | harmonize | depth_blur | super_zoom | colorize, smoothness, blur}` → batchPlay
`neuralGalleryFilters` inside `executeAsModal`; `skin_smoothing` takes `smoothness` and `blur` (0–100); the others run with defaults.
Needs the bridge (`uxp_bridge_unavailable` otherwise) and each filter downloaded once in Filter › Neural Filters (UI). Unverified live
(skipped in the sweep). `recipe enhance_portrait {use_neural_skin:true}` calls it before frequency separation. Credit-free (on-device
or Adobe cloud without generative credits, as the gallery itself).

Sources: helpx.adobe.com/photoshop/desktop/repair-retouch/ — remove-objects-fill-space/remove-unwanted-objects-and-distractions,
remove-tool-known-issues-and-workarounds, blend-subjects-with-harmonize; clean-restore-images/enhance-image-quality-with-generative-upscale;
…/effects-filters/artistic-stylize-filters/enhance-images-with-generative-ai-filters; helpx «Partner models in Adobe products» (Topaz rates).
