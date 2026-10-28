# Generative AI: Fill, Remove, Expand, Generate Image, Prompt to edit, Markup, Generate Background

Credits, the 2K cap and availability: `gotchas.md`. helpx pages checked 2026-10-28; Photoshop 27.9–27.11.
Every step here spends generative credits — ask the user before the first one (SKILL.md §5).

## What the server scripts (Firefly default model, no model picker)

| operation | what it does | status |
|---|---|---|
| `generative_fill {prompt}` | needs an active pixel selection (`generative_no_selection`); fires the Action Manager events `generativeFill` → `generativeLayerFill` → `firefly` with the prompt; waits up to 90 s for a new history state; deselects | **unverified live** (the sweep skips generative calls without `PHOTOSHOP_AI_SMOKE=1`). If it answers `generative_unavailable` with an Error 8 / «Syntax error» message, those events do not exist in this build — route the fill through the UI |
| `generative_remove {feather_px 0–20, auto_select_subject}` | `syntheticFill` (the event Photoshop records for Generative Fill) with the prompt «remove the selected object» on the selection; 90 s wait | the route upstream fixed in 1.7.20; unverified on 27.x |
| `generate_image {prompt, width, height}` | `syntheticFill` text-to-image on the active document, falling back to select-all + in-painting; with no document open it creates a white RGB document W×H (64–4096) | unverified live |
| `generative_expand {direction: left/right/top/bottom/all, prompt}` | events `generativeExpand` / `expandCanvas` / `generativeCanvasExpand`; 120 s wait | unverified live; the UI route is the Crop tool (below) |
| `recipe remove_distraction {feather_px, use_generative}` | generative remove when `generative_fill` is capable, else `content_aware_fill`; one history state | content-aware path verified |

Result: `{ok, summary, details:{action_id, prompt, wait:{completed, waited_ms, history_states}}}` plus `next_suggested_tool`.
`wait.completed:false` = still rendering → poll `get_history` / `ps_get_layers` for the new Generative Layer before a frame.
`get_capabilities.features.generative_fill` is a version flag (≥ 25 / 2024), `generative_upscale` ≥ 27 — not an entitlement check: a
signed-out account or empty credits surface only as `generative_credits_exhausted` / `generative_unavailable` at run time.
Which model answers a scripted call is not selectable; assume the Firefly default. Treat every scripted generative call as a UI
generation for verification: `ps_get_layers` (a new layer, name «Generative …» in the UI language) → `ps_export_frame`.

## UI route — the full feature

Click path: make the selection → **Contextual Task Bar** (Window › Contextual Task Bar) → **Generative Fill** (also Edit › Generative
Fill — the larger prompt field) → model picker → prompt (blank = fill from the surroundings) → **Generate** → variations in the
Properties panel; **Generate Similar** on a variation; **Enhance Detail** duplicates a variation sharper (only variations larger than
1024 px). The result is a Generative Layer with a mask; the pixels below are untouched.

What the Contextual Task Bar offers depends on the state (helpx «Prompt to edit»):

| state | button | purpose |
|---|---|---|
| empty or transparent layer | Generate Image | new picture from a prompt |
| image, no selection, or everything selected | Prompt to edit | edit the whole image by prompt (Edit › Prompt to Edit) |
| partial selection | Generative Fill | edit the selected area only |

Models per feature (helpx, Sep–Oct 2026):

| feature | Adobe models | partner models |
|---|---|---|
| Generative Fill | Firefly Fill & Expand, Firefly Image 5, Firefly Image 1 | FLUX.2 pro, FLUX Kontext pro, Gemini 3.1 (Nano Banana 2), Gemini 3 (Nano Banana Pro) |
| Generative Expand | Firefly Fill & Expand, Firefly Image 3, Firefly Image 1 | none — Expand is Firefly-only |
| Generate Image | Firefly Image 5, Firefly Image 3 | Gemini 3.1, Gemini 3, FLUX.2 pro, GPT Image 2 |
| Prompt to edit | Firefly Image 5 | FLUX.2 pro, FLUX Kontext pro, Gemini 3.1, Gemini 3, GPT Image 2 |

Gemini 2.5 (Nano Banana) is deprecated from 2026-10-02 and removed from 27.11 (Sep 2026 build). Partner-model availability varies by
country, plan and account type (enterprise admins can disable them). Firefly Image 5 has native mask support: a selection is used as
context, not just a boundary (helpx «Use selections for generative editing»).

### Reference images
- Firefly Fill & Expand: Generative Fill → **Reference image** → Choose image → *Reference to*: Object | Whole image; *Intent*: Swap the
  selected area | Place into the selected area → Generate.
- Partner models: enter the prompt first, then the Reference image icon → upload: FLUX up to 3 images, Gemini up to 8.
- Community trick for a second reference on any model: enlarge the canvas, place the reference beside the photo (transparent areas
  filled white), select all, generate, crop back. Scripted part: `ps_execute_script` with `resizeCanvas`, `place_image`, `select_all`;
  afterwards `crop_document` to the original bounds (from `get_document_info` taken before).

### Prompt to edit and Markup
- Prompt to edit works on a pixel or generative layer (a generative layer with everything selected); it generates whole-image
  variations: lighting, season, pose, brightness/contrast are Adobe's own examples.
- Markup (Gemini models only, inside Prompt to edit): a text tool for notes on the canvas and a brush for marks or rough shapes; Adobe
  recommends red (#FF0000) and electric blue (#00FFFF); a temporary «Brush Markup» layer appears and is deleted on Generate.

### Generate Background
Contextual Task Bar → **Remove background** → **Generate background** → prompt or blank; the colour-fill icon for a flat colour;
**Import background** for your own file → Generate → variations in Properties. Scripted equivalent without credits:
`recipe remove_background` + `place_image` + layer order (`move_layer_to_position {targetLayerName, position:"BELOW"}`).

## Cost (Adobe generative credits, per generation; helpx «Partner models in Adobe products», 2026-10-23 — marked «for a limited time»)
Firefly models 1 · FLUX Kontext pro 10 · FLUX.2 20 · Gemini 3.1 (Nano Banana 2) 20 at 1K/2K, 30 at 4K · Gemini 3 (Nano Banana Pro) 40 ·
GPT Image 2 5 / 20 / 80 by output resolution. Adobe: «In Photoshop, Generative Fill consumes 10 to 40 credits depending on the output
size» for partner models. A Dec 2025 community table (Firefly 1, Nano Banana 10, FLUX Kontext 10, FLUX.2 20, Nano Banana Pro 40) agrees;
read the estimate the task bar shows. Each generation returns several variations for one charge.

## Prompt and selection tips (community-sourced unless marked Adobe)
- The selection's shape and size are part of the prompt: a dog-shaped selection yields a dog in that pose. Partner models prefer loose
  selections without hard edges; Cmd/Ctrl+A with a partner model behaves like uploading the whole frame to it.
- Removing: include a margin of background in the selection (`expand_selection {pixels}`), or seams remain.
- Quick Mask (Q) painted with grey = partial strength (40 % grey ≈ 40 % fill). UI only.
- Hide adjustment layers before generating (`set_layer_visibility {visible:false}` on each, restore after): the model sees the
  flattened composite and a strong grade distorts the fill.
- Prompts: say what to keep («keep the same perspective and scale», pose, light); partner models understand HEX and Pantone codes;
  «4K», «HD» and camera names change nothing. Adobe: prompts in 100+ languages.
- Output is capped around 2K per generation (community; Adobe's FAQ still says 1024 × 1024): fill large areas in parts, then
  Generative Upscale (`retouch.md`). A fill that half-fits: fill its mask black and paint back the good part.
- Expand one side at a time; after a UI expand `get_document_info` gives the new size.

Sources: helpx.adobe.com/photoshop/desktop/create-open-import-images/create-images/ — edit-images-with-generative-fill,
explore-beyond-the-canvas-with-generative-expand, generate-image-with-descriptive-text-prompts, use-reference-images-for-consistent-results,
edit-images-with-prompt-to-edit, use-markup-for-ai-image-generation, generate-sharper-variations-with-enhance-detail;
…/repair-retouch/remove-objects-fill-space/replace-background-with-generate-background; …/generative-ai/generative-ai-features-overview,
frequently-asked-questions-about-generative-ai-features; …/make-selections/refine-modify-selections/use-selections-for-generative-editing;
helpx.adobe.com/creative-cloud/apps/generative-ai/non-adobe-models-in-adobe-products (credits). Community: photoshoptrainingchannel.com
«Generative Fill … ultimate guide», «partner models guide»; glyndewis.com «adobe-credit-crunch»; phlearn.com «10 days of AI … day 7».
